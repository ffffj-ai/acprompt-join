// Tests for the six desktop-IDE / desktop-agent detectors + their installers,
// and for the new `--harness` override.
//
// Two regressions are pinned here beyond basic detection:
//   1. WorkBuddy's config path MUST be `~/.workbuddy/mcp.json` and MUST NOT be
//      the dot-file `~/.workbuddy/.mcp.json` — the dot-file is auto-generated
//      by WorkBuddy and overwritten on restart, so pointing a user at it is a
//      config that silently disappears.
//   2. Cursor's entry must NOT carry a `type` field (ours doesn't; WorkBuddy's
//      does). Copy-pasting the wrong one between the two installers is the
//      easiest way to ship a snippet that doesn't work.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DetectionContext, DetectionResult } from "../detect/types.js";
import {
  ALL_DETECTORS,
} from "../detect/index.js";
import {
  IDE_APP_DETECTORS,
  cursorConfigPath,
  workbuddyConfigPath,
  windsurfConfigPath,
  openclawConfigPath,
  continueConfigPath,
  zedConfigDir,
} from "../detect/ide-apps.js";
import { findExecutableOnPath } from "../detect/which.js";
import { getInstaller, FILE_WRITER_HARNESSES } from "../install/index.js";
import type { InstallerContext } from "../install/shared.js";
import { pickDetection, normalizeHarnessId } from "../commands/install.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "acprompt-ide-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Detection context rooted at a throwaway home. `platform` defaults to the
 * HOST platform on purpose: detectors build paths with `path.join`, which is
 * host-flavoured, so simulating win32 from a POSIX host (or the reverse) would
 * test separators rather than behaviour.
 */
function ctx(overrides: Partial<DetectionContext> = {}): DetectionContext {
  return {
    cwd: tmpDir,
    home: tmpDir,
    platform: process.platform,
    env: { PATH: "" },
    ...overrides,
  };
}

async function touch(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "{}\n", "utf8");
}

function installerCtx(harness: string): InstallerContext {
  return {
    detection: {
      harness,
      label: harness,
      detected: true,
      configTargets: [],
    },
    home: tmpDir,
    platform: process.platform,
    token: "acp_mcp_TESTTOKEN",
    mcpUrl: "https://www.acprompt.com/api/mcp",
    dryRun: true,
  };
}

async function captureLog(fn: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  await fn();
  return lines.join("\n");
}

// ---------------------------------------------------------------------------

