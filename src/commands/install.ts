// `acprompt-join install` — the interactive happy path.
//
// Flow:
//   1. Detect harness (pick best match, confirm with user).
//   2. If no token: run browser flow; else confirm reuse.
//   3. Generate local identity if missing.
//   4. Write MCP config for Claude Desktop (only implemented target this week)
//      or print a shell command for Claude Code CLI.
//   5. Run verify().
//
// The config-writing paths for other harnesses are Week-3 work; we bail
// gracefully and print the manual snippet.

import pc from "picocolors";
import { confirm } from "@inquirer/prompts";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ALL_DETECTORS,
  currentContext,
  type DetectionResult,
} from "../detect/index.js";
import { runBrowserAuth } from "../auth/browser-flow.js";
import { getToken, maskToken } from "../auth/token-store.js";
import { loadOrCreateIdentity } from "../identity/keypair.js";
import { runVerify } from "./verify.js";

async function writeClaudeDesktopConfig(
  configPath: string,
  token: string
): Promise<void> {
  let current: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(configPath, "utf8");
    current = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
  }
  const servers = (current.mcpServers ?? {}) as Record<string, unknown>;
  servers["acprompt"] = {
    type: "http",
    url: "https://acprompt.com/api/mcp",
    headers: { Authorization: `Bearer ${token}` },
  };
  current.mcpServers = servers;
  await fs.writeFile(configPath, JSON.stringify(current, null, 2), "utf8");
}

export async function runInstall(): Promise<void> {
  console.log(pc.bold("ACPrompt installer"));
  console.log("");

  const ctx = currentContext();
  const detections = await Promise.all(ALL_DETECTORS.map((d) => d.detect(ctx)));
  const best: DetectionResult | undefined = detections.find((d) => d.detected);

  if (!best) {
    console.log(pc.yellow("No harness detected. Week-3 fallback will handle this."));
    return;
  }
  console.log(pc.green(`Detected: ${best.label}`));
  (best.evidence ?? []).forEach((e) => console.log(pc.dim(`  ${e}`)));
  console.log("");

  let cfg = await getToken();
  if (cfg) {
    console.log(pc.dim(`Reusing stored token (${maskToken(cfg.token)}).`));
  } else {
    const ok = await confirm({
      message: "Open browser to approve an ACPrompt owner token?",
      default: true,
    });
    if (!ok) {
      console.log(pc.yellow("Aborted. Rerun when ready."));
      return;
    }
    const result = await runBrowserAuth();
    cfg = await getToken();
    console.log(pc.green(`Token saved (${maskToken(result.token)}).`));
  }

  await loadOrCreateIdentity();

  if (best.harness === "claude-code" && best.configTargets?.[0]) {
    const target = best.configTargets[0];
    const ok = await confirm({
      message: `Write ACPrompt MCP server entry into ${target}?`,
      default: true,
    });
    if (ok && cfg) {
      await writeClaudeDesktopConfig(target, cfg.token);
      console.log(pc.green(`Wrote ${target}.`));
    } else {
      console.log(pc.dim("Skipped. Claude Code CLI users can run:"));
      console.log(
        pc.dim(
          `  claude mcp add acprompt https://acprompt.com/api/mcp --transport http -H "Authorization: Bearer <your_token>"`
        )
      );
    }
  } else {
    console.log(
      pc.yellow(
        `Auto-config for ${best.label} is not implemented yet (TODO Week 3).`
      )
    );
  }

  console.log("");
  await runVerify();
}
