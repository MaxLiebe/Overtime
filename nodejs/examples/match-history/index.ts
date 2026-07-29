import { authenticate } from "../../src/auth.js";
import { getRecentMatches } from "../../src/matches.js";
import {
  findLocalPlayer,
  formatDuration,
  formatScore,
  formatTimestamp,
  getPlaylistName,
} from "../../src/format.js";

const MATCH_LIMIT = 20;

async function main(): Promise<void> {
  console.log("Authenticating with Epic Games...");
  const { rpc, displayName, accountId } = await authenticate();
  console.log(`Logged in as ${displayName} (${accountId})\n`);

  console.log(`Fetching ${MATCH_LIMIT} most recent matches...`);
  const matches = await getRecentMatches(rpc, MATCH_LIMIT);

  if (matches.length === 0) {
    console.log("No matches found.");
    await rpc.close();
    return;
  }

  console.log(`Found ${matches.length} match(es):\n`);

  for (const [index, entry] of matches.entries()) {
    const match = entry.Match;
    const localPlayer = findLocalPlayer(match.Players, rpc.localPlayerId);
    const playlist = getPlaylistName(match.Playlist);
    const date = formatTimestamp(match.RecordStartTimestamp);
    const duration = formatDuration(match.SecondsPlayed);
    const score = formatScore(match.Team0Score, match.Team1Score);

    const result =
      match.bNoContest ? "No contest" :
      match.bForfeit ? "Forfeit" :
      match.WinningTeam === -1 ? "Tie" :
      localPlayer && localPlayer.LastTeam === match.WinningTeam ? "Win" :
      localPlayer ? "Loss" :
      "Unknown";

    console.log(`${index + 1}. ${playlist}`);
    console.log(`   Date:     ${date}`);
    console.log(`   Map:      ${match.MapName}`);
    console.log(`   Score:    ${score}`);
    console.log(`   Duration: ${duration}`);
    console.log(`   Result:   ${result}`);

    if (localPlayer) {
      const stats = [
        localPlayer.Goals > 0 ? `${localPlayer.Goals}G` : null,
        localPlayer.Assists > 0 ? `${localPlayer.Assists}A` : null,
        localPlayer.Saves > 0 ? `${localPlayer.Saves}S` : null,
        localPlayer.bMvp ? "MVP" : null,
      ].filter(Boolean);

      if (stats.length > 0) {
        console.log(`   Stats:    ${stats.join(" ")}`);
      }
    }

    if (entry.ReplayUrl) {
      console.log(`   Replay:   ${entry.ReplayUrl}`);
    }

    console.log();
  }

  await rpc.close();
}

main().catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