describe("detector registry", () => {
  it("registers all six IDE apps before the generic fallback", () => {
    const ids = ALL_DETECTORS.map((d) => d.id);
    for (const id of [
      "cursor",
      "workbuddy",
      "windsurf",
      "zed",
      "openclaw",
      "continue",
    ]) {
      expect(ids).toContain(id);
    }
    expect(ids[ids.length - 1]).toBe("generic");
    // Appended, not inserted: every pre-v0.1.10 detector keeps its index, so
    // "first detected wins" cannot change for existing users.
    expect(ids.slice(0, 6)).toEqual([
      "claude-code",
      "langgraph",
      "crewai",
      "openai-agents",
      "anthropic-sdk",
      "letta",
    ]);
  });

  it("has no duplicate harness ids", () => {
    const ids = ALL_DETECTORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("curated IDE_APP_DETECTORS list matches the registry tail", () => {
    expect(IDE_APP_DETECTORS.map((d) => d.id)).toEqual([
      "cursor",
      "workbuddy",
      "windsurf",
      "zed",
      "openclaw",
      "continue",
    ]);
  });
});

describe("path helpers", () => {
  it("workbuddy points at mcp.json, never at the auto-generated dot-file", () => {
    const p = workbuddyConfigPath(ctx());
    expect(p.endsWith(path.join(".workbuddy", "mcp.json"))).toBe(true);
    expect(path.basename(p)).toBe("mcp.json");
    expect(path.basename(p)).not.toBe(".mcp.json");
  });

  it("matches the paths documented in acp/src/lib/harness-quirks.ts", () => {
    const c = ctx();
    expect(cursorConfigPath(c)).toBe(path.join(c.home, ".cursor", "mcp.json"));
    expect(windsurfConfigPath(c)).toBe(
      path.join(c.home, ".codeium", "windsurf", "mcp_config.json")
    );
    expect(openclawConfigPath(c)).toBe(
      path.join(c.home, ".openclaw", "openclaw.json")
    );
    expect(continueConfigPath(c)).toBe(
      path.join(c.home, ".continue", "config.json")
    );
    expect(zedConfigDir(c)).toBe(path.join(c.home, ".config", "zed"));
  });
});

describe("which.findExecutableOnPath", () => {
  it("finds a plain executable in a PATH directory", async () => {
    const bin = path.join(tmpDir, "bin");
    const exe = path.join(bin, process.platform === "win32" ? "cursor.exe" : "cursor");
    await touch(exe);
    const found = await findExecutableOnPath(
      ctx({ env: { PATH: bin } }),
      ["cursor"]
    );
    expect(found).toBe(exe);
  });

  it("resolves Windows suffixes when platform is win32", async () => {
    const bin = path.join(tmpDir, "bin");
    const exe = path.join(bin, "zed.cmd");
    await touch(exe);
    const found = await findExecutableOnPath(
      ctx({ platform: "win32", env: { PATH: bin } }),
      ["zed"]
    );
    expect(found).toBe(exe);
  });

  it("ignores directories that merely share the name", async () => {
    const bin = path.join(tmpDir, "bin");
    await fs.mkdir(path.join(bin, "cursor"), { recursive: true });
    const found = await findExecutableOnPath(
      ctx({ platform: "linux", env: { PATH: bin } }),
      ["cursor"]
    );
    expect(found).toBeNull();
  });

  it("returns null for an empty PATH", async () => {
    const found = await findExecutableOnPath(ctx(), ["cursor"]);
    expect(found).toBeNull();
  });
});

describe("IDE app detectors", () => {
  it("cursor detects via ~/.cursor/mcp.json", async () => {
    await touch(cursorConfigPath(ctx()));
    const r = await getDetector("cursor").detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.evidence?.join(" ")).toMatch(/mcp\.json/);
    expect(r.configTargets?.[0]).toBe(cursorConfigPath(ctx()));
  });

  it("cursor detects via the app dir alone (installed, never configured)", async () => {
    await fs.mkdir(path.join(tmpDir, ".cursor"), { recursive: true });
    const r = await getDetector("cursor").detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.evidence?.join(" ")).toMatch(/app dir/);
  });

  it("workbuddy detects on this-repo-style ~/.workbuddy/ dir", async () => {
    await fs.mkdir(path.join(tmpDir, ".workbuddy"), { recursive: true });
    const r = await getDetector("workbuddy").detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.configTargets?.[0]).toBe(workbuddyConfigPath(ctx()));
  });

  it("workbuddy detects via a codebuddy binary on PATH", async () => {
    const bin = path.join(tmpDir, "bin");
    await touch(
      path.join(bin, process.platform === "win32" ? "codebuddy.cmd" : "codebuddy")
    );
    const r = await getDetector("workbuddy").detect(
      ctx({ env: { PATH: bin } })
    );
    expect(r.detected).toBe(true);
    expect(r.evidence?.join(" ")).toMatch(/codebuddy/);
  });

  it("zed reports no configTargets because it is UI-only", async () => {
    await fs.mkdir(zedConfigDir(ctx()), { recursive: true });
    const r = await getDetector("zed").detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.configTargets).toEqual([]);
  });

  it("every detector reports not-detected (with a reason) on a bare home", async () => {
    for (const d of IDE_APP_DETECTORS) {
      const r = await d.detect(ctx());
      expect(r.detected).toBe(false);
      expect(r.reason && r.reason.length > 0).toBe(true);
      expect(r.harness).toBe(d.id);
    }
  });

  it("never throws when home is unreadable", async () => {
    const r = await getDetector("windsurf").detect(
      ctx({ home: path.join(tmpDir, "does-not-exist") })
    );
    expect(r.detected).toBe(false);
  });
});

