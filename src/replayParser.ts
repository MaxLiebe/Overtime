import { createRequire } from "node:module";
import { CborDecoder } from "@jsonjoy.com/json-pack/lib/cbor/index.js";
import { getMapDisplayName } from "./maps.js";
import {
  getPlaylistDisplayName,
  getPlaylistIdsForSearchQuery,
  getPlaylistName,
  playerMatchesLinkedAccount,
  replayMatchesSearchQuery,
} from "./format.js";
import type { LinkedAccount } from "./accounts.js";
import { isProPlayer } from "./proPlayers.js";
import type { SavedReplayPlayer, SavedReplayRecord } from "./store.js";

const require = createRequire(import.meta.url);
const { readFileHeader } = require("@kant/node-boxcars") as {
  readFileHeader: (filename: string) => Uint8Array;
};

const decoder = new CborDecoder();

interface BoxcarsStruct {
  name?: string;
  fields?: Record<string, unknown>;
}

interface BoxcarsPlayerStat {
  Name?: string;
  Team?: number;
  Score?: number;
  Goals?: number;
  Assists?: number;
  Saves?: number;
  Shots?: number;
  Demolishes?: number;
  bBot?: boolean;
  bMVP?: boolean;
  OnlineID?: string;
  PlayerID?: BoxcarsStruct;
  Platform?: { kind?: string; value?: string };
}

interface ParsedReplayHeader {
  game_type?: string;
  properties?: Record<string, unknown>;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function readStructField(struct: unknown, key: string): unknown {
  if (!struct || typeof struct !== "object") {
    return undefined;
  }

  const fields = (struct as BoxcarsStruct).fields;
  if (!fields || typeof fields !== "object") {
    return undefined;
  }

  return fields[key];
}

function readPlatformFromStat(player: BoxcarsPlayerStat): string {
  const direct = player.Platform?.value;
  if (direct) {
    return direct.replace(/^OnlinePlatform_/, "");
  }

  const nested = readStructField(player.PlayerID, "Platform") as
    | { value?: string }
    | undefined;
  return nested?.value?.replace(/^OnlinePlatform_/, "") ?? "Epic";
}

function readPlatformId(player: BoxcarsPlayerStat): string | undefined {
  const onlineId = asString(player.OnlineID);
  if (onlineId && onlineId !== "0") {
    return onlineId;
  }

  const uid = asString(readStructField(player.PlayerID, "Uid"));
  if (uid && uid !== "0") {
    return uid;
  }

  const epicAccountId = asString(readStructField(player.PlayerID, "EpicAccountId"));
  if (epicAccountId) {
    return epicAccountId;
  }

  return undefined;
}

function readEpicAccountId(player: BoxcarsPlayerStat): string | undefined {
  const epicAccountId = asString(readStructField(player.PlayerID, "EpicAccountId"));
  return epicAccountId || undefined;
}

function formatReplayPlayerId(player: BoxcarsPlayerStat): string {
  const name = player.Name?.trim() ?? "Unknown";
  const platform = readPlatformFromStat(player);
  const platformId = readPlatformId(player);

  if (platformId) {
    return `${platform}|${platformId}|${name}`;
  }

  return name;
}

function inferPlaylistId(matchType: string | undefined, teamSize: number): number {
  const normalized = (matchType ?? "").trim().toLowerCase();

  if (normalized.includes("private")) {
    return 6;
  }

  if (normalized.includes("offline") || normalized === "local") {
    if (teamSize === 1) {
      return 1;
    }
    if (teamSize === 2) {
      return 2;
    }
    if (teamSize === 3) {
      return 3;
    }
    return 0;
  }

  if (teamSize === 1) {
    return 10;
  }
  if (teamSize === 2) {
    return 11;
  }
  if (teamSize === 3) {
    return 13;
  }

  return 0;
}

function inferWinningTeam(team0Score: number, team1Score: number): number {
  if (team0Score > team1Score) {
    return 0;
  }
  if (team1Score > team0Score) {
    return 1;
  }
  return -1;
}

function teamColorForTeam(team: number): string {
  return team === 0 ? "Blue" : "Orange";
}

function normalizeSoccarTeams(players: SavedReplayPlayer[]): SavedReplayPlayer[] {
  const counts = new Map<number, number>();
  for (const player of players) {
    if (player.team >= 0) {
      counts.set(player.team, (counts.get(player.team) ?? 0) + 1);
    }
  }

  const rankedTeams = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, 2)
    .map(([team]) => team)
    .sort((left, right) => left - right);

