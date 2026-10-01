import type { PsyNetRPC } from "./psynetRpc.js";
import type { GetMatchHistoryResponse, MatchEntry } from "./types.js";

export async function getMatchHistory(
  rpc: PsyNetRPC,
  signal?: AbortSignal,
): Promise<MatchEntry[]> {
  const result = await rpc.sendRequestSync<GetMatchHistoryResponse>(
    "Matches/GetMatchHistory v1",
    { PlayerID: rpc.localPlayerId },
    signal,
  );

  return result.Matches ?? [];
}
