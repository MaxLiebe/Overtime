export type Platform = "Epic" | "Steam" | "PS4" | "XboxOne" | "Switch";

export type PlayerId = string;

export function newPlayerId(platform: Platform, id: string): PlayerId {
  return `${platform}|${id}|0`;
}
