// Claude Code / Claude Desktop installer.
//
// Two overlapping targets:
//   1. Claude Desktop — merge-write the MCP server entry into
//      claude_desktop_config.json at the platform-appropriate path.
//   2. Claude Code CLI — no file we write directly; instead, print the
//      `claude mcp add` command the user can paste into their own shell.
//
// We always try (1) if a config path is known. If the user ALSO has the
// CLI, we print the CLI hint after the file write as a second option.

import pc from "picocolors";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { HarnessInstaller } from "./shared.js";
import { claudeDesktopConfigPath } from "../detect/claude-code.js";

async function mergeConfig(
  configPath: string,
  entry: Record<string, unknown>
): Promise<void> {
  let current: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf8");
    current = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
  }
  const servers = (current.mcpServers ?? {}) as Record<string, unknown>;
  servers["acprompt"] = entry;
  current.mcpServers = servers;
  await fs.writeFile(configPath, JSON.stringify(current, null, 2), "utf8");
}

export const claudeCodeInstaller: HarnessInstaller = async (ic) => {
  const wrote: string[] = [];
  const printed: string[] = [];

  const configPath =
    ic.detection.configTargets?.[0] ??
    claudeDesktopConfigPath({
      cwd: ic.home,
      home: ic.home,
      platform: ic.platform,
      env: process.env,
    });

  const entry = {
    type: "http",
    url: ic.mcpUrl,
    headers: { Authorization: `Bearer ${ic.token}` },
  };

  if (!ic.dryRun) {
    await mergeConfig(configPath, entry);
  }
  wrote.push(configPath);
  console.log(pc.green(`Wrote ACPrompt MCP server entry to ${configPath}.`));

  const cliHit = (ic.detection.evidence ?? []).some((e) =>
    e.includes("Claude Code CLI")
  );
  if (cliHit) {
    console.log("");
    console.log(pc.dim("Claude Code CLI detected. If you use the CLI, run:"));
    console.log(
      pc.dim(
        `  claude mcp add acprompt ${ic.mcpUrl} --transport http -H "Authorization: Bearer <token>"`
      )
    );
    printed.push("claude-code-cli-hint");
  }

  return { wrote, printed };
};
