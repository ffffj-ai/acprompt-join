# @acprompt/join dogfood findings

Rolling list of UX issues surfaced while the founder connects their own agent via the flagship `npx @acprompt/join` flow. Priority: P0 blocks a real first user, P1 is rough-but-usable, P2 is polish.

## 2026-04-20 — founder first run

### F1 (P1) — no non-interactive mode
`runInstall()` uses `@inquirer/prompts` `confirm()` twice ([commands/install.ts:47](src/commands/install.ts:47), [commands/install.ts:72](src/commands/install.ts:72)). On a non-TTY stdin (background tasks, CI, `bash -c`, piped environments) `confirm()` resolves `null` and the CLI silently exits with code 1 — no error message, no fallback.

**Repro:** `npx @acprompt/join < /dev/null` or any background-shell invocation.

**Fix (shipped 2026-04-20 in v0.1.5):**
- Added `-y`/`--yes` to both the `install` subcommand and the bare `npx @acprompt/join` default path ([src/index.ts](src/index.ts), [src/commands/install.ts](src/commands/install.ts)).
- New `askYesNo(message, default, opts)` helper replaces raw `confirm()` at both call sites. Rules: `yes:true` ⇒ accept default with no prompt; `!yes && !process.stdin.isTTY` ⇒ throw `"Non-interactive environment detected (stdin is not a TTY). Re-run with --yes to accept defaults, or run in a terminal."`; otherwise fall through to `confirm()`.
- Regression test in [src/__tests__/install-yes.test.ts](src/__tests__/install-yes.test.ts) flips `process.stdin.isTTY` to `false` and pins both branches of the contract. Verified end-to-end: `node dist/index.js install < /dev/null` now prints the clear actionable error (it used to print nothing and exit 1).

Filed during founder dogfood run, before the browser flow even opened.

---

### F2 (P0) — loopback server missing CORS preflight → "Failed to fetch"
The dashboard page `https://www.acprompt.com/cli-auth` POSTs JSON to `http://127.0.0.1:<port>/callback` with `Content-Type: application/json`. Because the target is cross-origin (public HTTPS → loopback HTTP) AND the content type is not CORS-simple, the browser issues an OPTIONS preflight. The loopback server in [browser-flow.ts:88](src/auth/browser-flow.ts:88) did NOT handle OPTIONS — it returned 404 with no CORS headers — so every preflight failed and the actual POST was blocked client-side with "Failed to fetch".

Compounding: Chrome's Private Network Access (PNA) also requires `Access-Control-Allow-Private-Network: true` when a public-origin page contacts a loopback/private IP. Without it, recent Chrome builds also kill the preflight even if the standard CORS headers are correct.

**Impact:** every founder-side retry hits the same wall; no real user can get past step 3 of the flow. This fully blocks the flagship `npx @acprompt/join` path.

**Fix (shipped 2026-04-20 in v0.1.1):** added `corsHeadersFor()` helper that returns `Access-Control-Allow-Origin` (`https://www.acprompt.com` or `https://acprompt.com`), `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Max-Age: 600`, `Access-Control-Allow-Private-Network: true`, and `Vary: Origin`. The OPTIONS request returns 204 with those headers; actual POST also includes them so the page can read the response body. Regression test in [browser-flow.test.ts](src/__tests__/browser-flow.test.ts) binds a real loopback server via `runBrowserAuth({randomPort,randomState,openBrowser:noop})` and asserts preflight→204 + all 5 headers.

**Root-cause reflection:** this bug is load-bearing on the entire product's flagship path and it slipped through 48 passing unit tests because no test actually exercised the HTTP server — only the pure `verifyCallback()` payload validator was covered. Tests that never call `runBrowserAuth` can't catch server-config bugs. Added the regression test above to close the hole.

---

