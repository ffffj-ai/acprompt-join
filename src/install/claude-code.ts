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
//
// ============================================================================
// Claude Desktop config-shape trap (F6 + F7, 2026-04-20)
// ============================================================================
// F6 — Claude Desktop (Electron app) does NOT support the native `{type:"http",
// url, headers}` MCP shape that Claude Code CLI accepts. As of Apr 2026 the
// Desktop app is stdio-only; remote HTTP MCP servers must go through the
// `mcp-remote` shim which the Desktop app spawns as a local child process.
//
// F7 — The obvious fix `--header "Authorization:Bearer <token>"` breaks on
// Windows. Node's child_process cannot spawn `.cmd` files without
// shell:true (Node 24 now hard-errors with EINVAL; Node 20–22 fail
// differently). shell:true routes the command through cmd.exe, which
// splits on whitespace and does NOT respect quoting inside the argv array
// — the token gets chopped off, mcp-remote receives just
// "Authorization:Bearer" as the header value, and every request 401s.
//
// Fix (v0.1.7): put the whole `Bearer <token>` string (including its
// required space) in the `env` block, and reference it from args as
// `Authorization:${ACP_MCP_AUTH}`. mcp-remote supports `${VAR}` expansion
// internally on header values (parseCommandLineArgs in
// mcp-remote/dist/chunk-*.js). Argv elements now contain NO whitespace,
// so cmd.exe splitting is a non-issue. Empirically verified end-to-end
// via scripts/probe-mcp-remote.mjs: initialize + tools/list returns all
// 15 ACPrompt tools through the spawned child process.
//
// Other invariants:
//   - Header separator is `:` with NO space before the value (mcp-remote
//     matches `NAME:\s*VALUE` so either works, but omitting the space
//     keeps the argv element whitespace-free as a secondary defense).
//   - `-y` on npx auto-accepts the on-disk install prompt so first run
//     doesn't hang waiting for stdin.

import pc from "picocolors";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readMergeableJson, type HarnessInstaller } from "./shared.js";
import { claudeDesktopConfigPath } from "../detect/claude-code.js";

/**
 * Build the Claude-Desktop-compatible MCP server entry for ACPrompt. See
 * the file-top comment for why this shape (and not `{type:"http",...}`)
 * and why the Bearer token goes through `env` instead of inline in args.
 * Exported for unit testing.
 */
export function buildClaudeDesktopEntry(opts: {
  mcpUrl: string;
  token: string;
}): Record<string, unknown> {
  return {
    command: "npx",
    args: [
      "-y",
      "mcp-remote",
      opts.mcpUrl,
      "--header",
      "Authorization:${ACP_MCP_AUTH}",
    ],
    env: {
      ACP_MCP_AUTH: `Bearer ${opts.token}`,
    },
  };
}

async function mergeConfig(
  configPath: string,
  entry: Record<string, unknown>
): Promise<void> {
  // readMergeableJson returns null only on ENOENT. Any other read/parse
  // problem throws with an actionable message — we must NOT clobber an
  // existing-but-unparseable config, or we'd silently destroy the user's
  // other MCP server entries. (This was the Round-3 data-loss path on
  // Windows where Notepad-saved configs carried a UTF-8 BOM and the old
  // catch-all handler blindly wrote a fresh file on top.)
  const existing = await readMergeableJson(configPath);
  const current = existing ?? {};
  if (!existing) {
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

  const entry = buildClaudeDesktopEntry({ mcpUrl: ic.mcpUrl, token: ic.token });

  if (!ic.dryRun) {
    await mergeConfig(configPath, entry);
  }
  wrote.push(configPath);
  console.log(pc.green(`Wrote ACPrompt MCP server entry to ${configPath}.`));
  console.log(
    pc.dim(
      "  Shape: mcp-remote stdio shim (Claude Desktop does not accept native HTTP MCP yet)."
    )
  );
  console.log(
    pc.dim("  Restart Claude Desktop to load the new server.")
  );

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
