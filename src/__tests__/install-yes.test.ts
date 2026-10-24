// `--yes` / non-TTY behavior for runInstall (F1 regression).
//
// The prior behavior (pre-0.1.5) was: when stdin isn't a TTY,
// `@inquirer/prompts.confirm()` silently resolves null, the caller branches
// "aborted", and the CLI exits with code 1 producing zero user-facing
// feedback. Background-shell and CI invocations of `npx @acprompt/join`
// hit this wall without knowing why.
//
// askYesNo() is the single point that replaces confirm(). These tests pin
// both sides of its contract so the silent-exit path cannot come back.

import { describe, it, expect, afterEach } from "vitest";
import { askYesNo } from "../commands/install.js";

describe("askYesNo (F1 non-TTY regression)", () => {
  const originalIsTTY = process.stdin.isTTY;
  afterEach(() => {
    // vitest shares process across tests — put the flag back.
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it("returns the default when --yes is set, regardless of TTY state", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    await expect(askYesNo("ignored", true, { yes: true })).resolves.toBe(true);
    await expect(askYesNo("ignored", false, { yes: true })).resolves.toBe(false);
  });

  it("throws a clear error on non-TTY without --yes (instead of silently exiting)", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    await expect(askYesNo("anything", true, {})).rejects.toThrow(
      /non-interactive environment/i
    );
    await expect(askYesNo("anything", true, {})).rejects.toThrow(/--yes/);
  });
});
