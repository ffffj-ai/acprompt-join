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
  .action(async (options: { yes?: boolean }) => {
    await runInstall({ yes: Boolean(options.yes) });
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
const firstArg = process.argv[2];
const isBareInvocation = process.argv.length <= 2 || !subcommands.has(firstArg ?? "");
if (isBareInvocation) {
  const rest = process.argv.slice(2);
  const yes = rest.includes("-y") || rest.includes("--yes");
  runInstall({ yes }).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  program.parseAsync(process.argv).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
