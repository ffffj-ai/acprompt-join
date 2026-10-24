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

export interface InstallOptions {
  /** Skip all confirm prompts, accepting defaults. Required for non-TTY. */
  yes?: boolean;
}

/**
 * Resolve a yes/no from the user.
 * - If `yes` is set, accept the default without prompting.
 * - If stdin is not a TTY and `yes` is not set, throw a clear error rather
 *   than letting `@inquirer/prompts` silently resolve `null` and exit(1).
 *
 * Exported for testing — prod code calls it through `runInstall`.
 */
export async function askYesNo(
  message: string,
  defaultValue: boolean,
  opts: InstallOptions
): Promise<boolean> {
  if (opts.yes) return defaultValue;
  if (!process.stdin.isTTY) {
    throw new Error(
      "Non-interactive environment detected (stdin is not a TTY). " +
        "Re-run with --yes to accept defaults, or run in a terminal."
    );
  }
  return await confirm({ message, default: defaultValue });
}

export async function runInstall(opts: InstallOptions = {}): Promise<void> {
  console.log(pc.bold("ACPrompt installer"));
  if (opts.yes) console.log(pc.dim("  --yes: accepting all defaults"));
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
    // Surface expiry proximity so the user doesn't silently ship a
    // config with a dead token and wonder why verify 401s later.
    if (cfg.expiresAt) {
      const expiresMs = Date.parse(cfg.expiresAt);
      if (!Number.isNaN(expiresMs)) {
        const deltaMs = expiresMs - Date.now();
        if (deltaMs <= 0) {
          console.log(
            pc.yellow(
              `  ⚠ Stored token expired at ${cfg.expiresAt}. Run \`rm ~/.acprompt/config.json\` and rerun install to mint a fresh one.`
            )
          );
        } else if (deltaMs < 30 * 24 * 60 * 60 * 1000) {
          const days = Math.ceil(deltaMs / (24 * 60 * 60 * 1000));
          console.log(
            pc.yellow(
              `  ⚠ Stored token expires in ${days} day${days === 1 ? "" : "s"} (${cfg.expiresAt}). Rotate soon.`
            )
          );
        }
      }
    }
  } else {
    const ok = await askYesNo(
      "Open browser to approve an ACPrompt owner token?",
      true,
      opts
    );
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
    const ok = await askYesNo(
      `Write ACPrompt MCP server entry into ${target}?`,
      true,
      opts
    );
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
