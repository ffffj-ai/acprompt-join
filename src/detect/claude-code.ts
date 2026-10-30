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

/**
 * The command we probe for the Claude Code CLI on every platform.
 *
 * R33 — Windows used to probe `claude.cmd` specifically. That only matches the
 * npm-installed shim; the NATIVE Windows installer ships `claude.exe` (no .cmd),
 * so the probe failed for a correctly installed CLI and `acprompt-join` told a
 * native-install user "Claude Code CLI not on PATH". Probing the bare `claude`
 * through the shell (see below) lets cmd.exe resolve either `claude.cmd` or
 * `claude.exe` via PATHEXT. Exported so the regression is pinned by a test.
 */
export function claudeCliProbe(_platform: NodeJS.Platform): string {
  return "claude";
}

async function claudeCliOnPath(ctx: DetectionContext): Promise<boolean> {
  // `claude --version` is the cheapest way to confirm the CLI exists.
  // Swallow every error — if it's not installed, the CLI simply isn't there.
  //
  // Windows-specific: on Node 24 (CVE-2024-27980 hardening), spawning a
  // `.cmd` file without `shell: true` is rejected unconditionally with
  // EINVAL. We pass `shell: true` on win32 to stay compatible across Node
  // 20/22/24. Safe against the F7-class cmd.exe argv-splitting trap because
  // the only arg is the literal `--version`, containing no whitespace or
  // shell metacharacters.
  //
  // R33 — `env: ctx.env` is deliberate, not cosmetic: without it the probe
  // used the PROCESS environment regardless of the context, so a caller (or a
  // test) that supplied a controlled PATH still hit the developer's real PATH.
  const probe = claudeCliProbe(ctx.platform);
  const opts =
    ctx.platform === "win32"
      ? { timeout: 3000, shell: true, env: ctx.env, windowsHide: true }
      : { timeout: 3000, env: ctx.env };
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