describe("IDE app installers", () => {
  it("cursor snippet has no `type` field (Cursor does not want one)", async () => {
    const out = await captureLog(() => getInstaller("cursor")(installerCtx("cursor")));
    expect(out).toContain("https://www.acprompt.com/api/mcp");
    expect(out).toContain("Bearer acp_mcp_TESTTOKEN");
    expect(out).toContain("mcpServers");
    expect(out).not.toContain('"type"');
  });

  it("workbuddy snippet carries type:http and warns about the dot-file", async () => {
    const out = await captureLog(() =>
      getInstaller("workbuddy")(installerCtx("workbuddy"))
    );
    expect(out).toContain('"type": "http"');
    expect(out).toMatch(/NOT \.mcp\.json/);
    expect(out).toMatch(/tray/i);
  });

  it("openclaw nests under mcp.servers", async () => {
    const out = await captureLog(() =>
      getInstaller("openclaw")(installerCtx("openclaw"))
    );
    expect(out).toContain('"servers"');
    expect(out).toContain("openclaw mcp set acprompt");
  });

  it("zed prints a UI instruction, not a file path", async () => {
    const out = await captureLog(() => getInstaller("zed")(installerCtx("zed")));
    expect(out).toMatch(/Settings → Assistant → MCP Servers/);
    expect(out).toContain('"name": "acprompt"');
  });

  it("windsurf + continue point at their real config files", async () => {
    const w = await captureLog(() =>
      getInstaller("windsurf")(installerCtx("windsurf"))
    );
    expect(w).toContain(".codeium");
    const c = await captureLog(() =>
      getInstaller("continue")(installerCtx("continue"))
    );
    expect(c).toContain(".continue/config.json");
  });

  it("none of the new installers claim to have written a file", async () => {
    for (const id of ["cursor", "workbuddy", "windsurf", "zed", "openclaw", "continue"]) {
      const r = await getInstaller(id)(installerCtx(id));
      expect(r.wrote).toEqual([]);
      expect(r.printed).toContain(`${id}-snippet`);
    }
  });

  it("keeps the file-writer allowlist in sync with reality", () => {
    expect(FILE_WRITER_HARNESSES.has("claude-code")).toBe(true);
    expect(FILE_WRITER_HARNESSES.has("letta")).toBe(true);
    for (const id of ["cursor", "workbuddy", "windsurf", "zed", "openclaw", "continue"]) {
      expect(FILE_WRITER_HARNESSES.has(id)).toBe(false);
    }
  });
});

describe("pickDetection (--harness override)", () => {
  const mk = (harness: string, detected: boolean): DetectionResult => ({
    harness,
    label: harness,
    detected,
    reason: detected ? undefined : "no evidence",
  });

  const detections = [
    mk("claude-code", true),
    mk("workbuddy", true),
    mk("cursor", false),
    mk("generic", true),
  ];

  it("defaults to the first detected harness", () => {
    const r = pickDetection(detections);
    expect(r.picked?.harness).toBe("claude-code");
    expect(r.forced).toBe(false);
  });

  it("honours an explicit id even when it is shadowed", () => {
    const r = pickDetection(detections, "workbuddy");
    expect(r.picked?.harness).toBe("workbuddy");
    expect(r.forced).toBe(false);
  });

  it("accepts underscore spelling from install.sh docs", () => {
    expect(normalizeHarnessId("claude_code")).toBe("claude-code");
    const r = pickDetection(detections, "claude_code");
    expect(r.picked?.harness).toBe("claude-code");
  });

  it("allows forcing a harness with no evidence, flagged as forced", () => {
    const r = pickDetection(detections, "cursor");
    expect(r.picked?.harness).toBe("cursor");
    expect(r.forced).toBe(true);
  });

  it("errors on an unknown id instead of silently falling back", () => {
    const r = pickDetection(detections, "warpdrive");
    expect(r.picked).toBeUndefined();
    expect(r.error).toMatch(/Unknown harness/);
    expect(r.error).toMatch(/workbuddy/);
  });

  it("treats blank override as absent", () => {
    const r = pickDetection(detections, "   ");
    expect(r.picked?.harness).toBe("claude-code");
  });
});

// Small helper so the table above reads as "detector by id" rather than
// importing six named symbols.
function getDetector(id: string) {
  const found = ALL_DETECTORS.find((d) => d.id === id);
  if (!found) throw new Error(`detector ${id} not registered`);
  return found;
}
