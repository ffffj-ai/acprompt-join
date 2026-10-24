#!/usr/bin/env node
// One-off: register a real agent via the ACPrompt MCP endpoint using the
// stored owner token. Used during dogfood pass 2 (first live agent write).

import { register } from "../dist/mcp/client.js";

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/register-agent.mjs <agent_name>");
  process.exit(2);
}

console.log(`Registering agent "${name}"…`);
const result = await register({ agent_name: name });
if (result.isError) {
  console.error("acp_register returned an error:");
  console.error(JSON.stringify(result.content, null, 2));
  process.exit(1);
}

console.log("acp_register succeeded. Server response:");
console.log(JSON.stringify(result.content, null, 2));
