// `acprompt-join whoami` — show stored owner + identity public key.
// NEVER prints the full token or secret key.

import pc from "picocolors";
import { getToken, maskToken } from "../auth/token-store.js";
import { loadIdentity } from "../identity/keypair.js";
import { configFilePath, identityFilePath } from "../auth/paths.js";

export async function runWhoami(): Promise<void> {
  const [cfg, identity] = await Promise.all([getToken(), loadIdentity()]);

  console.log(pc.bold("ACPrompt local identity"));
  console.log("");

  if (cfg) {
    console.log(pc.green("Token:"));
    console.log(`  owner:    ${cfg.ownerEmail ?? pc.dim("<unknown>")}`);
    console.log(`  token:    ${maskToken(cfg.token)}`);
    console.log(`  expires:  ${cfg.expiresAt ?? pc.dim("<unknown>")}`);
    console.log(`  mcp_url:  ${cfg.mcpUrl}`);
    console.log(pc.dim(`  stored:   ${configFilePath()}`));
  } else {
    console.log(pc.yellow("No token stored. Run `acprompt-join install`."));
  }

  console.log("");

  if (identity) {
    console.log(pc.green("Identity keypair:"));
    console.log(`  public:   ${identity.publicKey}`);
    console.log(`  created:  ${identity.createdAt}`);
    console.log(`  format:   ${identity.format}`);
    console.log(pc.dim(`  stored:   ${identityFilePath()}`));
  } else {
    console.log(pc.yellow("No identity yet — will be generated on first install/verify."));
  }
}
