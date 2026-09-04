import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execute = promisify(execFile);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("the published runtime executes without the development dependency tree", async () => {
  const artifact = await mkdtemp(join(tmpdir(), "complexity-artifact-"));
  const repository = await mkdtemp(join(tmpdir(), "complexity-target-"));
  const entrypoint = join(artifact, "dist", "index.js");
  const schema = join(artifact, "schemas", "adversary.review.v1.schema.json");
  const input = join(artifact, "input.json");
  const output = join(artifact, "output.json");

  const { stdout: trackedOutput } = await execute("git", ["ls-files", "-z", "dist"], { cwd: projectRoot });
  const tracked = trackedOutput.split("\0").filter(Boolean).sort();
  const generated = (await filesBelow(join(projectRoot, "dist")))
    .map((path) => `dist/${path}`)
    .sort();
  assert.deepEqual(generated, tracked, "every generated runtime chunk must be tracked in the release commit");

  await cp(join(projectRoot, "dist"), join(artifact, "dist"), { recursive: true });
  await mkdir(dirname(schema), { recursive: true });
  await mkdir(join(repository, "src"), { recursive: true });
  await copyFile(join(projectRoot, "schemas", "adversary.review.v1.schema.json"), schema);
  await copyFile(join(projectRoot, "package.json"), join(artifact, "package.json"));
  await writeFile(join(repository, "src", "index.ts"), "export const value = 1;\n");
  await writeFile(input, `${JSON.stringify({ source: { path: repository } })}\n`);

  const bundle = await readFile(entrypoint, "utf8");
  assert.doesNotMatch(bundle, /from\s+["'](?:@adversarylabs\/sdk|eslint|eslint-plugin-sonarjs|@typescript-eslint\/parser)["']/);

  await execute(process.execPath, [entrypoint], {
    cwd: artifact,
    env: {
      ...process.env,
      ADVERSARY_INPUT: input,
      ADVERSARY_OUTPUT: output,
      ADVERSARY_REPO: repository,
    },
  });

  const envelope = JSON.parse(await readFile(output, "utf8"));
  assert.equal(envelope.protocolVersion, 1);
  assert.equal(envelope.result.adversary.name, "review/complexity");
  assert.equal(envelope.result.adversary.version, "0.0.13");
  assert.deepEqual(envelope.result.findings, []);
});

async function filesBelow(root: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(join(root, prefix))) {
    const relative = join(prefix, entry);
    if ((await stat(join(root, relative))).isDirectory()) files.push(...await filesBelow(root, relative));
    else files.push(relative.split("\\").join("/"));
  }
  return files;
}
