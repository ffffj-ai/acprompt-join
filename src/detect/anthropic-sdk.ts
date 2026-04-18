// Anthropic SDK harness detector.
//
// Coverage:
//   * JS/TS:   `@anthropic-ai/sdk` in package.json
//   * Python:  `anthropic` in pyproject.toml / requirements.txt
//
// Note the ordering constraint: the Claude Code / Desktop detector runs
// first in the registry. That detector fires when a native app is present
// OR the `claude` CLI is on PATH — but it does NOT inspect Python/Node
// manifests. So a user who only has the raw `anthropic` SDK in their repo
// will fall through to this detector, which is the intended behavior.
//
// Config surface: in-code. The SDK's MCP integration (`mcp_servers`
// parameter on `messages.create` + the MCP connector) is wired in code, not
// through a central config file, so the installer emits a snippet.

import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";
import { findDependency, evidenceFromMatches } from "./deps.js";

const ANTHROPIC_SDK_DEPS = ["@anthropic-ai/sdk", "anthropic"] as const;

export const anthropicSdkDetector: HarnessDetector = {
  id: "anthropic-sdk",
  label: "Anthropic SDK",

  async detect(ctx: DetectionContext): Promise<DetectionResult> {
    try {
      const matches = await findDependency(ctx, ANTHROPIC_SDK_DEPS);
      if (matches.length === 0) {
        return {
          harness: this.id,
          label: this.label,
          detected: false,
          reason: "No anthropic SDK dependency in package.json / pyproject.toml / requirements.txt.",
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
