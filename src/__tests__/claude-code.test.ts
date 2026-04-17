// Detector test — Claude Code / Claude Desktop.
// We isolate by pointing `home` at a temp dir and controlling env vars.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  claudeCodeDetector,
  claudeDesktopConfigPath,
} from "../detect/claude-code.js";
import type { DetectionContext } from "../detect/types.js";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "acprompt-test-"));
});

afterEach(async () => {
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function ctx(platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}): DetectionContext {
  return {
    cwd: tmpHome,
    home: tmpHome,
    platform,
    // Empty PATH so the `claude` binary probe always fails in tests.
    env: { PATH: "", ...env },
  };
}

describe("claudeCodeDetector", () => {
  it("reports not-detected when no config file and no CLI", async () => {
    const result = await claudeCodeDetector.detect(ctx("linux"));
    expect(result.detected).toBe(false);
    expect(result.reason).toMatch(/No Claude Desktop config/);
    expect(result.configTargets?.[0]).toMatch(/claude_desktop_config\.json$/);
  });

  it("reports detected when the linux desktop config is present", async () => {
    const c = ctx("linux");
    const target = claudeDesktopConfigPath(c);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify({ mcpServers: {} }), "utf8");
    const result = await claudeCodeDetector.detect(c);
    expect(result.detected).toBe(true);
    expect(result.evidence?.some((e) => e.includes(target))).toBe(true);
  });

  it("resolves correct per-platform config paths", () => {
    const linux = claudeDesktopConfigPath(ctx("linux"));
    const darwin = claudeDesktopConfigPath(ctx("darwin"));
    const win = claudeDesktopConfigPath(ctx("win32", { APPDATA: path.join(tmpHome, "AppData", "Roaming") }));
    expect(linux).toMatch(/\.config[\\/]Claude[\\/]claude_desktop_config\.json$/);
    expect(darwin).toMatch(/Library[\\/]Application Support[\\/]Claude[\\/]claude_desktop_config\.json$/);
    expect(win).toMatch(/AppData[\\/]Roaming[\\/]Claude[\\/]claude_desktop_config\.json$/);
  });
});
