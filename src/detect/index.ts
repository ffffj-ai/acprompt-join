// Detector registry. Order matters: more specific first, `generic` last.

import os from "node:os";
import type { DetectionContext, HarnessDetector } from "./types.js";
import { claudeCodeDetector } from "./claude-code.js";
import { langgraphDetector } from "./langgraph.js";
import { crewaiDetector } from "./crewai.js";
import { openaiAgentsDetector } from "./openai-agents.js";
import { anthropicSdkDetector } from "./anthropic-sdk.js";
import { lettaDetector } from "./letta.js";
import { genericDetector } from "./generic.js";

export const ALL_DETECTORS: readonly HarnessDetector[] = [
  claudeCodeDetector,
  langgraphDetector,
  crewaiDetector,
  openaiAgentsDetector,
  anthropicSdkDetector,
  lettaDetector,
  genericDetector,
];

export function currentContext(): DetectionContext {
  return {
    cwd: process.cwd(),
    home: os.homedir(),
    platform: process.platform,
    env: process.env,
  };
}

export type { DetectionContext, DetectionResult, HarnessDetector } from "./types.js";
