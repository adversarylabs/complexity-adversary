import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createApp } from "../src/index.ts";

const execute = promisify(execFile);

async function repository(path: string, before: string, after: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "complexity-clone-"));
  const target = join(root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, before);
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "user.email", "complexity@example.test"], { cwd: root });
  await execute("git", ["config", "user.name", "Complexity Tests"], { cwd: root });
  await execute("git", ["add", "."], { cwd: root });
  await execute("git", ["commit", "-qm", "baseline"], { cwd: root });
  await writeFile(target, after);
  return root;
}

async function review(root: string, path: string) {
  return createApp().run({
    input: {
      source: { path: root },
      change: {
        type: "diff",
        base_ref: "HEAD",
        head_ref: "WORKTREE",
        scan_mode: "changed",
        changed_files: [path],
      },
    },
    includeRawObservations: true,
  });
}

const PYTHON_EXISTING = `class ZoneInfoTests:
    def zone_from_tzstr(self, tzstr):
        zonefile = io.BytesIO(self._tzif_header)
        zonefile.seek(0, 2)
        zonefile.write(b"\\x0A")
        zonefile.write(tzstr.encode("ascii"))
        zonefile.write(b"\\x0A")
        zonefile.seek(0)
        return self.klass.from_file(zonefile, key=tzstr)

    def test_invalid_tzstr(self):
        self.assertRaises(ValueError)
`;

const PYTHON_DUPLICATE = `class ZoneInfoTests:
    def zone_from_tzstr(self, tzstr):
        zonefile = io.BytesIO(self._tzif_header)
        zonefile.seek(0, 2)
        zonefile.write(b"\\x0A")
        zonefile.write(tzstr.encode("ascii"))
        zonefile.write(b"\\x0A")
        zonefile.seek(0)
        return self.klass.from_file(zonefile, key=tzstr)

    def test_invalid_tzstr(self):
        self.assertRaises(ValueError)

    def test_invalid_tzstr_non_ascii_abbr(self):
        tzstr = "ABÀC3"
        footer = tzstr.encode("utf-8")

        def from_footer():
            zonefile = io.BytesIO(self._tzif_header)
            zonefile.seek(0, 2)
            zonefile.write(b"\\x0A")
            zonefile.write(footer)
            zonefile.write(b"\\x0A")
            zonefile.seek(0)
            return self.klass.from_file(zonefile, key=tzstr)

        self.assertRaisesRegex(ValueError, tzstr, from_footer)
`;

const PYTHON_REUSED = `class ZoneInfoTests:
    def zone_from_tzstr(self, tzstr, encoding="ascii"):
        zonefile = io.BytesIO(self._tzif_header)
        zonefile.seek(0, 2)
        zonefile.write(b"\\x0A")
        zonefile.write(tzstr.encode(encoding))
        zonefile.write(b"\\x0A")
        zonefile.seek(0)
        return self.klass.from_file(zonefile, key=tzstr)

    def test_invalid_tzstr(self):
        self.assertRaises(ValueError)

    def test_invalid_tzstr_non_ascii_abbr(self):
        tzstr = "ABÀC3"
        with self.assertRaisesRegex(ValueError, tzstr):
            self.zone_from_tzstr(tzstr, encoding="utf-8")
`;

const RUST_EXISTING = `fn setup_resctrl_group(dir: &Path, pid: Pid) -> Result<bool> {
    let tasks = dir.join("tasks");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(tasks)
        .map_err(|err| {
            tracing::error!("failed to open tasks file: {}", err);
            Error::Open(err)
        })?;
    write!(file, "{pid}").map_err(|err| {
        tracing::error!("failed to write tasks file: {}", err);
        Error::Write(err)
    })?;
    Ok(true)
}
`;

const RUST_DUPLICATE = `${RUST_EXISTING}
fn setup_monitoring_group(dir: &Path, pid: Pid) -> Result<bool> {
    let tasks = dir.join("tasks");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(tasks)
        .map_err(|err| {
            tracing::error!("failed to open monitoring tasks file: {}", err);
            Error::Open(err)
        })?;
    write!(file, "{pid}").map_err(|err| {
        tracing::error!("failed to write monitoring tasks file: {}", err);
        Error::Write(err)
    })?;
    Ok(true)
}
`;

