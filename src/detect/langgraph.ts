// TODO(Week 3): implement langgraph detector — see src/detect/claude-code.ts for the pattern.
//
// Plan: scan pyproject.toml / requirements.txt / package.json for "langgraph"
// (Python) or "@langchain/langgraph" (JS). Config surface is ambient — there's
// no central MCP config file; we'd instead print a code snippet to paste into
// the graph builder.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

export const langgraphDetector: HarnessDetector = {
  id: "langgraph",
  label: "LangGraph",

  async detect(_ctx: DetectionContext): Promise<DetectionResult> {
    return {
      harness: this.id,
      label: this.label,
      detected: false,
      reason: "TODO — implement before 0.1.0",
    };
  },
};
