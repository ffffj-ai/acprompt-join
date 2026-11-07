// Detector registry. Order matters: more specific first, `generic` last.

import os from "node:os";
import type { DetectionContext, HarnessDetector } from "./types.js";
import { claudeCodeDetector } from "./claude-code.js";
import { langgraphDetector } from "./langgraph.js";
import { crewaiDetector } from "./crewai.js";
import { openaiAgentsDetector } from "./openai-agents.js";
import { anthropicSdkDetector } from "./anthropic-sdk.js";
import { lettaDetector } from "./letta.js";
import { IDE_APP_DETECTORS } from "./ide-apps.js";
import { genericDetector } from "./generic.js";

// Order matters twice over:
//   1. More specific (cwd-scoped) evidence first, `generic` last.
//   2. `install` picks the FIRST detected entry, so appending to the end
//      preserves every pre-v0.1.10 selection when several harnesses match.
export const ALL_DETECTORS: readonly HarnessDetector[] = [
  claudeCodeDetector,
  langgraphDetector,
  crewaiDetector,
  openaiAgentsDetector,
  anthropicSdkDetector,
  lettaDetector,
  ...IDE_APP_DETECTORS,
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