### F3 (P0) — regression test wrote a fake token to the real `~/.acprompt/config.json`
My v0.1.1 CORS regression test (added same session as F2) called `runBrowserAuth(...)` with overridden `randomPort`/`randomState`/`openBrowser`/`authUrl` but **NOT** an overridden token-store path. On a successful callback, `runBrowserAuth` unconditionally calls `setToken(result.token, ...)` which writes to `~/.acprompt/config.json`. The test's dummy token `"acp_mcp_" + "x".repeat(40)` therefore clobbered the developer's real stored token on disk. The next run of `npx @acprompt/join` saw a non-null stored token and skipped the browser flow entirely; the verify step then hit `/api/mcp` with `acp_mcp_xxxx…xxxx` and got 401.

**Caught by:** the founder running `npx @acprompt/join@latest` immediately after I ran the test suite. Self-inflicted — my own test corrupted the founder's config mid-session.

**Fix (shipped 2026-04-20 in v0.1.2):** the new test now creates a tmpdir via `fs.mkdtemp(os.tmpdir() + "acprompt-test-home-…")` and redirects `process.env.HOME` + `process.env.USERPROFILE` to it in `beforeAll`, restoring the originals in `afterAll`. `os.homedir()` (used by `acpromptDir()`) reads those env vars on both unix and windows, so the test can never again reach the real config path.

**Broader principle (added to future-test checklist):** any CLI test that instantiates a real code path reaching filesystem primitives MUST isolate HOME/APPDATA/USERPROFILE in a beforeAll, not rely on mocking at the import boundary.

---

