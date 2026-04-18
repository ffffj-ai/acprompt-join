// Detector tests for the five dependency-scan harnesses + the generic fallback.
// Each test scopes its filesystem side effects to a fresh tmp dir.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { langgraphDetector } from "../detect/langgraph.js";
import { crewaiDetector } from "../detect/crewai.js";
import { openaiAgentsDetector } from "../detect/openai-agents.js";
import { anthropicSdkDetector } from "../detect/anthropic-sdk.js";
import {
  lettaDetector,
  lettaHomeDir,
  lettaMcpConfigPath,
} from "../detect/letta.js";
import { genericDetector } from "../detect/generic.js";
import type { DetectionContext } from "../detect/types.js";
import { findDependency } from "../detect/deps.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "acprompt-det-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function ctx(overrides: Partial<DetectionContext> = {}): DetectionContext {
  return {
    cwd: tmpDir,
    home: tmpDir,
    platform: "linux",
    env: { PATH: "" },
    ...overrides,
  };
}

async function writePackageJson(deps: Record<string, string>): Promise<void> {
  await fs.writeFile(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name: "fixture", version: "0.0.0", dependencies: deps }),
    "utf8"
  );
}

async function writePyproject(body: string): Promise<void> {
  await fs.writeFile(path.join(tmpDir, "pyproject.toml"), body, "utf8");
}

async function writeRequirements(lines: string[]): Promise<void> {
  await fs.writeFile(
    path.join(tmpDir, "requirements.txt"),
    lines.join("\n"),
    "utf8"
  );
}

describe("langgraphDetector", () => {
  it("detects via package.json", async () => {
    await writePackageJson({ "@langchain/langgraph": "^0.2.0" });
    const r = await langgraphDetector.detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.evidence?.join(" ")).toMatch(/package\.json.*langgraph/);
  });

  it("detects via pyproject.toml poetry style", async () => {
    await writePyproject(
      `[tool.poetry.dependencies]\npython = "^3.11"\nlanggraph = "^0.2.0"\n`
    );
    const r = await langgraphDetector.detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.evidence?.join(" ")).toMatch(/pyproject\.toml/);
  });

  it("detects via pyproject.toml PEP 621 quoted dependency", async () => {
    await writePyproject(
      `[project]\ndependencies = [\n  "langgraph>=0.2",\n  "requests",\n]\n`
    );
    const r = await langgraphDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("detects via requirements.txt", async () => {
    await writeRequirements(["# pinned", "langgraph==0.2.5", "requests"]);
    const r = await langgraphDetector.detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.evidence?.join(" ")).toMatch(/requirements\.txt/);
  });

  it("reports not-detected when nothing matches", async () => {
    await writePackageJson({ react: "^18.0.0" });
    const r = await langgraphDetector.detect(ctx());
    expect(r.detected).toBe(false);
    expect(r.reason).toMatch(/No langgraph/);
  });

  it("does not false-positive on the word langgraph in a description", async () => {
    await writePyproject(
      `[project]\nname = "my-pkg"\ndescription = "A langgraph tool wrapper"\ndependencies = ["requests"]\n`
    );
    const r = await langgraphDetector.detect(ctx());
    expect(r.detected).toBe(false);
  });
});

describe("crewaiDetector", () => {
  it("detects via requirements.txt", async () => {
    await writeRequirements(["crewai>=0.30"]);
    const r = await crewaiDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("detects crewai-tools extension", async () => {
    await writeRequirements(["crewai-tools"]);
    const r = await crewaiDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("reports not-detected with empty repo", async () => {
    const r = await crewaiDetector.detect(ctx());
    expect(r.detected).toBe(false);
  });
});

describe("openaiAgentsDetector", () => {
  it("detects @openai/agents in package.json", async () => {
    await writePackageJson({ "@openai/agents": "^0.1.0" });
    const r = await openaiAgentsDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("detects openai-agents in pyproject", async () => {
    await writePyproject(`[project]\ndependencies = ["openai-agents>=0.1"]\n`);
    const r = await openaiAgentsDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("does NOT match plain openai dependency", async () => {
    await writePackageJson({ openai: "^4.0.0" });
    const r = await openaiAgentsDetector.detect(ctx());
    expect(r.detected).toBe(false);
  });
});

describe("anthropicSdkDetector", () => {
  it("detects @anthropic-ai/sdk in package.json", async () => {
    await writePackageJson({ "@anthropic-ai/sdk": "^0.40.0" });
    const r = await anthropicSdkDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("detects anthropic in requirements.txt", async () => {
    await writeRequirements(["anthropic==0.40.0"]);
    const r = await anthropicSdkDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("is not detected on empty repo", async () => {
    const r = await anthropicSdkDetector.detect(ctx());
    expect(r.detected).toBe(false);
  });
});

describe("lettaDetector", () => {
  it("detects via ~/.letta/ directory", async () => {
    await fs.mkdir(lettaHomeDir(ctx()), { recursive: true });
    const r = await lettaDetector.detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.evidence?.join(" ")).toMatch(/\.letta/);
    expect(r.configTargets?.[0]).toBe(lettaMcpConfigPath(ctx()));
  });

  it("detects via letta python dep", async () => {
    await writeRequirements(["letta>=0.5"]);
    const r = await lettaDetector.detect(ctx());
    expect(r.detected).toBe(true);
  });

  it("reports not-detected when neither signal present", async () => {
    const r = await lettaDetector.detect(ctx());
    expect(r.detected).toBe(false);
    expect(r.configTargets?.[0]).toMatch(/mcp_config\.json$/);
  });
});

describe("genericDetector", () => {
  it("always detects so the installer can fall through to a manual snippet", async () => {
    const r = await genericDetector.detect(ctx());
    expect(r.detected).toBe(true);
    expect(r.harness).toBe("generic");
  });
});

describe("findDependency edge cases", () => {
  it("tolerates malformed package.json", async () => {
    await fs.writeFile(path.join(tmpDir, "package.json"), "{ not json", "utf8");
    const matches = await findDependency(ctx(), ["langgraph"]);
    expect(matches).toEqual([]);
  });

  it("picks up devDependencies + peerDependencies", async () => {
    await fs.writeFile(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        name: "x",
        devDependencies: { "@langchain/langgraph": "*" },
        peerDependencies: { "@openai/agents": "*" },
      }),
      "utf8"
    );
    const lg = await findDependency(ctx(), ["@langchain/langgraph"]);
    const oa = await findDependency(ctx(), ["@openai/agents"]);
    expect(lg.length).toBe(1);
    expect(oa.length).toBe(1);
  });

  it("ignores commented-out requirements.txt lines", async () => {
    await writeRequirements(["# langgraph==0.2.5 (disabled)", "requests"]);
    const matches = await findDependency(ctx(), ["langgraph"]);
    expect(matches).toEqual([]);
  });
});
