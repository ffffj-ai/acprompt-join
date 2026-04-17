// Browser-assisted OAuth-style token acquisition.
//
// Flow:
//   1. Pick a free port in [49152, 65535] and start a tiny HTTP server.
//   2. Generate a 32-byte random state token.
//   3. Open https://acprompt.com/cli-auth?callback=<local>&state=<state>.
//      The dashboard authenticates the user (Supabase Google OAuth),
//      mints an MCP owner token via POST /api/owner-token, then POSTs the
//      token back to <local>/callback with the state echoed.
//   4. Verify the state, persist the token, respond 200 to the browser.
//
// Assumed server contract (documented in README + report):
//   Inbound:  POST /callback
//             body: { token, state, owner_email?, expires_at?, mcp_url? }
//   Outbound: plain 200 text "You can close this tab." on success;
//             400 on state mismatch.

import http from "node:http";
import crypto from "node:crypto";
import open from "open";
import { setToken } from "./token-store.js";

const AUTH_URL = "https://acprompt.com/cli-auth";
const PORT_MIN = 49152;
const PORT_MAX = 65535;

export interface BrowserAuthResult {
  token: string;
  ownerEmail?: string;
  expiresAt?: string;
  mcpUrl: string;
}

export interface BrowserAuthOptions {
  /** Override for tests. */
  authUrl?: string;
  /** Override for tests / CI. */
  openBrowser?: (url: string) => Promise<void>;
  /** How long to wait before giving up, in ms. Default 5 minutes. */
  timeoutMs?: number;
  /** Override for tests. */
  randomPort?: () => number;
  /** Override for tests. */
  randomState?: () => string;
}

function defaultRandomPort(): number {
  return Math.floor(Math.random() * (PORT_MAX - PORT_MIN + 1)) + PORT_MIN;
}

function defaultRandomState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Validate the incoming callback body. Exported so tests can target it
 * directly without needing a full HTTP round-trip.
 */
export function verifyCallback(
  body: unknown,
  expectedState: string
): BrowserAuthResult {
  if (typeof body !== "object" || body === null) {
    throw new Error("Invalid callback payload: expected JSON object.");
  }
  const b = body as Record<string, unknown>;
  if (typeof b.state !== "string" || b.state !== expectedState) {
    throw new Error("State parameter mismatch — possible CSRF; aborting.");
  }
  if (typeof b.token !== "string" || b.token.length < 20) {
    throw new Error("Callback missing a valid token.");
  }
  return {
    token: b.token,
    ownerEmail: typeof b.owner_email === "string" ? b.owner_email : undefined,
    expiresAt: typeof b.expires_at === "string" ? b.expires_at : undefined,
    mcpUrl:
      typeof b.mcp_url === "string" ? b.mcp_url : "https://acprompt.com/api/mcp",
  };
}

async function startServer(
  port: number,
  state: string,
  timeoutMs: number
): Promise<BrowserAuthResult> {
  return new Promise<BrowserAuthResult>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method !== "POST" || !req.url || !req.url.startsWith("/callback")) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          const result = verifyCallback(parsed, state);
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.statusCode = 200;
          res.end("ACPrompt CLI: token received. You can close this tab.");
          server.close();
          resolve(result);
        } catch (err) {
          res.statusCode = 400;
          res.end((err as Error).message);
          // do NOT resolve — let caller keep waiting or time out
        }
      });
      req.on("error", (err) => {
        res.statusCode = 500;
        res.end((err as Error).message);
      });
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error(`Browser auth timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    timer.unref?.();

    server.on("error", reject);
    server.listen(port, "127.0.0.1");
    server.on("close", () => clearTimeout(timer));
  });
}

export async function runBrowserAuth(
  opts: BrowserAuthOptions = {}
): Promise<BrowserAuthResult> {
  const port = (opts.randomPort ?? defaultRandomPort)();
  const state = (opts.randomState ?? defaultRandomState)();
  const authUrl = opts.authUrl ?? AUTH_URL;
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  const callback = `http://127.0.0.1:${port}/callback`;
  const url = `${authUrl}?callback=${encodeURIComponent(callback)}&state=${encodeURIComponent(state)}`;

  const waitPromise = startServer(port, state, timeoutMs);

  const opener = opts.openBrowser ?? (async (u: string) => {
    await open(u);
  });
  await opener(url);

  const result = await waitPromise;
  await setToken(result.token, {
    ownerEmail: result.ownerEmail,
    expiresAt: result.expiresAt,
    mcpUrl: result.mcpUrl,
  });
  return result;
}
