import { extname } from "node:path";
import { type SourceRevision, type StructuralClone } from "./types.js";

interface CallEvent {
  signature: string;
  line: number;
}

interface Span {
  line: number;
  endLine: number;
}

interface Pair {
  path: string;
  first: Span;
  second: Span;
  calls: string[];
}

const MIN_CALLS = 6;
const MAX_CALLS = 16;
const MAX_SPAN_LINES = 24;
const CONTROL_WORDS = new Set([
  "catch",
  "class",
  "def",
  "else",
  "except",
  "for",
  "function",
  "if",
  "impl",
  "interface",
  "match",
  "return",
  "struct",
  "switch",
  "trait",
  "try",
  "while",
  "with",
]);
const EFFECTFUL_CALL = /(?:append|close|create|delete|from_file|insert|join|load|open|read|remove|save|seek|send|set|store|update|write)/i;

export function findNewStructuralClones(files: SourceRevision[]): StructuralClone[] {
  const findings: StructuralClone[] = [];

  for (const file of files) {
    if (file.status === "repository" || file.previous === undefined) continue;
    const current = extractCalls(file.current, extname(file.path).toLowerCase());
    const previous = extractCalls(file.previous, extname(file.path).toLowerCase());
    const pairs = candidatePairs(file.path, current, previous);

    for (const pair of pairs) {
      const firstChanged = intersects(file.changedLines, pair.first);
      const secondChanged = intersects(file.changedLines, pair.second);
      if (!firstChanged && !secondChanged) continue;
      const changed = secondChanged ? pair.second : pair.first;
      const existing = secondChanged ? pair.first : pair.second;
      findings.push({
        path: pair.path,
        changed,
        existing,
        calls: pair.calls,
      });
    }
  }

  return findings.sort((left, right) =>
    left.path.localeCompare(right.path) || left.changed.line - right.changed.line,
  );
}

function candidatePairs(path: string, current: CallEvent[], previous: CallEvent[]): Pair[] {
  const candidates: Pair[] = [];
  for (let first = 0; first < current.length; first += 1) {
    for (let second = first + MIN_CALLS; second < current.length; second += 1) {
      if (current[second] === undefined || current[first] === undefined) continue;
      if (current[second].line <= current[first].line) continue;
      let length = commonLength(current, first, second);
      while (length >= MIN_CALLS) {
        const calls = current.slice(first, first + length).map((event) => event.signature);
        if (qualifies(calls) && occurrenceCount(previous, calls) === 1 && occurrenceCount(current, calls) >= 2) {
          candidates.push({
            path,
            first: span(current, first, length),
            second: span(current, second, length),
            calls,
          });
          break;
        }
        length -= 1;
      }
    }
  }

  candidates.sort((left, right) => right.calls.length - left.calls.length || left.first.line - right.first.line);
  const accepted: Pair[] = [];
  for (const candidate of candidates) {
    if (accepted.some((item) => sameRegion(item, candidate))) continue;
    accepted.push(candidate);
  }
  return accepted;
}

function commonLength(events: CallEvent[], first: number, second: number): number {
  let length = 0;
  while (length < MAX_CALLS) {
    const left = events[first + length];
    const right = events[second + length];
    if (left === undefined || right === undefined || left.signature !== right.signature) break;
    if (right.line - events[second]!.line > MAX_SPAN_LINES) break;
    if (left.line - events[first]!.line > MAX_SPAN_LINES) break;
    length += 1;
  }
  return length;
}

function occurrenceCount(events: CallEvent[], calls: string[]): number {
  let count = 0;
  for (let index = 0; index + calls.length <= events.length; index += 1) {
    const candidate = events.slice(index, index + calls.length);
    if (candidate[candidate.length - 1]!.line - candidate[0]!.line > MAX_SPAN_LINES) continue;
    if (candidate.every((event, offset) => event.signature === calls[offset])) count += 1;
  }
  return count;
}

function qualifies(calls: string[]): boolean {
  return new Set(calls).size >= 3 &&
    calls.some((call) => EFFECTFUL_CALL.test(call)) &&
    calls.some((call) => call.includes(".") || call.includes("::"));
}

