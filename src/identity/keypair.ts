// Local Ed25519 identity for challenge-response auto-signing.
//
// Implementation choice: tweetnacl + tweetnacl-util.
// Rationale: Ed25519 has been in Node's native `crypto` since v16, but the
// KeyObject-based API is awkward for signing raw bytes and returning a
// base64url-encoded signature. tweetnacl gives us a single-call
// `nacl.sign.detached(msg, secretKey)` that matches the server's verifier
// (which uses `nacl-verify` from the same family). If we ever need FIPS
// compliance we swap to the node crypto path — isolated behind signMessage.

import { promises as fs } from "node:fs";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { identityFilePath, writeSecureJson } from "../auth/paths.js";

export const IDENTITY_FORMAT = "ed25519-b64url" as const;

export interface StoredIdentity {
  format: typeof IDENTITY_FORMAT;
  publicKey: string; // base64url
  secretKey: string; // base64url (64 bytes: seed + pub)
  createdAt: string;
}

function b64urlEncode(bytes: Uint8Array): string {
  // tweetnacl-util gives standard base64; convert to base64url.
  const b64 = naclUtil.encodeBase64(bytes);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const rem = padded.length % 4;
  const full = rem ? padded + "=".repeat(4 - rem) : padded;
  return naclUtil.decodeBase64(full);
}

export function generateKeyPair(): StoredIdentity {
  const kp = nacl.sign.keyPair();
  return {
    format: IDENTITY_FORMAT,
    publicKey: b64urlEncode(kp.publicKey),
    secretKey: b64urlEncode(kp.secretKey),
    createdAt: new Date().toISOString(),
  };
}

export async function loadIdentity(): Promise<StoredIdentity | null> {
  try {
    const raw = await fs.readFile(identityFilePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredIdentity;
    if (parsed.format !== IDENTITY_FORMAT) return null;
    if (!parsed.publicKey || !parsed.secretKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveIdentity(identity: StoredIdentity): Promise<void> {
  await writeSecureJson(identityFilePath(), identity);
}

/** Load the stored identity or generate + persist a new one. */
export async function loadOrCreateIdentity(): Promise<StoredIdentity> {
  const existing = await loadIdentity();
  if (existing) return existing;
  const fresh = generateKeyPair();
  await saveIdentity(fresh);
  return fresh;
}

/**
 * Returns a base64url-encoded detached Ed25519 signature over `message`.
 * Used by the MCP client's challenge-response loop: the message format is
 * `${agentId}:${action}:${timestamp}` — the server echoes that envelope and
 * verifies with the stored public key it saw at acp_register time.
 */
export function signMessage(message: string, identity: StoredIdentity): string {
  const msgBytes = naclUtil.decodeUTF8(message);
  const secret = b64urlDecode(identity.secretKey);
  const sig = nacl.sign.detached(msgBytes, secret);
  return b64urlEncode(sig);
}

/** For tests — verify a signature round-tripped by this module. */
export function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const msgBytes = naclUtil.decodeUTF8(message);
    const sigBytes = b64urlDecode(signature);
    const pkBytes = b64urlDecode(publicKey);
    return nacl.sign.detached.verify(msgBytes, sigBytes, pkBytes);
  } catch {
    return false;
  }
}
