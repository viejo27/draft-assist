import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      args[key] = value;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const config = JSON.parse(
  await readFile(join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = config.version;
if (!version) {
  throw new Error("tauri.conf.json no tiene una versión definida.");
}

const tag = args.tag ?? `v${version}`;
const repoMatch = String(pkg.repository?.url ?? "").match(
  /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/,
);
const repo = repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : "viejo27/draft-assist";

const nsisDir = join(root, "target", "release", "bundle", "nsis");
let installerPath = args.installer ? resolve(root, args.installer) : null;
if (!installerPath) {
  const entries = await readdir(nsisDir).catch(() => []);
  const name = entries.find((entry) => entry.endsWith(`_${version}_x64-setup.exe`));
  if (!name) {
    throw new Error(
      `No encontré el instalador NSIS ${version} en ${nsisDir}. Ejecutá "npm run build -- --bundles nsis" primero.`,
    );
  }
  installerPath = join(nsisDir, name);
}

if (!existsSync(installerPath)) {
  throw new Error(`No existe el instalador: ${installerPath}`);
}

const sigPath = args.sig ? resolve(root, args.sig) : `${installerPath}.sig`;
if (!existsSync(sigPath)) {
  throw new Error(
    `No encontré la firma ${sigPath}. El build tiene que haber corrido con TAURI_SIGNING_PRIVATE_KEY configurada.`,
  );
}

const assetName = basename(installerPath).replace(/\s+/g, ".");
const signature = (await readFile(sigPath, "utf8")).trim();
if (!signature) {
  throw new Error(`La firma ${sigPath} está vacía.`);
}

let notes = typeof args.notes === "string" ? args.notes : null;
if (!notes && typeof args["notes-file"] === "string") {
  notes = (await readFile(resolve(root, args["notes-file"]), "utf8")).trim();
}
if (!notes) {
  const defaultNotes = join(root, "release-notes", `${version}.md`);
  if (existsSync(defaultNotes)) {
    notes = (await readFile(defaultNotes, "utf8")).trim();
  }
}
notes ||= `Draft Assist ${version}`;

const outDir = resolve(
  root,
  typeof args.out === "string"
    ? args.out
    : join("target", "release", "bundle", `release-${tag}`),
);
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const sigAssetName = `${assetName}.sig`;
await copyFile(installerPath, join(outDir, assetName));
await copyFile(sigPath, join(outDir, sigAssetName));
await writeFile(join(outDir, "notes.md"), `${notes}\n`, "utf8");

const assetUrl = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(assetName)}`;
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64-nsis": {
      signature,
      url: assetUrl,
    },
    "windows-x86_64": {
      signature,
      url: assetUrl,
    },
  },
};
await writeFile(
  join(outDir, "latest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

console.log(`Release ${tag} preparado en ${outDir}`);
console.log(`  ${assetName}`);
console.log(`  ${sigAssetName}`);
console.log("  latest.json");
console.log("  notes.md");
console.log("");
console.log("Para publicarlo en GitHub:");
console.log(
  `gh release create ${tag} --title "Draft Assist ${version}" --notes-file "${join(outDir, "notes.md")}" "${join(outDir, assetName)}" "${join(outDir, sigAssetName)}" "${join(outDir, "latest.json")}"`,
);
console.log("");
console.log(
  "El release tiene que quedar publicado (no draft ni prerelease) para que funcione /releases/latest/download/latest.json.",
);
