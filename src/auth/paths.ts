// Resolves well-known paths under ~/.acprompt/.

import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

export function acpromptDir(): string {
  return path.join(os.homedir(), ".acprompt");
}

export function configFilePath(): string {
  return path.join(acpromptDir(), "config.json");
}

export function identityFilePath(): string {
  return path.join(acpromptDir(), "identity.json");
}

/**
 * Ensure ~/.acprompt exists with owner-only permissions where possible.
 * On Windows, chmod is a no-op at the filesystem level — the directory still
 * inherits the user profile's ACL, which is owner-only for a default install,
 * so this is best-effort.
 */
export async function ensureDir(): Promise<string> {
  const dir = acpromptDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try {
      await fs.chmod(dir, 0o700);
    } catch {
      // best-effort — a restrictive umask may already have this right
    }
  }
  return dir;
}

/** Writes a JSON file with chmod 600 on unix, best-effort on windows. */
export async function writeSecureJson(filePath: string, payload: unknown): Promise<void> {
  await ensureDir();
  const body = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, body, { encoding: "utf8", mode: 0o600 });
  if (process.platform !== "win32") {
    try {
      await fs.chmod(filePath, 0o600);
    } catch {
      // best-effort
    }
  }
}
