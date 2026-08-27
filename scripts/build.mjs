import { build } from "esbuild";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: {
    index: "src/index.ts",
    "entries/analyze": "src/analyze.ts",
    "entries/rules": "src/rules.ts",
    "entries/typescript-parser": "node_modules/@typescript-eslint/parser/dist/index.js",
    "entries/eslint": "node_modules/eslint/lib/api.js",
    "entries/sonarjs": "node_modules/eslint-plugin-sonarjs/cjs/plugin.js",
  },
  bundle: true,
  splitting: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outdir: "dist",
  chunkNames: "chunks/[name]-[hash]",
  entryNames: "[name]",
  minify: true,
  legalComments: "none",
  banner: {
    js: "import { createRequire as __complexityCreateRequire } from 'node:module'; import * as __complexityUrl from 'node:url'; import * as __complexityPath from 'node:path'; const require = __complexityCreateRequire(import.meta.url); const __filename = __complexityUrl.fileURLToPath(import.meta.url); const __dirname = __complexityPath.dirname(__filename);",
  },
});

for (const path of await filesBelow("dist")) {
  if (!path.endsWith(".js")) continue;
  const source = await readFile(path, "utf8");
  await writeFile(path, source.replace(/[ \t]+$/gm, ""));
}

await mkdir("schemas", { recursive: true });
await copyFile(
  "node_modules/@adversarylabs/sdk/schemas/adversary.review.v1.schema.json",
  "schemas/adversary.review.v1.schema.json",
);

async function filesBelow(root) {
  const files = [];
  for (const entry of await readdir(root)) {
    const path = `${root}/${entry}`;
    if ((await stat(path)).isDirectory()) files.push(...await filesBelow(path));
    else files.push(path);
  }
  return files;
}
