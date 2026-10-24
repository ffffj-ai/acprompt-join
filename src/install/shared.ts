// Shared types + helpers for per-harness installers.
//
// An "installer" is the post-detection step that either (a) writes the MCP
// server config into a framework's registry file (Claude Desktop, Letta) or
// (b) prints a code snippet for the user to paste into their own source
// (LangGraph, CrewAI, OpenAI Agents SDK, Anthropic SDK). The generic
// fallback prints bare endpoint + header info.

import { promises as fs } from "node:fs";
import type { DetectionResult } from "../detect/types.js";

// MUST be the www-prefixed canonical origin. Bare `acprompt.com` 307-redirects
// to www, and most HTTP clients (including the MCP SDK's StreamableHTTP
// transport and Node's fetch) strip the Authorization header on cross-host
// redirects — so a `Bearer acp_mcp_*` sent to the bare domain silently hits
// the server without auth and gets 401. Same trap bit R37 GitHub webhooks.
export const DEFAULT_MCP_URL = "https://www.acprompt.com/api/mcp";

export interface InstallerContext {
  /** The detection result for the picked harness. */
  readonly detection: DetectionResult;
  /** User home dir. */
  readonly home: string;
  /** Platform from the detection context. */
  readonly platform: NodeJS.Platform;
  /** Bearer token to embed in the MCP config / snippet. */
  readonly token: string;
  /** MCP endpoint URL (default `DEFAULT_MCP_URL`; server response may override). */
  readonly mcpUrl: string;
  /**
   * When true, the installer should NOT write any files or print secrets —
   * it runs a dry-plan, returning `wrote`/`printed` arrays with the paths/
   * labels it WOULD have touched. Used in tests.
   */
  readonly dryRun?: boolean;
}

export interface InstallerResult {
  /** Absolute paths the installer actually wrote to. */
  wrote: string[];
  /**
   * Labels of snippets the installer printed. Callers don't re-render;
   * this array is purely for UX summaries + test assertions.
   */
  printed: string[];
}

export type HarnessInstaller = (ic: InstallerContext) => Promise<InstallerResult>;

/** Infer whether the repo is Python, JS/TS, or both, from detector evidence. */
export function inferLanguage(
  evidence: readonly string[] | undefined
): "python" | "javascript" | "both" {
  if (!evidence || evidence.length === 0) return "both";
  const hasPy = evidence.some((e) => /pyproject\.toml|requirements\.txt/.test(e));
  const hasJs = evidence.some((e) => /package\.json/.test(e));
  if (hasPy && hasJs) return "both";
  if (hasPy) return "python";
  if (hasJs) return "javascript";
  return "both";
}

/**
 * Read an existing JSON config that an installer is about to merge into.
 *
 * Contract:
 *   - File missing (ENOENT) → returns `null`. Caller creates dir + starts
 *     with an empty object.
 *   - File exists, parses cleanly → returns the parsed object.
 *   - File exists, CANNOT be parsed (corrupted JSON, partial save,
 *     unexpected non-object root) → throws a clear actionable error.
 *     **Never returns `null` or `{}` from a bad-parse**, because the
 *     caller would immediately overwrite the file with only our entry,
 *     silently destroying every other MCP server the user had configured.
 *
 * BOM-awareness: Windows tools (Notepad, VS Code with "UTF-8 with BOM")
 * sometimes prepend U+FEFF to saved files. Node's `fs.readFile(…, "utf8")`
 * does NOT strip it. A leading BOM makes `JSON.parse` throw with an
 * unhelpful "Unexpected token" message, which under the old catch-all
 * handler silently clobbered the user's whole config. We strip the BOM
 * before parsing.
 *
 * This helper is the load-bearing piece behind the Round-3 data-loss
 * fix; any new merge-write installer added in the future must route
 * through it, not call `fs.readFile` + `JSON.parse` directly.
 */
export async function readMergeableJson(
  configPath: string
): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
  // Strip UTF-8 BOM if present. `fs.readFile("…", "utf8")` keeps it —
  // Node does not auto-strip, contrary to some cross-platform assumptions.
  const body = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error(
      `Cannot parse existing config at ${configPath}: ${(err as Error).message}. ` +
        `Refusing to overwrite — fix or delete the file, then re-run install.`
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    // typeof null === "object", so we check for null explicitly before
    // falling back to the runtime type label. The reported kind drives a
    // regression assertion in merge-safety.test.ts.
    const kind =
      parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
    throw new Error(
      `Expected a JSON object at ${configPath}, got ${kind}. ` +
        `Refusing to overwrite — fix or delete the file, then re-run install.`
    );
  }
  return parsed as Record<string, unknown>;
}
