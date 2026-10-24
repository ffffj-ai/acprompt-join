// Single source of truth for the CLI version.
//
// Why a runtime read instead of a string constant?
//   The CLI version ends up in two places that matter:
//     1. commander's `.version()` — what `acprompt-join --version` prints.
//     2. `CLIENT_INFO.version` on the MCP client — what the server sees as
//        the `clientInfo.version` field during `initialize` (telemetry +
//        any future per-version gating).
//   Both must match `package.json.version`. Historically (pre-v0.1.8) we
//   hardcoded the version in both places and the CLIENT_INFO one drifted
//   (stuck at "0.1.0" while the package shipped 0.1.7). Reading the real
//   package.json at startup makes drift structurally impossible.
//
// Why not `import pkg from "../package.json"`?
//   Node 20's JSON-module import requires `assert { type: "json" }`;
//   Node 22+ prefers `with { type: "json" }`. The two are not fully
//   interchangeable, and we want the CLI to run unchanged on both LTS
//   versions. A plain `fs.readFileSync` sidesteps the whole saga.
//
// Path resolution:
//   At runtime this file lives at `dist/version.js` (published under
//   `node_modules/@acprompt/join/dist/version.js`). `package.json` is one
//   level up at `node_modules/@acprompt/join/package.json`. We derive the
//   path from `import.meta.url` so it works regardless of where npm put
//   the package, and regardless of the current working directory.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function readCliVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "..", "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to the sentinel below. We deliberately swallow the
    // error — the CLI is still functional without a precise version
    // string, and throwing here would break every code path transitively.
  }
  return "0.0.0-unknown";
}

export const CLI_VERSION = readCliVersion();
