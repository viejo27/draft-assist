import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const vendoredSource = path.join(root, "scripts", "vendor", "champion.json");
const dragonRoot = path.join(root, "lol-things", "16.21.1");
const dragonSource = path.join(dragonRoot, "data", "en_US", "champion.json");
const source = existsSync(vendoredSource)
  ? vendoredSource
  : dragonSource;
const targetDir = path.join(root, "crates", "draft-engine", "data");
const iconSource = path.join(dragonRoot, "img", "champion");
const iconTarget = path.join(root, "src", "assets", "champions");

if (!existsSync(source)) {
  console.error(
    "No hay fuente de campeones. Se esperaba scripts/vendor/champion.json o lol-things/16.21.1/data/en_US/champion.json.",
  );
  process.exit(1);
}

const dragon = JSON.parse(await readFile(source, "utf8"));
const champions = Object.values(dragon.data)
  .map((champion) => ({
    id: champion.id,
    key: champion.key,
    name: champion.name,
    title: champion.title,
    image: champion.image.full,
    tags: champion.tags,
    info: champion.info,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

await mkdir(targetDir, { recursive: true });
await mkdir(iconTarget, { recursive: true });

await writeFile(
  path.join(targetDir, "champions.json"),
  `${JSON.stringify({ version: dragon.version, champions }, null, 2)}\n`,
  "utf8",
);

let copied = 0;
let missingIcons = 0;
for (const champion of champions) {
  const from = path.join(iconSource, champion.image);
  const to = path.join(iconTarget, champion.image);
  if (existsSync(to)) continue;
  if (existsSync(from)) {
    await copyFile(from, to);
    copied += 1;
  } else {
    missingIcons += 1;
  }
}

const metaPath = path.join(targetDir, "champion-meta.json");
if (!existsSync(metaPath)) {
  console.warn("champion-meta.json no existe todavía. Ejecuta scripts/seed-meta.mjs.");
} else {
  const meta = JSON.parse(await readFile(metaPath, "utf8"));
  const missing = champions.filter((champion) => !meta.champions[champion.id]);
  if (missing.length > 0) {
    console.warn(`Faltan ${missing.length} campeones en champion-meta.json: ${missing.map((c) => c.id).join(", ")}`);
  }
}

console.log(`Catálogo: ${champions.length} campeones (${dragon.version}).`);
if (copied > 0) console.log(`Iconos nuevos copiados: ${copied}.`);
if (missingIcons > 0) {
  console.warn(`Faltan ${missingIcons} iconos en el origen; se conservan los ya existentes en src/assets/champions.`);
}
console.log(`Datos: ${path.relative(root, targetDir)}`);
