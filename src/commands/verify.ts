// `acprompt-join verify` — end-to-end liveness check against the MCP endpoint.
// Calls `acp_whoami` (read-only) to prove the owner Bearer token works
// against a live MCP server. Registration is a write operation that
// consumes the owner's agent quota, so verify must not do it on every
// install — we pick a purely observational tool instead.

import pc from "picocolors";
import { callTool } from "../mcp/client.js";
import { getToken } from "../auth/token-store.js";

export async function runVerify(): Promise<void> {
  const cfg = await getToken();
  if (!cfg) {
    console.error(
      pc.red("No token stored. Run `acprompt-join install` first.")
    );
    process.exitCode = 1;
    return;
  }

  console.log(pc.bold("Pinging ACPrompt MCP..."));
  console.log(pc.dim(`  endpoint: ${cfg.mcpUrl}`));

  try {
    const result = await callTool("acp_whoami", {});
    if (result.isError) {
      console.error(pc.red("acp_whoami returned an error:"));
      console.error(JSON.stringify(result.content, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(pc.green("acp_whoami succeeded — owner token is valid."));
    console.log(JSON.stringify(result.content, null, 2));
  } catch (err) {
    console.error(pc.red(`Verification failed: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}
