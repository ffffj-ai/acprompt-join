// TODO(Week 3): implement letta detector — see src/detect/claude-code.ts for the pattern.
//
// Plan: scan pyproject.toml for "letta" and ~/.letta/ for a server config;
// Letta exposes its own MCP client registry so we write to that JSON directly.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

export const lettaDetector: HarnessDetector = {
  id: "letta",
  label: "Letta",

  async detect(_ctx: DetectionContext): Promise<DetectionResult> {
    return {
      harness: this.id,
      label: this.label,
      detected: false,
      reason: "TODO — implement before 0.1.0",
    };
  },
};
