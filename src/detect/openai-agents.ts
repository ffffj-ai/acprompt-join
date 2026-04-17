// TODO(Week 3): implement openai-agents detector — see src/detect/claude-code.ts for the pattern.
//
// Plan: scan package.json for "@openai/agents" or pyproject.toml for
// "openai-agents". Config surface is in-code (Agent({ tools: [...] }));
// output a snippet.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

export const openaiAgentsDetector: HarnessDetector = {
  id: "openai-agents",
  label: "OpenAI Agents SDK",

  async detect(_ctx: DetectionContext): Promise<DetectionResult> {
    return {
      harness: this.id,
      label: this.label,
      detected: false,
      reason: "TODO — implement before 0.1.0",
    };
  },
};
