import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { FEATURE_SET, GAME_VERSION } from "./constants.js";
import { getWindowsDocumentsCandidates } from "./windowsDocuments.js";

export interface PsyNetVersionInfo {
  gameVersion: string;
  featureSet: string;
}

interface CachedLaunchLogVersion {
  info: PsyNetVersionInfo;
  /** mtimeMs of the Launch.log that produced this cache entry. */
  mtimeMs: number;
  path: string;
}

let cachedFromLog: CachedLaunchLogVersion | null = null;

/** Extra replay dirs supplied by the app config, searched before the auto-detected ones. */
const searchHints = new Set<string>();

const RL_LOGS_SUFFIX = join("My Games", "Rocket League", "TAGame", "Logs");

/**
 * Register a replay dir (e.g. from app config) whose sibling `Logs\Launch.log` should be
 * searched. Lets callers that cannot thread `replayDir` through — such as the auth flow —
 * still benefit from a custom Rocket League install location.
 */
export function addLaunchLogSearchHint(replayDir: string | undefined | null): void {
  const normalized = String(replayDir ?? "").trim();
  if (normalized) {
    searchHints.add(normalized);
  }
}

function launchLogPathForReplayDir(replayDir: string): string {
  // .../TAGame/Demos -> .../TAGame/Logs/Launch.log
  const normalized = replayDir.trim().replace(/[\\/]+$/, "");
  const tagameDir = normalized.replace(/[\\/]Demos$/i, "");
  return join(tagameDir, "Logs", "Launch.log");
}

export function getLaunchLogCandidates(replayDir?: string): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  const add = (filePath: string | undefined) => {
    if (!filePath?.trim() || seen.has(filePath)) {
      return;
    }
    seen.add(filePath);
    paths.push(filePath);
  };

  if (replayDir?.trim()) {
    add(launchLogPathForReplayDir(replayDir));
  }

  for (const hint of searchHints) {
    add(launchLogPathForReplayDir(hint));
  }

  switch (platform()) {
    case "win32":
      for (const documents of getWindowsDocumentsCandidates()) {
        add(join(documents, RL_LOGS_SUFFIX, "Launch.log"));
      }
      break;
    case "darwin":
      add(
        join(
          homedir(),
          "Library",
          "Application Support",
          "Rocket League",
          "TAGame",
          "Logs",
          "Launch.log",
        ),
      );
      break;
    default:
      add(join(homedir(), "Documents", RL_LOGS_SUFFIX, "Launch.log"));
      break;
  }

  return paths;
}

function parseLaunchLogVersion(content: string): PsyNetVersionInfo | null {
  // Psyonix widens these values between updates (`260811.1257.524913` ->
  // `260918.75141.528314`, `PrimeUpdate59_1` -> `PrimeUpdate60`), so match shapes
  // rather than exact digit counts or a `PrimeUpdate` prefix.
  const gameVersion =
    content.match(/GPsyonixBuildID[:\s]+(\d+(?:\.\d+)+)/i)?.[1]?.trim() ??
    content.match(/RL Win\/(\d+(?:\.\d+)+)/i)?.[1]?.trim();
  const featureSet =
    content.match(/Using feature set[:\s]+([A-Za-z0-9_.]+)/i)?.[1]?.trim() ??
    content.match(/FeatureSet["\s:=]+([A-Za-z0-9_.]+)/i)?.[1]?.trim();

  if (!gameVersion || !featureSet) {
    return null;
  }

  return { gameVersion, featureSet };
}

/** Both markers are logged in the first seconds of startup, well inside this window. */
const LAUNCH_LOG_HEAD_BYTES = 512 * 1024;

function readFileHead(path: string, maxBytes: number): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(maxBytes);
    const bytesRead = readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

function readLaunchLogVersion(path: string): PsyNetVersionInfo | null {
  const head = readFileHead(path, LAUNCH_LOG_HEAD_BYTES);
  const fromHead = parseLaunchLogVersion(head);
  if (fromHead || head.length < LAUNCH_LOG_HEAD_BYTES) {
    return fromHead;
  }

  // Launch.log grows to several MB; only pay for a full read when the head came up empty.
  return parseLaunchLogVersion(readFileSync(path, "utf8"));
}

/**
 * Read the installed client's PsyNet version from Rocket League's Launch.log.
 * Falls back to bundled constants when the log is missing or unreadable.
 */
export function resolvePsyNetVersion(options?: {
  replayDir?: string;
  /** Force a re-read even when a cache entry exists. */
  forceRefresh?: boolean;
}): PsyNetVersionInfo {
  const fallback: PsyNetVersionInfo = {
    gameVersion: GAME_VERSION,
    featureSet: FEATURE_SET,
  };

  const existing: Array<{ path: string; mtimeMs: number }> = [];
  for (const logPath of getLaunchLogCandidates(options?.replayDir)) {
    try {
      existing.push({ path: logPath, mtimeMs: statSync(logPath).mtimeMs });
    } catch {
      // Candidate does not exist on this machine.
    }
  }

  // A stale duplicate install (e.g. a pre-OneDrive-redirect Documents folder) can leave a
  // second Launch.log behind, so trust the most recently written one.
  existing.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const candidate of existing) {
    try {
      if (
        !options?.forceRefresh &&
        cachedFromLog &&
        cachedFromLog.path === candidate.path &&
        cachedFromLog.mtimeMs === candidate.mtimeMs
      ) {
        return cachedFromLog.info;
      }

      const parsed = readLaunchLogVersion(candidate.path);
      if (!parsed) {
        continue;
      }

      cachedFromLog = { info: parsed, mtimeMs: candidate.mtimeMs, path: candidate.path };
      return parsed;
    } catch {
      // Try the next candidate path.
    }
  }

  return cachedFromLog?.info ?? fallback;
}
