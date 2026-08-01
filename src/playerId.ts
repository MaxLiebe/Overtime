export type Platform = "Epic" | "Steam" | "PS4" | "XboxOne" | "Switch";

export type PlayerId = string;

export function newPlayerId(platform: Platform, id: string): PlayerId {
  return `${platform}|${id}|0`;
}

export function parsePlayerId(playerId: string): { platform: Platform; id: string } {
  const parts = playerId.split("|");
  if (parts.length !== 3) {
    throw new Error(`invalid PlayerID format: ${playerId}`);
  }
  return { platform: parts[0] as Platform, id: parts[1] };
}
