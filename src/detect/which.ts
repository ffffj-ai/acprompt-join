// PATH lookup that never executes the binary it finds.
//
// Why not `execFile(name, ["--version"])` like the Claude Code detector does?
// Because desktop-app CLIs are not all safe to invoke: `cursor`, `windsurf`
// and `zed` will happily launch the full GUI (or block on a socket waiting
// for a running instance). A detector runs on every `install` invocation, so
// "probing" must be a read, not a process spawn.
//
// We therefore resolve the name against PATH with fs only. On Windows we try
// the usual executable suffixes because `where cursor` would have matched
// `cursor.cmd` / `cursor.exe` regardless of how npm or the native installer
// shipped it (the R33 bug: probing only `claude.cmd` missed native installs).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { DetectionContext } from "./types.js";

/** Extensions Windows will resolve for a bare command name. */
const WIN_SUFFIXES = ["", ".exe", ".cmd", ".bat", ".ps1", ".com"] as const;
const POSIX_SUFFIXES = [""] as const;

async function isFile(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve `names` against `ctx.env.PATH`. Returns the absolute path of the
 * first hit, or null. Pure filesystem access — nothing is executed.
 *
 * `ctx.env` (not `process.env`) is read deliberately so tests can supply a
 * controlled PATH; same reasoning as the R33 fix in claude-code.ts.
 */
export async function findExecutableOnPath(
  ctx: DetectionContext,
  names: readonly string[]
): Promise<string | null> {
  const rawPath = ctx.env.PATH ?? ctx.env.Path ?? "";
  if (!rawPath) return null;

  const suffixes = ctx.platform === "win32" ? WIN_SUFFIXES : POSIX_SUFFIXES;
  // `path.delimiter` follows the HOST, not ctx.platform. Reading a Windows
  // PATH as ";" separators on a POSIX host (or vice versa) silently yields one
  // giant bogus entry, so pick the separator from ctx explicitly.
  const separator = ctx.platform === "win32" ? ";" : ":";
  const dirs = rawPath.split(separator).filter((d) => d.length > 0);

  for (const name of names) {
    for (const dir of dirs) {
      for (const suffix of suffixes) {
        const candidate = path.join(dir, name + suffix);
        if (await isFile(candidate)) return candidate;
      }
    }
  }
  return null;
}
