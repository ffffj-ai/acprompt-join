// Atomic file write — serialize to a sibling temp file, fsync, rename over
// the target.
//
// Why this exists: several installers merge our entry into a config file the
// user already owns (Claude Desktop's claude_desktop_config.json, Letta's mcp
// config, ~/.acprompt/config.json). A plain `fs.writeFile` truncates the target
// first and then streams the new bytes in, so a crash, a full disk, a killed
// process, or a Windows antivirus/OneDrive lock in the middle of that window
// leaves a HALF-WRITTEN file. For a merged config that means the user's other
// MCP servers are gone; for the token store it means auth silently breaks.
//
// rename(2) within one directory is atomic, so the target is always either the
// complete old file or the complete new one.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface AtomicWriteOptions {
  /** File mode for the temp file (e.g. 0o600 for secrets). */
  mode?: number;
}

export async function writeFileAtomic(
  targetPath: string,
  data: string,
  opts: AtomicWriteOptions = {}
): Promise<void> {
  const dir = path.dirname(targetPath);
  const tmpPath = path.join(
    dir,
    `.${path.basename(targetPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );

  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(tmpPath, "w", opts.mode ?? 0o644);
    await handle.writeFile(data, "utf8");
    // Flush to disk before the rename, otherwise a power loss can leave the
    // renamed (empty) file behind on some filesystems.
    await handle.sync();
  } finally {
    await handle?.close();
  }

  // Windows: rename over an existing file fails with EPERM/EBUSY while another
  // process (editor, antivirus, sync client) holds a handle. Retry briefly —
  // these are almost always short-lived — then fail loudly with the real cause.
  const attempts = process.platform === "win32" ? 5 : 1;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.rename(tmpPath, targetPath);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") break;
      await new Promise((r) => setTimeout(r, 60 * (i + 1)));
    }
  }

  // Never leave the temp fragment behind on failure.
  await fs.rm(tmpPath, { force: true }).catch(() => undefined);
  throw new Error(
    `Could not write ${targetPath} atomically: ${(lastErr as Error)?.message ?? "unknown error"}. ` +
      `The existing file was left untouched. Close any program holding it open and retry.`
  );
}

/** JSON convenience wrapper: pretty-print then write atomically. */
export async function writeJsonAtomic(
  targetPath: string,
  value: unknown,
  opts: AtomicWriteOptions = {}
): Promise<void> {
  await writeFileAtomic(targetPath, JSON.stringify(value, null, 2), opts);
}
