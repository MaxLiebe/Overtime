import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { GAME_VERSION } from "./constants.js";
import type { Match, MatchEntry } from "./types.js";

const DEFAULT_STATE_FILE = ".replay-saver-state.json";

export interface ReplaySaverState {
  downloadedMatchGuids: string[];
}

export interface SyncReplaysOptions {
  replayDir?: string;
  knownGuids?: Iterable<string>;
  fetchFn?: typeof fetch;
  onGuidsUpdated?: (guids: string[]) => Promise<void> | void;
  /** @deprecated Use knownGuids + onGuidsUpdated instead */
  statePath?: string;
}

export interface SyncReplaysResult {
  checked: number;
  downloaded: Array<{ filePath: string; fileName: string; matchGuid: string }>;
  skippedExisting: number;
  skippedNoReplayUrl: number;
  failed: Array<{ matchGuid: string; error: string }>;
}

export function getDefaultReplayDir(): string {
  const home = homedir();

  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Rocket League", "TAGame", "Demos");
    case "win32":
      return join(home, "Documents", "My Games", "Rocket League", "TAGame", "Demos");
    default:
      return join(home, ".local", "share", "Rocket League", "TAGame", "Demos");
  }
}

export function getReplayFileName(match: Match): string {
  return `${match.RecordStartTimestamp}-${match.MatchGUID}.replay`;
}

export function getReplayFilePath(replayDir: string, match: Match): string {
  return join(replayDir, getReplayFileName(match));
}

export async function loadReplaySaverState(
  statePath = DEFAULT_STATE_FILE,
): Promise<ReplaySaverState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ReplaySaverState>;
    return {
      downloadedMatchGuids: parsed.downloadedMatchGuids ?? [],
    };
  } catch {
    return { downloadedMatchGuids: [] };
  }
}

export async function saveReplaySaverState(
  state: ReplaySaverState,
  statePath = DEFAULT_STATE_FILE,
): Promise<void> {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function scanExistingReplayGuids(replayDir: string): Promise<Set<string>> {
  const guids = new Set<string>();

  let entries: string[];
  try {
    entries = await readdir(replayDir);
  } catch {
    return guids;
  }

  const guidPattern = /[0-9A-F]{32}/gi;
  for (const entry of entries) {
    if (!entry.endsWith(".replay")) {
      continue;
    }

    for (const match of entry.matchAll(guidPattern)) {
      guids.add(match[0].toUpperCase());
    }
  }

  return guids;
}

export async function replayFileExists(
  replayDir: string,
  match: Match,
): Promise<boolean> {
  try {
    await access(getReplayFilePath(replayDir, match));
    return true;
  } catch {
    try {
      const entries = await readdir(replayDir);
      const upperGuid = match.MatchGUID.toUpperCase();
      return entries.some(
        (entry) => entry.toUpperCase().includes(upperGuid) && entry.endsWith(".replay"),
      );
    } catch {
      return false;
    }
  }
}

export async function isReplayDownloaded(
  matchGuid: string,
  replayDir: string,
  match: Match,
): Promise<boolean> {
  return replayFileExists(replayDir, match);
}

export async function downloadReplay(
  entry: MatchEntry,
  replayDir: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  if (!entry.ReplayUrl) {
    throw new Error("match has no replay URL");
  }

  await mkdir(replayDir, { recursive: true });

  const destination = getReplayFilePath(replayDir, entry.Match);
  const response = await fetchFn(entry.ReplayUrl, {
    headers: {
      "User-Agent": `RL Win/${GAME_VERSION} gzip`,
    },
  });

  if (!response.ok) {
    throw new Error(`download failed with status ${response.status} ${response.statusText}`);
  }

  const replayData = Buffer.from(await response.arrayBuffer());
  if (replayData.length === 0) {
    throw new Error("downloaded replay file is empty");
  }

  await writeFile(destination, replayData);
  return destination;
}

export async function syncReplays(
  matches: MatchEntry[],
  options: SyncReplaysOptions = {},
): Promise<SyncReplaysResult> {
  const replayDir = options.replayDir ?? getDefaultReplayDir();
  const fetchFn = options.fetchFn ?? fetch;

  let downloadedGuids: string[];
  if (options.knownGuids) {
    downloadedGuids = [...options.knownGuids];
  } else if (options.statePath) {
    const state = await loadReplaySaverState(options.statePath);
    downloadedGuids = state.downloadedMatchGuids;
  } else {
    downloadedGuids = [];
  }

  const knownGuids = new Set(
    [
      ...downloadedGuids,
      ...(await scanExistingReplayGuids(replayDir)),
    ].map((guid) => guid.toUpperCase()),
  );

  const result: SyncReplaysResult = {
    checked: matches.length,
    downloaded: [],
    skippedExisting: 0,
    skippedNoReplayUrl: 0,
    failed: [],
  };

  for (const entry of matches) {
    const matchGuid = entry.Match.MatchGUID;
    if (!matchGuid) {
      continue;
    }

    if (!entry.ReplayUrl) {
      result.skippedNoReplayUrl += 1;
      continue;
    }

    const alreadyDownloaded = await replayFileExists(replayDir, entry.Match);
    if (alreadyDownloaded) {
      result.skippedExisting += 1;
      knownGuids.add(matchGuid.toUpperCase());
      continue;
    }

    try {
      const destination = await downloadReplay(entry, replayDir, fetchFn);
      knownGuids.add(matchGuid.toUpperCase());
      downloadedGuids.push(matchGuid);
      result.downloaded.push({
        filePath: destination,
        fileName: getReplayFileName(entry.Match),
        matchGuid,
      });
    } catch (error) {
      result.failed.push({
        matchGuid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  downloadedGuids = [...new Set([...downloadedGuids, ...knownGuids])];

  if (options.onGuidsUpdated) {
    await options.onGuidsUpdated(downloadedGuids);
  } else if (options.statePath) {
    await saveReplaySaverState(
      { downloadedMatchGuids: downloadedGuids },
      options.statePath,
    );
  }

  return result;
}

export async function replayDirExists(replayDir: string): Promise<boolean> {
  try {
    await access(replayDir);
    return true;
  } catch {
    return false;
  }
}
