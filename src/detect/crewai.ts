// TODO(Week 3): implement crewai detector — see src/detect/claude-code.ts for the pattern.
//
// Plan: scan pyproject.toml / requirements.txt for "crewai". Config surface
// is in-code (tools list on the Crew / Agent constructor); output a snippet.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

export const crewaiDetector: HarnessDetector = {
  id: "crewai",
  label: "CrewAI",

  async detect(_ctx: DetectionContext): Promise<DetectionResult> {
    return {
      harness: this.id,
      label: this.label,
      detected: false,
      reason: "TODO — implement before 0.1.0",
    };
  },
};
