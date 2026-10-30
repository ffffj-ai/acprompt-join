// R33 regressions for the three "an installer silently did the wrong thing"
// findings from DOGFOOD_FINDINGS.md, plus the atomic-write helper those fixes
// introduced.
//
//   1. Windows CLI detection probed `claude.cmd`, which the NATIVE installer
//      never ships (it installs claude.exe) → false "CLI not installed".
//   2. The detector ignored `ctx.env`, so a caller-supplied PATH was ignored
//      and the probe used the developer's real PATH (which also made the
//      detector test fail on any machine that has the CLI).
//   3. `npx -y mcp-remote` was unpinned → the config we write could silently
//      change behavior when upstream published a new version.
//
// Pinning (3) is only safe because mcp-remote still expands `${VAR}` in header
// values; that was verified by reading mcp-remote@0.15.2's dist (the
// substituteEnvVars() call applied to every parsed header) — this test can only
// pin the VERSION, so a bump must be re-verified with
// scripts/probe-mcp-remote.mjs.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  claudeCliProbe,
  claudeCodeDetector,
} from "../detect/claude-code.js";
import { buildClaudeDesktopEntry, MCP_REMOTE_SPEC } from "../install/claude-code.js";
import { writeFileAtomic, writeJsonAtomic } from "../util/atomic-write.js";
import type { DetectionContext } from "../detect/types.js";

const FAKE_TOKEN = "acp_mcp_" + "y".repeat(40);
const FAKE_URL = "https://www.acprompt.com/api/mcp";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "acprompt-r33-"));
});

afterEach(async () => {
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function ctx(platform: NodeJS.Platform, env: NodeJS.ProcessEnv = {}): DetectionContext {
  return { cwd: tmpHome, home: tmpHome, platform, env: { PATH: "", ...env } };
}

describe("Windows CLI probe", () => {
  it("probes the bare `claude` on Windows, not claude.cmd", () => {
    // The native Windows installer ships claude.exe; only the npm shim is
    // claude.cmd. Probing the .cmd was a guaranteed false-negative.
    expect(claudeCliProbe("win32")).toBe("claude");
    expect(claudeCliProbe("linux")).toBe("claude");
    expect(claudeCliProbe("darwin")).toBe("claude");
  });

  it("honours the PATH supplied in the detection context", async () => {
    // Empty PATH → probe must fail even when the developer's own machine has
    // the CLI installed. This is the exact failure that made the detector
    // test red locally while green in CI.
    const result = await claudeCodeDetector.detect(ctx("linux"));
    expect(result.detected).toBe(false);
    expect(result.reason).toMatch(/not on PATH/);
  });
});

describe("mcp-remote pinning", () => {
  it("pins an exact version in the generated args", () => {
    const entry = buildClaudeDesktopEntry({ mcpUrl: FAKE_URL, token: FAKE_TOKEN });
    const args = entry.args as string[];
    expect(args).toContain(MCP_REMOTE_SPEC);
    expect(args).not.toContain("mcp-remote"); // bare spec = floating version
    expect(MCP_REMOTE_SPEC).toMatch(/^mcp-remote@\d+\.\d+\.\d+$/);
  });

  it("keeps the Bearer token out of argv (F7 cmd.exe space-splitting trap)", () => {
    const entry = buildClaudeDesktopEntry({ mcpUrl: FAKE_URL, token: FAKE_TOKEN });
    const args = (entry.args as string[]).join(" ");
    expect(args).not.toContain(FAKE_TOKEN);
    expect(args).toContain("Authorization:${ACP_MCP_AUTH}");
    expect((entry.env as Record<string, string>).ACP_MCP_AUTH).toBe(`Bearer ${FAKE_TOKEN}`);
  });
});

describe("atomic write", () => {
  it("replaces the target and leaves no temp fragments behind", async () => {
    const target = path.join(tmpHome, "config.json");
    await fs.writeFile(target, JSON.stringify({ old: true }), "utf8");

    await writeJsonAtomic(target, { old: false, added: 1 });

    expect(JSON.parse(await fs.readFile(target, "utf8"))).toEqual({ old: false, added: 1 });
    const leftovers = (await fs.readdir(tmpHome)).filter((f) => f.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("creates the file when it does not exist yet", async () => {
    const target = path.join(tmpHome, "nested", "config.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await writeFileAtomic(target, "hello\n");
    expect(await fs.readFile(target, "utf8")).toBe("hello\n");
  });
});
