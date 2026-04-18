// CrewAI harness detector.
//
// CrewAI is Python-only (as of 2026-04). We scan pyproject.toml / requirements.txt
// for `crewai` or the adjacent `crewai-tools` extension package — the latter
// is often the manifest line that actually declares the MCP-capable extras.
//
// Config surface: in-code. CrewAI doesn't have a central MCP registry;
// installer output is a snippet to paste into the Crew / Agent constructor.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";
import { findDependency, evidenceFromMatches } from "./deps.js";

const CREWAI_DEPS = ["crewai", "crewai-tools"] as const;

export const crewaiDetector: HarnessDetector = {
  id: "crewai",
  label: "CrewAI",

  async detect(ctx: DetectionContext): Promise<DetectionResult> {
    try {
      const matches = await findDependency(ctx, CREWAI_DEPS);
      if (matches.length === 0) {
        return {
          harness: this.id,
          label: this.label,
          detected: false,
          reason: "No crewai dependency in pyproject.toml / requirements.txt.",
        };
      }
      return {
        harness: this.id,
        label: this.label,
        detected: true,
        evidence: evidenceFromMatches(matches),
      };
    } catch (e) {
      return {
        harness: this.id,
        label: this.label,
        detected: false,
        reason: (e as Error).message,
      };
    }
  },
};
