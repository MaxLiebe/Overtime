import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getDefaultReplayDir } from "./replays.js";
import type { BallchasingVisibility } from "./ballchasing.js";

export interface AppConfig {
  replayDir: string;
  pollIntervalMinutes: number;
  startMinimized: boolean;
  minimizeToTrayOnClose: boolean;
  launchAtLogin: boolean;
  autoUploadBallchasing: boolean;
  ballchasingToken: string;
  ballchasingVisibility: BallchasingVisibility;
}

export interface SavedReplayRecord {
  matchGuid: string;
  accountId: string;
  accountDisplayName: string;
  filePath: string;
  fileName: string;
  downloadedAt: string;
  playlist: number;
  playlistName: string;
  mapName: string;
  recordStartTimestamp: number;
  team0Score: number;
  team1Score: number;
  secondsPlayed: number;
  result: string;
  ballchasingId?: string;
  ballchasingUrl?: string;
  ballchasingUploadedAt?: string;
  ballchasingError?: string;
}

export interface AppState {
  downloadedMatchGuids: string[];
  savedReplays: SavedReplayRecord[];
  lastSyncAt?: string;
  lastSyncMessage?: string;
  lastSyncError?: string;
  isSyncing: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  replayDir: getDefaultReplayDir(),
  pollIntervalMinutes: 10,
  startMinimized: false,
  minimizeToTrayOnClose: true,
  launchAtLogin: false,
  autoUploadBallchasing: false,
  ballchasingToken: "",
  ballchasingVisibility: "private",
};

export const DEFAULT_STATE: AppState = {
  downloadedMatchGuids: [],
  savedReplays: [],
  isSyncing: false,
};

export function getDefaultPaths(userDataDir: string): {
  configPath: string;
  statePath: string;
  accountsPath: string;
  refreshTokenPath: string;
} {
  return {
    configPath: join(userDataDir, "config.json"),
    statePath: join(userDataDir, "state.json"),
    accountsPath: join(userDataDir, "accounts.json"),
    refreshTokenPath: join(userDataDir, ".rlshops"),
  };
}

export async function loadConfig(configPath: string): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(
  configPath: string,
  config: AppConfig,
): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function loadAppState(statePath: string): Promise<AppState> {
  try {
    const raw = await readFile(statePath, "utf8");
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<AppState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveAppState(
  statePath: string,
  state: AppState,
): Promise<void> {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function upsertSavedReplay(
  state: AppState,
  replay: SavedReplayRecord,
): AppState {
  const savedReplays = state.savedReplays.filter(
    (item) => item.matchGuid.toUpperCase() !== replay.matchGuid.toUpperCase(),
  );
  savedReplays.unshift(replay);
  savedReplays.sort(
    (a, b) => b.recordStartTimestamp - a.recordStartTimestamp,
  );

  return {
    ...state,
    savedReplays,
    downloadedMatchGuids: [
      ...new Set([...state.downloadedMatchGuids, replay.matchGuid].map((guid) => guid.toUpperCase())),
    ],
  };
}

export function updateSavedReplay(
  state: AppState,
  matchGuid: string,
  updates: Partial<SavedReplayRecord>,
): AppState {
  return {
    ...state,
    savedReplays: state.savedReplays.map((replay) =>
      replay.matchGuid.toUpperCase() === matchGuid.toUpperCase()
        ? { ...replay, ...updates }
        : replay,
    ),
  };
}
