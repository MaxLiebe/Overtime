import { access, unlink } from "node:fs/promises";
import { setReplayName } from "./replayName.js";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteReplayFile(filePath: string): Promise<void> {
  if (!(await fileExists(filePath))) {
    throw new Error("Replay file was not found on disk.");
  }

  await unlink(filePath);
}

export async function renameReplayInFile(
  filePath: string,
  replayName: string,
): Promise<string> {
  if (!(await fileExists(filePath))) {
    throw new Error("Replay file was not found on disk.");
  }

  setReplayName(filePath, replayName);
  return replayName.trim();
}
