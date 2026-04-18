// LangGraph harness detector.
//
// Coverage:
//   * Python:   `langgraph` in pyproject.toml or requirements.txt
//   * JS/TS:    `@langchain/langgraph` in package.json
//
// Config surface: ambient — LangGraph has no central MCP config file, so the
// installer prints a code snippet for the user to paste into their graph
// builder (Week 3 work). We only populate `evidence` here.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";
import { findDependency, evidenceFromMatches } from "./deps.js";

const LANGGRAPH_DEPS = ["langgraph", "@langchain/langgraph"] as const;

export const langgraphDetector: HarnessDetector = {
  id: "langgraph",
  label: "LangGraph",

  async detect(ctx: DetectionContext): Promise<DetectionResult> {
    try {
      const matches = await findDependency(ctx, LANGGRAPH_DEPS);
      if (matches.length === 0) {
        return {
          harness: this.id,
          label: this.label,
          detected: false,
          reason: "No langgraph dependency in package.json / pyproject.toml / requirements.txt.",
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
