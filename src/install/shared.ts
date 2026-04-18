// Shared types + helpers for per-harness installers.
//
// An "installer" is the post-detection step that either (a) writes the MCP
// server config into a framework's registry file (Claude Desktop, Letta) or
// (b) prints a code snippet for the user to paste into their own source
// (LangGraph, CrewAI, OpenAI Agents SDK, Anthropic SDK). The generic
// fallback prints bare endpoint + header info.

import type { DetectionResult } from "../detect/types.js";

export const DEFAULT_MCP_URL = "https://acprompt.com/api/mcp";

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
