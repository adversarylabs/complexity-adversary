import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/index.js",
  banner: {
    js: "import { createRequire as __complexityCreateRequire } from 'node:module'; import * as __complexityUrl from 'node:url'; import * as __complexityPath from 'node:path'; const require = __complexityCreateRequire(import.meta.url); const __filename = __complexityUrl.fileURLToPath(import.meta.url); const __dirname = __complexityPath.dirname(__filename);",
  },
});

await mkdir("schemas", { recursive: true });
await copyFile(
  "node_modules/@adversarylabs/sdk/schemas/adversary.review.v1.schema.json",
  "schemas/adversary.review.v1.schema.json",
);
