// Round-3 regression — merge-write must NOT clobber the user's data on
// read/parse failure.
//
// Pre-v0.1.8, both Claude Desktop's `mergeConfig` and Letta's
// `writeLettaMcpConfig` wrapped `fs.readFile` + `JSON.parse` in a
// catch-all that silently fell through to an empty `current = {}`. Two
// failure modes trip this in real life:
//
//   1. **UTF-8 BOM** (Windows). Notepad saves UTF-8 with a leading
//      U+FEFF by default. `fs.readFile(…, "utf8")` does NOT strip the
//      BOM, so `JSON.parse` throws "Unexpected token". The catch-all
//      treated this as "no config exists" and wrote a fresh file with
//      only our entry. Every OTHER MCP server the user had configured
//      was destroyed.
//
//   2. **Corrupted / partial JSON**. A half-saved edit, a power loss,
//      or a human typo leaves the file syntactically invalid. Same
//      silent clobber.
//
// v0.1.8 fix: `readMergeableJson` strips BOMs, parses cleanly, and
// refuses to return null/{} on parse errors — it throws with an
// actionable error that tells the user to fix the file. The caller
// refuses to write, user data is preserved.
//
// This file pins both merge paths (Claude Desktop + Letta) against both
// failure modes. Either regression here is P0.
//
// Also pins the null/array/scalar-root variants because `typeof null ===
// "object"` and `typeof [] === "object"` — the old accept-any-object
// check would happily merge into them.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildClaudeDesktopEntry,
} from "../install/claude-code.js";
import { writeLettaMcpConfig } from "../install/letta.js";
import { readMergeableJson } from "../install/shared.js";

let tmpHome: string;
const FAKE_TOKEN = "acp_mcp_" + "z".repeat(40);
const FAKE_URL = "https://www.acprompt.com/api/mcp";

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "acprompt-merge-"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("readMergeableJson (Round-3 BOM + no-clobber guard)", () => {
  it("returns null when the file doesn't exist", async () => {
    const target = path.join(tmpHome, "nope.json");
    expect(await readMergeableJson(target)).toBeNull();
  });

  it("strips a leading UTF-8 BOM before parsing", async () => {
    // Simulate Notepad-on-Windows saving with "UTF-8 with BOM".
    const target = path.join(tmpHome, "bom.json");
    const original = { mcpServers: { "other-server": { command: "real" } } };
    await fs.writeFile(target, "\uFEFF" + JSON.stringify(original), "utf8");
    const parsed = await readMergeableJson(target);
    expect(parsed).toEqual(original);
  });

  it("throws on syntactically invalid JSON, never returns null or {}", async () => {
    const target = path.join(tmpHome, "broken.json");
    await fs.writeFile(target, "{this is not, valid JSON::", "utf8");
    await expect(readMergeableJson(target)).rejects.toThrow(
      /Refusing to overwrite/
    );
    await expect(readMergeableJson(target)).rejects.toThrow(/broken\.json/);
  });

  it("throws on a JSON root that's not an object (null)", async () => {
    const target = path.join(tmpHome, "null-root.json");
    await fs.writeFile(target, "null", "utf8");
    await expect(readMergeableJson(target)).rejects.toThrow(
      /Expected a JSON object.*got null/
    );
  });

  it("throws on a JSON root that's not an object (array)", async () => {
    const target = path.join(tmpHome, "array-root.json");
    await fs.writeFile(target, "[1,2,3]", "utf8");
    await expect(readMergeableJson(target)).rejects.toThrow(
      /Expected a JSON object.*got array/
    );
  });

  it("throws on a JSON root that's not an object (scalar)", async () => {
    const target = path.join(tmpHome, "scalar-root.json");
    await fs.writeFile(target, '"a-string-root"', "utf8");
    await expect(readMergeableJson(target)).rejects.toThrow(
      /Expected a JSON object.*got string/
    );
  });
});

