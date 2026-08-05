import type { AppConfig } from "./store.js";
import { buildGameMonitorState, type GameMonitorState } from "./gameMonitorState.js";
import {
  getProcessGamesThreshold,
  isLiveMatchTrackingEnabled,
  usesProcessSync,
} from "./syncConfig.js";
import { isRocketLeagueRunning } from "./rocketLeagueProcess.js";
import { RocketLeagueStatsClient } from "./rocketLeagueStatsApi.js";
import {
  applyUpdateStateToTrackedMatch,
  createLiveTrackedMatch,
  markTrackedMatchEnded,
  mergeTrackedPlayers,
  type StatsApiUpdateState,
  type TrackedMatch,
} from "./trackedMatch.js";
import type { SavedReplayPlayer } from "./store.js";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const UPDATE_STATE_EMIT_MIN_MS = 400;
const MAX_AWAITING_SYNC = 30;

export interface RocketLeagueWatcherOptions {
  getConfig: () => AppConfig;
  /** Platform player ids / account ids used to detect the local player in Stats API snapshots. */
  getLinkedPlayerIds?: () => string[];
  pollIntervalMs?: number;
  onGameClosed: () => void;
  onGamesThresholdReached: (gamesPlayed: number) => void;
  onStateChange?: (state: GameMonitorState) => void;
  onTrackedMatchesChange?: (matches: TrackedMatch[]) => void;
}

