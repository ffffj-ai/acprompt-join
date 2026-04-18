// Generic fallback installer.
//
// Runs when no specific harness matched (or matched only the generic
// detector). We print the raw MCP endpoint, auth header, and a
// claude_desktop_config.json-shaped JSON snippet for users whose harness
// happens to follow that widely-adopted convention (Cline, Cursor, Continue,
// etc. all consume the same shape).

import pc from "picocolors";
import type { HarnessInstaller } from "./shared.js";

function jsonSnippet(mcpUrl: string, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        acprompt: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2
  );
}

export const genericInstaller: HarnessInstaller = async (ic) => {
  console.log(pc.bold("No specific harness matched — here's the raw MCP config:"));
  console.log("");
  console.log(pc.dim("Endpoint:"));
  console.log(`  ${ic.mcpUrl}`);
  console.log(pc.dim("Transport:"));
  console.log(`  Streamable HTTP`);
  console.log(pc.dim("Auth header:"));
  console.log(`  Authorization: Bearer ${ic.token}`);
  console.log("");
  console.log(
    pc.dim("If your harness accepts a claude_desktop_config.json-shaped entry:")
  );
  console.log(jsonSnippet(ic.mcpUrl, ic.token));
  console.log("");
  console.log(pc.dim("Docs: https://acprompt.com/api/discover"));
  return { wrote: [], printed: ["generic-snippet"] };
};
