import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { getDefaultReplayDir } from "./replays.js";
import type { BallchasingVisibility } from "./ballchasing.js";
import {
  getDefaultSyncMode,
  normalizeSyncConfig,
  type ProcessSyncWhilePlaying,
  type SyncMode,
} from "./syncConfig.js";

export type { ProcessSyncWhilePlaying, SyncMode };

export interface AppConfig {
  replayDir: string;
  /** Watch for Rocket League, sync on a timer, or only when you click Sync. */
  syncMode: SyncMode;
  /** How often to check for replays when syncMode is interval. */
  pollIntervalMinutes: number;
  /** While RL is open: wait for close, or sync every N games (process mode only). */
  processSyncWhilePlaying: ProcessSyncWhilePlaying;
  /** Games between mid-session syncs when processSyncWhilePlaying is after-games. */
  syncAfterGames: number;
  startMinimized: boolean;
  minimizeToTrayOnClose: boolean;
  launchAtLogin: boolean;
  /** Check GitHub Releases for Overtime updates (installed builds only). */
  autoUpdateEnabled: boolean;
  /**
   * Track live / awaiting-sync matches from the Rocket League Stats API.
   * PC only; requires Stats API. Works with any sync mode when enabled.
   */
  liveMatchTrackingEnabled: boolean;
  autoUploadBallchasing: boolean;
  deleteLocalAfterBallchasingUpload: boolean;
  ballchasingToken: string;
  ballchasingVisibility: BallchasingVisibility;
  onboardingCompleted?: boolean;
  /** Sort replay list by match date or when the replay was added to Overtime. */
  replaySortBy?: ReplaySortBy;
  /**
   * Renderer-only: whether a Ballchasing token is stored.
   * Never persisted; stripped in saveConfig.
   */
  hasBallchasingToken?: boolean;
}

/** Config shape safe to send to the renderer (no secrets). */
export type PublicAppConfig = Omit<AppConfig, "ballchasingToken"> & {
  ballchasingToken: "";
  hasBallchasingToken: boolean;
};

export function toPublicConfig(config: AppConfig): PublicAppConfig {
  return {
    ...config,
    ballchasingToken: "",
    hasBallchasingToken: Boolean(config.ballchasingToken?.trim()),
  };
}

/** Merge IPC partials without wiping secrets or letting the renderer set replayDir. */
export function mergeConfigFromRenderer(
  current: AppConfig,
  partial: Partial<AppConfig>,
): AppConfig {
  const {
    replayDir: _replayDir,
    hasBallchasingToken: _hasToken,
    ballchasingToken: incomingToken,
    ...rest
  } = partial;

  const next: AppConfig = {
    ...current,
    ...rest,
    replayDir: current.replayDir,
  };

  if (typeof incomingToken === "string" && incomingToken.trim()) {
    next.ballchasingToken = incomingToken.trim();
  }

  return next;
}

export type ReplaySortBy = "match" | "import";

export interface ImportedReplayMeta {
  importedAt: string;
  matchGuid?: string;
}

export interface SavedReplayPlayer {
  playerId: string;
  playerName: string;
  team: number;
  teamColor: string;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demolishes: number;
  isMvp: boolean;
  isPro?: boolean;
  rankTier?: number | null;
  rankDivision?: number | null;
  /** Stats API spectator shortcut; used to detect bot backfill on the same slot. */
  shortcut?: number;
}

export interface SavedReplayRecord {
  matchGuid: string;
  accountId: string;
  accountDisplayName: string;
  filePath: string;
  fileName: string;
  /** User-defined replay name stored inside the replay file header */
  replayName?: string;
  downloadedAt: string;
  playlist: number;
  playlistName: string;
  mapName: string;
  recordStartTimestamp: number;
  team0Score: number;
  team1Score: number;
  secondsPlayed: number;
  overtimeSecondsPlayed?: number;
  wentToOvertime?: boolean;
  result: string;
  winningTeam?: number;
  localPlayerTeam?: number;
  localPlayerId?: string;
  isForfeit?: boolean;
  players?: SavedReplayPlayer[];
  ballchasingId?: string;
  ballchasingUrl?: string;
  ballchasingUploadedAt?: string;
  ballchasingError?: string;
  ballchasingErrorKind?: "quota" | "unknown";
  /** synced = downloaded via Overtime; imported = found or copied into replay folder */
  source?: "synced" | "imported";
  /** When the replay was added to Overtime (imports, restores). */
  importedAt?: string;
  /** Local file removed; metadata kept with Ballchasing link */
  cloudOnly?: boolean;
  /** For imported replays: whether a linked account name was found in the file */
  hasAccountMatch?: boolean;
}

