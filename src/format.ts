import { getMapDisplayName } from "./maps.js";
import type { Match } from "./types.js";
import type { SavedReplayRecord, ReplaySortBy } from "./store.js";

const PLAYLIST_NAMES: Record<number, string> = {
  0: "Exhibition",
  1: "Duel",
  2: "Doubles",
  3: "Standard",
  4: "Chaos",
  6: "Private Match",
  10: "Ranked Duel",
  11: "Ranked Doubles",
  13: "Ranked Standard",
  27: "Hoops",
  28: "Rumble",
  29: "Dropshot",
  30: "Snow Day",
  34: "Tournament",
  61: "Ranked Hoops",
  62: "Ranked Rumble",
  63: "Ranked Dropshot",
  64: "Ranked Snow Day",
};

export function getPlaylistName(playlistId: number): string {
  return PLAYLIST_NAMES[playlistId] ?? `Playlist ${playlistId}`;
}

const RANKED_PLAYLISTS = new Set([10, 11, 13, 61, 62, 63, 64]);

const PLAYLIST_MODE_LABEL: Record<number, string> = {
  1: "1v1",
  2: "2v2",
  3: "3v3",
  10: "1v1",
  11: "2v2",
  13: "3v3",
  27: "Hoops",
  28: "Rumble",
  29: "Dropshot",
  30: "Snow Day",
  61: "Hoops",
  62: "Rumble",
  63: "Dropshot",
  64: "Snow Day",
};

export function getPlaylistDisplayName(playlistId: number): string {
  const modeLabel = PLAYLIST_MODE_LABEL[playlistId];
  if (modeLabel) {
    const tier = RANKED_PLAYLISTS.has(playlistId) ? "Ranked" : "Casual";
    return `${tier} ${modeLabel}`;
  }

  return getPlaylistName(playlistId);
}

const PLAYLIST_SEARCH_ALIASES: Record<string, readonly number[]> = {
  "1s": [10],
  "2s": [11],
  "3s": [13],
};

export function getPlaylistIdsForSearchQuery(query: string): readonly number[] | null {
  const normalized = query.trim().toLowerCase();
  return PLAYLIST_SEARCH_ALIASES[normalized] ?? null;
}

export type ReplayPlayerPlatform = "steam" | "epic" | "ps4" | "xboxone" | "switch" | "unknown";

export interface ReplaySearchFields {
  playlist: number;
  playlistName?: string;
  mapName?: string;
  result?: string;
  accountDisplayName?: string;
  fileName?: string;
  replayName?: string;
  source?: string;
  players?: Array<{ playerName: string; playerId?: string; isPro?: boolean }>;
}

