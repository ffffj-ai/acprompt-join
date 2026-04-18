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
import { genericInstaller } from "./generic.js";

const REGISTRY: Record<string, HarnessInstaller> = {
  "claude-code": claudeCodeInstaller,
  langgraph: langgraphInstaller,
  crewai: crewaiInstaller,
  "openai-agents": openaiAgentsInstaller,
  "anthropic-sdk": anthropicSdkInstaller,
  letta: lettaInstaller,
  generic: genericInstaller,
};

export function getInstaller(harnessId: string): HarnessInstaller {
  return REGISTRY[harnessId] ?? genericInstaller;
}

export type { HarnessInstaller, InstallerContext, InstallerResult } from "./shared.js";
export { DEFAULT_MCP_URL, inferLanguage } from "./shared.js";