### F4 (P0) — bare-domain mcpUrl silently drops Authorization on 307 redirect
`@acprompt/join` v0.1.0–v0.1.2 stored `mcpUrl: "https://acprompt.com/api/mcp"` (no `www.`). The server redirects bare → www with 307. Both the MCP SDK's `StreamableHTTPClientTransport` and Node's built-in fetch **strip the `Authorization` header on cross-host redirects** as a standard security measure (same policy browsers use — the redirected origin isn't the one the Bearer was issued to). Result: the redirected POST arrives at `www.acprompt.com/api/mcp` with no auth, server returns 401, and the failure message says the token is missing even though the token is correct.

**Same class of bug as R37 GitHub webhook** (which flat-out doesn't follow redirects at all). The canonical origin everywhere inside ACPrompt is `https://www.acprompt.com`, NOT `https://acprompt.com`. Every server-issued URL, every doc snippet, every default in the CLI must use `www.` up front.

**Fix (shipped 2026-04-20 in v0.1.3 + ACPrompt prod redeploy):**
- ACPrompt backend: [src/app/api/owner-token/route.ts](../acp/src/app/api/owner-token/route.ts) returns `mcp_url: "https://www.acprompt.com/api/mcp"`, and the `claude_code` hint string matches.
- ACPrompt backend: [src/app/api/discover/route.ts](../acp/src/app/api/discover/route.ts), [src/app/dashboard/page.tsx](../acp/src/app/dashboard/page.tsx), [src/app/admin/page.tsx](../acp/src/app/admin/page.tsx), [src/app/api/mcp/route.ts](../acp/src/app/api/mcp/route.ts), and [ACP_PROTOCOL_SPEC_v0.3.md](../acp/ACP_PROTOCOL_SPEC_v0.3.md) all flipped to `www.`.
- CLI sources: [src/install/shared.ts](src/install/shared.ts) `DEFAULT_MCP_URL`, [src/auth/browser-flow.ts](src/auth/browser-flow.ts) fallback, [src/auth/token-store.ts](src/auth/token-store.ts) default, [src/install/letta.ts](src/install/letta.ts) doc comment.
- **Defensive auto-heal in `getToken()`**: if the stored `mcpUrl` is the bare-domain form, rewrite it to the www form on read. This lets every already-installed 0.1.0–0.1.2 user's next call succeed without them knowing anything happened.

**Root-cause reflection:** the bare-domain value was chosen for readability when the URL first appeared (R32, before the DNS routing through `www.` was finalised). Once `acprompt.com` started 307'ing to `www.`, nobody audited the internal URL constants because "it still works in the browser / curl follows redirects". The two paths where redirect-following silently breaks (MCP SDK keeping Authorization cross-host, GitHub webhook delivery) are exactly the ones without humans in the loop. Added this class of bug to the checklist: **any server-issued URL destined for a non-browser HTTP client must be the canonical host, not a redirect source.**

---

### F5 (P1) — verify step used `name` but the server's `acp_register` schema expects `agent_name`, and calling a write-tool in verify is wrong anyway
`runVerify()` (v0.1.0–v0.1.3) called `register({ name, kind, public_key })`. Three problems in one call:

1. **Field-name mismatch.** The server's `acp_register` Zod schema at [src/lib/mcp/server.ts:109](../acp/src/lib/mcp/server.ts:109) requires `agent_name`, not `name`. The CLI's wrapper type was written in isolation from the server. So the first successful auth on a real token bombed with `Input validation error: Invalid arguments for tool acp_register: agent_name expected string, received undefined`.

2. **Misplaced `kind` + `public_key` fields.** Neither exists in the server schema — `kind` is unused by the platform, and the server generates its own Ed25519 keypair and returns `acp_secret_key` in the response (the CLI was never expected to supply one). Zod silently strips unknown keys, so they never would've taken effect even before (1).

3. **Verify should not be a write.** `acp_register` creates a real DB row, consumes the owner's agent quota, and emits a platform event. Re-running `acprompt-join install` a second time would therefore either duplicate-error (same name) or eat a quota slot. Verify must be read-only.

**Fix (shipped 2026-04-20 in v0.1.4):**
- Rewrote `runVerify()` to call `acp_whoami` (read-only) instead. This proves the owner Bearer token reaches the MCP server and the server recognizes the owner — which is what verify is *for*.
- Rewrote `register()` in [src/mcp/client.ts](src/mcp/client.ts) to match the server schema exactly: `agent_name` + optional `capabilities`/`intent`/`autonomy_mode`/`endpoint_url`. Dropped `name`/`kind`/`public_key`.
- Dropped the `loadOrCreateIdentity()` call from verify — the installer identity is orphaned relative to the MCP path (challenge-response uses per-agent server-generated keys, not the installer's local keypair). Keeping the identity file is harmless; it may yet find a use.

**Root-cause reflection:** the CLI was developed in parallel with the server without a shared schema source of truth. The CLI side wrote a wrapper against an *imagined* server contract, and because the auth layer blocked us at the 401 all the way through dogfood up to F4, this schema divergence never surfaced until the Bearer started working. Follow-up candidate: generate the CLI's MCP tool wrappers from the server's Zod schemas (or at least pin a contract test that `tools/list` on prod matches the wrappers).

---

### F6 (P0) — installer wrote the Claude **Code** MCP shape into Claude **Desktop**'s config; Desktop silently skipped it
v0.1.0–v0.1.5 emitted the native HTTP shape `{type:"http", url, headers:{Authorization:"Bearer …"}}` into `claude_desktop_config.json`. That shape is what Claude Code (the CLI) accepts, but Claude Desktop (the Electron app) as of Apr 2026 is stdio-only for MCP servers. On restart, Desktop pops a dialog reading *"Some MCP servers could not be loaded — The following entries in claude_desktop_config.json are not valid MCP server configurations and were skipped: acprompt"*, loads zero tools, and the founder's newly-registered `天才` agent is invisible inside any Claude conversation.

**Caught by:** founder restarted Claude Desktop after we ran `npx @acprompt/join` earlier in the same dogfood session. Had the founder not restarted, this would have stayed hidden indefinitely — `acp_whoami` from the CLI still worked, so the CLI-side "verify" was green while the actual product surface (Claude-in-Claude-Desktop) was broken.

**Fix (shipped 2026-04-20 in v0.1.6):** the installer now emits the [`mcp-remote`](https://github.com/geelen/mcp-remote) stdio shim shape that Claude Desktop does accept:
```json
"acprompt": {
  "command": "npx",
  "args": [
    "-y",
    "mcp-remote",
    "https://www.acprompt.com/api/mcp",
    "--header",
    "Authorization:Bearer acp_mcp_…"
  ]
}
```
Windows-safety choices baked in:
- Header separator is `:` with **no space** before the value. `mcp-remote` splits on the first colon and trims, so the parsed header is still `Authorization: Bearer acp_mcp_…`. The no-space form avoids a class of argv-corruption bugs seen on some Windows npx/cmd paths.
- Token is inlined in `args`, not indirected via `${VAR}` + `env`. Claude Desktop doesn't document `${VAR}` substitution in args, and `mcp-remote`'s internal substitution has varied across versions — inlining makes the config version-independent.
- `-y` on `npx` prevents the "install this package?" prompt from hanging the child process on first run.

Regression test in [src/__tests__/claude-desktop-shape.test.ts](src/__tests__/claude-desktop-shape.test.ts) pins all four invariants via the new `buildClaudeDesktopEntry()` helper: not-HTTP-shape, npx-mcp-remote-command, colon-no-space header, inlined token.

**Root-cause reflection:** the CLI was written assuming Claude Desktop and Claude Code CLI shared an MCP config shape because they share a config *file path* on some platforms (they don't — Claude Code's CLI config lives elsewhere). No test actually loaded the written config into a Claude Desktop instance. The only end-to-end check was `runVerify()` from the CLI itself, which uses our own MCP client and never touches Desktop. Follow-up candidate: spin up `mcp-remote` in a child process against the written config and assert it can list tools — this would catch both F6 (invalid shape) and hypothetical future breakage (wrong args, missing -y, token truncation).

This is the second dogfood pass where the verify step passed-green while the real user-facing product was still broken. The shape of that gap is: **verify-from-CLI uses a different code path than verify-from-harness**, and any bug confined to the harness-side config is invisible to the CLI. Fix direction: add an explicit post-install probe that invokes the harness's own MCP loader, not ours.

---

### F7 (P0) — v0.1.6 `mcp-remote` shape, Bearer token chopped by Windows cmd.exe on spawn
The F6 fix (v0.1.6) wrote a config of the form `args: ["-y", "mcp-remote", "<url>", "--header", "Authorization:Bearer acp_mcp_…"]`. This parses correctly on paper — `mcp-remote`'s header regex is `/^([A-Za-z0-9_-]+):\s*(.*)$/`, so `Authorization:Bearer <token>` splits cleanly on the first colon. On Unix the config worked end-to-end.

On Windows it silently broke every tool call. Root cause is a three-step trap:

1. **Node 24 no longer spawns `.cmd` files without `shell:true`.** `execa` / `child_process.spawn` return `EINVAL` for `npx.cmd` on Node 24 unless `shell:true` is passed — a security hardening introduced for CVE-2024-27980-class regressions. `mcp-remote` (invoked by Claude Desktop via `npx`) spawns the upstream Streamable HTTP transport with `shell:true` on Windows for exactly this reason.
2. **`shell:true` routes the child through `cmd.exe`.** cmd.exe does NOT respect the JSON-array argv grouping Desktop passed in; it rebuilds the command line as a single string and re-tokenizes it on whitespace.
3. **Any argv element containing a space gets chopped.** The single element `"Authorization:Bearer acp_mcp_<40+chars>"` becomes two tokens, `Authorization:Bearer` and `acp_mcp_<40+chars>`, as far as the child's argv is concerned. `mcp-remote` then sees just `Authorization:Bearer` as its `--header` value, parses that as a header with empty value, and every request to `https://www.acprompt.com/api/mcp` 401s — exactly the kind of failure mode that looks like "token revoked" or "bad auth".

**Caught by:** a side-probe I wrote after shipping v0.1.6 during the same dogfood session. The probe (`scripts/probe-mcp-remote.mjs`) spawns mcp-remote the way Claude Desktop does (via `spawn("npx", [...], { shell: true })`) and sends `initialize` + `tools/list` over stdio. Under the v0.1.6 args shape it got an error surface showing only `{ "Authorization": "Bearer" }` — the token was *gone*, confirming the argv-splitting theory.

**Fix (shipped 2026-04-20 in v0.1.7):** move the Bearer token out of argv entirely, into `env`, and reference it from the header arg via `${VAR}` expansion:
```json
"acprompt": {
  "command": "npx",
  "args": [
    "-y",
    "mcp-remote",
    "https://www.acprompt.com/api/mcp",
    "--header",
    "Authorization:${ACP_MCP_AUTH}"
  ],
  "env": { "ACP_MCP_AUTH": "Bearer acp_mcp_…" }
}
```
`mcp-remote` does `${VAR}` substitution on header values internally (see `parseCommandLineArgs` in `mcp-remote/dist/chunk-*.js`, lines ~20850), so the final HTTP header on the wire is still `Authorization: Bearer acp_mcp_…`. The crucial difference: **no argv element now contains whitespace**, so the cmd.exe re-tokenization pass cannot chop anything.

The regression test in [src/__tests__/claude-desktop-shape.test.ts](src/__tests__/claude-desktop-shape.test.ts) pins five invariants:
1. NOT the `{type:"http"…}` shape (F6 regression).
2. Exact args: `-y mcp-remote <url> --header Authorization:${ACP_MCP_AUTH}`.
3. NO whitespace inside ANY argv element — **this is the load-bearing F7 guard**. Any element containing a space is sufficient to reproduce F7 on Windows; if this assertion ever fires, revert immediately.
4. `env.ACP_MCP_AUTH === "Bearer <token>"` with the required inter-word space.
5. The `${VAR}` placeholder in the header arg literally matches the env key — a silent-breakage guard against a rename in one place but not the other, which would substitute empty and 401.

The probe script was re-run against the v0.1.7 shape and returned all 15 ACPrompt tools, end-to-end, through the real `mcp-remote` binary spawned the Claude-Desktop way.

**Root-cause reflection:** F6's fix was *verified* by reading the Claude Desktop docs and by end-to-end testing through our own CLI — neither of which touched the actual spawn path Desktop uses. The F7 trap sits two layers below Desktop's config parser, in the way Node spawns child processes on Windows, and is invisible to any test that doesn't actually cross the cmd.exe boundary. Lesson logged for the publish checklist: **every MCP-config change must be validated by spawning the shim the way the host harness spawns it, not by reading the config file into our own client.** The probe script is now part of the repo and will run against any future v0.1.x shape change.

This is the third consecutive trap (F4, F6, F7) where the failure surfaced only on the cross-process boundary — each one is invisible to code paths that stay inside a single process. That pattern has earned a named checklist entry: any change that shifts the trust/auth boundary between processes must be validated by a process-crossing probe, never by an in-process unit test alone.

---

### R2-F8 (P2) — `AUTH_URL` in browser-flow.ts and docs URL in generic.ts still used bare `acprompt.com`
Round-2 code audit caught two residual bare-domain URLs surviving the F4 pass. Neither was fatal (browser 307 on GET works; docs URL is a dim hint), but both violated the F4 canonical-origin rule — "any URL destined for a non-browser HTTP client must be the canonical host, not a redirect source" — and the inconsistency was begging for someone to add a third bare-domain URL next release under "it works in the browser" reasoning.

**Locations:** [src/auth/browser-flow.ts:23](src/auth/browser-flow.ts:23) `AUTH_URL`, [src/install/generic.ts:43](src/install/generic.ts:43) Docs URL in the generic-fallback printout.

**Fix (pending v0.1.8):** both flipped to `https://www.acprompt.com/...`. No new test added — the `grep -rE "https://acprompt\.com"` check is cheap enough to run manually pre-publish, and mechanical regressions would be caught by the flagship-path tests that already pin www.

---

### R3-F10 (P0) — `mergeConfig` silently clobbered the user's whole config when the existing file had a UTF-8 BOM
`src/install/claude-code.ts::mergeConfig` and `src/install/letta.ts::writeLettaMcpConfig` both wrapped `fs.readFile` + `JSON.parse` in a catch-all that silently fell through to `current = {}`. On the write step the whole existing file was replaced with our single entry, destroying every other MCP server the user had configured.

Two real-world paths tripped this on Windows:

1. **UTF-8 BOM.** Notepad (and VS Code with "UTF-8 with BOM" selected) saves files with a leading U+FEFF. Node's `fs.readFile(path, "utf8")` does NOT strip the BOM — the returned string starts with U+FEFF, and `JSON.parse` throws "Unexpected token" on it. Catch-all → clobber.
2. **Partial / corrupted JSON.** Half-saved edits, power loss mid-write, or a human typo left the config syntactically invalid. Same silent clobber.

Impact on a Windows founder: installs ACPrompt, loses the Filesystem/GitHub/Memory/etc. MCP servers they'd set up before. The loss is non-obvious until Desktop next restarts and half their tools are gone.

**Fix (pending v0.1.8):** new `readMergeableJson(configPath)` helper in [src/install/shared.ts](src/install/shared.ts) that
  - returns `null` only on `ENOENT` (file genuinely doesn't exist),
  - strips a leading UTF-8 BOM before parsing,
  - throws a clear actionable error (`"Refusing to overwrite — fix or delete the file, then re-run install."`) on any other read failure, parse failure, or non-object root.

Both `mergeConfig` and `writeLettaMcpConfig` now route through it. Regression test in [src/__tests__/merge-safety.test.ts](src/__tests__/merge-safety.test.ts) pins 10 invariants across both merge paths: BOM is stripped and siblings preserved; corrupted JSON triggers throw + the file on disk is **unchanged**; null/array/scalar roots throw with a specific kind in the error.

**Root-cause reflection:** catch-all handlers in filesystem code are a data-loss landmine. The principled default when "read existing, merge, write back" hits any problem at the read step is *abort*, not *treat as new file*. Added a named rule: **merge-write installers must route read failures through a helper that distinguishes ENOENT (safe to start fresh) from every other failure (refuse to write)**. Any new harness installer that does read-then-merge in the future must use `readMergeableJson`; a direct `fs.readFile` + `JSON.parse` is considered a bug and will be caught in review.

---

### R3-F11 (P1) — Node 24's `.cmd` spawn hardening makes `claudeCliOnPath()` false-negative on Windows
`src/detect/claude-code.ts::claudeCliOnPath` calls `execFile("claude.cmd", ["--version"])` without `shell: true`. Node 24 (CVE-2024-27980 hardening) now rejects unconditional spawning of `.cmd`/`.bat` files without `shell: true` — returns EINVAL. The old code caught the EINVAL and reported `false`, meaning: *every Windows user on Node 24 who actually has Claude Code CLI installed* was silently flagged as NOT having it, and the post-install "also run `claude mcp add …`" hint was suppressed. This never caused a broken install — the Claude Desktop write path was unaffected — but it was a silent UX downgrade that would have confused any power-user running both Desktop and CLI on Node 24.

**Fix (pending v0.1.8):** on `win32`, pass `shell: true` to the `execFile` call. Safe against the F7-class cmd.exe argv-splitting trap because the only arg is the literal `--version` — no whitespace, no shell metacharacters, no user input.

**Root-cause reflection:** Node 24's `.cmd` hardening was already the underlying cause of F7 (the mcp-remote spawn that needed `shell: true` because it's a `.cmd` shim under `npx`). F7 surfaced inside the harness-spawned subprocess; F11 surfaces inside our own process. Both are different manifestations of the same Node-24-Windows trap: **any `.cmd` spawn on Windows MUST pass `shell: true`**. Added to the checklist: grep the codebase for `execFile\|spawn` on every release and confirm any `.cmd`/`.bat` invocation has `shell: true`.

---

### R4-F12 (P2) — `scanPackageJson` threw on BOM, detector reported "no matches"
`src/detect/deps.ts::scanPackageJson` read `package.json` and called `JSON.parse` without stripping a leading U+FEFF. A Notepad-saved `package.json` on Windows would trip the catch, return `[]`, and every dependency-based detector (LangGraph / CrewAI / OpenAI Agents / Anthropic SDK / Letta) would report "no match" even though the dep was right there. Not a data-loss bug — the detector just silently misclassifies and the user falls through to the generic installer.

**Fix (pending v0.1.8):** same BOM strip as `readMergeableJson`. Regression in [src/__tests__/detectors.test.ts](src/__tests__/detectors.test.ts) writes a BOM-prefixed `package.json` with `@langchain/langgraph` and asserts `langgraphDetector.detect` returns `detected: true`.

---

### R4-F13 (P1) — install silently reused expired tokens, surfaced only as verify-401 at the end
If the stored `~/.acprompt/config.json` had an `expiresAt` in the past (MCP owner tokens are 1-year JWTs), the install flow reused it without warning. All the config-writing steps succeeded; only the final `acp_whoami` ping surfaced the 401 — at which point the user has a dead-token config on disk at Claude Desktop / Letta / wherever, and an error message that doesn't obviously point at "your stored token expired". The exact misdiagnosis was "something broke after I restarted Claude Desktop" rather than "my owner token expired yesterday."

**Fix (pending v0.1.8):** in `runInstall`, if we reuse a stored config whose `expiresAt` parses and is in the past → print a yellow warning that the token expired and tell the user to delete `~/.acprompt/config.json`; if within 30 days → print a yellow "rotate soon" warning with day count. Warnings don't block — the user might have a legitimate reason to try anyway (clock skew, manual server extension) and the downstream verify step will give the definitive answer.

**Root-cause reflection:** this is a symptom-level fix, not a root-cause one. Proper fix direction: automatic pre-check that the stored token is still accepted by the server BEFORE writing harness configs — refuse the write if the server already 401s. That's Round-5 work (the token-rotation flow). Today's warning at least removes the "why does verify fail?" confusion.

---

### R2-F9 (P2) — `CLIENT_INFO.version` stuck at `0.1.0` while the package shipped 0.1.7 (telemetry drift)
[src/mcp/client.ts:21](src/mcp/client.ts:21) had `version: "0.1.0"` hardcoded since v0.1.0. commander's `.version()` was updated each release (0.1.4 → 0.1.7) but nobody touched `CLIENT_INFO`. Effect: the MCP server recorded `clientInfo.version: "0.1.0"` for every real install, making it impossible to tell from server logs which CLI version was talking. Harmless today, actively misleading if we ever gate server behavior on client version or analyze client-version distribution for upgrade nudging.

**Fix (pending v0.1.8):** added [src/version.ts](src/version.ts) that reads `package.json.version` at runtime via `fs.readFileSync` + `import.meta.url` (avoids the Node 20 vs 22 JSON-import-attribute saga entirely). Both `CLIENT_INFO.version` and commander's `.version()` now read from the same `CLI_VERSION` constant. Regression test in [src/__tests__/version.test.ts](src/__tests__/version.test.ts) pins (1) `CLI_VERSION === package.json.version`, (2) not the `"0.0.0-unknown"` fallback, (3) semver-shaped — so a future refactor that breaks the runtime read fails loudly instead of silently falling back.

**Root-cause reflection:** versioning drift is the canonical bug of "two sources of truth that look the same". The fix isn't discipline, it's eliminating the second source. Applied the same reasoning to the AUTH_URL/docs-URL cleanup — one canonical host constant, referenced everywhere.

---

(More findings to follow as the founder completes the real interactive flow.)
