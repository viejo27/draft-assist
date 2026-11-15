import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(root, "crates", "draft-engine", "data");
const outputDir = path.join(root, "src", "data");
await mkdir(outputDir, { recursive: true });

const [catalog, meta, templates, exampleState, packageJson] = await Promise.all([
  readFile(path.join(dataDir, "champions.json"), "utf8").then(JSON.parse),
  readFile(path.join(dataDir, "champion-meta.json"), "utf8").then(JSON.parse),
  readFile(path.join(dataDir, "templates.json"), "utf8").then(JSON.parse),
  readFile(path.join(dataDir, "example-state.json"), "utf8").then(JSON.parse),
  readFile(path.join(root, "package.json"), "utf8").then(JSON.parse),
]);

const champions = catalog.champions
  .map((champion) => {
    const championMeta = meta.champions[champion.id];
    if (!championMeta) return null;
    return {
      id: champion.id,
      name: champion.name,
      title: champion.title,
      image: champion.image,
      roles: championMeta.roles,
      tags: champion.tags,
      damage: championMeta.damage,
      priority: championMeta.priority,
    };
  })
  .filter(Boolean);

const bootstrap = {
  champions,
  templates: templates.templates,
  settings: exampleState.settings,
  data: {
    data_dir: "preview/data",
    state_path: "preview/state.json",
    stats: {
      version: catalog.version,
      champions: champions.length,
      meta_entries: Object.keys(meta.champions).length,
      matchups: JSON.parse(await readFile(path.join(dataDir, "matchups.json"), "utf8")).matchups.length,
      synergies: JSON.parse(await readFile(path.join(dataDir, "synergies.json"), "utf8")).synergies.length,
      templates: templates.templates.length,
    },
  },
  example_state: exampleState,
  warnings: [],
  app_version: packageJson.version,
};

await writeFile(
  path.join(outputDir, "preview-bootstrap.json"),
  `${JSON.stringify(bootstrap, null, 2)}\n`,
  "utf8",
);

console.log(`Preview bootstrap: ${champions.length} campeones.`);
