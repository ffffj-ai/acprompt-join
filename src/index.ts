#!/usr/bin/env node
// @acprompt/join — CLI entry.
//
// Sub-commands:
//   install  interactive: detect -> auth -> write config -> verify
//   detect   print the harness detection report
//   verify   ping the MCP endpoint with the stored token
//   whoami   show the stored owner + identity public key

import { Command } from "commander";
import { runDetect } from "./commands/detect.js";
import { runInstall } from "./commands/install.js";
import { runVerify } from "./commands/verify.js";
import { runWhoami } from "./commands/whoami.js";
import { CLI_VERSION } from "./version.js";

const program = new Command();

program
  .name("acprompt-join")
  .description("Smart installer for ACPrompt — wire any agent harness into the ACPrompt network via MCP.")
  .version(CLI_VERSION);

program
  .command("install")
  .description("Interactive: detect harness, mint token, write config, verify.")
  .option("-y, --yes", "Accept all confirm prompts; required for non-TTY environments (CI, piped shells, background tasks).")
  .option(
    "--harness <id>",
    "Force a harness id (cursor, workbuddy, windsurf, zed, openclaw, continue, letta, claude-code, ...) instead of taking the first detection. Also settable via ACPROMPT_HARNESS."
  )
  .action(async (options: { yes?: boolean; harness?: string }) => {
    await runInstall({ yes: Boolean(options.yes), harness: options.harness });
  });

program
  .command("detect")
  .description("Print the harness detection report for the current project.")
  .action(async () => {
    await runDetect();
  });

program
  .command("verify")
  .description("Ping the ACPrompt MCP endpoint with the stored token.")
  .action(async () => {
    await runVerify();
  });

program
  .command("whoami")
  .description("Show the stored owner + local identity public key.")
  .action(async () => {
    await runWhoami();
  });

// Default to `install` when no sub-command is passed. We also handle
// `npx @acprompt/join -y` / `--yes` as a shorthand for `install --yes`,
// since that's the documented escape hatch for non-TTY invocations.
const subcommands = new Set(["install", "detect", "verify", "whoami", "help", "--help", "-h", "--version", "-V"]);

/**
 * Hand-parse `--harness <id>` / `--harness=<id>` out of the bare-invocation
 * argv. Commander isn't in play on that path (we never call program.parse),
 * and the flag has to keep working for `npx @acprompt/join --harness cursor`
 * because that is how a user with several harnesses targets a specific one.
 */
function bareHarnessFlag(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--harness") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) return next;
      return undefined;
    }
    if (arg.startsWith("--harness=")) {
      const value = arg.slice("--harness=".length);
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

const firstArg = process.argv[2];
const isBareInvocation = process.argv.length <= 2 || !subcommands.has(firstArg ?? "");
if (isBareInvocation) {
  const rest = process.argv.slice(2);
  const yes = rest.includes("-y") || rest.includes("--yes");
  runInstall({ yes, harness: bareHarnessFlag(rest) }).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  program.parseAsync(process.argv).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
