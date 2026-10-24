// Shared dependency scanner used by language-framework detectors
// (LangGraph, CrewAI, OpenAI Agents SDK, Anthropic SDK, Letta).
//
// Scans the three manifest files commonly found at a project root:
//   - package.json       (Node/TS projects; dependencies + devDependencies +
//                         peerDependencies + optionalDependencies)
//   - pyproject.toml     (PEP 621 and Poetry-style Python projects, scanned
//                         textually so we don't pull in a TOML parser)
//   - requirements.txt   (pip-style Python projects)
//
// The scan is deliberately lenient. Over-detecting is cheap: the installer
// asks the user to confirm before writing any config. Under-detecting means
// a real user's harness slips through to the generic fallback, which is
// worse UX.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { DetectionContext } from "./types.js";

export interface DepMatch {
  /** Path (relative to cwd) of the manifest that contained the match. */
  file: string;
  /** Which candidate name matched. */
  name: string;
}

async function readFileIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function scanPackageJson(
  cwd: string,
  names: readonly string[]
): Promise<DepMatch[]> {
  const raw = await readFileIfExists(path.join(cwd, "package.json"));
  if (!raw) return [];
  let parsed: Record<string, unknown>;
  try {
    // Strip UTF-8 BOM if present. Node's fs.readFile("…", "utf8") keeps
    // the BOM and JSON.parse throws on it; without this strip, a
    // Windows-Notepad-saved package.json would silently report "no
    // matches" and the user's harness would fall through to the generic
    // installer — a detection false-negative, not a data-loss bug, but
    // still a surprising UX downgrade. Mirror of the Round-3 BOM strip
    // in install/shared.ts::readMergeableJson.
    const body = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return [];
  }
  const buckets: (keyof typeof parsed)[] = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  const all: Record<string, string> = {};
  for (const k of buckets) {
    const v = parsed[k];
    if (v && typeof v === "object") {
      Object.assign(all, v as Record<string, string>);
    }
  }
  const matches: DepMatch[] = [];
  for (const n of names) {
    if (Object.prototype.hasOwnProperty.call(all, n)) {
      matches.push({ file: "package.json", name: n });
    }
  }
  return matches;
}

async function scanPyproject(
  cwd: string,
  names: readonly string[]
): Promise<DepMatch[]> {
  const raw = await readFileIfExists(path.join(cwd, "pyproject.toml"));
  if (!raw) return [];
  const matches: DepMatch[] = [];
  for (const n of names) {
    // Accept the package name when it appears:
    //   * as a bare TOML key:            name = "..."
    //   * inside a quoted PEP 508 spec:  "name", "name>=1", "name ; python_version"
    // Prefix char: start-of-line, whitespace, or a quote/bracket/comma/equals.
    // Suffix char: version operator, quote, comma, or bracket — NOT a raw
    // space or letter (that ruled out false positives like "a langgraph tool").
    const re = new RegExp(
      `(^|[\\s"'\\[,=])${escapeRegex(n)}(\\s*[=<>~!^]|["',\\]])`,
      "m"
    );
    if (re.test(raw)) {
      matches.push({ file: "pyproject.toml", name: n });
    }
  }
  return matches;
}

async function scanRequirementsTxt(
  cwd: string,
  names: readonly string[]
): Promise<DepMatch[]> {
  const raw = await readFileIfExists(path.join(cwd, "requirements.txt"));
  if (!raw) return [];
  const lines = raw
    .split(/\r?\n/)
    .map((l) => (l.split("#")[0] ?? "").trim())
    .filter((l) => l.length > 0);
  const matches: DepMatch[] = [];
  for (const n of names) {
    const re = new RegExp(
      `^${escapeRegex(n)}(\\s*[\\[=<>~!]|\\s*$)`,
      "i"
    );
    if (lines.some((l) => re.test(l))) {
      matches.push({ file: "requirements.txt", name: n });
    }
  }
  return matches;
}

export async function findDependency(
  ctx: DetectionContext,
  names: readonly string[]
): Promise<DepMatch[]> {
  const [pkg, py, req] = await Promise.all([
    scanPackageJson(ctx.cwd, names),
    scanPyproject(ctx.cwd, names),
    scanRequirementsTxt(ctx.cwd, names),
  ]);
  return [...pkg, ...py, ...req];
}

export function evidenceFromMatches(matches: readonly DepMatch[]): string[] {
  return matches.map((m) => `${m.file}: ${m.name}`);
}
