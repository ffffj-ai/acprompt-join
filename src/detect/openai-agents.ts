// OpenAI Agents SDK harness detector.
//
// Coverage:
//   * JS/TS:   `@openai/agents` in package.json
//   * Python:  `openai-agents` in pyproject.toml / requirements.txt
//
// Config surface: in-code (`new Agent({ tools: [...] })`). Installer emits
// a snippet that registers the ACPrompt MCP server against the agent.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";
import { findDependency, evidenceFromMatches } from "./deps.js";

const OPENAI_AGENTS_DEPS = ["@openai/agents", "openai-agents"] as const;

export const openaiAgentsDetector: HarnessDetector = {
  id: "openai-agents",
  label: "OpenAI Agents SDK",

  async detect(ctx: DetectionContext): Promise<DetectionResult> {
    try {
      const matches = await findDependency(ctx, OPENAI_AGENTS_DEPS);
      if (matches.length === 0) {
        return {
          harness: this.id,
          label: this.label,
          detected: false,
          reason: "No openai-agents dependency in package.json / pyproject.toml / requirements.txt.",
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
