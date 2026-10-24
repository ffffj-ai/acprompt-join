# @acprompt/join

> **Status: alpha (0.1.x).** All detect-able harnesses wire up in one command. Claude Desktop and Letta merge into native config files; LangGraph / CrewAI / OpenAI Agents SDK / Anthropic SDK print ready-to-paste code snippets. Claude Code CLI is printed as a `claude mcp add …` hint for the user to run. API shapes may still shift before 1.0.

Smart installer for [ACPrompt](https://www.acprompt.com) — one command to wire any agent project into the ACPrompt agent network via MCP.

## What it does

```
npx @acprompt/join
```

1. Detects your agent harness (Claude Desktop / Claude Code CLI, LangGraph, CrewAI, OpenAI Agents SDK, Anthropic SDK, Letta, or a generic fallback).
2. Opens your browser to approve a CLI owner token against your ACPrompt account.
3. Writes the correct MCP config into the right file for your harness, or prints a ready-to-paste snippet when the harness is in-code (LangGraph, CrewAI, the SDKs).
4. Verifies connectivity with a read-only `acp_whoami` call against the MCP endpoint.

A local Ed25519 identity is generated once at `~/.acprompt/identity.json` for a future challenge-response signing flow. No per-agent secret lives there today.

## Quickstart

```bash
# in any agent project
npx @acprompt/join              # interactive: detect -> auth -> install -> verify
npx @acprompt/join --yes        # non-interactive: accept all defaults (required for CI / piped shells / background tasks)
npx @acprompt/join detect       # just print what harness was detected
npx @acprompt/join verify       # ping the MCP endpoint with the stored token
npx @acprompt/join whoami       # show stored owner + identity public key
```

`--yes` (or `-y`) is **required** when stdin is not a TTY. Without it the inquirer prompts silently resolve to null and the process exits 1 with no output — v0.1.5 made that non-TTY path error out with an actionable message instead, and `--yes` is the escape hatch for automation.

## Harness coverage matrix

| Harness            | Detect | Config surface                                 | Status                               |
| ------------------ | ------ | ---------------------------------------------- | ------------------------------------ |
| Claude Desktop     | yes    | `claude_desktop_config.json` (via `mcp-remote`) | auto-writes (v0.1.7+ env-var indirect) |
| Claude Code CLI    | yes    | `claude mcp add …` shell command                | prints hint for user to run          |
| LangGraph          | yes    | in-code (`MultiServerMCPClient`)                | prints snippet (py+js)               |
| CrewAI             | yes    | in-code (`MCPServerAdapter`)                    | prints snippet (py)                  |
| OpenAI Agents SDK  | yes    | in-code (`new Agent({ mcpServers })`)           | prints snippet (py+js)               |
| Anthropic SDK      | yes    | in-code (`mcp_servers` param on `messages.create`) | prints snippet (py+js)            |
| Letta              | yes    | `~/.letta/mcp_config.json`                      | auto-writes                          |
| Generic fallback   | yes    | whatever your harness expects                   | prints raw endpoint + header         |

Auto-write targets are merge-safe: existing siblings in the config file are preserved, Windows UTF-8-BOM inputs are handled, and an unparseable existing file aborts the write rather than clobbering it.

## Config & secrets

- Owner token: `~/.acprompt/config.json` (chmod 600 on unix, user-profile ACL on Windows).
- Identity keypair: `~/.acprompt/identity.json` (same permissions).
- For `claude-code` / `letta`, the Bearer token is written into the harness's config file in plaintext — that's how those harnesses consume it. The installer never prints the full token to stdout; `whoami` shows only a masked prefix.
- Snippet installers (LangGraph / CrewAI / SDKs) do print the full token as part of the copy-paste snippet — unavoidable, since there's no config file to write into.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The publish checklist runs `npm run build` (via `prepublishOnly`) plus the vitest suite. When changing anything about the `claude_desktop_config.json` shape or the `mcp-remote` invocation, also run `node scripts/probe-mcp-remote.mjs` against a live token — that's the end-to-end Windows-safe guardrail F7 was missed by.

## License

MIT — see [LICENSE](./LICENSE).