const RUST_REUSED = `fn setup_resctrl_group(dir: &Path, pid: Pid) -> Result<bool> {
    write_pid_to_tasks(dir, pid)?;
    Ok(true)
}

fn setup_monitoring_group(dir: &Path, pid: Pid) -> Result<bool> {
    write_pid_to_tasks(dir, pid)?;
    Ok(true)
}

fn write_pid_to_tasks(dir: &Path, pid: Pid) -> Result<()> {
    let tasks = dir.join("tasks");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(tasks)
        .map_err(|err| Error::Open(err))?;
    write!(file, "{pid}").map_err(|err| Error::Write(err))?;
    Ok(())
}
`;

test("reports the accepted CPython helper-reuse concern", async () => {
  const path = "Lib/test/test_zoneinfo/test_zoneinfo.py";
  const output = await review(await repository(path, PYTHON_EXISTING, PYTHON_DUPLICATE), path);
  const finding = output.findings.find((item) => item.ruleId === "complexity.structural-clone.new");
  assert.ok(finding);
  assert.equal(finding.severity, "low");
  assert.equal(finding.confidence, "high");
  assert.equal(finding.evidence.length, 2);
  assert.match(JSON.stringify(finding.evidence), /BytesIO.*seek.*write.*from_file/);
  assert.equal(output.opinion?.ship, true);
});

test("keeps the accepted CPython parameterized helper fix quiet", async () => {
  const path = "Lib/test/test_zoneinfo/test_zoneinfo.py";
  const output = await review(await repository(path, PYTHON_EXISTING, PYTHON_REUSED), path);
  assert.equal(output.findings.some((item) => item.ruleId === "complexity.structural-clone.new"), false);
});

test("reports the accepted Youki tasks-file duplication", async () => {
  const path = "crates/libcontainer/src/process/intel_rdt.rs";
  const output = await review(await repository(path, RUST_EXISTING, RUST_DUPLICATE), path);
  const finding = output.findings.find((item) => item.ruleId === "complexity.structural-clone.new");
  assert.ok(finding);
  assert.match(JSON.stringify(finding.evidence), /join.*new.*create.*append.*open.*map_err/);
});

test("keeps the accepted Youki extracted helper fix quiet", async () => {
  const path = "crates/libcontainer/src/process/intel_rdt.rs";
  const output = await review(await repository(path, RUST_EXISTING, RUST_REUSED), path);
  assert.equal(output.findings.some((item) => item.ruleId === "complexity.structural-clone.new"), false);
});

test("requires a base-to-current growth from one occurrence to two", async () => {
  const legacy = `${PYTHON_DUPLICATE}\n# legacy duplicate\n`;
  const commentOnly = `${PYTHON_DUPLICATE}\n# documentation changed\n`;
  const path = "Lib/test/test_zoneinfo/test_zoneinfo.py";
  const output = await review(await repository(path, legacy, commentOnly), path);
  assert.equal(output.findings.some((item) => item.ruleId === "complexity.structural-clone.new"), false);
});

test("keeps short idioms, reordered effects, and fake string/comment calls quiet", async () => {
  const before = `def existing():
    open_file()
    seek_file()
    write_header()
    write_body()
    close_file()
`;
  const after = `${before}
def short_copy():
    open_file()
    seek_file()
    write_header()
    write_body()
    close_file()

def different_order():
    open_file()
    write_header()
    seek_file()
    write_body()
    close_file()
    save_file()

FAKE = "open_file() seek_file() write_header() write_body() close_file() save_file()"
# open_file(); seek_file(); write_header(); write_body(); close_file(); save_file()
`;
  const path = "src/example.py";
  const output = await review(await repository(path, before, after), path);
  assert.equal(output.findings.some((item) => item.ruleId === "complexity.structural-clone.new"), false);
});

test("does not equate unrelated receivers that happen to use the same method names", async () => {
  const before = `def existing():
    source.open()
    source.seek()
    source.read()
    source.write()
    source.save()
    source.close()
`;
  const after = `${before}
def unrelated_copy():
    destination.open()
    destination.seek()
    destination.read()
    destination.write()
    destination.save()
    destination.close()
`;
  const path = "src/example.py";
  const output = await review(await repository(path, before, after), path);
  assert.equal(output.findings.some((item) => item.ruleId === "complexity.structural-clone.new"), false);
});

test("is deterministic", async () => {
  const path = "Lib/test/test_zoneinfo/test_zoneinfo.py";
  const root = await repository(path, PYTHON_EXISTING, PYTHON_DUPLICATE);
  assert.deepEqual(await review(root, path), await review(root, path));
});
