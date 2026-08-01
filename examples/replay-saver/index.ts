import { authenticate } from "../../src/auth.js";
import { getMatchHistory } from "../../src/matches.js";
import {
  getDefaultReplayDir,
  replayDirExists,
  syncReplays,
} from "../../src/replays.js";
import { formatTimestamp, getPlaylistName } from "../../src/format.js";

const POLL_INTERVAL_MS = 10 * 60 * 1000;
const replayDir = process.env.RL_REPLAY_DIR ?? getDefaultReplayDir();

let running = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function runSync(): Promise<void> {
  if (running) {
    console.log("Previous sync still running, skipping this cycle.");
    return;
  }

  running = true;
  const startedAt = new Date();

  try {
    console.log(`[${startedAt.toLocaleString()}] Checking for new replays...`);

    const { rpc, displayName } = await authenticate();
    try {
      const matches = await getMatchHistory(rpc);
      const result = await syncReplays(matches, { replayDir });

      console.log(
        `Checked ${result.checked} match(es) for ${displayName}. ` +
          `Downloaded ${result.downloaded.length}, skipped ${result.skippedExisting}, failed ${result.failed.length}.`,
      );

      for (const downloaded of result.downloaded) {
        const entry = matches.find((match) => downloaded.fileName === `${match.Match.RecordStartTimestamp}-${match.Match.MatchGUID}.replay`);
        const match = entry?.Match;
        const label = match
          ? `${getPlaylistName(match.Playlist)} (${formatTimestamp(match.RecordStartTimestamp)})`
          : downloaded.filePath;
        console.log(`  Saved: ${label}`);
        console.log(`         ${downloaded.filePath}`);
      }

      for (const failure of result.failed) {
        console.log(`  Failed: ${failure.matchGuid} - ${failure.error}`);
      }

      if (
        result.downloaded.length === 0 &&
        result.failed.length === 0
      ) {
        console.log("  No new replays to download.");
      }
    } finally {
      await rpc.close();
    }
  } catch (error) {
    console.error(
      "Sync failed:",
      error instanceof Error ? error.message : error,
    );
  } finally {
    running = false;
  }
}

async function main(): Promise<void> {
  console.log("Rocket League replay saver");
  console.log(`Replay folder: ${replayDir}`);
  console.log(`Polling every ${POLL_INTERVAL_MS / 60_000} minutes`);
  console.log();

  if (!(await replayDirExists(replayDir))) {
    console.log("Replay folder does not exist yet; it will be created on first download.");
  }

  await runSync();

  pollTimer = setInterval(() => {
    void runSync();
  }, POLL_INTERVAL_MS);

  const shutdown = () => {
    console.log("\nShutting down...");
    if (pollTimer) {
      clearInterval(pollTimer);
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
