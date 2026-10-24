// Letta installer.
//
// Letta reads MCP server declarations from `~/.letta/mcp_config.json`
// (created on first run of the Letta server). We merge-write our entry
// into that file, creating it if it does not yet exist. The schema
// matches what the Letta server expects:
//
//   {
//     "mcpServers": {
//       "acprompt": {
//         "transport": "streamable_http",
//         "url": "https://www.acprompt.com/api/mcp",
//         "headers": { "Authorization": "Bearer <token>" }
//       }
//     }
//   }

import pc from "picocolors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readMergeableJson, type HarnessInstaller } from "./shared.js";
import { lettaMcpConfigPath } from "../detect/letta.js";

export async function writeLettaMcpConfig(
  configPath: string,
  mcpUrl: string,
  token: string
): Promise<void> {
  // See comment in claude-code.ts::mergeConfig — readMergeableJson is the
  // BOM-aware / no-clobber-on-parse-error guard. Same data-loss risk
  // applies here: a Windows Letta user with a BOM-prefixed config would
  // otherwise lose every other entry they had.
  const existing = await readMergeableJson(configPath);
  const current = existing ?? {};
  if (!existing) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
  }
  const servers = (current.mcpServers ?? {}) as Record<string, unknown>;
  servers["acprompt"] = {
    transport: "streamable_http",
    url: mcpUrl,
    headers: { Authorization: `Bearer ${token}` },
  };
  current.mcpServers = servers;
  await fs.writeFile(configPath, JSON.stringify(current, null, 2), "utf8");
}

export const lettaInstaller: HarnessInstaller = async (ic) => {
  const configPath =
    ic.detection.configTargets?.[0] ??
    lettaMcpConfigPath({
      cwd: ic.home,
      home: ic.home,
      platform: ic.platform,
      env: process.env,
    });

  if (!ic.dryRun) {
    await writeLettaMcpConfig(configPath, ic.mcpUrl, ic.token);
  }
  console.log(pc.green(`Wrote ACPrompt MCP server entry to ${configPath}.`));
  console.log(
    pc.dim("Restart the Letta server for the new MCP entry to take effect.")
  );

  return { wrote: [configPath], printed: [] };
};
