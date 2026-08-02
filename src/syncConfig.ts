import type { AppConfig } from "./store.js";

export type SyncMode = "process" | "interval" | "manual";
export type ProcessSyncWhilePlaying = "on-close-only" | "after-games";

export function getDefaultSyncMode(): SyncMode {
  return process.platform === "win32" || process.platform === "linux"
    ? "process"
    : "interval";
}

export function usesProcessSync(config: AppConfig): boolean {
  return config.syncMode === "process";
}

export function usesIntervalSync(config: AppConfig): boolean {
  return config.syncMode === "interval";
}

export function usesManualSync(config: AppConfig): boolean {
  return config.syncMode === "manual";
}

export function getProcessGamesThreshold(config: AppConfig): number {
  if (!usesProcessSync(config) || config.processSyncWhilePlaying !== "after-games") {
    return 0;
  }

  const value = config.syncAfterGames ?? 20;
  if (!Number.isFinite(value)) {
    return 20;
  }

  return Math.max(1, Math.floor(value));
}

/** Live match tracking when the setting is on (PC / Stats API; works in any sync mode). */
export function isLiveMatchTrackingEnabled(config: AppConfig): boolean {
  return config.liveMatchTrackingEnabled !== false;
}

type LegacySyncFields = {
  syncMode?: SyncMode;
  skipSyncWhenGameRunning?: boolean;
  syncOnGameClose?: boolean;
  syncAfterGames?: number;
  processSyncWhilePlaying?: ProcessSyncWhilePlaying;
};

/** Apply defaults and migrate older config shapes. */
export function normalizeSyncConfig(config: AppConfig, legacy: LegacySyncFields = {}): AppConfig {
  if (
    legacy.syncMode === "process" ||
    legacy.syncMode === "interval" ||
    legacy.syncMode === "manual"
  ) {
    return {
      ...config,
      syncMode: legacy.syncMode,
      processSyncWhilePlaying:
        legacy.processSyncWhilePlaying === "after-games" ? "after-games" : "on-close-only",
      syncAfterGames: Math.max(1, Math.floor(config.syncAfterGames ?? 20)),
    };
  }

  const syncMode = getDefaultSyncMode();
  let processSyncWhilePlaying: ProcessSyncWhilePlaying = "on-close-only";
  let syncAfterGames = 20;

  const oldAfterGames =
    typeof legacy.syncAfterGames === "number" ? legacy.syncAfterGames : config.syncAfterGames ?? 0;
  if (oldAfterGames > 0) {
    processSyncWhilePlaying = "after-games";
    syncAfterGames = oldAfterGames;
  }

  return {
    ...config,
    syncMode,
    processSyncWhilePlaying,
    syncAfterGames,
  };
}
