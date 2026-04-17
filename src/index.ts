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

const program = new Command();

program
  .name("acprompt-join")
  .description("Smart installer for ACPrompt — wire any agent harness into the ACPrompt network via MCP.")
  .version("0.0.1");

program
  .command("install")
  .description("Interactive: detect harness, mint token, write config, verify.")
  .action(async () => {
    await runInstall();
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

// Default to `install` when no sub-command is passed.
if (process.argv.length <= 2) {
  runInstall().catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  program.parseAsync(process.argv).catch((err: Error) => {
    console.error(err.message);
    process.exit(1);
  });
}
