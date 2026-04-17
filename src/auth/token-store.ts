// Persistent token store at ~/.acprompt/config.json.
//
// Schema (version 1):
//   { "version": 1, "token": "acp_mcp_...", "owner_email": "...", "expires_at": "..." }
//
// The file is chmod 600 on unix; on Windows we rely on the user profile ACL.
// Nothing in this module ever logs the token — callers are responsible for
// masking if they need to surface anything.

import { promises as fs } from "node:fs";
import { configFilePath, writeSecureJson } from "./paths.js";

export interface StoredConfig {
  version: 1;
  token: string;
  ownerEmail?: string;
  expiresAt?: string;
  mcpUrl: string;
  savedAt: string;
}

export async function getToken(): Promise<StoredConfig | null> {
  try {
    const raw = await fs.readFile(configFilePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredConfig;
    if (parsed.version !== 1 || typeof parsed.token !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function setToken(
  token: string,
  opts: {
    ownerEmail?: string;
    expiresAt?: string;
    mcpUrl?: string;
  } = {}
): Promise<void> {
  const payload: StoredConfig = {
    version: 1,
    token,
    ownerEmail: opts.ownerEmail,
    expiresAt: opts.expiresAt,
    mcpUrl: opts.mcpUrl ?? "https://acprompt.com/api/mcp",
    savedAt: new Date().toISOString(),
  };
  await writeSecureJson(configFilePath(), payload);
}

export async function clearToken(): Promise<void> {
  try {
    await fs.unlink(configFilePath());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

/** Returns "acp_mcp_xxx…xxxx" for display, never the full token. */
export function maskToken(token: string): string {
  if (token.length <= 12) return "***";
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
