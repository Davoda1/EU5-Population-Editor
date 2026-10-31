import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NtExecutable, NtExecutableResource, Resource} from 'resedit';

export const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngMagic = Buffer.from([137,80,78,71,13,10,26,10]);
const same = (a,b) => a.length === b.length && a.equals(b);

export async function verifyIcons(base = 'assets') {
  assert.match(await readFile(join(base,'icon.svg'),'utf8'), /viewBox="0 0 64 64"/);
  const pngs = new Map();
  for (const size of iconSizes) {
    const png = await readFile(join(base,'icons',`${size}.png`));
    assert.ok(png.length > 100 && same(png.subarray(0,8),pngMagic), `Invalid ${size}px PNG`);
    assert.equal(png.toString('ascii',12,16),'IHDR');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
    assert.equal(png[24],8,'Icons must have 8-bit channels');
    assert.equal(png[25],6,'Icons must retain RGBA transparency');
    assert.equal(png.toString('ascii',png.length-8,png.length-4),'IEND');
    pngs.set(size,png);
  }
  const ico = await readFile(join(base,'icon.ico'));
  assert.equal(ico.readUInt16LE(0),0);
  assert.equal(ico.readUInt16LE(2),1);
  const sizes=iconSizes.filter(size=>size<=256);
  assert.equal(ico.readUInt16LE(4),sizes.length);
  let end=6+sizes.length*16;
  for (let i=0;i<sizes.length;i++) {
    const at=6+i*16,size=sizes[i];
    assert.equal(ico[at]||256,size);
    assert.equal(ico[at+1]||256,size);
    assert.equal(ico.readUInt16LE(at+4),1);
    assert.equal(ico.readUInt16LE(at+6),32);
    const length=ico.readUInt32LE(at+8),offset=ico.readUInt32LE(at+12);
    assert.equal(offset,end,'ICO frame offsets must be contiguous');
    assert.ok(same(ico.subarray(offset,offset+length),pngs.get(size)),`ICO ${size}px frame differs from PNG asset`);
    end=offset+length;
  }
  assert.equal(end,ico.length,'Unexpected ICO trailing data');
  return pngs;
}

export async function verifyWindowsIcon(executable, base='assets') {
  const pngs=await verifyIcons(base);
  const pe=NtExecutable.from(await readFile(executable));
  const resources=NtExecutableResource.from(pe);
  const groups=Resource.IconGroupEntry.fromEntries(resources.entries);
  const sizes=iconSizes.filter(size=>size<=256);
  const matching=groups.some(group=>{
    const items=group.getIconItemsFromEntries(resources.entries);
    return items.length===sizes.length && sizes.every(size=>items.some(item=>
      item.isRaw() && (item.width||256)===size && (item.height||256)===size && same(Buffer.from(item.bin),pngs.get(size))));
  });
  assert.ok(matching,'Application EXE does not embed the complete matching multiresolution icon');
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  await verifyIcons();
  if(process.argv[2]) await verifyWindowsIcon(process.argv[2]);
  console.log('Icon integrity passed: SVG, nine transparent PNG sizes, seven matching ICO frames'+(process.argv[2]?', and embedded PE resources.':'.'));
}
