import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
export const population =
  "\uFEFF# Synthetic test data, not EU5 assets\r\nlocations={alpha={future_location={flag=yes}\r\n define_pop={type=peasants culture=amber religion=sun size=7.001 future={flag=yes}}\r\n define_pop={type=clergy culture=amber religion=sun size=0.999}\r\n define_pop={type=peasants culture=blue religion=moon size=2}\r\n}\r\nbeta={define_pop={type=peasants culture=blue religion=moon size=4}} gamma={}}\r\n";
export async function syntheticGame(root, pops = population, { restrictedMap = false } = {}) {
  if (restrictedMap) {
    const keys = ["south_sea", "blue_lake", "mountain_corridor", "wasteland_corridor", "shared_land", "sea_alias"];
    const extra = keys.map(key => `${key}={define_pop={type=peasants culture=amber religion=sun size=1}}`).join(" ");
    // Deliberately include populations in blocked regions: map filtering must
    // use terrain classification, not merely the absence of population data.
    pops = pops.replace(/}\r?\n$/, `${extra}}\r\n`);
  }
  const files = {
    "main_menu/setup/start/06_pops.txt": pops,
    "main_menu/setup/start/10_countries.txt":
      "countries={countries={ALP={own_control_core={alpha gamma}} BET={own_control_core={beta}}}}",
    "in_game/common/cultures/fixture.txt": "amber={} blue={} copper={}",
    "in_game/common/religions/fixture.txt": "sun={} moon={}",
    "in_game/common/pop_types/fixture.txt": "peasants={} clergy={}",
    "main_menu/localization/english/fixture.yml":
      '\uFEFFl_english:\n ALP:0 "Alpine Assembly"\n alpha:0 "Alpha City"\n beta:0 "Beta City"\n',
    "in_game/map_data/named_locations/fixture.txt": restrictedMap
      ? "alpha=010203 beta=040506 south_sea=070809 blue_lake=0A0B0C mountain_corridor=0D0E0F wasteland_corridor=101112 shared_land=131415 sea_alias=131415"
      : "alpha=010203 beta=040506",
    "in_game/map_data/default.map": restrictedMap
      ? 'provinces="locations.png" sea_zones={south_sea sea_alias} lakes={blue_lake} impassable_mountains={mountain_corridor} non_ownable={wasteland_corridor}'
      : 'provinces="locations.png"',
  };
  for (const [path, body] of Object.entries(files)) {
    const p = join(root, path);
    await mkdir(join(p, ".."), { recursive: true });
    await writeFile(p, body);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let b = 0; b < 8; b++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const n = Buffer.alloc(4),
      c = Buffer.alloc(4);
    n.writeUInt32BE(data.length);
    c.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([n, body, c]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(restrictedMap ? 8 : 4, 0);
  header.writeUInt32BE(2, 4);
  header[8] = 8;
  header[9] = 2;
  await writeFile(
    join(root, "in_game/map_data/locations.png"),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk(
        "IDAT",
        deflateSync(
          restrictedMap
            ? Buffer.from(Array.from({ length: 2 }, () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]).flat())
            : Buffer.from([
                0, 1, 2, 3, 1, 2, 3, 4, 5, 6, 4, 5, 6, 0, 1, 2, 3, 1, 2, 3, 4, 5, 6,
                4, 5, 6,
              ]),
        ),
      ),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
  return root;
}
