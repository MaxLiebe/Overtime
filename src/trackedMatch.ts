import { isPsyonixBotPlayerId } from "./format.js";
import { getMapDisplayName } from "./maps.js";
import type { SavedReplayPlayer, SavedReplayRecord } from "./store.js";

/** Live game, or finished game waiting for a synced .replay file. */
export type TrackedMatchStatus = "live" | "awaiting_sync";

export interface TrackedMatch {
  matchGuid: string;
  status: TrackedMatchStatus;
  mapName: string;
  team0Score: number;
  team1Score: number;
  winningTeam?: number;
  players: SavedReplayPlayer[];
  localPlayerTeam?: number;
  localPlayerId?: string;
  result: string;
  /** Game clock seconds remaining (from Stats API). */
  timeSeconds?: number;
  wentToOvertime?: boolean;
  startedAt: string;
  updatedAt: string;
  recordStartTimestamp: number;
}

export interface StatsApiPlayer {
  Name?: string;
  PrimaryId?: string;
  /** Some Stats API builds use PlayerID instead of / as well as PrimaryId. */
  PlayerID?: string;
  /** Spectator shortcut; reused when a leaver is replaced by a bot. */
  Shortcut?: number;
  TeamNum?: number;
  Score?: number;
  Goals?: number;
  Assists?: number;
  Saves?: number;
  Shots?: number;
  Demos?: number;
}

export interface StatsApiTeam {
  TeamNum?: number;
  Score?: number;
  Name?: string;
}

export interface StatsApiGameState {
  Arena?: string;
  TimeSeconds?: number;
  bOvertime?: boolean;
  bHasWinner?: boolean;
  Winner?: number;
  Teams?: StatsApiTeam[];
}

export interface StatsApiUpdateState {
  MatchGuid?: string;
  Players?: StatsApiPlayer[];
  Game?: StatsApiGameState;
}

export interface MatchCreatedData {
  MatchGuid?: string;
}

export interface MatchDestroyedData {
  MatchGuid?: string;
}

function teamColorFromNum(team: number): string {
  return team === 0 ? "blue" : team === 1 ? "orange" : "unknown";
}

export function mapStatsApiPlayers(
  players: StatsApiPlayer[] | undefined,
): SavedReplayPlayer[] {
  if (!players?.length) {
    return [];
  }

  return players.map((player) => {
    const team = Number(player.TeamNum ?? 0);
    const shortcut = Number(player.Shortcut);
    return {
      playerId: String(player.PrimaryId ?? player.PlayerID ?? "").trim(),
      playerName: String(player.Name ?? "Unknown").trim() || "Unknown",
      team,
      teamColor: teamColorFromNum(team),
      score: Number(player.Score ?? 0),
      goals: Number(player.Goals ?? 0),
      assists: Number(player.Assists ?? 0),
      saves: Number(player.Saves ?? 0),
      shots: Number(player.Shots ?? 0),
      demolishes: Number(player.Demos ?? 0),
      isMvp: false,
      shortcut: Number.isFinite(shortcut) ? shortcut : undefined,
    };
  });
}

function isTrackedBot(player: SavedReplayPlayer): boolean {
  return isPsyonixBotPlayerId(player.playerId);
}

/** Stable key for roster retention across leaves / bot-fill / shortcut renumbers. */
function trackedPlayerKey(player: SavedReplayPlayer): string {
  const id = player.playerId.trim().toUpperCase();
  if (id && !isPsyonixBotPlayerId(id)) {
    return `id:${id}`;
  }

  // Bots and id-less players: keep distinct by team + name (shortcut changes on leave).
  return `name:${player.team}:${player.playerName.trim().toUpperCase()}`;
}

/**
 * Keep anyone once seen for this match.
 * Ranked leavers disappear from UpdateState with no bot replacement; casual bot-fill
 * reuses Shortcut and may swap PrimaryId to Unknown|0|0 in place.
 */
