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
import { getInstaller, DEFAULT_MCP_URL, FILE_WRITER_HARNESSES } from "../install/index.js";
import { runVerify } from "./verify.js";

export interface InstallOptions {
  /** Skip all confirm prompts, accepting defaults. Required for non-TTY. */
  yes?: boolean;
  /**
   * Force a specific harness id instead of taking the first detection.
   *
   * Needed because detection is home-scoped for desktop apps: a developer with
   * Claude Code, Cursor and WorkBuddy all installed would otherwise always be
   * routed to whichever sits first in ALL_DETECTORS. `ACPROMPT_HARNESS` is
   * honoured too, mirroring `install.sh`.
   */
  harness?: string;
}

/** Harness ids are compared loosely: `claude_code` == `claude-code`. */
export function normalizeHarnessId(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, "-");
}

export interface HarnessPick {
  picked?: DetectionResult;
  /** True when the caller forced a harness that detection had no evidence for. */
  forced?: boolean;
  error?: string;
}

/**
 * Decide which detection `install` acts on.
 *
 * Default behaviour is unchanged since v0.1.7: first detected entry wins,
 * which is why the IDE-app detectors were appended after the existing ones.
 *
 * With an explicit override we trust the human over the filesystem. Forcing a
 * harness that showed no evidence is allowed (the user may have a non-standard
 * install path) but reported as `forced` so the caller can warn. An id that
 * isn't in the registry is a hard error — silently falling back to `generic`
 * there would look like the override worked when it didn't.
 *
 * Exported for testing: `runInstall` needs network + a token, this doesn't.
 */
export function pickDetection(
  detections: readonly DetectionResult[],
  override?: string
): HarnessPick {
  const known = detections.map((d) => d.harness).join(", ");

  if (override && override.trim().length > 0) {
    const want = normalizeHarnessId(override);
    const hit = detections.find((d) => normalizeHarnessId(d.harness) === want);
    if (!hit) {
      return { error: `Unknown harness "${override}". Known ids: ${known}.` };
    }
    return { picked: hit, forced: !hit.detected };
  }

  const first = detections.find((d) => d.detected);
  return first
    ? { picked: first, forced: false }
    : { error: "No harness detected." };
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

  const override = opts.harness ?? process.env.ACPROMPT_HARNESS;
  const pick = pickDetection(detections, override);
  if (!pick.picked) {
    throw new Error(pick.error ?? "No harness detected.");
  }
  const best = pick.picked;

  if (pick.forced) {
    console.log(
      pc.yellow(
        `--harness ${best.harness}: forced despite no detection evidence (${best.reason ?? "no reason recorded"}).`
      )
    );
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
  const isFileWriter = FILE_WRITER_HARNESSES.has(best.harness);
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
