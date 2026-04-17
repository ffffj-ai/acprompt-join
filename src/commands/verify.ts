// `acprompt-join verify` — end-to-end liveness check against the MCP endpoint.
// Calls acp_register with the local identity's public key.

import pc from "picocolors";
import os from "node:os";
import path from "node:path";
import { loadOrCreateIdentity } from "../identity/keypair.js";
import { register } from "../mcp/client.js";
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

  const identity = await loadOrCreateIdentity();
  const defaultName = `${os.userInfo().username}@${path.basename(process.cwd())}`;

  console.log(pc.bold("Pinging ACPrompt MCP..."));
  console.log(pc.dim(`  endpoint: ${cfg.mcpUrl}`));
  console.log(pc.dim(`  agent name: ${defaultName}`));

  try {
    const result = await register({
      name: defaultName,
      kind: "cli",
      public_key: identity.publicKey,
    });
    if (result.isError) {
      console.error(pc.red("acp_register returned an error:"));
      console.error(JSON.stringify(result.content, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(pc.green("acp_register succeeded."));
    console.log(JSON.stringify(result.content, null, 2));
  } catch (err) {
    console.error(pc.red(`Verification failed: ${(err as Error).message}`));
    process.exitCode = 1;
  }
}
