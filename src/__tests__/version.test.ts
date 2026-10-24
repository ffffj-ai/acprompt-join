// Regression — CLI_VERSION must equal package.json.version.
//
// Pre-v0.1.8 the CLI had two hardcoded version strings: commander's
// `.version()` (kept bumped) and `CLIENT_INFO.version` on the MCP client
// (left behind at "0.1.0" while the package shipped 0.1.7). The MCP
// server sees `clientInfo.version` on initialize, so telemetry was
// mis-identifying every real install as a v0.1.0 client.
//
// Fix: both now read from a single `CLI_VERSION` that's derived at
// runtime from package.json. This test pins two invariants:
//   1. `CLI_VERSION` matches the actual package.json.version — if someone
//      ever replaces the runtime read with a hardcoded string, `npm publish`
//      after bumping version will trip this test.
//   2. `CLI_VERSION` is a real-looking semver, not the "0.0.0-unknown"
//      fallback that the runtime read returns when package.json is
//      missing. If this assertion fails, the path resolution in
//      `src/version.ts` broke — the test file structure must mirror the
//      production layout for the relative `..\/package.json` to resolve.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CLI_VERSION } from "../version.js";

describe("CLI_VERSION (version-drift regression)", () => {
  it("matches package.json.version", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
  });

  it("is not the 0.0.0-unknown fallback sentinel", () => {
    // Fallback fires only when the runtime fs read failed. In the test
    // harness it must succeed — if this fires, `src/version.ts`'s path
    // resolution no longer finds package.json from its bundled location.
    expect(CLI_VERSION).not.toBe("0.0.0-unknown");
  });

  it("looks like a real semver", () => {
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
  });
});