export function replayMatchesSearchQuery(
  replay: ReplaySearchFields,
  query: string,
  formatMapName: (mapName: string) => string = (mapName) => mapName,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return true;
  }

  const playlistFilter = getPlaylistIdsForSearchQuery(trimmed);
  if (playlistFilter) {
    return playlistFilter.includes(replay.playlist);
  }

  const platformFilter = getPlatformsForSearchQuery(trimmed);
  if (platformFilter) {
    return replayHasPlayerOnPlatform(replay, platformFilter);
  }

  const normalized = trimmed.toLowerCase();
  if (normalized === "pro") {
    return replay.players?.some((player) => player.isPro) ?? false;
  }

  const haystack = [
    replay.playlistName,
    getPlaylistDisplayName(replay.playlist),
    replay.mapName,
    formatMapName(replay.mapName ?? ""),
    replay.result,
    replay.accountDisplayName,
    replay.fileName,
    replay.replayName ?? "",
    replay.source ?? "synced",
    ...(replay.players?.map((player) => player.playerName) ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatScore(team0: number, team1: number): string {
  return `${team0} - ${team1}`;
}

export function getSteamCommunityProfileUrl(steam64Id: string): string | undefined {
  const trimmed = steam64Id.trim();
  if (!/^\d{17}$/.test(trimmed)) {
    return undefined;
  }

  return `https://steamcommunity.com/profiles/${trimmed}`;
}

const PLATFORM_SEARCH_ALIASES: Record<string, readonly ReplayPlayerPlatform[]> = {
  steam: ["steam"],
  pc: ["steam", "epic"],
  computer: ["steam", "epic"],
  epic: ["epic"],
  eg: ["epic"],
  ps4: ["ps4"],
  ps5: ["ps4"],
  playstation: ["ps4"],
  psn: ["ps4"],
  sony: ["ps4"],
  xbox: ["xboxone"],
  xboxone: ["xboxone"],
  xbl: ["xboxone"],
  switch: ["switch"],
  nintendo: ["switch"],
};

export function getPlatformsForSearchQuery(
  query: string,
): readonly ReplayPlayerPlatform[] | null {
  const normalized = query.trim().toLowerCase();
  return PLATFORM_SEARCH_ALIASES[normalized] ?? null;
}

export function replayHasPlayerOnPlatform(
  replay: { players?: Array<{ playerId?: string }> },
  platforms: readonly ReplayPlayerPlatform[],
): boolean {
  if (!replay.players?.length) {
    return false;
  }

  const allowed = new Set(platforms);
  return replay.players.some((player) => {
    if (!player.playerId) {
      return false;
    }

    const { platform } = parseReplayPlayerPlatform(player.playerId);
    return allowed.has(platform);
  });
}

export interface ParsedReplayPlayerPlatform {
  platform: ReplayPlayerPlatform;
  platformId: string;
}

export function parseReplayPlayerPlatform(playerId: string): ParsedReplayPlayerPlatform {
  const parts = playerId.split("|");
  if (parts.length === 3) {
    const platform = parts[0].trim().toLowerCase();
    const platformId = parts[1].trim();

    switch (platform) {
      case "steam":
      case "epic":
      case "ps4":
      case "xboxone":
      case "switch":
        return { platform, platformId };
      default:
        return { platform: "unknown", platformId };
    }
  }

  return { platform: "epic", platformId: playerId.trim() };
}

/** SteamID64 for Amalox (Overtime developer). */
export const OVERTIME_DEV_STEAM_ID = "76561198163847840";

export const OVERTIME_DEV_YOUTUBE_URL = "https://www.youtube.com/@imamalox";

/** True when this player id is the Overtime developer's Steam account. */
export function isOvertimeDeveloperPlayerId(playerId: string | undefined | null): boolean {
  const raw = String(playerId ?? "").trim();
  if (!raw) {
    return false;
  }

  if (raw.includes(OVERTIME_DEV_STEAM_ID)) {
    return true;
  }

  const { platform, platformId } = parseReplayPlayerPlatform(raw);
  return platform === "steam" && platformId === OVERTIME_DEV_STEAM_ID;
}

/** Psyonix bots in private matches share PrimaryId `Unknown|0|0`. */
export function isPsyonixBotPlayerId(playerId: string | undefined | null): boolean {
  const normalized = String(playerId ?? "")
    .trim()
    .toUpperCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "UNKNOWN|0|0" || normalized === "UNKNOWN") {
    return true;
  }

  const parts = normalized.split("|");
  return parts[0] === "UNKNOWN";
}

export function playerMatchesAccount(playerId: string, accountId: string): boolean {
  if (!playerId || !accountId) {
    return false;
  }
  if (playerId === accountId) {
    return true;
  }
  const parts = playerId.split("|");
  if (parts.length === 3 && parts[1] === accountId) {
    return true;
  }
  return playerId.includes(accountId);
}

function normalizeDisplayNameForMatch(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function displayNamesMatch(replayName: string, accountName: string): boolean {
  const left = replayName.trim();
  const right = accountName.trim();
  if (!left || !right) {
    return false;
  }

  if (
    left.localeCompare(right, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return true;
  }

  const normalizedLeft = normalizeDisplayNameForMatch(left);
  const normalizedRight = normalizeDisplayNameForMatch(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

export function platformIdsMatch(
  replayPlatformId: string | undefined,
  accountPlatformPlayerId: string | undefined,
): boolean {
  if (!replayPlatformId || !accountPlatformPlayerId) {
    return false;
  }

  const accountParts = accountPlatformPlayerId.split("|");
  if (accountParts.length < 2) {
    return false;
  }

  return replayPlatformId === accountParts[1];
}

export function playerMatchesLinkedAccount(
  player: { playerId: string; playerName: string },
  account: {
    accountId: string;
    displayName: string;
    platformPlayerId?: string;
  },
  hints?: {
    platformId?: string;
    epicAccountId?: string;
  },
): boolean {
  if (hints?.platformId && platformIdsMatch(hints.platformId, account.platformPlayerId)) {
    return true;
  }

  if (hints?.epicAccountId && hints.epicAccountId === account.accountId) {
    return true;
  }

  if (playerMatchesAccount(player.playerId, account.accountId)) {
    return true;
  }

  if (platformIdsMatch(player.playerId.split("|")[1], account.platformPlayerId)) {
    return true;
  }

  return displayNamesMatch(player.playerName, account.displayName);
}

export interface LocalPlayerLookup {
  epicPlayerId: string;
  accountId?: string;
  displayName?: string;
  platformPlayerId?: string;
}

export function resolveLocalPlayerInMatch<
  T extends { PlayerID: string; PlayerName: string; LastTeam: number },
>(players: T[], lookup: LocalPlayerLookup): T | undefined {
  if (lookup.platformPlayerId) {
    const byPlatform = players.find((player) => player.PlayerID === lookup.platformPlayerId);
    if (byPlatform) {
      return byPlatform;
    }
  }

  const byEpic = findLocalPlayer(players, lookup.epicPlayerId);
  if (byEpic) {
    return byEpic;
  }

  if (lookup.accountId) {
    const byAccount = players.find((player) =>
      playerMatchesAccount(player.PlayerID, lookup.accountId!),
    );
    if (byAccount) {
      return byAccount;
    }
  }

  if (lookup.displayName) {
    const normalized = lookup.displayName.trim().toLowerCase();
    const byName = players.find(
      (player) => player.PlayerName.trim().toLowerCase() === normalized,
    );
    if (byName) {
      return byName;
    }
  }

  return undefined;
}

export function discoverPlatformPlayerId(
  entries: Array<{ Match: { Players: Array<{ PlayerID: string }> } }>,
  lookup: LocalPlayerLookup,
): string | undefined {
  if (lookup.platformPlayerId) {
    return lookup.platformPlayerId;
  }

  for (const entry of entries) {
    for (const player of entry.Match.Players) {
      if (player.PlayerID === lookup.epicPlayerId) {
        return player.PlayerID;
      }
      if (lookup.accountId && playerMatchesAccount(player.PlayerID, lookup.accountId)) {
        return player.PlayerID;
      }
    }
  }

  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const player of entry.Match.Players) {
      counts.set(player.PlayerID, (counts.get(player.PlayerID) ?? 0) + 1);
    }
  }

  let bestId: string | undefined;
  let bestCount = 0;
  for (const [playerId, count] of counts) {
    if (count > bestCount) {
      bestId = playerId;
      bestCount = count;
    }
  }

  return bestId;
}

export function discoverPlatformPlayerIdFromReplays(
  replays: Array<{ players?: Array<{ playerId: string }> }>,
): string | undefined {
  const counts = new Map<string, number>();
  for (const replay of replays) {
    for (const player of replay.players ?? []) {
      counts.set(player.playerId, (counts.get(player.playerId) ?? 0) + 1);
    }
  }

  let bestId: string | undefined;
  let bestCount = 0;
  for (const [playerId, count] of counts) {
    if (count > bestCount) {
      bestId = playerId;
      bestCount = count;
    }
  }

  return bestId;
}

export function findLocalPlayer<
  T extends { PlayerID: string; LastTeam?: number },
>(players: T[], localPlayerId: string): T | undefined {
  const exact = players.find((player) => player.PlayerID === localPlayerId);
  if (exact) {
    return exact;
  }

  const accountId = localPlayerId.split("|")[1] ?? localPlayerId;
  return players.find((player) => {
    if (player.PlayerID === accountId) {
      return true;
    }
    const parts = player.PlayerID.split("|");
    return parts.length === 3 && parts[1] === accountId;
  });
}

export function getMatchResult(
  match: {
    bNoContest: boolean;
    bForfeit: boolean;
    WinningTeam: number;
    Players: Array<{ PlayerID: string; LastTeam: number; PlayerName?: string }>;
  },
  localPlayerId: string,
  lookup?: LocalPlayerLookup,
): string {
  if (match.bNoContest) {
    return "No contest";
  }

  const localPlayer = lookup
    ? resolveLocalPlayerInMatch(match.Players as Array<{ PlayerID: string; PlayerName: string; LastTeam: number }>, lookup)
    : findLocalPlayer(match.Players, localPlayerId);

  if (!localPlayer) {
    return "Unknown";
  }
  if (match.WinningTeam === -1) {
    return "Tie";
  }

  const outcome = localPlayer.LastTeam === match.WinningTeam ? "Win" : "Loss";
  return outcome;
}

export function isCloudOnlyReplay(replay: SavedReplayRecord): boolean {
  if (replay.cloudOnly) {
    return true;
  }

  return !replay.filePath?.trim() && Boolean(replay.ballchasingId);
}

export function getReplaySortTimestamp(
  replay: SavedReplayRecord,
  sortBy: ReplaySortBy = "match",
): number {
  if (sortBy === "match") {
    return replay.recordStartTimestamp;
  }

  const importedAt = replay.importedAt?.trim();
  if (importedAt) {
    const parsed = Date.parse(importedAt);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  const downloadedAt = replay.downloadedAt?.trim();
  if (downloadedAt) {
    const parsed = Date.parse(downloadedAt);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return replay.recordStartTimestamp;
}

export function getReplayDisplayTimestamp(
  replay: SavedReplayRecord,
  sortBy: ReplaySortBy = "match",
): number {
  return getReplaySortTimestamp(replay, sortBy);
}

export function getReplayDisplayTimestampTitle(
  replay: SavedReplayRecord,
  sortBy: ReplaySortBy = "match",
): string | undefined {
  if (sortBy === "import") {
    return `Match played ${formatTimestamp(replay.recordStartTimestamp)}`;
  }

  if (replay.source === "imported" || replay.importedAt) {
    const importTs = getReplaySortTimestamp(replay, "import");
    if (importTs !== replay.recordStartTimestamp) {
      return `Imported ${formatTimestamp(importTs)}`;
    }
  }

  return undefined;
}

export function getReplayDisplayName(replay: SavedReplayRecord): string {
  const replayName = replay.replayName?.trim();
  if (replayName) {
    return replayName;
  }

  return buildReplaySummaryLabel(replay);
}

export interface ReplaySummaryFields {
  replayName?: string;
  playlist: number;
  mapName: string;
  team0Score: number;
  team1Score: number;
  secondsPlayed: number;
  overtimeSecondsPlayed?: number;
  wentToOvertime?: boolean;
  result?: string;
  winningTeam?: number;
  localPlayerTeam?: number;
}

const INVALID_REPLAY_FILE_NAME_CHARS = /[\\/:*?"<>|]/g;

export function sanitizeReplayFileName(input: string): string {
  return input
    .trim()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(INVALID_REPLAY_FILE_NAME_CHARS, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();
}

export function sanitizeReplayExportFileName(input: string): string {
  return sanitizeReplayFileName(
    input
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00b7/g, " - ")
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function getReplayOutcomeLetter(
  fields: ReplaySummaryFields,
): "W" | "L" | "D" {
  const normalized = String(fields.result ?? "").trim().toLowerCase();
  if (normalized === "win") {
    return "W";
  }
  if (normalized === "loss") {
    return "L";
  }
  if (normalized === "tie" || normalized === "draw" || normalized === "no contest") {
    return "D";
  }

  const localTeam = fields.localPlayerTeam;
  const winningTeam = fields.winningTeam;
  if (typeof localTeam === "number" && typeof winningTeam === "number") {
    if (winningTeam === -1) {
      return "D";
    }
    if (winningTeam >= 0) {
      return localTeam === winningTeam ? "W" : "L";
    }
  }

  if (fields.team0Score === fields.team1Score) {
    return "D";
  }

  return "D";
}

export function formatReplayDurationFileLabel(
  fields: Pick<
    ReplaySummaryFields,
    "secondsPlayed" | "overtimeSecondsPlayed" | "wentToOvertime"
  >,
): string {
  const mins = Math.floor(fields.secondsPlayed / 60);
  const secs = Math.floor(fields.secondsPlayed % 60);
  let total = `${mins}m${secs.toString().padStart(2, "0")}s`;
  const overtimeSeconds = fields.overtimeSecondsPlayed ?? 0;

  if (overtimeSeconds > 0) {
    const otMins = Math.floor(overtimeSeconds / 60);
    const otSecs = Math.floor(overtimeSeconds % 60);
    total += ` +${otMins}m${otSecs.toString().padStart(2, "0")}s OT`;
  } else if (fields.wentToOvertime) {
    total += " OT";
  }

  return total;
}

export function formatReplayDurationLabel(
  fields: Pick<
    ReplaySummaryFields,
    "secondsPlayed" | "overtimeSecondsPlayed" | "wentToOvertime"
  >,
): string {
  const total = formatDuration(fields.secondsPlayed);
  const overtimeSeconds = fields.overtimeSecondsPlayed ?? 0;

  if (overtimeSeconds > 0) {
    return `${total} (+${formatDuration(overtimeSeconds)} OT)`;
  }

  if (fields.wentToOvertime) {
    return `${total} (OT)`;
  }

  return total;
}

export function buildReplaySummaryLabel(fields: ReplaySummaryFields): string {
  const replayName = fields.replayName?.trim();
  if (replayName) {
    return sanitizeReplayFileName(replayName);
  }

  const outcome = getReplayOutcomeLetter(fields);
  const playlist = getPlaylistDisplayName(fields.playlist);
  const score = `${fields.team0Score}–${fields.team1Score}`;
  const mapName = getMapDisplayName(fields.mapName);
  const duration = formatReplayDurationLabel(fields);

  return `${outcome} · ${playlist} · ${score} · ${mapName} · ${duration}`;
}

export function buildBallchasingReplayTitle(replay: SavedReplayRecord): string {
  return getReplayDisplayName(replay);
}

export function buildReplayExportFileName(replay: SavedReplayRecord): string {
  const replayName = replay.replayName?.trim();
  if (replayName) {
    return `${sanitizeReplayExportFileName(replayName)}.replay`;
  }

  const outcome = getReplayOutcomeLetter(replay);
  const playlist = getPlaylistDisplayName(replay.playlist);
  const score = `${replay.team0Score}-${replay.team1Score}`;
  const mapName = getMapDisplayName(replay.mapName);
  const duration = formatReplayDurationFileLabel(replay);
  const label = `${outcome} - ${playlist} - ${score} - ${mapName} - ${duration}`;

  return `${sanitizeReplayExportFileName(label)}.replay`;
}

export interface ReplayFileNameContext {
  localPlayerId?: string;
  lookup?: LocalPlayerLookup;
}

export function buildReplaySyncFileName(
  match: Match,
  context?: ReplayFileNameContext,
): string {
  const localPlayer = context?.lookup
    ? resolveLocalPlayerInMatch(match.Players, context.lookup)
    : context?.localPlayerId
      ? findLocalPlayer(match.Players, context.localPlayerId)
      : undefined;

  const result =
    localPlayer && context?.localPlayerId
      ? getMatchResult(match, context.localPlayerId, context.lookup)
      : undefined;

  const outcome = getReplayOutcomeLetter({
    playlist: match.Playlist,
    mapName: match.MapName,
    team0Score: match.Team0Score,
    team1Score: match.Team1Score,
    secondsPlayed: match.SecondsPlayed,
    overtimeSecondsPlayed: match.OvertimeSecondsPlayed,
    wentToOvertime: match.bOverTime,
    result,
    winningTeam: match.WinningTeam,
    localPlayerTeam: localPlayer?.LastTeam,
  });
  const playlist = getPlaylistDisplayName(match.Playlist);
  const score = `${match.Team0Score}-${match.Team1Score}`;
  const mapName = getMapDisplayName(match.MapName);
  const duration = formatReplayDurationFileLabel({
    secondsPlayed: match.SecondsPlayed,
    overtimeSecondsPlayed: match.OvertimeSecondsPlayed,
    wentToOvertime: match.bOverTime,
  });
  const label = `${outcome} - ${playlist} - ${score} - ${mapName} - ${duration}`;

  return `${sanitizeReplayExportFileName(label)}.replay`;
}
