#!/usr/bin/env node
// Spawns `mcp-remote` exactly the way Claude Desktop would, feeds it an
// MCP initialize + tools/list handshake, and prints the result. Used to
// empirically verify F6's fix: the shape we write into
// claude_desktop_config.json actually works end-to-end, not just passes
// a unit-level regression test.

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const cfgRaw = await fs.readFile(
  path.join(os.homedir(), ".acprompt", "config.json"),
  "utf8"
);
const cfg = JSON.parse(cfgRaw);
const token = cfg.token;
// Force www — stored may be stale bare form.
const mcpUrl = "https://www.acprompt.com/api/mcp";

console.log(`[probe] spawning mcp-remote against ${mcpUrl}`);

// v0.1.7 shape: no spaces inside any single argv element. The full
// "Bearer <token>" (including its required space) lives in env;
// mcp-remote does its own ${VAR} substitution on header values so we
// only pass "Authorization:${ACP_MCP_AUTH}" through argv — safe from
// cmd.exe space-splitting on Windows when npx spawns via shell:true.
const args = [
  "-y",
  "mcp-remote",
  mcpUrl,
  "--header",
  "Authorization:${ACP_MCP_AUTH}",
];
const childEnv = {
  ...process.env,
  ACP_MCP_AUTH: `Bearer ${token}`,
};

const child = spawn("npx", args, {
  stdio: ["pipe", "pipe", "pipe"],
  shell: true, // Windows needs shell:true to run npx.cmd.
  env: childEnv,
});

let stdoutBuf = "";
let stderrBuf = "";
child.stdout.on("data", (d) => (stdoutBuf += d.toString()));
child.stderr.on("data", (d) => (stderrBuf += d.toString()));

// Wait for mcp-remote to open its upstream connection. The tool does
// OAuth discovery on startup regardless (harmless — 404 on our server
// means it falls through to Bearer). Allow generous time.
await new Promise((r) => setTimeout(r, 10000));

const initReq = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "probe-mcp-remote", version: "0.0.0" },
  },
};
child.stdin.write(JSON.stringify(initReq) + "\n");

await new Promise((r) => setTimeout(r, 2000));

const initNotif = { jsonrpc: "2.0", method: "notifications/initialized" };
child.stdin.write(JSON.stringify(initNotif) + "\n");

const listReq = { jsonrpc: "2.0", id: 2, method: "tools/list" };
child.stdin.write(JSON.stringify(listReq) + "\n");

await new Promise((r) => setTimeout(r, 8000));

child.kill();

console.log("\n=== stdout ===");
console.log(stdoutBuf || "(empty)");
console.log("\n=== stderr ===");
console.log(stderrBuf || "(empty)");

// Verdict
const ok =
  stdoutBuf.includes('"result"') &&
  stdoutBuf.includes("tools") &&
  stdoutBuf.includes("acp_whoami");
console.log(ok ? "\n[probe] PASS" : "\n[probe] FAIL");
process.exit(ok ? 0 : 1);