export function mergeTrackedPlayers(
  previous: SavedReplayPlayer[],
  incoming: SavedReplayPlayer[],
): SavedReplayPlayer[] {
  if (!previous.length) {
    return incoming;
  }
  if (!incoming.length) {
    return previous;
  }

  const retained = new Map<string, SavedReplayPlayer>();
  const previousByShortcut = new Map<number, SavedReplayPlayer>();

  for (const player of previous) {
    retained.set(trackedPlayerKey(player), player);
    if (typeof player.shortcut === "number") {
      previousByShortcut.set(player.shortcut, player);
    }
  }

  for (const player of incoming) {
    const key = trackedPlayerKey(player);

    // Slot reused by someone else (bot-fill or renumber) — freeze the previous occupant.
    if (typeof player.shortcut === "number") {
      const previousOccupant = previousByShortcut.get(player.shortcut);
      if (previousOccupant) {
        const previousKey = trackedPlayerKey(previousOccupant);
        if (previousKey !== key) {
          retained.set(previousKey, previousOccupant);
        }
      }
    }

    const existing = retained.get(key);
    // Never overwrite a real platform player with a Psyonix bot under the same key.
    if (existing && !isTrackedBot(existing) && isTrackedBot(player)) {
      retained.set(
        `bot:${player.team}:${player.shortcut ?? "x"}:${player.playerName.trim().toUpperCase()}`,
        player,
      );
      continue;
    }

    retained.set(key, player);
  }

  return [...retained.values()];
}

function scoresFromUpdate(data: StatsApiUpdateState): {
  team0Score: number;
  team1Score: number;
} {
  const teams = data.Game?.Teams ?? [];
  let team0Score = 0;
  let team1Score = 0;

  for (const team of teams) {
    if (Number(team.TeamNum) === 0) {
      team0Score = Number(team.Score ?? 0);
    } else if (Number(team.TeamNum) === 1) {
      team1Score = Number(team.Score ?? 0);
    }
  }

  // Fallback if Teams array is missing: sum player goals.
  if (teams.length === 0 && data.Players?.length) {
    team0Score = data.Players.filter((player) => Number(player.TeamNum) === 0).reduce(
      (sum, player) => sum + Number(player.Goals ?? 0),
      0,
    );
    team1Score = data.Players.filter((player) => Number(player.TeamNum) === 1).reduce(
      (sum, player) => sum + Number(player.Goals ?? 0),
      0,
    );
  }

  return { team0Score, team1Score };
}

function resolveLocalPlayer(
  players: SavedReplayPlayer[],
  linkedPlayerIds: Set<string>,
): { localPlayerId?: string; localPlayerTeam?: number } {
  if (linkedPlayerIds.size === 0) {
    return {};
  }

  for (const player of players) {
    const id = player.playerId.trim().toUpperCase();
    if (!id) {
      continue;
    }
    if (linkedPlayerIds.has(id) || [...linkedPlayerIds].some((linked) => id.includes(linked) || linked.includes(id))) {
      return { localPlayerId: player.playerId, localPlayerTeam: player.team };
    }
  }

  return {};
}

function resultForTracked(input: {
  status: TrackedMatchStatus;
  winningTeam?: number;
  localPlayerTeam?: number;
}): string {
  if (input.status === "live") {
    return "In Progress";
  }
  if (
    input.winningTeam === undefined ||
    input.winningTeam < 0 ||
    input.localPlayerTeam === undefined
  ) {
    return "Unknown";
  }
  if (input.winningTeam === input.localPlayerTeam) {
    return "Win";
  }
  return "Loss";
}

export function createLiveTrackedMatch(
  matchGuid: string,
  now = new Date(),
): TrackedMatch {
  const iso = now.toISOString();
  return {
    matchGuid: matchGuid.toUpperCase(),
    status: "live",
    mapName: "Unknown",
    team0Score: 0,
    team1Score: 0,
    players: [],
    result: "In Progress",
    startedAt: iso,
    updatedAt: iso,
    // Same unit as PsyNet / SavedReplayRecord: unix seconds.
    recordStartTimestamp: Math.floor(now.getTime() / 1000),
  };
}

