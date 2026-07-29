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

export function findLocalPlayer(
  players: Array<{ PlayerID: string; PlayerName: string; Goals: number; Assists: number; Saves: number; bMvp: boolean }>,
  localPlayerId: string,
) {
  return players.find((player) => player.PlayerID === localPlayerId);
}
