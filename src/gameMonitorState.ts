import type { AppConfig } from "./store.js";
import { getProcessGamesThreshold, usesProcessSync } from "./syncConfig.js";

export interface GameMonitorState {
  /** Process-detection sync mode is active. */
  active: boolean;
  rocketLeagueRunning: boolean;
  /** Sync-after-games mode is enabled. */
  statsApiEnabled: boolean;
  statsApiConnected: boolean;
  gamesCompletedSinceSync: number;
  gamesUntilSync: number;
  syncAfterGames: number;
}

export function createInactiveGameMonitorState(config: AppConfig): GameMonitorState {
  const threshold = getProcessGamesThreshold(config);

  return {
    active: usesProcessSync(config),
    rocketLeagueRunning: false,
    statsApiEnabled: threshold > 0,
    statsApiConnected: false,
    gamesCompletedSinceSync: 0,
    gamesUntilSync: threshold,
    syncAfterGames: threshold,
  };
}

export function buildGameMonitorState(input: {
  config: AppConfig;
  rocketLeagueRunning: boolean;
  statsApiConnected: boolean;
  gamesCompletedSinceSync: number;
}): GameMonitorState {
  const active = usesProcessSync(input.config);
  const syncAfterGames = getProcessGamesThreshold(input.config);
  const statsApiEnabled = active && syncAfterGames > 0;
  const gamesUntilSync = statsApiEnabled
    ? Math.max(0, syncAfterGames - input.gamesCompletedSinceSync)
    : 0;

  return {
    active,
    rocketLeagueRunning: input.rocketLeagueRunning,
    statsApiEnabled,
    statsApiConnected: statsApiEnabled && input.statsApiConnected,
    gamesCompletedSinceSync: input.gamesCompletedSinceSync,
    gamesUntilSync,
    syncAfterGames,
  };
}
