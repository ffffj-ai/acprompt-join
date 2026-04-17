// Shared types for harness detectors.
//
// Each detector is a pure function that inspects the filesystem (and optionally
// the current working directory) and reports whether it believes its harness
// is installed. Detectors must NOT mutate state and must NOT throw — any error
// becomes `{ detected: false, reason: "<error message>" }`.

export interface DetectionContext {
  /** Absolute path to the user project being installed into. */
  cwd: string;
  /** Absolute path to the user's home dir. */
  home: string;
  /** Node's `process.platform` — one of "win32" | "darwin" | "linux" | others. */
  platform: NodeJS.Platform;
  /** Environment snapshot — tests inject a fake one, runtime passes process.env. */
  env: NodeJS.ProcessEnv;
}

export interface DetectionResult {
  /** Stable harness id, e.g. "claude-code", "langgraph". */
  harness: string;
  /** Human-readable label for UI. */
  label: string;
  /** Whether the detector found evidence of the harness. */
  detected: boolean;
  /** If detected: where evidence was found (e.g. a config file path). */
  evidence?: string[];
  /** If not detected: one-line explanation. Never leaks secrets. */
  reason?: string;
  /**
   * Config file(s) the installer would modify. May be present even when
   * `detected` is false (e.g. "I could create this file if the user opts in").
   */
  configTargets?: string[];
}

export interface HarnessDetector {
  /** Stable id used across commands and reports. */
  readonly id: string;
  /** UI label. */
  readonly label: string;
  /** Run the detection. Must be side-effect-free except for reads. */
  detect(ctx: DetectionContext): Promise<DetectionResult>;
}