export interface ImportedBallchasingLink {
  ballchasingId: string;
  ballchasingUrl: string;
  ballchasingUploadedAt: string;
}

export interface AppState {
  downloadedMatchGuids: string[];
  savedReplays: SavedReplayRecord[];
  importedBallchasingLinks?: Record<string, ImportedBallchasingLink>;
  importedReplayMeta?: Record<string, ImportedReplayMeta>;
  lastSyncAt?: string;
  lastSyncMessage?: string;
  lastSyncError?: string;
  isSyncing: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  replayDir: getDefaultReplayDir(),
  syncMode: getDefaultSyncMode(),
  pollIntervalMinutes: 150,
  processSyncWhilePlaying: "on-close-only",
  syncAfterGames: 20,
  startMinimized: false,
  minimizeToTrayOnClose: true,
  launchAtLogin: false,
  autoUpdateEnabled: true,
  liveMatchTrackingEnabled: true,
  autoUploadBallchasing: false,
  deleteLocalAfterBallchasingUpload: false,
  ballchasingToken: "",
  ballchasingVisibility: "private",
  onboardingCompleted: false,
  replaySortBy: "match",
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
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    return normalizeSyncConfig(merged, parsed);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(
  configPath: string,
  config: AppConfig,
): Promise<void> {
  const { hasBallchasingToken: _hasToken, ...persistable } = config;
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(persistable, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
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
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
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

export function removeSavedReplay(state: AppState, matchGuid: string): AppState {
  const upper = matchGuid.toUpperCase();
  return {
    ...state,
    savedReplays: state.savedReplays.filter(
      (replay) => replay.matchGuid.toUpperCase() !== upper,
    ),
  };
}

function importedReplayMetaKey(filePath: string): string {
  return normalize(filePath).toLowerCase();
}

export function getImportedReplayMeta(
  meta: Record<string, ImportedReplayMeta> | undefined,
  filePath: string,
): ImportedReplayMeta | undefined {
  if (!meta || !filePath.trim()) {
    return undefined;
  }

  return meta[importedReplayMetaKey(filePath)];
}

export function upsertImportedReplayMeta(
  state: AppState,
  filePath: string,
  entry: ImportedReplayMeta,
): AppState {
  return {
    ...state,
    importedReplayMeta: {
      ...state.importedReplayMeta,
      [importedReplayMetaKey(filePath)]: entry,
    },
  };
}

export function removeImportedReplayMeta(
  state: AppState,
  filePath: string,
): AppState {
  if (!state.importedReplayMeta || !filePath.trim()) {
    return state;
  }

  const { [importedReplayMetaKey(filePath)]: _removed, ...rest } =
    state.importedReplayMeta;

  return {
    ...state,
    importedReplayMeta: rest,
  };
}

function importedBallchasingLinkKey(filePath: string): string {
  return normalize(filePath).toLowerCase();
}

export function getImportedBallchasingLink(
  links: Record<string, ImportedBallchasingLink> | undefined,
  filePath: string,
): ImportedBallchasingLink | undefined {
  if (!links) {
    return undefined;
  }

  return links[importedBallchasingLinkKey(filePath)];
}

export function upsertImportedBallchasingLink(
  state: AppState,
  filePath: string,
  link: ImportedBallchasingLink,
): AppState {
  return {
    ...state,
    importedBallchasingLinks: {
      ...state.importedBallchasingLinks,
      [importedBallchasingLinkKey(filePath)]: link,
    },
  };
}

export function removeImportedBallchasingLink(
  state: AppState,
  filePath: string,
): AppState {
  if (!state.importedBallchasingLinks) {
    return state;
  }

  const { [importedBallchasingLinkKey(filePath)]: _removed, ...rest } =
    state.importedBallchasingLinks;

  return {
    ...state,
    importedBallchasingLinks: rest,
  };
}
