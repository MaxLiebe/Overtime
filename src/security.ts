import { basename, normalize, resolve, sep } from "node:path";
import { sanitizeReplayFileName } from "./format.js";

const ALLOWED_EXTERNAL_HOST_SUFFIXES = [
  "ballchasing.com",
  "epicgames.com",
  "rocketleague.com",
  "psyonix.com",
  "liquipedia.net",
  "tracker.gg",
  "tracker.network",
  "steampowered.com",
  "steamcommunity.com",
  "github.com",
  "githubusercontent.com",
  "discord.com",
  "discord.gg",
  "ko-fi.com",
  "metafy.gg",
  "x.com",
  "twitter.com",
  "youtube.com",
  "youtu.be",
  "playstation.com",
  "xbox.com",
  "nintendo.com",
] as const;

function hostnameAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_EXTERNAL_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Only allow http(s) links to known Overtime-related hosts. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return hostnameAllowed(parsed.hostname);
  } catch {
    return false;
  }
}

export function assertAllowedExternalUrl(url: string): string {
  const trimmed = url.trim();
  if (!isAllowedExternalUrl(trimmed)) {
    throw new Error("Opening this link is not allowed.");
  }
  return trimmed;
}

/** Epic device-auth verification pages only. */
export function isAllowedEpicVerificationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    return hostnameAllowed(parsed.hostname) && parsed.hostname.toLowerCase().includes("epicgames.com");
  } catch {
    return false;
  }
}

export function isAllowedBallchasingApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === "ballchasing.com" || host.endsWith(".ballchasing.com");
  } catch {
    return false;
  }
}

function normalizePathForCompare(filePath: string): string {
  const resolved = normalize(resolve(filePath));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** True when filePath is the directory itself or a file/folder inside it. */
export function isPathInsideDir(filePath: string, dir: string): boolean {
  const resolvedFile = normalizePathForCompare(filePath);
  const resolvedDir = normalizePathForCompare(dir);
  if (resolvedFile === resolvedDir) {
    return true;
  }
  const prefix = resolvedDir.endsWith(sep) ? resolvedDir : `${resolvedDir}${sep}`;
  return resolvedFile.startsWith(prefix);
}

export function assertPathInsideReplayDir(filePath: string, replayDir: string): string {
  const resolved = resolve(filePath);
  if (!isPathInsideDir(resolved, replayDir)) {
    throw new Error("Replay path is outside the configured replay folder.");
  }
  return resolved;
}

/** Strip path segments and unsafe characters from a download/import file name. */
export function sanitizeReplayDownloadFileName(
  fileName: string,
  fallbackBase = "replay",
): string {
  const baseName = basename(fileName.replace(/\\/g, "/"));
  const withoutExt = baseName.toLowerCase().endsWith(".replay")
    ? baseName.slice(0, -".replay".length)
    : baseName;
  const safe = sanitizeReplayFileName(withoutExt) || fallbackBase;
  return `${safe}.replay`;
}
