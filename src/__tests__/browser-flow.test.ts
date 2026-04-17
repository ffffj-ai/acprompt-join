// Browser flow — state parameter mismatch must be rejected.

import { describe, it, expect } from "vitest";
import { verifyCallback } from "../auth/browser-flow.js";

describe("verifyCallback", () => {
  it("accepts a correctly-stated payload", () => {
    const result = verifyCallback(
      {
        state: "abc123",
        token: "acp_mcp_" + "x".repeat(40),
        owner_email: "owner@example.com",
        expires_at: "2027-04-18T00:00:00Z",
      },
      "abc123"
    );
    expect(result.token).toContain("acp_mcp_");
    expect(result.ownerEmail).toBe("owner@example.com");
  });

  it("rejects a mismatched state (CSRF defense)", () => {
    expect(() =>
      verifyCallback(
        { state: "wrong", token: "acp_mcp_" + "x".repeat(40) },
        "abc123"
      )
    ).toThrow(/state parameter mismatch/i);
  });

  it("rejects a missing state even when a token is present", () => {
    expect(() =>
      verifyCallback({ token: "acp_mcp_" + "x".repeat(40) }, "abc123")
    ).toThrow(/state parameter mismatch/i);
  });

  it("rejects a missing or too-short token", () => {
    expect(() => verifyCallback({ state: "abc123" }, "abc123")).toThrow(/valid token/i);
    expect(() =>
      verifyCallback({ state: "abc123", token: "short" }, "abc123")
    ).toThrow(/valid token/i);
  });
});
