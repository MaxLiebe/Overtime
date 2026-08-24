import { readFileSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { FEATURE_SET, GAME_VERSION } from "./constants.js";

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

const RL_LOGS_SUFFIX = join("My Games", "Rocket League", "TAGame", "Logs");

function getWindowsDocumentsCandidates(): string[] {
  const home = homedir();
  const candidates = [
    process.env.OneDrive ? join(process.env.OneDrive, "Documents") : undefined,
    process.env.OneDrive ? join(process.env.OneDrive, "Documenten") : undefined,
    process.env.OneDriveCommercial
      ? join(process.env.OneDriveCommercial, "Documents")
      : undefined,
    process.env.OneDriveCommercial
      ? join(process.env.OneDriveCommercial, "Documenten")
      : undefined,
    join(home, "Documents"),
    join(home, "OneDrive", "Documents"),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
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
    // .../TAGame/Demos -> .../TAGame/Logs/Launch.log
    const normalized = replayDir.trim().replace(/[\\/]+$/, "");
    const tagameDir = normalized.replace(/[\\/]Demos$/i, "");
    add(join(tagameDir, "Logs", "Launch.log"));
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
  const gameVersion =
    content.match(/GPsyonixBuildID\s+(\d+\.\d+\.\d+)/i)?.[1]?.trim() ??
    content.match(/RL Win\/(\d+\.\d+\.\d+)/i)?.[1]?.trim();
  const featureSet =
    content.match(/Using feature set\s+(PrimeUpdate\w+)/i)?.[1]?.trim() ??
    content.match(/FeatureSet["\s:=]+(PrimeUpdate\w+)/i)?.[1]?.trim();

  if (!gameVersion || !featureSet) {
    return null;
  }

  return { gameVersion, featureSet };
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

  for (const logPath of getLaunchLogCandidates(options?.replayDir)) {
    try {
      const mtimeMs = statSync(logPath).mtimeMs;
      if (
        !options?.forceRefresh &&
        cachedFromLog &&
        cachedFromLog.path === logPath &&
        cachedFromLog.mtimeMs === mtimeMs
      ) {
        return cachedFromLog.info;
      }

      const content = readFileSync(logPath, "utf8");
      const parsed = parseLaunchLogVersion(content);
      if (!parsed) {
        continue;
      }

      cachedFromLog = { info: parsed, mtimeMs, path: logPath };
      return parsed;
    } catch {
      // Try the next candidate path.
    }
  }

  return cachedFromLog?.info ?? fallback;
}

/** @internal test helper */
export function parseLaunchLogVersionForTests(content: string): PsyNetVersionInfo | null {
  return parseLaunchLogVersion(content);
}
