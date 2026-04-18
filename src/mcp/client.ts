// Thin MCP client wrapper for the ACPrompt endpoint.
//
// Responsibilities:
//   - Auto-attach the stored owner token as a Bearer header.
//   - Run the challenge-response loop: if a tool response comes back with
//     `needs_signature: true`, auto-sign `${agentId}:${action}:${timestamp}`
//     with the local identity and retry ONCE with the signature in the
//     envelope.
//   - Hand back JSON-parsed tool output.
//
// Uses the streamable-HTTP transport in stateless mode — every call is a
// fresh session, matching the ACPrompt server's expectation.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getToken } from "../auth/token-store.js";
import { loadOrCreateIdentity, signMessage } from "../identity/keypair.js";

const CLIENT_INFO = {
  name: "acprompt-join",
  version: "0.1.0",
} as const;

export interface CallToolOptions {
  /** Timeout for the tool call in ms. Default 30s. */
  timeoutMs?: number;
  /** Whether to retry with a signature on needs_signature=true. Default true. */
  autoSign?: boolean;
}

export interface ToolCallResult {
  content: unknown;
  isError: boolean;
}

interface ChallengePayload {
  needs_signature?: boolean;
  agent_id?: string;
  action?: string;
  timestamp?: number | string;
}

function extractChallenge(content: unknown): ChallengePayload | null {
  // MCP returns `content: [{type:"text", text:"..."}, ...]`. The server
  // serializes challenges as JSON text. We try the first text block.
  if (!Array.isArray(content) || content.length === 0) return null;
  const first = content[0] as { type?: string; text?: string };
  if (first?.type !== "text" || typeof first.text !== "string") return null;
  try {
    const parsed = JSON.parse(first.text) as ChallengePayload;
    if (parsed && parsed.needs_signature === true) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function connect(): Promise<Client> {
  const stored = await getToken();
  if (!stored) {
    throw new Error(
      "No ACPrompt token found. Run `acprompt-join install` first."
    );
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stored.token}`,
  };
  const transport = new StreamableHTTPClientTransport(new URL(stored.mcpUrl), {
    requestInit: { headers },
  });
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  await client.connect(transport);
  return client;
}

export async function callTool(
  name: string,
  args: Record<string, unknown> = {},
  opts: CallToolOptions = {}
): Promise<ToolCallResult> {
  const autoSign = opts.autoSign ?? true;
  const client = await connect();

  try {
    const first = await client.callTool({ name, arguments: args });
    const challenge = extractChallenge(first.content);

    if (!challenge || !autoSign) {
      return { content: first.content, isError: Boolean(first.isError) };
    }

    const { agent_id, action, timestamp } = challenge;
    if (!agent_id || !action || timestamp === undefined) {
      return { content: first.content, isError: Boolean(first.isError) };
    }

    const identity = await loadOrCreateIdentity();
    const envelope = `${agent_id}:${action}:${timestamp}`;
    const signature = signMessage(envelope, identity);

    const retry = await client.callTool({
      name,
      arguments: {
        ...args,
        _sig: {
          agent_id,
          action,
          timestamp,
          signature,
          public_key: identity.publicKey,
        },
      },
    });
    return { content: retry.content, isError: Boolean(retry.isError) };
  } finally {
    await client.close().catch(() => {
      // transport close errors are harmless
    });
  }
}

/** Calls acp_register. Returns whatever the server hands back (agent row). */
export async function register(args: {
  name: string;
  kind?: string;
  public_key?: string;
}): Promise<ToolCallResult> {
  return callTool("acp_register", args);
}