export function applyUpdateStateToTrackedMatch(
  current: TrackedMatch,
  data: StatsApiUpdateState,
  linkedPlayerIds: Set<string>,
  now = new Date(),
): TrackedMatch {
  const incomingPlayers = mapStatsApiPlayers(data.Players);
  const players = mergeTrackedPlayers(current.players, incomingPlayers);
  const { team0Score, team1Score } = scoresFromUpdate(data);
  const local = resolveLocalPlayer(players, linkedPlayerIds);
  const mapName = data.Game?.Arena
    ? getMapDisplayName(data.Game.Arena)
    : current.mapName;
  const winningTeam =
    data.Game?.bHasWinner && typeof data.Game.Winner === "number"
      ? data.Game.Winner
      : current.winningTeam;

  const next: TrackedMatch = {
    ...current,
    mapName,
    team0Score,
    team1Score,
    players,
    localPlayerId: local.localPlayerId ?? current.localPlayerId,
    localPlayerTeam: local.localPlayerTeam ?? current.localPlayerTeam,
    winningTeam,
    timeSeconds:
      typeof data.Game?.TimeSeconds === "number"
        ? data.Game.TimeSeconds
        : current.timeSeconds,
    wentToOvertime: Boolean(data.Game?.bOvertime) || current.wentToOvertime,
    updatedAt: now.toISOString(),
  };

  next.result = resultForTracked({
    status: next.status,
    winningTeam: next.winningTeam,
    localPlayerTeam: next.localPlayerTeam,
  });

  return next;
}

export function markTrackedMatchEnded(
  current: TrackedMatch,
  winnerTeamNum: number | undefined,
  now = new Date(),
): TrackedMatch {
  const winningTeam =
    typeof winnerTeamNum === "number" && winnerTeamNum >= 0
      ? winnerTeamNum
      : current.winningTeam;

  const next: TrackedMatch = {
    ...current,
    status: "awaiting_sync",
    winningTeam,
    updatedAt: now.toISOString(),
  };

  next.result = resultForTracked({
    status: next.status,
    winningTeam: next.winningTeam,
    localPlayerTeam: next.localPlayerTeam,
  });

  return next;
}

function trackedMatchSecondsPlayed(match: TrackedMatch): number {
  if (match.status === "live" || match.recordStartTimestamp <= 0) {
    return 0;
  }

  const endMs = Date.parse(match.updatedAt);
  if (!Number.isFinite(endMs)) {
    return 0;
  }

  return Math.max(0, Math.floor(endMs / 1000) - match.recordStartTimestamp);
}

/** List/detail view model compatible with existing replay row rendering. */
export function trackedMatchToReplayView(match: TrackedMatch): SavedReplayRecord & {
  trackedStatus: TrackedMatchStatus;
} {
  return {
    matchGuid: match.matchGuid,
    accountId: "",
    accountDisplayName: "",
    filePath: "",
    fileName: "",
    downloadedAt: match.startedAt,
    playlist: -1,
    playlistName: match.status === "live" ? "Live match" : "Awaiting sync",
    mapName: match.mapName,
    recordStartTimestamp: match.recordStartTimestamp,
    team0Score: match.team0Score,
    team1Score: match.team1Score,
    secondsPlayed: trackedMatchSecondsPlayed(match),
    wentToOvertime: match.wentToOvertime,
    result: match.result,
    winningTeam: match.winningTeam,
    localPlayerTeam: match.localPlayerTeam,
    localPlayerId: match.localPlayerId,
    players: match.players,
    source: "synced",
    trackedStatus: match.status,
  };
}

export function isTrackedReplayView(
  replay: SavedReplayRecord,
): replay is SavedReplayRecord & { trackedStatus: TrackedMatchStatus } {
  return (
    "trackedStatus" in replay &&
    (replay.trackedStatus === "live" || replay.trackedStatus === "awaiting_sync")
  );
}
