// `acprompt-join detect` — scan the current project for known harnesses.

import pc from "picocolors";
import { ALL_DETECTORS, currentContext } from "../detect/index.js";

export async function runDetect(): Promise<void> {
  const ctx = currentContext();
  const results = await Promise.all(ALL_DETECTORS.map((d) => d.detect(ctx)));

  const detected = results.filter((r) => r.detected);
  const misses = results.filter((r) => !r.detected);

  console.log(pc.bold("ACPrompt harness detection"));
  console.log(pc.dim(`  cwd: ${ctx.cwd}`));
  console.log(pc.dim(`  platform: ${ctx.platform}`));
  console.log("");

  if (detected.length === 0) {
    console.log(pc.yellow("No harness detected."));
  } else {
    console.log(pc.green(`Detected (${detected.length}):`));
    for (const r of detected) {
      console.log(`  ${pc.green("*")} ${pc.bold(r.label)} [${r.harness}]`);
      for (const ev of r.evidence ?? []) {
        console.log(`      ${pc.dim(ev)}`);
      }
    }
  }

  console.log("");
  console.log(pc.dim("Not detected:"));
  for (const r of misses) {
    console.log(`  ${pc.dim("-")} ${r.label} ${pc.dim(`(${r.reason ?? "no evidence"})`)}`);
  }
}
