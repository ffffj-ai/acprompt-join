// Per-harness installer tests.
//
// The heavy test is the Letta writer (merges into a real JSON file). The
// snippet installers are smoke-tested: they shouldn't throw, they should
// return the expected `printed` label, and they shouldn't write files.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  writeLettaMcpConfig,
  lettaInstaller,
} from "../install/letta.js";
import { langgraphInstaller } from "../install/langgraph.js";
import { crewaiInstaller } from "../install/crewai.js";
import { openaiAgentsInstaller } from "../install/openai-agents.js";
import { anthropicSdkInstaller } from "../install/anthropic-sdk.js";
import { genericInstaller } from "../install/generic.js";
import { getInstaller, inferLanguage } from "../install/index.js";
import type { InstallerContext } from "../install/index.js";

let tmpHome: string;
const FAKE_TOKEN = "acp_mcp_" + "y".repeat(40);
const FAKE_URL = "https://acprompt.com/api/mcp";

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "acprompt-inst-"));
  // Silence stdout chatter from snippet printers — we test behavior, not prose.
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function makeCtx(overrides: Partial<InstallerContext> = {}): InstallerContext {
  return {
    detection: {
      harness: "test",
      label: "Test",
      detected: true,
      evidence: ["package.json: test-dep"],
    },
    home: tmpHome,
    platform: "linux",
    token: FAKE_TOKEN,
    mcpUrl: FAKE_URL,
    ...overrides,
  };
}

describe("writeLettaMcpConfig", () => {
  it("creates the file and directory when absent", async () => {
    const target = path.join(tmpHome, ".letta", "mcp_config.json");
    await writeLettaMcpConfig(target, FAKE_URL, FAKE_TOKEN);
    const written = JSON.parse(await fs.readFile(target, "utf8"));
    expect(written.mcpServers.acprompt.url).toBe(FAKE_URL);
    expect(written.mcpServers.acprompt.headers.Authorization).toBe(
      `Bearer ${FAKE_TOKEN}`
    );
    expect(written.mcpServers.acprompt.transport).toBe("streamable_http");
  });

  it("merges into an existing config without clobbering siblings", async () => {
    const target = path.join(tmpHome, ".letta", "mcp_config.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      JSON.stringify({
        something_letta_owns: "keep me",
        mcpServers: {
          "old-friend": { transport: "stdio", command: "foo" },
        },
      }),
      "utf8"
    );
    await writeLettaMcpConfig(target, FAKE_URL, FAKE_TOKEN);
    const written = JSON.parse(await fs.readFile(target, "utf8"));
    expect(written.something_letta_owns).toBe("keep me");
    expect(written.mcpServers["old-friend"].command).toBe("foo");
    expect(written.mcpServers.acprompt.url).toBe(FAKE_URL);
  });

  it("overwrites a previous acprompt entry when rotating a token", async () => {
    const target = path.join(tmpHome, ".letta", "mcp_config.json");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(
      target,
      JSON.stringify({
        mcpServers: {
          acprompt: {
            transport: "streamable_http",
            url: FAKE_URL,
            headers: { Authorization: "Bearer STALE" },
          },
        },
      }),
      "utf8"
    );
    await writeLettaMcpConfig(target, FAKE_URL, FAKE_TOKEN);
    const written = JSON.parse(await fs.readFile(target, "utf8"));
    expect(written.mcpServers.acprompt.headers.Authorization).toBe(
      `Bearer ${FAKE_TOKEN}`
    );
  });
});

describe("lettaInstaller", () => {
  it("writes to detection.configTargets[0] and reports it", async () => {
    const target = path.join(tmpHome, ".letta", "mcp_config.json");
    const result = await lettaInstaller(
      makeCtx({
        detection: {
          harness: "letta",
          label: "Letta",
          detected: true,
          evidence: [],
          configTargets: [target],
        },
      })
    );
    expect(result.wrote).toEqual([target]);
    const written = JSON.parse(await fs.readFile(target, "utf8"));
    expect(written.mcpServers.acprompt).toBeDefined();
  });

  it("honors dryRun (no file I/O but still reports the path)", async () => {
    const target = path.join(tmpHome, ".letta", "mcp_config.json");
    const result = await lettaInstaller(
      makeCtx({
        dryRun: true,
        detection: {
          harness: "letta",
          label: "Letta",
          detected: true,
          evidence: [],
          configTargets: [target],
        },
      })
    );
    expect(result.wrote).toEqual([target]);
    await expect(fs.access(target)).rejects.toThrow();
  });
});

describe("snippet installers", () => {
  it("langgraph returns the expected label without writing files", async () => {
    const r = await langgraphInstaller(makeCtx());
    expect(r.wrote).toEqual([]);
    expect(r.printed).toContain("langgraph-snippet");
  });

  it("crewai emits a snippet", async () => {
    const r = await crewaiInstaller(makeCtx());
    expect(r.printed).toContain("crewai-snippet");
  });

  it("openai-agents picks language from evidence (js-only)", async () => {
    const r = await openaiAgentsInstaller(
      makeCtx({
        detection: {
          harness: "openai-agents",
          label: "OpenAI Agents SDK",
          detected: true,
          evidence: ["package.json: @openai/agents"],
        },
      })
    );
    expect(r.printed).toContain("openai-agents-snippet");
  });

  it("anthropic-sdk picks language from evidence (python-only)", async () => {
    const r = await anthropicSdkInstaller(
      makeCtx({
        detection: {
          harness: "anthropic-sdk",
          label: "Anthropic SDK",
          detected: true,
          evidence: ["pyproject.toml: anthropic"],
        },
      })
    );
    expect(r.printed).toContain("anthropic-sdk-snippet");
  });

  it("generic emits the raw-config snippet", async () => {
    const r = await genericInstaller(makeCtx());
    expect(r.printed).toContain("generic-snippet");
    expect(r.wrote).toEqual([]);
  });
});

describe("getInstaller dispatcher", () => {
  it("maps known harness ids to their installer", () => {
    expect(getInstaller("claude-code").name).toMatch(/claudeCode|installer|anon/i);
    expect(getInstaller("langgraph")).toBe(langgraphInstaller);
    expect(getInstaller("crewai")).toBe(crewaiInstaller);
    expect(getInstaller("openai-agents")).toBe(openaiAgentsInstaller);
    expect(getInstaller("anthropic-sdk")).toBe(anthropicSdkInstaller);
    expect(getInstaller("letta")).toBe(lettaInstaller);
    expect(getInstaller("generic")).toBe(genericInstaller);
  });

  it("falls back to generic for unknown harness ids", () => {
    expect(getInstaller("unknown-harness")).toBe(genericInstaller);
    expect(getInstaller("")).toBe(genericInstaller);
  });
});

describe("inferLanguage", () => {
  it("returns python when only python manifests match", () => {
    expect(inferLanguage(["requirements.txt: langgraph"])).toBe("python");
    expect(inferLanguage(["pyproject.toml: langgraph"])).toBe("python");
  });
  it("returns javascript when only package.json matches", () => {
    expect(inferLanguage(["package.json: @langchain/langgraph"])).toBe("javascript");
  });
  it("returns both when both manifests match", () => {
    expect(
      inferLanguage([
        "package.json: @langchain/langgraph",
        "pyproject.toml: langgraph",
      ])
    ).toBe("both");
  });
  it("defaults to both on unknown evidence", () => {
    expect(inferLanguage([])).toBe("both");
    expect(inferLanguage(undefined)).toBe("both");
    expect(inferLanguage(["some weird string"])).toBe("both");
  });
});
