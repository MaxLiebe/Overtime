import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Rocket League on Steam (Proton). */
export const ROCKET_LEAGUE_STEAM_APP_ID = 252950;

const RL_DEMOS_SUFFIX = join("My Games", "Rocket League", "TAGame", "Demos");

function unescapeVdfPath(value: string): string {
  return value.replace(/\\\\/g, "\\").replace(/\\"/g, '"');
}

export function getSteamRootCandidates(): string[] {
  const home = homedir();
  const candidates = [
    process.env.STEAM_ROOT?.trim(),
    process.env.STEAM_BASE?.trim(),
    join(home, ".steam", "steam"),
    join(home, ".local", "share", "Steam"),
    join(home, ".var", "app", "com.valvesoftware.Steam", "data", "Steam"),
    join(home, "snap", "steam", "common", ".steam", "steam"),
  ].filter((value): value is string => Boolean(value?.trim()));

  return [...new Set(candidates.map((candidate) => resolve(candidate)))];
}

export function parseSteamLibraryRoots(steamRoot: string): string[] {
  const roots = new Set<string>([resolve(steamRoot)]);
  const libraryFile = join(steamRoot, "steamapps", "libraryfolders.vdf");

  if (!existsSync(libraryFile)) {
    return [...roots];
  }

  try {
    const raw = readFileSync(libraryFile, "utf8");
    for (const match of raw.matchAll(/"path"\s+"([^"]+)"/g)) {
      const parsed = unescapeVdfPath(match[1]?.trim() ?? "");
      if (parsed) {
        roots.add(resolve(parsed));
      }
    }
  } catch {
    // Ignore unreadable library metadata.
  }

  return [...roots];
}

function replayDirFromProtonPrefix(prefixRoot: string): string | null {
  const usersDir = join(prefixRoot, "drive_c", "users");
  if (!existsSync(usersDir)) {
    return null;
  }

  let userEntries: string[];
  try {
    userEntries = readdirSync(usersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== "Public" && !name.startsWith("."));
  } catch {
    return null;
  }

  const preferredUsers = [
    ...userEntries.filter((name) => name.toLowerCase() === "steamuser"),
    ...userEntries.filter((name) => name.toLowerCase() !== "steamuser"),
  ];

  for (const userName of preferredUsers) {
    const replayDir = join(usersDir, userName, "Documents", RL_DEMOS_SUFFIX);
    if (existsSync(replayDir)) {
      return replayDir;
    }
  }

  for (const userName of preferredUsers) {
    const replayDir = join(usersDir, userName, "Documents", RL_DEMOS_SUFFIX);
    return replayDir;
  }

  return null;
}

export function getProtonReplayDirCandidatesSync(): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: string | null | undefined) => {
    if (!candidate?.trim()) {
      return;
    }

    const resolved = resolve(candidate);
    if (seen.has(resolved)) {
      return;
    }

    seen.add(resolved);
    candidates.push(resolved);
  };

  const runningCompat = process.env.STEAM_COMPAT_DATA_PATH?.trim();
  if (runningCompat) {
    addCandidate(replayDirFromProtonPrefix(join(runningCompat, "pfx")));
  }

  for (const steamRoot of getSteamRootCandidates()) {
    if (!existsSync(steamRoot)) {
      continue;
    }

    for (const libraryRoot of parseSteamLibraryRoots(steamRoot)) {
      const compatData = join(
        libraryRoot,
        "steamapps",
        "compatdata",
        String(ROCKET_LEAGUE_STEAM_APP_ID),
      );
      addCandidate(replayDirFromProtonPrefix(join(compatData, "pfx")));
    }
  }

  return candidates;
}

export function getDefaultProtonReplayDirSync(): string {
  const candidates = getProtonReplayDirCandidatesSync();
  if (candidates.length > 0) {
    return candidates[0];
  }

  const home = homedir();
  return join(
    home,
    ".steam",
    "steam",
    "steamapps",
    "compatdata",
    String(ROCKET_LEAGUE_STEAM_APP_ID),
    "pfx",
    "drive_c",
    "users",
    "steamuser",
    "Documents",
    RL_DEMOS_SUFFIX,
  );
}
