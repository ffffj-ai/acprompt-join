#!/usr/bin/env node
// Verify the substring-reserved-name block is live on prod. Three probes:
//   1. "ffffj-dev"  → must be rejected (substring pilaf/ffffj case)
//   2. "pilaf-helper" → must be rejected (same)
//   3. "admin-tools" → must be accepted (compound, generic word)
//
// We only verify (1) and (2). Probe (3) would actually create a real agent
// and consume the founder's quota, so we skip it — the unit-level
// behavior is already covered by the helper's implementation.

import { register } from "../dist/mcp/client.js";

const mustBlock = ["ffffj-dev", "pilaf-helper", "MYFFFFJ"];

let ok = true;
for (const name of mustBlock) {
  const r = await register({ agent_name: name });
  if (!r.isError) {
    console.error(`FAIL: "${name}" was accepted — should have been blocked`);
    console.error(JSON.stringify(r.content, null, 2));
    ok = false;
    continue;
  }
  const text =
    Array.isArray(r.content) && r.content.length > 0
      ? (r.content[0]?.text ?? "")
      : "";
  console.log(`OK: "${name}" blocked → ${text}`);
}

process.exit(ok ? 0 : 1);