function span(events: CallEvent[], start: number, length: number): Span {
  return { line: events[start]!.line, endLine: events[start + length - 1]!.line };
}

function intersects(lines: Set<number>, candidate: Span): boolean {
  for (let line = candidate.line; line <= candidate.endLine; line += 1) {
    if (lines.has(line)) return true;
  }
  return false;
}

function sameRegion(left: Pair, right: Pair): boolean {
  return overlaps(left.first, right.first) && overlaps(left.second, right.second);
}

function overlaps(left: Span, right: Span): boolean {
  return left.line <= right.endLine && right.line <= left.endLine;
}

function extractCalls(source: string, extension: string): CallEvent[] {
  const lines = maskSource(source, extension);
  const events: CallEvent[] = [];
  const pattern = /([A-Za-z_$][\w$]*(?:(?:\.|::)[A-Za-z_$][\w$]*)*)\s*(!)?\s*\(/g;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    pattern.lastIndex = 0;
    for (const match of line.matchAll(pattern)) {
      const raw = match[1] ?? "";
      const tail = raw.split(/\.|::/).at(-1) ?? raw;
      if (CONTROL_WORDS.has(tail)) continue;
      const prefix = line.slice(0, match.index).trim();
      if (/^(?:async\s+def|def|fn|function|class|interface|struct|enum|trait|impl)\s+$/i.test(prefix)) continue;
      events.push({ signature: normalizeCall(raw, match[2] ?? ""), line: index + 1 });
      break;
    }
  }
  return events;
}

function normalizeCall(raw: string, macro: string): string {
  const separator = raw.includes("::") ? "::" : ".";
  const parts = raw.split(/\.|::/);
  if (parts.length === 1) return `${raw}${macro}`;
  if (parts[0] === "self" || parts[0] === "cls" || parts[0] === "this") {
    return `${parts.slice(-2).join(".")}${macro}`;
  }
  return `${parts.slice(-2).join(separator)}${macro}`;
}

function maskSource(source: string, extension: string): string[] {
  let state: "normal" | "single" | "double" | "template" | "block" | "triple-single" | "triple-double" | "raw" = "normal";
  let rawTerminator = "";
  let escaped = false;
  let output = "";

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";
    const three = source.slice(index, index + 3);
    if (char === "\n") {
      output += "\n";
      if (state === "single" || state === "double") state = "normal";
      escaped = false;
      continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "normal";
      } else output += " ";
      continue;
    }
    if (state === "raw") {
      if (source.startsWith(rawTerminator, index)) {
        output += " ".repeat(rawTerminator.length);
        index += rawTerminator.length - 1;
        state = "normal";
      } else output += " ";
      continue;
    }
    if (state === "triple-single" || state === "triple-double") {
      const terminator = state === "triple-single" ? "'''" : "\"\"\"";
      if (source.startsWith(terminator, index)) {
        output += "   ";
        index += 2;
        state = "normal";
      } else output += " ";
      continue;
    }
    if (state !== "normal") {
      output += " ";
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (
        (state === "single" && char === "'") ||
        (state === "double" && char === "\"") ||
        (state === "template" && char === "`")
      ) state = "normal";
      continue;
    }

    if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block";
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        output += " ";
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (extension === ".py" && char === "#") {
      while (index < source.length && source[index] !== "\n") {
        output += " ";
        index += 1;
      }
      index -= 1;
      continue;
    }
    if (extension === ".py" && (three === "'''" || three === "\"\"\"")) {
      output += "   ";
      index += 2;
      state = three === "'''" ? "triple-single" : "triple-double";
      continue;
    }
    if (extension === ".rs" && char === "r") {
      const raw = /^r(#+)?\"/.exec(source.slice(index));
      if (raw !== null) {
        const hashes = raw[1] ?? "";
        output += " ".repeat(raw[0].length);
        index += raw[0].length - 1;
        rawTerminator = `\"${hashes}`;
        state = "raw";
        continue;
      }
    }
    if (char === "'" || char === "\"" || char === "`") {
      output += " ";
      state = char === "'" ? "single" : char === "\"" ? "double" : "template";
      continue;
    }
    output += char;
  }
  return output.split("\n");
}
