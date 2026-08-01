import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { downloadReplayFromBallchasing } from "./ballchasing.js";
import { isCloudOnlyReplay } from "./format.js";
import { deleteReplayFile } from "./replayManage.js";
import { uniqueReplayDestination } from "./replayImport.js";
import {
  removeImportedBallchasingLink,
  removeImportedReplayMeta,
  upsertSavedReplay,
  type AppState,
  type SavedReplayRecord,
} from "./store.js";

export { isCloudOnlyReplay };

export async function promoteReplayToCloudOnly(
  state: AppState,
  replay: SavedReplayRecord,
): Promise<AppState> {
  if (!replay.ballchasingId?.trim()) {
    throw new Error("Replay must be uploaded to Ballchasing before removing the local file.");
  }

  const filePath = replay.filePath?.trim();
  if (filePath) {
    try {
      await deleteReplayFile(filePath);
    } catch {
      // File may already be gone.
    }
    state = removeImportedBallchasingLink(state, filePath);
    state = removeImportedReplayMeta(state, filePath);
  }

  const cloudReplay: SavedReplayRecord = {
    ...replay,
    cloudOnly: true,
    filePath: "",
    source: replay.source ?? "synced",
  };

  return upsertSavedReplay(state, cloudReplay);
}

export async function restoreReplayFromCloud(
  state: AppState,
  replay: SavedReplayRecord,
  replayDir: string,
  token: string,
): Promise<{ state: AppState; replay: SavedReplayRecord }> {
  const ballchasingId = replay.ballchasingId?.trim();
  if (!ballchasingId) {
    throw new Error("This replay has no Ballchasing link to download from.");
  }

  if (!isCloudOnlyReplay(replay)) {
    throw new Error("This replay already has a local file.");
  }

  if (!token.trim()) {
    throw new Error("Add a Ballchasing API token in Settings first.");
  }

  await mkdir(replayDir, { recursive: true });

  const { data, fileName: downloadedName } = await downloadReplayFromBallchasing(
    ballchasingId,
    token.trim(),
  );

  const normalizedDownloadName = downloadedName.toLowerCase().endsWith(".replay")
    ? downloadedName
    : `${downloadedName}.replay`;
  const preferredName =
    replay.fileName?.trim() ||
    normalizedDownloadName ||
    (replay.recordStartTimestamp && replay.matchGuid
      ? `${replay.recordStartTimestamp}-${replay.matchGuid}.replay`
      : `${ballchasingId}.replay`);

  const destination = await uniqueReplayDestination(replayDir, preferredName);
  await writeFile(destination, data);

  const restored: SavedReplayRecord = {
    ...replay,
    filePath: destination,
    fileName: basename(destination),
    cloudOnly: false,
    importedAt: new Date().toISOString(),
  };

  return {
    state: upsertSavedReplay(state, restored),
    replay: restored,
  };
}
