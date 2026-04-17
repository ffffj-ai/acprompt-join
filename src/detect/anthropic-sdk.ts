// TODO(Week 3): implement anthropic-sdk detector — see src/detect/claude-code.ts for the pattern.
//
// Plan: scan package.json for "@anthropic-ai/sdk" or pyproject.toml for
// "anthropic". Config surface is in-code (MCP connector list on the
// messages.create call); output a snippet.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

export const anthropicSdkDetector: HarnessDetector = {
  id: "anthropic-sdk",
  label: "Anthropic SDK",

  async detect(_ctx: DetectionContext): Promise<DetectionResult> {
    return {
      harness: this.id,
      label: this.label,
      detected: false,
      reason: "TODO — implement before 0.1.0",
    };
  },
};
