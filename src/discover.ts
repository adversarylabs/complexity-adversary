import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { SOURCE_EXTENSIONS, type SourceRevision } from "./types.js";

const execute = promisify(execFile);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "vendor",
]);
const MAX_FILE_BYTES = 750_000;
const MAX_FILES = 500;

export interface Discovery {
  mode: "diff" | "repository";
  base?: string;
  files: SourceRevision[];
  changedTestFiles: number;
  changedSourceFiles: number;
}

export async function discoverSources(repoPath: string): Promise<Discovery> {
  const git = await isGitRepository(repoPath);
  if (!git) {
    const files = await repositoryFiles(repoPath);
    return {
      mode: "repository",
      files: await readRepositorySources(repoPath, files),
      changedTestFiles: 0,
      changedSourceFiles: files.length,
    };
  }

  const worktree = await gitOutput(repoPath, ["diff", "--name-status", "--find-renames", "HEAD", "--"]);
  if (worktree.trim() !== "") {
    return diffDiscovery(repoPath, "HEAD", worktree);
  }

  const base = await chooseBase(repoPath);
  if (base !== undefined) {
    const names = await gitOutput(repoPath, ["diff", "--name-status", "--find-renames", base, "HEAD", "--"]);
    if (names.trim() !== "") {
      return diffDiscovery(repoPath, base, names);
    }
  }

  const files = (await gitOutput(repoPath, ["ls-files", "-z"]))
    .split("\0")
    .filter((path) => isSourcePath(path))
    .slice(0, MAX_FILES);
  return {
    mode: "repository",
    files: await readRepositorySources(repoPath, files),
    changedTestFiles: 0,
    changedSourceFiles: files.length,
  };
}

async function diffDiscovery(repoPath: string, base: string, names: string): Promise<Discovery> {
  const records = parseNameStatus(names).filter((record) => record.status !== "D");
  const sourceRecords = records.filter((record) => isSourcePath(record.path)).slice(0, MAX_FILES);
  const files: SourceRevision[] = [];

  for (const record of sourceRecords) {
    const absolute = join(repoPath, record.path);
    const current = await safeRead(absolute);
    if (current === undefined) continue;
    const oldPath = record.oldPath ?? record.path;
    const previous = record.status === "A" ? undefined : await gitShow(repoPath, base, oldPath);
    const changedLines = await changedLineNumbers(repoPath, base, record.path);
    files.push({
      path: record.path,
      current,
      previous,
      changedLines,
      status: record.status === "A" ? "added" : "modified",
    });
  }

  return {
    mode: "diff",
    base,
    files,
    changedTestFiles: records.filter((record) => isTestPath(record.path)).length,
    changedSourceFiles: sourceRecords.filter((record) => !isTestPath(record.path)).length,
  };
}

async function chooseBase(repoPath: string): Promise<string | undefined> {
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    if (!(await revisionExists(repoPath, candidate))) continue;
    const mergeBase = (await gitOutput(repoPath, ["merge-base", "HEAD", candidate])).trim();
    if (mergeBase !== "" && mergeBase !== (await gitOutput(repoPath, ["rev-parse", "HEAD"])).trim()) {
      return mergeBase;
    }
  }
  if (await revisionExists(repoPath, "HEAD^")) return "HEAD^";
  return undefined;
}

async function changedLineNumbers(repoPath: string, base: string, path: string): Promise<Set<number>> {
  const patch = await gitOutput(repoPath, ["diff", "--unified=0", base, "--", path]);
  const lines = new Set<number>();
  for (const match of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = Math.max(1, match[2] === undefined ? 1 : Number(match[2]));
    for (let line = start; line < start + count; line += 1) lines.add(line);
  }
  return lines;
}

async function repositoryFiles(repoPath: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string): Promise<void> {
    if (result.length >= MAX_FILES) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (result.length >= MAX_FILES) return;
      if (entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(absolute);
      } else {
        const path = relative(repoPath, absolute).split(sep).join("/");
        if (isSourcePath(path)) result.push(path);
      }
    }
  }
  await walk(repoPath);
  return result;
}

async function readRepositorySources(repoPath: string, paths: string[]): Promise<SourceRevision[]> {
  const files: SourceRevision[] = [];
  for (const path of paths) {
    const current = await safeRead(join(repoPath, path));
    if (current !== undefined) {
      files.push({ path, current, changedLines: new Set<number>(), status: "repository" });
    }
  }
  return files;
}

async function safeRead(path: string): Promise<string | undefined> {
  try {
    const content = await readFile(path);
    if (content.byteLength > MAX_FILE_BYTES || content.includes(0)) return undefined;
    return content.toString("utf8");
  } catch {
    return undefined;
  }
}

async function gitShow(repoPath: string, revision: string, path: string): Promise<string | undefined> {
  try {
    return await gitOutput(repoPath, ["show", `${revision}:${path}`]);
  } catch {
    return undefined;
  }
}

async function revisionExists(repoPath: string, revision: string): Promise<boolean> {
  try {
    await execute("git", ["-C", repoPath, "rev-parse", "--verify", "--quiet", revision], {
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function isGitRepository(repoPath: string): Promise<boolean> {
  try {
    return (await gitOutput(repoPath, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch {
    return false;
  }
}

async function gitOutput(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execute("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

function parseNameStatus(output: string): Array<{ status: string; path: string; oldPath?: string }> {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const fields = line.split("\t");
      const status = fields[0]?.slice(0, 1) ?? "";
      if ((status === "R" || status === "C") && fields.length >= 3) {
        return { status, oldPath: fields[1], path: fields[2] ?? "" };
      }
      return { status, path: fields[1] ?? "" };
    });
}

function isSourcePath(path: string): boolean {
  if (!SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) return false;
  const parts = path.split("/");
  if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) return false;
  return !/\.(?:min|bundle|generated)\.[cm]?[jt]sx?$/i.test(path);
}

export function isTestPath(path: string): boolean {
  return /(^|\/)(?:test|tests|__tests__|spec)(\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path);
}
