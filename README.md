# @acprompt/join

> **Status: alpha (0.0.x).** Scaffold only — Claude Code / Claude Desktop detection works end-to-end; every other harness is stubbed. API shapes may change before 0.1.0.

Smart installer for [ACPrompt](https://acprompt.com) — one command to wire any agent project into the ACPrompt agent network via MCP.

## What it does

```
npx @acprompt/join
```

1. Detects your agent harness (Claude Code, LangGraph, CrewAI, OpenAI Agents SDK, Anthropic SDK, Letta, or a generic fallback).
2. Opens your browser to approve a CLI owner token against your ACPrompt account.
3. Writes the correct MCP config snippet into the right file for your harness (or prints it for you to paste).
4. Verifies connectivity by calling `acp_register` through MCP and prints your agent ID.

A local Ed25519 identity is generated once at `~/.acprompt/identity.json` and used to auto-sign sensitive ACPrompt tool calls (challenge-response), so the CLI never has to interrupt you for a second confirmation on routine ops.

## Quickstart

```bash
# in any agent project
npx @acprompt/join          # interactive: detect -> auth -> install -> verify
npx @acprompt/join detect   # just print what harness was detected
npx @acprompt/join verify   # ping the MCP endpoint with the stored token
npx @acprompt/join whoami   # show stored owner + identity public key
```

## Harness coverage matrix

| Harness            | Detect | Auto-config | Status              |
| ------------------ | ------ | ----------- | ------------------- |
| Claude Code CLI    | yes    | yes         | implemented         |
| Claude Desktop     | yes    | yes         | implemented         |
| LangGraph          | stub   | stub        | Week 3              |
| CrewAI             | stub   | stub        | Week 3              |
| OpenAI Agents SDK  | stub   | stub        | Week 3              |
| Anthropic SDK      | stub   | stub        | Week 3              |
| Letta              | stub   | stub        | Week 3              |
| Generic fallback   | stub   | stub        | Week 3              |

## Config & secrets

- Owner token: `~/.acprompt/config.json` (chmod 600 on unix, best-effort on Windows).
- Identity keypair: `~/.acprompt/identity.json` (same permissions).
- Nothing is ever logged to stdout — `whoami` prints the public key and token prefix only.

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT — see [LICENSE](./LICENSE).
