// Browser flow — state parameter mismatch must be rejected.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { AddressInfo } from "node:net";
import { verifyCallback, runBrowserAuth } from "../auth/browser-flow.js";

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

describe("loopback server CORS", () => {
  // runBrowserAuth calls setToken() on success, which writes to
  // ~/.acprompt/config.json. Redirect HOME/USERPROFILE to a tmpdir
  // so this test cannot clobber the developer's real config.
  let tmpHome: string;
  let prevHome: string | undefined;
  let prevUserProfile: string | undefined;
  beforeAll(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "acprompt-test-home-"));
    prevHome = process.env.HOME;
    prevUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
  });
  afterAll(async () => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserProfile;
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  // Picks a free port by binding :0, reads it, closes, returns the port.
  async function pickPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const s = http.createServer();
      s.listen(0, "127.0.0.1", () => {
        const port = (s.address() as AddressInfo).port;
        s.close(() => resolve(port));
      });
      s.on("error", reject);
    });
  }

  it("answers OPTIONS preflight with CORS + PNA headers so the dashboard fetch isn't killed", async () => {
    const port = await pickPort();
    const noopOpen = async () => {};

    const authPromise = runBrowserAuth({
      authUrl: "https://www.acprompt.com/cli-auth",
      openBrowser: noopOpen,
      timeoutMs: 3000,
      randomPort: () => port,
      randomState: () => "test-state",
    });

    // Give the server a tick to bind.
    await new Promise((r) => setTimeout(r, 50));

    const preflight = await new Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
    }>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: "/callback",
          method: "OPTIONS",
          headers: {
            Origin: "https://www.acprompt.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
        }
      );
      req.on("error", reject);
      req.end();
    });

    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(
      "https://www.acprompt.com"
    );
    expect(preflight.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(preflight.headers["access-control-allow-headers"]).toMatch(/content-type/i);
    // PNA: Chrome requires this when a public-origin page hits a loopback.
    expect(preflight.headers["access-control-allow-private-network"]).toBe("true");

    // Feed a good POST so the server resolves and shuts down cleanly.
    await new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({
        state: "test-state",
        token: "acp_mcp_" + "x".repeat(40),
      });
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          path: "/callback",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            Origin: "https://www.acprompt.com",
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve());
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    await authPromise;
  });
});
