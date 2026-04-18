// Letta harness detector.
//
// Letta is a Python-based stateful-agent platform. Two independent evidence
// sources:
//   1. `letta` dependency in pyproject.toml / requirements.txt (the user is
//      building WITH Letta).
//   2. `~/.letta/` directory present (the user has already run the Letta
//      server at least once, which creates this dir with config + state).
//
// Either signal is enough to report detected. The configTarget points at
// `~/.letta/mcp_config.json` — Letta's MCP-server registry file. Writing
// that file is Week-3 work; for now we only expose the path.

import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";
import { findDependency, evidenceFromMatches } from "./deps.js";

const LETTA_DEPS = ["letta", "pyletta"] as const;

export function lettaHomeDir(ctx: DetectionContext): string {
  return path.join(ctx.home, ".letta");
}

export function lettaMcpConfigPath(ctx: DetectionContext): string {
  return path.join(lettaHomeDir(ctx), "mcp_config.json");
}

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export const lettaDetector: HarnessDetector = {
  id: "letta",
  label: "Letta",

  async detect(ctx: DetectionContext): Promise<DetectionResult> {
    const configTarget = lettaMcpConfigPath(ctx);
    try {
      const [depMatches, homePresent] = await Promise.all([
        findDependency(ctx, LETTA_DEPS),
        dirExists(lettaHomeDir(ctx)),
      ]);

      const evidence = evidenceFromMatches(depMatches);
      if (homePresent) evidence.push(`Letta home dir: ${lettaHomeDir(ctx)}`);

      if (evidence.length === 0) {
        return {
          harness: this.id,
          label: this.label,
          detected: false,
          reason: "No letta dependency and no ~/.letta/ directory.",
          configTargets: [configTarget],
        };
      }

      return {
        harness: this.id,
        label: this.label,
        detected: true,
        evidence,
        configTargets: [configTarget],
      };
    } catch (e) {
      return {
        harness: this.id,
        label: this.label,
        detected: false,
        reason: (e as Error).message,
        configTargets: [configTarget],
      };
    }
  },
};
