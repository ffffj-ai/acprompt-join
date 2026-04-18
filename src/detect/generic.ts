// Generic fallback detector.
//
// ALWAYS reports detected. The registry in `src/detect/index.ts` puts this
// detector last; callers that use `detections.find((d) => d.detected)` will
// only land on this one if every specific detector missed, in which case
// the installer prints the manual MCP snippet (URL + bearer header) for the
// user to wire in themselves.
//
// There is no `configTargets` — the user pastes the snippet wherever their
// harness expects MCP server configuration. `evidence` flags that no other
// harness matched, so this is a last-resort match rather than a confident one.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

export const genericDetector: HarnessDetector = {
  id: "generic",
  label: "Generic (manual MCP config)",

  async detect(_ctx: DetectionContext): Promise<DetectionResult> {
    return {
      harness: this.id,
      label: this.label,
      detected: true,
      evidence: ["No specific harness matched — manual MCP snippet will be printed."],
    };
  },
};
