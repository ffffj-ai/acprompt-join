// `acprompt-join install` — the interactive happy path.
//
// Flow:
//   1. Detect harness (pick best match).
//   2. If no token: run browser flow; else confirm reuse.
//   3. Generate local identity if missing.
//   4. Dispatch to the per-harness installer (writes files or prints
//      snippets, depending on the harness's config surface).
//   5. Run verify().

import pc from "picocolors";
import { confirm } from "@inquirer/prompts";
import {
  ALL_DETECTORS,
  currentContext,
  type DetectionResult,
} from "../detect/index.js";
import { runBrowserAuth } from "../auth/browser-flow.js";
import { getToken, maskToken } from "../auth/token-store.js";
import { loadOrCreateIdentity } from "../identity/keypair.js";
import { getInstaller, DEFAULT_MCP_URL } from "../install/index.js";
import { runVerify } from "./verify.js";

export async function runInstall(): Promise<void> {
  console.log(pc.bold("ACPrompt installer"));
  console.log("");

  const ctx = currentContext();
  const detections = await Promise.all(ALL_DETECTORS.map((d) => d.detect(ctx)));
  const best: DetectionResult | undefined = detections.find((d) => d.detected);

  if (!best) {
    // Can't happen in practice: the generic detector always matches. We
    // still guard against it for defensive programming — a detector
    // throwing mid-Promise.all would otherwise leave us with nothing.
    console.log(pc.yellow("No harness detected."));
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

  if (!cfg) {
    throw new Error("Token store unexpectedly empty after auth; retry install.");
  }

  // Confirmation gates — writes always ask; snippets don't (printing is
  // read-only from the user's perspective).
  const installer = getInstaller(best.harness);
  const isFileWriter = best.harness === "claude-code" || best.harness === "letta";
  if (isFileWriter) {
    const target = best.configTargets?.[0] ?? "its default config path";
    const ok = await confirm({
      message: `Write ACPrompt MCP server entry into ${target}?`,
      default: true,
    });
    if (!ok) {
      console.log(
        pc.yellow(
          "Skipped auto-write. Run `acprompt-join install` again when ready, or paste the manual snippet below:"
        )
      );
      // Fall through to generic installer to print a manual snippet.
      await getInstaller("generic")({
        detection: best,
        home: ctx.home,
        platform: ctx.platform,
        token: cfg.token,
        mcpUrl: cfg.mcpUrl ?? DEFAULT_MCP_URL,
      });
      console.log("");
      await runVerify();
      return;
    }
  }

  console.log("");
  await installer({
    detection: best,
    home: ctx.home,
    platform: ctx.platform,
    token: cfg.token,
    mcpUrl: cfg.mcpUrl ?? DEFAULT_MCP_URL,
  });

  console.log("");
  await runVerify();
}