describe("writeLettaMcpConfig (data-loss regression)", () => {
  it("preserves sibling mcpServers when existing config has a BOM", async () => {
    const target = path.join(tmpHome, ".letta", "mcp_config.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Pre-existing Notepad-saved config — has BOM, has other MCP entries.
    const original = {
      some_letta_field: "keep_me",
      mcpServers: {
        "old-friend": { transport: "stdio", command: "foo" },
      },
    };
    await fs.writeFile(target, "\uFEFF" + JSON.stringify(original), "utf8");

    await writeLettaMcpConfig(target, FAKE_URL, FAKE_TOKEN);

    const written = JSON.parse(await fs.readFile(target, "utf8"));
    // F-level guarantee: no sibling data lost.
    expect(written.some_letta_field).toBe("keep_me");
    expect(written.mcpServers["old-friend"].command).toBe("foo");
    // And our entry was added.
    expect(written.mcpServers.acprompt.url).toBe(FAKE_URL);
  });

  it("throws rather than clobbering a corrupted existing config", async () => {
    const target = path.join(tmpHome, ".letta", "mcp_config.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    const corruptSource = "{ partial: edit, ";
    await fs.writeFile(target, corruptSource, "utf8");

    await expect(
      writeLettaMcpConfig(target, FAKE_URL, FAKE_TOKEN)
    ).rejects.toThrow(/Refusing to overwrite/);

    // File on disk MUST still be the original corrupt bytes — we never
    // wrote over them. (Old code would have replaced this with our
    // entry and a fresh `{ "mcpServers": { "acprompt": … } }`.)
    const afterAttempt = await fs.readFile(target, "utf8");
    expect(afterAttempt).toBe(corruptSource);
  });
});

describe("Claude Desktop mergeConfig (data-loss regression)", () => {
  // We can't easily import the internal `mergeConfig` — it's a module
  // local. Drive it through the public installer surface instead by
  // pointing `configTargets[0]` at our tmp path.

  it("preserves sibling mcpServers when existing config has a BOM", async () => {
    const target = path.join(tmpHome, "claude_desktop_config.json");
    const original = {
      mcpServers: {
        "filesystem": { command: "npx", args: ["-y", "@fs/server"] },
      },
      someUnrelatedKey: "preserve_this",
    };
    await fs.writeFile(target, "\uFEFF" + JSON.stringify(original), "utf8");

    const { claudeCodeInstaller } = await import("../install/claude-code.js");
    await claudeCodeInstaller({
      detection: {
        harness: "claude-code",
        label: "Claude Code / Claude Desktop",
        detected: true,
        evidence: [],
        configTargets: [target],
      },
      home: tmpHome,
      platform: "win32",
      token: FAKE_TOKEN,
      mcpUrl: FAKE_URL,
    });

    const written = JSON.parse(await fs.readFile(target, "utf8"));
    // F-level guarantee: existing `filesystem` entry survives.
    expect(written.mcpServers["filesystem"].command).toBe("npx");
    expect(written.someUnrelatedKey).toBe("preserve_this");
    // And our entry was added with the F7 shape (env-var indirection).
    expect(written.mcpServers.acprompt).toEqual(
      buildClaudeDesktopEntry({ mcpUrl: FAKE_URL, token: FAKE_TOKEN })
    );
  });

  it("throws rather than clobbering a corrupted existing config", async () => {
    const target = path.join(tmpHome, "claude_desktop_config.json");
    const corruptSource = '{"mcpServers": { broken';
    await fs.writeFile(target, corruptSource, "utf8");

    const { claudeCodeInstaller } = await import("../install/claude-code.js");
    await expect(
      claudeCodeInstaller({
        detection: {
          harness: "claude-code",
          label: "Claude Code / Claude Desktop",
          detected: true,
          evidence: [],
          configTargets: [target],
        },
        home: tmpHome,
        platform: "win32",
        token: FAKE_TOKEN,
        mcpUrl: FAKE_URL,
      })
    ).rejects.toThrow(/Refusing to overwrite/);

    const afterAttempt = await fs.readFile(target, "utf8");
    expect(afterAttempt).toBe(corruptSource);
  });
});
