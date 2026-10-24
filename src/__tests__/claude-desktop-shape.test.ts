// F6 + F7 regression — Claude Desktop config shape.
//
// F6 (v0.1.0–v0.1.5): wrote the Claude Code CLI native-HTTP shape
// `{type:"http", url, headers}` into claude_desktop_config.json. Claude
// Desktop silently skipped it ("Some MCP servers could not be loaded").
//
// F7 (v0.1.6): fixed F6 by emitting `mcp-remote` stdio shim shape, but
// inlined the Bearer token into args: `"Authorization:Bearer <token>"`.
// On Windows, Node's child_process cannot spawn .cmd files without
// shell:true — and shell:true routes through cmd.exe which splits on
// whitespace. The space inside `Bearer <token>` gets chopped, mcp-remote
// sees only `Authorization:Bearer` (token stripped), and every request
// 401s. Empirically verified via scripts/probe-mcp-remote.mjs.
//
// v0.1.7 fix: put the token in `env`, reference via `${VAR}` in the header.
// mcp-remote does ${VAR} substitution itself on header values, so the
// final HTTP header is still `Authorization: Bearer <token>` but no argv
// element contains whitespace. This test pins all four invariants so
// neither trap can come back.

import { describe, it, expect } from "vitest";
import { buildClaudeDesktopEntry } from "../install/claude-code.js";

describe("buildClaudeDesktopEntry (F6 + F7 regression)", () => {
  const entry = buildClaudeDesktopEntry({
    mcpUrl: "https://www.acprompt.com/api/mcp",
    token: "acp_mcp_test_token",
  });

  it("uses the stdio mcp-remote shim, not the native HTTP shape (F6)", () => {
    // Must NOT have the `type:"http"` shape that Desktop rejects.
    expect(entry).not.toHaveProperty("type");
    expect(entry).not.toHaveProperty("url");
    expect(entry).not.toHaveProperty("headers");
    // Must have the stdio shape Desktop accepts.
    expect(entry.command).toBe("npx");
    expect(Array.isArray(entry.args)).toBe(true);
  });

  it("invokes `npx -y mcp-remote <url> --header <placeholder>`", () => {
    const args = entry.args as string[];
    expect(args[0]).toBe("-y");
    expect(args[1]).toBe("mcp-remote");
    expect(args[2]).toBe("https://www.acprompt.com/api/mcp");
    expect(args[3]).toBe("--header");
    expect(args[4]).toBe("Authorization:${ACP_MCP_AUTH}");
  });

  it("contains NO whitespace inside any single argv element (F7 Windows-safety)", () => {
    // cmd.exe under shell:true splits command lines on whitespace without
    // respecting JSON-array argv grouping. Any argv element with an
    // internal space gets chopped into two. Regression guard: every
    // argv element must be whitespace-free.
    const args = entry.args as string[];
    for (const arg of args) {
      expect(arg).not.toMatch(/\s/);
    }
  });

  it("puts the Bearer token in env under ACP_MCP_AUTH (F7 fix)", () => {
    // mcp-remote reads process.env.ACP_MCP_AUTH and substitutes the
    // ${ACP_MCP_AUTH} placeholder in the header value. The actual space
    // between "Bearer" and the token lives safely in env, not argv.
    expect(entry.env).toEqual({ ACP_MCP_AUTH: "Bearer acp_mcp_test_token" });
  });

  it("the ${VAR} placeholder in args matches the env key exactly", () => {
    // Silent-breakage guard: if someone renames ACP_MCP_AUTH in one place
    // but not the other, mcp-remote would substitute empty-string,
    // server would 401, and error would look like token-revoked.
    const args = entry.args as string[];
    const headerArg = args[4];
    const match = headerArg.match(/\$\{([A-Z_][A-Z0-9_]*)\}/);
    expect(match).not.toBeNull();
    const placeholder = match![1];
    const envKeys = Object.keys(entry.env as Record<string, string>);
    expect(envKeys).toContain(placeholder);
  });
});
