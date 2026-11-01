// Deterministic fictional data for documentation captures. No game assets are
// copied, and the generated directory is read by the production Rust core.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const locations = [
  ["alpha", "Alpha City", "ALP", 220, 145],
  ["beta", "Beta City", "BET", 430, 125],
  ["cedar_vale", "Cedar Vale", "BET", 665, 145],
  ["dawnhaven", "Dawnhaven", "COP", 875, 160],
  ["emberwick", "Emberwick", "ALP", 185, 275],
  ["farrow_coast", "Farrow Coast", "ALP", 405, 270],
  ["glenmere", "Glenmere", "BET", 650, 280],
  ["highridge", "Highridge", "COP", 890, 285],
  ["ivory_port", "Ivory Port", "ALP", 210, 390],
  ["juniper_ford", "Juniper Ford", "DEL", 445, 395],
  ["kestrel_fields", "Kestrel Fields", "COP", 655, 410],
  ["larkspur", "Larkspur", "COP", 900, 395],
  ["mistfall", "Mistfall", "DEL", 245, 505],
  ["northgate", "Northgate", "DEL", 430, 510],
  ["oakharbor", "Oakharbor", "DEL", 655, 515],
  ["pinewatch", "Pinewatch", "COP", 860, 500],
];
const countries = {
  ALP: "Alpine Assembly",
  BET: "Bluewater League",
  COP: "Copper Commonwealth",
  DEL: "Dawn Principality",
};
const special = {
  azure_sea: [2, 4, 6],
  mirror_lake: [3, 5, 7],
  silver_ridge: [4, 6, 8],
  old_corridor: [5, 7, 9],
};
const landColors = locations.map((_, index) => [17 + index * 11, 31 + index * 7, 43 + index * 5]);
const hex = (rgb) => rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("");
function gameSize(people) {
  const value = BigInt(people);
  return `${value / 1000n}.${(value % 1000n).toString().padStart(3, "0")}`.replace(/\.?0+$/, "");
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
function mapPng() {
  const width = 1120, height = 640;
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rgb = special.azure_sea;
      const coast = ((x - 560) / 487) ** 2 + ((y - 320) / 278) ** 2;
      if (coast < 1 + 0.045 * Math.sin(x / 37) + 0.035 * Math.sin(y / 24)) {
        const warpedX = x + 16 * Math.sin(y / 32) + 8 * Math.sin(x / 70);
        const warpedY = y + 10 * Math.sin(x / 41);
        let nearest = 0, distance = Infinity;
        for (let index = 0; index < locations.length; index++) {
          const [, , , seedX, seedY] = locations[index];
          const candidate = (warpedX - seedX) ** 2 + (warpedY - seedY) ** 2;
          if (candidate < distance) { distance = candidate; nearest = index; }
        }
        rgb = landColors[nearest];
        if (((x - 625) / 27) ** 2 + ((y - 304) / 18) ** 2 < 1) rgb = special.mirror_lake;
        if (x > 670 && x < 920 && Math.abs(y - (190 + (x - 670) * 0.34 + 10 * Math.sin(x / 33))) < 11) rgb = special.silver_ridge;
        if (x > 225 && x < 365 && Math.abs(y - (445 + 9 * Math.sin(x / 30))) < 7) rgb = special.old_corridor;
      }
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      scanlines[offset] = rgb[0]; scanlines[offset + 1] = rgb[1]; scanlines[offset + 2] = rgb[2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

export async function demoGame(root) {
  const kinds = ["peasants", "burghers", "clergy", "nobles", "laborers", "peasants"];
  const cultures = ["amber", "amber", "amber", "amber", "blue", "blue"];
  const religions = ["sun", "sun", "sun", "sun", "moon", "sun"];
  const populations = locations.map(([key], index) => {
    const amounts = index === 0
      ? [68250, 18800, 4200, 2750, 23100, 6350]
      : [35000 + index * 1750, 7000 + index * 410, 1600 + index * 75, 950 + index * 45, 12500 + index * 530, 3100 + index * 135];
    const rows = amounts.map((amount, row) => `  define_pop = { type = ${kinds[row]} culture = ${cultures[row]} religion = ${religions[row]} size = ${gameSize(amount)} }`);
    return ` ${key} = {\n${rows.join("\n")}\n }`;
  });
  const files = {
    "main_menu/setup/start/06_pops.txt": `\uFEFF# Fictional documentation fixture; not game data.\nlocations = {\n${populations.join("\n")}\n}\n`,
    "main_menu/setup/start/10_countries.txt": `countries = {\n${Object.keys(countries).map((tag) => ` ${tag} = { own_control_core = { ${locations.filter(([, , country]) => country === tag).map(([key]) => key).join(" ")} } }`).join("\n")}\n}\n`,
    "in_game/common/cultures/demo.txt": "amber={} blue={} copper={}\n",
    "in_game/common/religions/demo.txt": "sun={} moon={}\n",
    "in_game/common/pop_types/demo.txt": "peasants={} burghers={} clergy={} nobles={} laborers={} soldiers={}\n",
    "main_menu/localization/english/demo.yml": `\uFEFFl_english:\n${[...Object.entries(countries), ...locations.map(([key, name]) => [key, name]), ["azure_sea", "Azure Sea"], ["mirror_lake", "Mirror Lake"], ["silver_ridge", "Silver Ridge"], ["old_corridor", "Old Corridor"]].map(([key, name]) => ` ${key}:0 "${name}"`).join("\n")}\n`,
    "in_game/map_data/named_locations/demo.txt": [...locations.map(([key], index) => `${key}=${hex(landColors[index])}`), ...Object.entries(special).map(([key, rgb]) => `${key}=${hex(rgb)}`)].join("\n"),
    "in_game/map_data/default.map": 'provinces="locations.png"\nsea_zones={azure_sea}\nlakes={mirror_lake}\nimpassable_mountains={silver_ridge}\nnon_ownable={old_corridor}\n',
  };
  for (const [path, body] of Object.entries(files)) {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, body);
  }
  await writeFile(join(root, "in_game/map_data/locations.png"), mapPng());
  return root;
}
