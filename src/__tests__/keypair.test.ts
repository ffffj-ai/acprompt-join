// Ed25519 sign + verify round-trip.

import { describe, it, expect } from "vitest";
import { generateKeyPair, signMessage, verifySignature } from "../identity/keypair.js";

describe("Ed25519 keypair", () => {
  it("signs and verifies a message end-to-end", () => {
    const id = generateKeyPair();
    const msg = "agent_abc:acp_send_message:1744934400";
    const sig = signMessage(msg, id);
    expect(sig.length).toBeGreaterThan(40);
    expect(verifySignature(msg, sig, id.publicKey)).toBe(true);
  });

  it("rejects a tampered message", () => {
    const id = generateKeyPair();
    const sig = signMessage("a:b:1", id);
    expect(verifySignature("a:b:2", sig, id.publicKey)).toBe(false);
  });

  it("rejects a signature made with a different key", () => {
    const a = generateKeyPair();
    const b = generateKeyPair();
    const sig = signMessage("m", a);
    expect(verifySignature("m", sig, b.publicKey)).toBe(false);
  });
});