export class RocketLeagueWatcher {
  private readonly pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private statsClient: RocketLeagueStatsClient | null = null;
  private wasRunning = false;
  private initialized = false;
  private gamesSinceLastSync = 0;
  private lastCountedMatchGuid = "";
  private rocketLeagueRunning = false;
  private statsApiConnected = false;
  private liveMatch: TrackedMatch | null = null;
  private awaitingSync: TrackedMatch[] = [];
  /** Union of every player once seen for a match — survives MatchDestroyed / live recreate. */
  private rosterHistory = new Map<string, SavedReplayPlayer[]>();
  private lastUpdateEmitAt = 0;
  /** True between ReplayCreated and the replay session ending — not a live match. */
  private viewingSavedReplay = false;
  private savedReplayMatchGuid = "";

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
    this.lastCountedMatchGuid = "";
    this.rocketLeagueRunning = false;
    this.statsApiConnected = false;
    this.liveMatch = null;
    this.awaitingSync = [];
    this.rosterHistory.clear();
    this.clearSavedReplayMode();
    this.emitTrackedMatches();
  }

  private clearSavedReplayMode(): void {
    this.viewingSavedReplay = false;
    this.savedReplayMatchGuid = "";
  }

  private isSavedReplaySession(matchGuid?: string): boolean {
    if (!this.viewingSavedReplay) {
      return false;
    }

    if (!matchGuid?.trim()) {
      return true;
    }

    if (!this.savedReplayMatchGuid) {
      return true;
    }

    return matchGuid.trim().toUpperCase() === this.savedReplayMatchGuid;
  }

  getState(): GameMonitorState {
    return buildGameMonitorState({
      config: this.options.getConfig(),
      rocketLeagueRunning: this.rocketLeagueRunning,
      statsApiConnected: this.statsApiConnected,
      gamesCompletedSinceSync: this.gamesSinceLastSync,
    });
  }

  isStatsApiConnected(): boolean {
    return this.statsApiConnected && (this.statsClient?.isConnected() ?? false);
  }

  /** Send a command on the live Stats API socket when connected. */
  sendStatsApiCommand(command: string, data: Record<string, unknown>): boolean {
    return this.statsClient?.sendCommand(command, data) ?? false;
  }

  getTrackedMatches(): TrackedMatch[] {
    if (!this.isLiveTrackingEnabled()) {
      return [];
    }

    const awaiting = this.awaitingSync.filter(
      (match) =>
        !this.liveMatch ||
        match.matchGuid.toUpperCase() !== this.liveMatch.matchGuid.toUpperCase(),
    );
    return this.liveMatch ? [this.liveMatch, ...awaiting] : [...awaiting];
  }

  private isLiveTrackingEnabled(): boolean {
    return isLiveMatchTrackingEnabled(this.options.getConfig());
  }

  private needsStatsClient(): boolean {
    return this.isLiveTrackingEnabled() || this.getGamesThreshold() > 0;
  }

  private clearTrackedMatches(): void {
    const hadTracked = Boolean(this.liveMatch) || this.awaitingSync.length > 0;
    this.liveMatch = null;
    this.awaitingSync = [];
    this.rosterHistory.clear();
    this.clearSavedReplayMode();
    if (hadTracked) {
      this.emitTrackedMatches();
    }
  }

  private rememberRoster(matchGuid: string, players: SavedReplayPlayer[]): SavedReplayPlayer[] {
    const upper = matchGuid.toUpperCase();
    const merged = mergeTrackedPlayers(this.rosterHistory.get(upper) ?? [], players);
    this.rosterHistory.set(upper, merged);
    return merged;
  }

  private seedPlayersForMatch(matchGuid: string): SavedReplayPlayer[] {
    const upper = matchGuid.toUpperCase();
    const fromHistory = this.rosterHistory.get(upper);
    if (fromHistory?.length) {
      return fromHistory;
    }

    return (
      this.awaitingSync.find((match) => match.matchGuid.toUpperCase() === upper)?.players ?? []
    );
  }

  /** Create or reuse the live row, always seeding previously seen players for this guid. */
  private ensureLiveMatch(matchGuid: string): TrackedMatch {
    const upper = matchGuid.toUpperCase();
    const seedPlayers = this.seedPlayersForMatch(upper);

    if (this.liveMatch?.matchGuid.toUpperCase() === upper) {
      if (!seedPlayers.length) {
        return this.liveMatch;
      }
      return {
        ...this.liveMatch,
        players: mergeTrackedPlayers(seedPlayers, this.liveMatch.players),
      };
    }

    if (this.liveMatch?.status === "live") {
      const previousGuid = this.liveMatch.matchGuid.toUpperCase();
      this.pushAwaiting(markTrackedMatchEnded(this.liveMatch, this.liveMatch.winningTeam));
      this.rosterHistory.delete(previousGuid);
    }

    const live = createLiveTrackedMatch(upper);
    if (!seedPlayers.length) {
      return live;
    }

    return { ...live, players: seedPlayers };
  }

  /** Drop tracked entries that already have a synced replay file. */
  pruneSyncedMatchGuids(matchGuids: Iterable<string>): void {
    const synced = new Set(
      [...matchGuids].map((guid) => guid.trim().toUpperCase()).filter(Boolean),
    );
    if (synced.size === 0) {
      return;
    }

    const beforeAwaiting = this.awaitingSync.length;
    this.awaitingSync = this.awaitingSync.filter(
      (match) => !synced.has(match.matchGuid.toUpperCase()),
    );

    let clearedLive = false;
    if (
      this.liveMatch &&
      synced.has(this.liveMatch.matchGuid.toUpperCase()) &&
      this.liveMatch.status !== "live"
    ) {
      this.liveMatch = null;
      clearedLive = true;
    }

    if (clearedLive || beforeAwaiting !== this.awaitingSync.length) {
      this.emitTrackedMatches();
    }
  }

  private emitState(): void {
    this.options.onStateChange?.(this.getState());
  }

  private emitTrackedMatches(): void {
    this.options.onTrackedMatchesChange?.(this.getTrackedMatches());
  }

  private linkedPlayerIdSet(): Set<string> {
    const ids = this.options.getLinkedPlayerIds?.() ?? [];
    return new Set(
      ids.map((id) => id.trim().toUpperCase()).filter(Boolean),
    );
  }

  private async poll(): Promise<void> {
    this.rocketLeagueRunning = await isRocketLeagueRunning();
    const running = this.rocketLeagueRunning;
    const processSync = usesProcessSync(this.options.getConfig());

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
      this.lastCountedMatchGuid = "";
      this.clearSavedReplayMode();
      this.finalizeLiveAsAwaiting();
      this.disconnectStatsClient();

      if (processSync) {
        this.options.onGameClosed();
      }
    } else if (!this.wasRunning && running) {
      this.gamesSinceLastSync = 0;
      this.lastCountedMatchGuid = "";
      this.clearSavedReplayMode();
      this.syncStatsClient();
    } else if (running) {
      this.syncStatsClient();
    } else {
      this.disconnectStatsClient();
    }

    this.wasRunning = running;
    this.emitState();
  }

  private finalizeLiveAsAwaiting(): void {
    if (!this.liveMatch) {
      return;
    }

    const upper = this.liveMatch.matchGuid.toUpperCase();
    if (this.isSavedReplaySession(upper)) {
      this.liveMatch = null;
      this.rosterHistory.delete(upper);
      this.emitTrackedMatches();
      return;
    }

    if (this.isLiveTrackingEnabled()) {
      const withRoster = {
        ...this.liveMatch,
        players: this.rememberRoster(upper, this.liveMatch.players),
      };
      if (withRoster.status === "live") {
        this.pushAwaiting(markTrackedMatchEnded(withRoster, withRoster.winningTeam));
      } else {
        this.pushAwaiting(withRoster);
      }
    }

    this.liveMatch = null;
    this.rosterHistory.delete(upper);
    this.emitTrackedMatches();
  }

  private pushAwaiting(match: TrackedMatch): void {
    const upper = match.matchGuid.toUpperCase();
    const awaiting: TrackedMatch = {
      ...match,
      status: "awaiting_sync",
      matchGuid: upper,
    };
    this.awaitingSync = [
      awaiting,
      ...this.awaitingSync.filter((item) => item.matchGuid.toUpperCase() !== upper),
    ].slice(0, MAX_AWAITING_SYNC);
  }

  private syncStatsClient(): void {
    if (!this.needsStatsClient()) {
      this.disconnectStatsClient();
      this.clearTrackedMatches();
      return;
    }

    if (!this.isLiveTrackingEnabled()) {
      this.clearTrackedMatches();
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
      onMatchCreated: (matchGuid) => {
        this.handleMatchCreated(matchGuid);
      },
      onMatchInitialized: (matchGuid) => {
        this.handleMatchInitialized(matchGuid);
      },
      onUpdateState: (data) => {
        this.handleUpdateState(data);
      },
      onMatchEnded: (matchGuid, winnerTeamNum) => {
        this.handleMatchEnded(matchGuid, winnerTeamNum);
      },
      onMatchDestroyed: (matchGuid) => {
        this.handleMatchDestroyed(matchGuid);
      },
      onReplayCreated: () => {
        this.handleReplayCreated();
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

  /** Saved-replay viewing emits the same match lifecycle events as live games. */
  private handleReplayCreated(): void {
    this.viewingSavedReplay = true;

    if (this.liveMatch) {
      const upper = this.liveMatch.matchGuid.toUpperCase();
      this.liveMatch = null;
      this.rosterHistory.delete(upper);
      this.awaitingSync = this.awaitingSync.filter(
        (match) => match.matchGuid.toUpperCase() !== upper,
      );
      this.emitTrackedMatches();
    }
  }

  private getGamesThreshold(): number {
    return getProcessGamesThreshold(this.options.getConfig());
  }

  private handleMatchCreated(matchGuid: string): void {
    if (!this.isLiveTrackingEnabled()) {
      return;
    }

    const upper = matchGuid.toUpperCase();
    if (this.viewingSavedReplay) {
      this.savedReplayMatchGuid = upper;
      return;
    }

    if (this.liveMatch?.matchGuid.toUpperCase() === upper) {
      return;
    }

    if (this.liveMatch?.status === "live") {
      const previousGuid = this.liveMatch.matchGuid.toUpperCase();
      this.pushAwaiting(markTrackedMatchEnded(this.liveMatch, this.liveMatch.winningTeam));
      this.rosterHistory.delete(previousGuid);
    }

    this.awaitingSync = this.awaitingSync.filter(
      (match) => match.matchGuid.toUpperCase() !== upper,
    );
    this.rosterHistory.delete(upper);
    this.liveMatch = createLiveTrackedMatch(upper);
    this.emitTrackedMatches();
  }

  /** Ensure a live row exists without wiping an already-built roster. */
  private handleMatchInitialized(matchGuid: string): void {
    if (!this.isLiveTrackingEnabled()) {
      return;
    }

    const upper = matchGuid.toUpperCase();
    if (this.isSavedReplaySession(upper)) {
      this.savedReplayMatchGuid = this.savedReplayMatchGuid || upper;
      return;
    }

    if (this.liveMatch?.matchGuid.toUpperCase() === upper) {
      return;
    }

    if (this.liveMatch?.status === "live") {
      // Different guid while live — treat as a new match only via MatchCreated.
      return;
    }

    this.liveMatch = this.ensureLiveMatch(upper);
    this.emitTrackedMatches();
  }

  private handleUpdateState(data: StatsApiUpdateState): void {
    if (!this.isLiveTrackingEnabled()) {
      return;
    }

    const matchGuid = data.MatchGuid?.trim().toUpperCase();
    if (!matchGuid) {
      return;
    }

    if (this.isSavedReplaySession(matchGuid)) {
      this.savedReplayMatchGuid = this.savedReplayMatchGuid || matchGuid;
      return;
    }

    // Goal replays set bReplay on the current live match — keep updating that row.
    // Never start tracking from an UpdateState that is already inside a replay.
    if (data.Game?.bReplay === true) {
      if (!this.liveMatch || this.liveMatch.matchGuid.toUpperCase() !== matchGuid) {
        return;
      }
    }

    const previousPlayerCount = this.liveMatch?.players.length ?? 0;
    this.liveMatch = this.ensureLiveMatch(matchGuid);

    this.liveMatch = applyUpdateStateToTrackedMatch(
      this.liveMatch,
      data,
      this.linkedPlayerIdSet(),
    );
    this.liveMatch = {
      ...this.liveMatch,
      players: this.rememberRoster(matchGuid, this.liveMatch.players),
    };

    const now = Date.now();
    const rosterChanged =
      this.liveMatch.players.length !== previousPlayerCount ||
      this.liveMatch.players.length !== (data.Players?.length ?? 0);
    if (rosterChanged || now - this.lastUpdateEmitAt >= UPDATE_STATE_EMIT_MIN_MS) {
      this.lastUpdateEmitAt = now;
      this.emitTrackedMatches();
    }
  }

  private handleMatchEnded(matchGuid: string, winnerTeamNum?: number): void {
    const upper = matchGuid.toUpperCase();
    const threshold = this.getGamesThreshold();

    if (this.isSavedReplaySession(upper)) {
      this.savedReplayMatchGuid = this.savedReplayMatchGuid || upper;
      if (this.liveMatch?.matchGuid.toUpperCase() === upper) {
        this.liveMatch = null;
        this.rosterHistory.delete(upper);
        this.emitTrackedMatches();
      }
      return;
    }

    if (this.isLiveTrackingEnabled()) {
      if (this.liveMatch && this.liveMatch.matchGuid.toUpperCase() === upper) {
        const withRoster = {
          ...this.liveMatch,
          players: this.rememberRoster(upper, this.liveMatch.players),
        };
        const ended = markTrackedMatchEnded(withRoster, winnerTeamNum);
        this.pushAwaiting(ended);
        this.liveMatch = null;
        this.emitTrackedMatches();
      } else {
        const existing = this.awaitingSync.find(
          (match) => match.matchGuid.toUpperCase() === upper,
        );
        if (existing) {
          const withRoster = {
            ...existing,
            players: this.rememberRoster(upper, existing.players),
          };
          this.pushAwaiting(markTrackedMatchEnded(withRoster, winnerTeamNum));
          this.emitTrackedMatches();
        } else {
          const seed = this.seedPlayersForMatch(upper);
          const stub = markTrackedMatchEnded(
            { ...createLiveTrackedMatch(upper), players: seed },
            winnerTeamNum,
          );
          this.pushAwaiting(stub);
          this.emitTrackedMatches();
        }
      }
    }

    if (threshold <= 0) {
      return;
    }

    if (upper === this.lastCountedMatchGuid) {
      return;
    }

    this.lastCountedMatchGuid = upper;
    this.gamesSinceLastSync += 1;
    this.emitState();

    if (this.gamesSinceLastSync < threshold) {
      return;
    }

    this.gamesSinceLastSync = 0;
    this.emitState();
    this.options.onGamesThresholdReached(threshold);
  }

  private handleMatchDestroyed(matchGuid: string): void {
    if (!this.isLiveTrackingEnabled()) {
      if (this.isSavedReplaySession(matchGuid)) {
        this.clearSavedReplayMode();
      }
      return;
    }

    const upper = matchGuid.toUpperCase();

    if (this.isSavedReplaySession(upper)) {
      if (this.liveMatch?.matchGuid.toUpperCase() === upper) {
        this.liveMatch = null;
        this.rosterHistory.delete(upper);
      }
      this.clearSavedReplayMode();
      this.emitTrackedMatches();
      return;
    }

    if (!this.liveMatch || this.liveMatch.matchGuid.toUpperCase() !== upper) {
      // Keep rosterHistory so a late UpdateState can rebuild the live row with leavers.
      return;
    }

    if (this.liveMatch.status === "live") {
      const withRoster = {
        ...this.liveMatch,
        players: this.rememberRoster(upper, this.liveMatch.players),
      };
      // Left without a clean MatchEnded — still keep a snapshot if we have scores.
      if (withRoster.players.length > 0 || withRoster.team0Score + withRoster.team1Score > 0) {
        this.pushAwaiting(markTrackedMatchEnded(withRoster, withRoster.winningTeam));
      }
    }

    // Clear live row, but keep rosterHistory: UpdateState can resume after a spurious
    // MatchDestroyed (e.g. when another player leaves) and must reseed leavers.
    this.liveMatch = null;
    this.emitTrackedMatches();
  }
}
