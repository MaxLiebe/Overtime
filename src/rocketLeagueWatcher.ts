import type { AppConfig } from "./store.js";
import { buildGameMonitorState, type GameMonitorState } from "./gameMonitorState.js";
import { getProcessGamesThreshold, usesProcessSync } from "./syncConfig.js";
import { isRocketLeagueRunning } from "./rocketLeagueProcess.js";
import { RocketLeagueStatsClient } from "./rocketLeagueStatsApi.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;

export interface RocketLeagueWatcherOptions {
  getConfig: () => AppConfig;
  pollIntervalMs?: number;
  onGameClosed: () => void;
  onGamesThresholdReached: (gamesPlayed: number) => void;
  onStateChange?: (state: GameMonitorState) => void;
}

export class RocketLeagueWatcher {
  private readonly pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private statsClient: RocketLeagueStatsClient | null = null;
  private wasRunning = false;
  private initialized = false;
  private gamesSinceLastSync = 0;
  private lastMatchGuid = "";
  private rocketLeagueRunning = false;
  private statsApiConnected = false;

  constructor(private readonly options: RocketLeagueWatcherOptions) {
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  start(): void {
    this.stop();
    void this.poll();
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.disconnectStatsClient();
    this.initialized = false;
    this.wasRunning = false;
    this.gamesSinceLastSync = 0;
    this.lastMatchGuid = "";
    this.rocketLeagueRunning = false;
    this.statsApiConnected = false;
  }

  getState(): GameMonitorState {
    return buildGameMonitorState({
      config: this.options.getConfig(),
      rocketLeagueRunning: this.rocketLeagueRunning,
      statsApiConnected: this.statsApiConnected,
      gamesCompletedSinceSync: this.gamesSinceLastSync,
    });
  }

  private emitState(): void {
    this.options.onStateChange?.(this.getState());
  }

  private async poll(): Promise<void> {
    if (!usesProcessSync(this.options.getConfig())) {
      this.rocketLeagueRunning = false;
      this.disconnectStatsClient();
      this.emitState();
      return;
    }

    this.rocketLeagueRunning = await isRocketLeagueRunning();
    const running = this.rocketLeagueRunning;

    if (!this.initialized) {
      this.wasRunning = running;
      this.initialized = true;

      if (running) {
        this.gamesSinceLastSync = 0;
        this.syncStatsClient();
      }

      this.emitState();
      return;
    }

    if (this.wasRunning && !running) {
      this.gamesSinceLastSync = 0;
      this.lastMatchGuid = "";
      this.disconnectStatsClient();

      this.options.onGameClosed();
    } else if (!this.wasRunning && running) {
      this.gamesSinceLastSync = 0;
      this.lastMatchGuid = "";
      this.syncStatsClient();
    } else if (running) {
      this.syncStatsClient();
    } else {
      this.disconnectStatsClient();
    }

    this.wasRunning = running;
    this.emitState();
  }

  private syncStatsClient(): void {
    const threshold = this.getGamesThreshold();
    if (threshold <= 0) {
      this.disconnectStatsClient();
      return;
    }

    if (this.statsClient?.isActive()) {
      this.statsApiConnected = this.statsClient.isConnected();
      return;
    }

    this.statsClient = new RocketLeagueStatsClient({
      onConnected: () => {
        this.statsApiConnected = true;
        this.emitState();
      },
      onDisconnected: () => {
        this.statsApiConnected = false;
        this.emitState();
      },
      onMatchEnded: (matchGuid) => {
        this.handleMatchEnded(matchGuid, threshold);
      },
    });
    this.statsClient.start();
    this.statsApiConnected = false;
  }

  private disconnectStatsClient(): void {
    if (!this.statsClient) {
      this.statsApiConnected = false;
      return;
    }

    this.statsClient.stop();
    this.statsClient = null;
    this.statsApiConnected = false;
  }

  private getGamesThreshold(): number {
    return getProcessGamesThreshold(this.options.getConfig());
  }

  private handleMatchEnded(matchGuid: string, threshold: number): void {
    if (matchGuid === this.lastMatchGuid) {
      return;
    }

    this.lastMatchGuid = matchGuid;
    this.gamesSinceLastSync += 1;
    this.emitState();

    if (this.gamesSinceLastSync < threshold) {
      return;
    }

    this.gamesSinceLastSync = 0;
    this.emitState();
    this.options.onGamesThresholdReached(threshold);
  }
}
