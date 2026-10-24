// Claude Code / Claude Desktop harness detector.
//
// This detector covers two related-but-distinct targets:
//   1. Claude Desktop — the native app. Config at:
//        win32:  %APPDATA%\Claude\claude_desktop_config.json
//        darwin: ~/Library/Application Support/Claude/claude_desktop_config.json
//        linux:  ~/.config/Claude/claude_desktop_config.json
//   2. Claude Code CLI — the terminal tool. Detected by presence of `claude`
//      on PATH. Its MCP config lives under ~/.claude/ but the user-facing
//      install flow uses `claude mcp add ...`, so we just need to know the
//      CLI exists; we don't write its config directly.
//
// If either is present, we report `detected: true`. The `configTargets`
// array is set so the install command knows where to write for the desktop
// variant; the CLI variant's hint is surfaced separately as a shell command.

import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  DetectionContext,
  DetectionResult,
  HarnessDetector,
} from "./types.js";

const execFileAsync = promisify(execFile);

export function claudeDesktopConfigPath(ctx: DetectionContext): string {
  if (ctx.platform === "win32") {
    const appData = ctx.env.APPDATA ?? path.join(ctx.home, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  if (ctx.platform === "darwin") {
    return path.join(
      ctx.home,
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json"
    );
  }
  // linux + everything else
  const xdgConfig = ctx.env.XDG_CONFIG_HOME ?? path.join(ctx.home, ".config");
  return path.join(xdgConfig, "Claude", "claude_desktop_config.json");
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function claudeCliOnPath(ctx: DetectionContext): Promise<boolean> {
  // `claude --version` is the cheapest way to confirm the CLI exists.
  // Swallow every error — if it's not installed, the CLI simply isn't there.
  //
  // Windows-specific: on Node 24 (CVE-2024-27980 hardening), spawning a
  // `.cmd` file without `shell: true` is rejected unconditionally with
  // EINVAL. The old code would catch that and report "no CLI" — a
  // false-negative on every Windows-Node-24 install that actually HAS
  // Claude Code CLI. We pass `shell: true` on win32 to stay compatible
  // across Node 20/22/24. Safe against the F7-class cmd.exe argv-
  // splitting trap because the only arg is the literal `--version`,
  // containing no whitespace or shell metacharacters.
  const probe = ctx.platform === "win32" ? "claude.cmd" : "claude";
  const opts =
    ctx.platform === "win32"
      ? { timeout: 3000, shell: true }
      : { timeout: 3000 };
  try {
    await execFileAsync(probe, ["--version"], opts);
    return true;
  } catch {
    return false;
  }
}

export const claudeCodeDetector: HarnessDetector = {
  id: "claude-code",
  label: "Claude Code / Claude Desktop",

  async detect(ctx: DetectionContext): Promise<DetectionResult> {
    const desktopConfig = claudeDesktopConfigPath(ctx);
    const [desktopPresent, cliPresent] = await Promise.all([
      fileExists(desktopConfig),
      claudeCliOnPath(ctx),
    ]);

    const evidence: string[] = [];
    if (desktopPresent) evidence.push(`Claude Desktop config: ${desktopConfig}`);
    if (cliPresent) evidence.push("Claude Code CLI on PATH");

    if (evidence.length === 0) {
      return {
        harness: this.id,
        label: this.label,
        detected: false,
        reason:
          "No Claude Desktop config file found and `claude` CLI not on PATH.",
        configTargets: [desktopConfig],
      };
    }

    return {
      harness: this.id,
      label: this.label,
      detected: true,
      evidence,
      configTargets: [desktopConfig],
    };
  },
};
