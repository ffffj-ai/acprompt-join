// TODO(Week 3): implement generic fallback detector — see src/detect/claude-code.ts for the pattern.
//
// Plan: last-resort catch-all that always "detects" and prints a manual MCP
// snippet (URL + header) for the user to wire in themselves. Will be wired
// into `install` as the final fallback when all specific detectors miss.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

export const genericDetector: HarnessDetector = {
  id: "generic",
  label: "Generic fallback",

  async detect(_ctx: DetectionContext): Promise<DetectionResult> {
    return {
      harness: this.id,
      label: this.label,
      detected: false,
      reason: "TODO — implement before 0.1.0",
    };
  },
};