  if (rankedTeams.length === 0) {
    return players.filter((player) => player.team === 0 || player.team === 1);
  }

  const remap = new Map<number, number>();
  remap.set(rankedTeams[0], 0);
  if (rankedTeams.length > 1) {
    remap.set(rankedTeams[1], 1);
  }

  return players
    .filter((player) => remap.has(player.team))
    .map((player) => {
      const team = remap.get(player.team)!;
      return {
        ...player,
        team,
        teamColor: teamColorForTeam(team),
      };
    });
}

function mapPlayerStats(players: BoxcarsPlayerStat[]): {
  players: SavedReplayPlayer[];
  rawByName: Map<string, BoxcarsPlayerStat>;
} {
  const rawByName = new Map<string, BoxcarsPlayerStat>();
  const mapped = players
    .filter((player) => player.Name && !player.bBot)
    .map((player) => {
      const playerName = player.Name!.trim();
      rawByName.set(playerName, player);
      return {
        playerId: formatReplayPlayerId(player),
        playerName,
        team: asNumber(player.Team),
        teamColor: teamColorForTeam(asNumber(player.Team)),
        score: asNumber(player.Score),
        goals: asNumber(player.Goals),
        assists: asNumber(player.Assists),
        saves: asNumber(player.Saves),
        shots: asNumber(player.Shots),
        demolishes: asNumber(player.Demolishes),
        isMvp: Boolean(player.bMVP),
        isPro: isProPlayer(formatReplayPlayerId(player), playerName),
      };
    });

  const normalized = normalizeSoccarTeams(mapped);

  if (!normalized.some((player) => player.isMvp) && normalized.length > 0) {
    let best = normalized[0];
    for (const player of normalized) {
      if (player.score > best.score) {
        best = player;
      }
    }
    best.isMvp = true;
  }

  return { players: normalized, rawByName };
}

function findMatchingAccountFromPlayers(
  players: SavedReplayPlayer[],
  accounts: LinkedAccount[],
  rawByName: Map<string, BoxcarsPlayerStat>,
): LinkedAccount | null {
  for (const account of accounts) {
    const matched = players.find((player) => {
      const raw = rawByName.get(player.playerName);
      return playerMatchesLinkedAccount(player, account, {
        platformId: raw ? readPlatformId(raw) : undefined,
        epicAccountId: raw ? readEpicAccountId(raw) : undefined,
      });
    });
    if (matched) {
      return account;
    }
  }
  return null;
}

function findLocalPlayerForAccount(
  players: SavedReplayPlayer[],
  account: LinkedAccount,
  rawByName: Map<string, BoxcarsPlayerStat>,
): SavedReplayPlayer | undefined {
  return players.find((player) => {
    const raw = rawByName.get(player.playerName);
    return playerMatchesLinkedAccount(player, account, {
      platformId: raw ? readPlatformId(raw) : undefined,
      epicAccountId: raw ? readEpicAccountId(raw) : undefined,
    });
  });
}

function getImportedMatchResult(
  localPlayer: SavedReplayPlayer | undefined,
  team0Score: number,
  team1Score: number,
  winningTeam: number,
  forfeited: boolean,
): string {
  if (!localPlayer) {
    return "Unknown";
  }

  if (forfeited) {
    return localPlayer.team === winningTeam ? "Win" : "Loss";
  }

  if (winningTeam === -1) {
    return "Tie";
  }

  return localPlayer.team === winningTeam ? "Win" : "Loss";
}

export function parseReplayHeader(filePath: string): ParsedReplayHeader {
  return decoder.decode(readFileHeader(filePath)) as ParsedReplayHeader;
}

export function readReplayMatchGuid(filePath: string): string | null {
  return readReplayIndexMeta(filePath).matchGuid;
}

/** Lightweight header fields used while indexing the replay library. */
export function readReplayIndexMeta(filePath: string): {
  matchGuid: string | null;
  matchStartEpoch: number;
} {
  try {
    const header = parseReplayHeader(filePath);
    const matchGuid = asString(header.properties?.MatchGUID);
    return {
      matchGuid: matchGuid ? matchGuid.toUpperCase() : null,
      matchStartEpoch: asNumber(header.properties?.MatchStartEpoch),
    };
  } catch {
    return { matchGuid: null, matchStartEpoch: 0 };
  }
}

