import { getProPlayerProfile, type ProPlayerProfile } from "./proPlayers.js";

export async function resolveProPlayerProfile(
  playerId: string,
  playerName: string,
): Promise<ProPlayerProfile | null> {
  return getProPlayerProfile(playerId, playerName) ?? null;
}
