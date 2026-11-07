// Installer registry — maps harness id → installer function.
//
// The install command asks the detector registry for the best match, then
// looks up the corresponding installer here and runs it. Unknown harness
// ids fall through to the generic installer.

import type { HarnessInstaller } from "./shared.js";
import { claudeCodeInstaller } from "./claude-code.js";
import { langgraphInstaller } from "./langgraph.js";
import { crewaiInstaller } from "./crewai.js";
import { openaiAgentsInstaller } from "./openai-agents.js";
import { anthropicSdkInstaller } from "./anthropic-sdk.js";
import { lettaInstaller } from "./letta.js";
import {
  cursorInstaller,
  workbuddyInstaller,
  windsurfInstaller,
  continueInstaller,
  openclawInstaller,
  zedInstaller,
} from "./ide-apps.js";
import { genericInstaller } from "./generic.js";

const REGISTRY: Record<string, HarnessInstaller> = {
  "claude-code": claudeCodeInstaller,
  langgraph: langgraphInstaller,
  crewai: crewaiInstaller,
  "openai-agents": openaiAgentsInstaller,
  "anthropic-sdk": anthropicSdkInstaller,
  letta: lettaInstaller,
  cursor: cursorInstaller,
  workbuddy: workbuddyInstaller,
  windsurf: windsurfInstaller,
  continue: continueInstaller,
  openclaw: openclawInstaller,
  zed: zedInstaller,
  generic: genericInstaller,
};

/**
 * Harnesses whose installer writes into an existing user config file, and
 * therefore needs an explicit confirmation prompt before it runs.
 *
 * This used to be an inline `=== "claude-code" || === "letta"` check inside
 * install.ts, which silently stopped being true the moment a new writer was
 * added. Keeping the list next to the registry makes the coupling visible.
 * Every id in here MUST route its merge through `readMergeableJson`.
 */
export const FILE_WRITER_HARNESSES: ReadonlySet<string> = new Set([
  "claude-code",
  "letta",
]);

export function getInstaller(harnessId: string): HarnessInstaller {
  return REGISTRY[harnessId] ?? genericInstaller;
}

export type { HarnessInstaller, InstallerContext, InstallerResult } from "./shared.js";
export { DEFAULT_MCP_URL, inferLanguage } from "./shared.js";
