// Resolve notices from the exact locked graph; no global package manager changes.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,cp,rm,access} from 'node:fs/promises';
import {join,dirname} from 'node:path';
function command(file,args){const r=spawnSync(file,args,{encoding:'utf8',shell:false,maxBuffer:32*1024*1024});if(r.status!==0)throw new Error(r.stderr||String(r.error));return r.stdout;}
const graph=JSON.parse(command('cargo',['metadata','--locked','--offline','--format-version','1','--manifest-path','core/Cargo.toml']));
await rm('third-party/rust',{recursive:true,force:true});await mkdir('third-party/rust',{recursive:true});let inventory='# Resolved Rust dependency licenses\n\nFrom Cargo.lock and downloaded official crate manifests. Includes target-specific and build dependencies. License texts are retained under rust/.\n\n| Crate | Version | License |\n|---|---|---|\n';
for(const p of graph.packages.filter(p=>p.source).sort((a,b)=>a.name.localeCompare(b.name))){const base=dirname(p.manifest_path),dest=join('third-party/rust',`${p.name}-${p.version}`);await mkdir(dest);let count=0;
 async function walk(rel=''){for(const e of await readdir(join(base,rel),{withFileTypes:true})){const path=join(rel,e.name);if(e.isDirectory())await walk(path);else if(e.isFile()&&(/^(LICENSE|LICENCE|COPYING|NOTICE|UNLICENSE|AUTHORS|COPYRIGHT)/i.test(e.name)||path.split(/[\\/]/).some(v=>/^licenses?$/i.test(v))||path===p.license_file)){await cp(join(base,path),join(dest,path.replaceAll('\\','__').replaceAll('/','__')));count++;}}}
 await walk();if(!count)throw new Error(`No license notice found for ${p.name}; review before packaging`);inventory+=`| ${p.name} | ${p.version} | ${p.license||'See retained license file'} |\n`;
}
await writeFile('third-party/RUST-LICENSE-INVENTORY.md',inventory);
const std=join(command('rustc',['--print','sysroot']).trim(),'share/doc/rust');const stdDest='third-party/rust-standard-library';await mkdir(stdDest,{recursive:true});let copyright='COPYRIGHT-library.html';try{await access(join(std,copyright));}catch{copyright='COPYRIGHT.html';}await cp(join(std,copyright),join(stdDest,copyright));await cp(join(std,'licenses'),join(stdDest,'licenses'),{recursive:true});
const lock=JSON.parse(await readFile('package-lock.json','utf8'));let npm='# Resolved npm dependency licenses\n\nDeclared metadata from package-lock.json. Build dependencies are not shipped as node_modules.\n\n| Package | Version | License |\n|---|---|---|\n';for(const [name,p]of Object.entries(lock.packages).sort()){if(name)npm+=`| ${name} | ${p.version||''} | ${p.license||'See upstream package notices'} |\n`;}
await writeFile('third-party/NPM-LICENSE-INVENTORY.md',npm);for(const name of ['react','react-dom','electron']){await mkdir(join('third-party',name),{recursive:true});await cp(join('node_modules',name,'LICENSE'),join('third-party',name,'LICENSE'));}
console.log(`Retained notices for ${graph.packages.filter(p=>p.source).length} locked Rust crates, Rust standard library, Electron and React; npm inventory refreshed.`);