export function buildImportedReplayRecordFromFile(
  entry: {
    matchGuid: string;
    filePath: string;
    fileName: string;
    recordStartTimestamp: number;
    importedAt?: string;
  },
  accounts: LinkedAccount[],
): SavedReplayRecord {
  const header = parseReplayHeader(entry.filePath);
  const properties = header.properties ?? {};

  const team0Score = asNumber(properties.Team0Score);
  const team1Score = asNumber(properties.Team1Score);
  const teamSize = asNumber(properties.TeamSize, 3);
  const matchType = asString(properties.MatchType);
  const playlist = inferPlaylistId(matchType, teamSize);
  const mapName = asString(properties.MapName) ?? "Unknown";
  const secondsPlayed = Math.round(asNumber(properties.TotalSecondsPlayed));
  const winningTeam = asNumber(properties.WinningTeam, inferWinningTeam(team0Score, team1Score));
  const forfeited = Boolean(properties.bForfeit);
  const { players, rawByName } = mapPlayerStats(
    Array.isArray(properties.PlayerStats)
      ? (properties.PlayerStats as BoxcarsPlayerStat[])
      : [],
  );

  const matchedAccount = findMatchingAccountFromPlayers(players, accounts, rawByName);
  const localPlayer = matchedAccount
    ? findLocalPlayerForAccount(players, matchedAccount, rawByName)
    : undefined;

  const recordStartTimestamp =
    asNumber(properties.MatchStartEpoch) || entry.recordStartTimestamp;

  const replayName = asString(properties.ReplayName)?.trim();
  const importedAt = entry.importedAt ?? new Date().toISOString();

  return {
    // Keep the library identity from the index entry. Header MatchGUID can differ
    // from filename/meta-derived IDs and would make uploads/cloud-only "lose" the row.
    matchGuid: entry.matchGuid.toUpperCase(),
    accountId: matchedAccount?.accountId ?? "",
    accountDisplayName: matchedAccount?.displayName ?? "",
    filePath: entry.filePath,
    fileName: entry.fileName,
    replayName: replayName || undefined,
    downloadedAt: importedAt,
    importedAt,
    playlist,
    playlistName: getPlaylistDisplayName(playlist),
    mapName: getMapDisplayName(mapName),
    recordStartTimestamp,
    team0Score,
    team1Score,
    secondsPlayed,
    result: getImportedMatchResult(
      localPlayer,
      team0Score,
      team1Score,
      winningTeam,
      forfeited,
    ),
    winningTeam: winningTeam >= 0 ? winningTeam : undefined,
    localPlayerTeam: localPlayer?.team,
    localPlayerId: localPlayer?.playerId,
    isForfeit: forfeited,
    players,
    source: "imported",
    hasAccountMatch: Boolean(matchedAccount),
  };
}

export function replayPropertiesMatchSearch(
  properties: Record<string, unknown>,
  players: SavedReplayPlayer[],
  query: string,
): boolean {
  const playlist = inferPlaylistId(
    asString(properties.MatchType),
    asNumber(properties.TeamSize, 3),
  );

  const playlistFilter = getPlaylistIdsForSearchQuery(query);
  if (playlistFilter) {
    return playlistFilter.includes(playlist);
  }

  return replayMatchesSearchQuery(
    {
      playlist,
      playlistName: getPlaylistName(playlist),
      mapName: asString(properties.MapName),
      result: asString(properties.MatchType),
      fileName: "imported",
      source: "imported",
      players,
    },
    query,
    getMapDisplayName,
  );
}

export function replayHeaderMatchesSearch(filePath: string, query: string): boolean {
  try {
    const header = parseReplayHeader(filePath);
    const properties = header.properties ?? {};
    const players = mapPlayerStats(
      Array.isArray(properties.PlayerStats)
        ? (properties.PlayerStats as BoxcarsPlayerStat[])
        : [],
    ).players;
    return replayPropertiesMatchSearch(properties, players, query);
  } catch {
    return basename(filePath).toLowerCase().includes(query);
  }
}

function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}
