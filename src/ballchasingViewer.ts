import { copyFile, mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import WebSocket from "ws";

import { isInGameReplaySupported } from "./platform.js";

export { isInGameReplaySupported } from "./platform.js";

export const BALLCHASING_VIEWER_PORT = 20452;
export const BALLCHASING_VIEWER_NOTIFIER = "ballchasing_viewer";

export interface PlayReplayInGameOptions {
  ballchasingId?: string;
  ballchasingUrl?: string;
  filePath?: string;
  matchGuid?: string;
  token?: string;
}

function buildMessage(...args: string[]): string {
  return args.join(" ");
}

export function getBallchasingReplayId(replay: {
  ballchasingId?: string;
  ballchasingUrl?: string;
}): string | null {
  const id = replay.ballchasingId?.trim();
  if (id) {
    return id;
  }

  const url = replay.ballchasingUrl?.trim();
  if (!url) {
    return null;
  }

  const match = url.match(/\/replay\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export function getBakkesModBallchasingCacheDir(): string {
  const appData = process.env.APPDATA?.trim();
  if (!appData) {
    throw new Error("Could not resolve the BakkesMod data folder.");
  }

  return join(appData, "bakkesmod", "bakkesmod", "data", "ballchasing", "dl");
}

function sanitizeCacheKey(key: string): string {
  return key.replace(/[<>:"/\\|?*]/g, "").trim();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function stageLocalReplayForViewer(
  filePath: string,
  cacheKey: string,
): Promise<string> {
  const normalizedKey = sanitizeCacheKey(cacheKey);
  if (!normalizedKey) {
    throw new Error("Replay is missing an identifier for in-game playback.");
  }

  if (!(await fileExists(filePath))) {
    throw new Error("Replay file was not found on disk.");
  }

  const cacheDir = getBakkesModBallchasingCacheDir();
  await mkdir(cacheDir, { recursive: true });

  const destinationPath = join(cacheDir, `${normalizedKey}.replay`);
  await copyFile(filePath, destinationPath);
  return destinationPath;
}

function sendCommand(message: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${BALLCHASING_VIEWER_PORT}`);
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      action();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("Timed out connecting to Ballchasing Replay Player")));
      ws.terminate();
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(message);
    });

    ws.on("message", (data) => {
      const response = typeof data === "string" ? data : data.toString("utf8");
      finish(() => resolve(response));
    });

    ws.on("error", (error) => {
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error("Could not connect to Ballchasing Replay Player"),
        ),
      );
    });
  });
}

export async function isBallchasingViewerAvailable(timeoutMs = 2000): Promise<boolean> {
  if (!isInGameReplaySupported()) {
    return false;
  }

  try {
    const response = await sendCommand(
      buildMessage(BALLCHASING_VIEWER_NOTIFIER, "available"),
      timeoutMs,
    );
    return response.trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

function assertSuccessfulViewerResponse(response: string): string {
  if (!response.toLowerCase().includes("attempting")) {
    throw new Error(response || "Failed to start replay in Rocket League.");
  }

  return response;
}

export async function playReplayInGame(
  options: PlayReplayInGameOptions,
  timeoutMs = 10000,
): Promise<string> {
  if (!isInGameReplaySupported()) {
    throw new Error("In-game replay playback is only supported on Windows.");
  }

  const available = await isBallchasingViewerAvailable();
  if (!available) {
    throw new Error(
      "Ballchasing Replay Player not detected. Install the BakkesMod plugin and make sure Rocket League is running.",
    );
  }

  const ballchasingId = getBallchasingReplayId(options);
  const filePath = options.filePath?.trim();
  const matchGuid = options.matchGuid?.trim();
  const token = options.token?.trim() ?? "";

  if (filePath) {
    const cacheKey = ballchasingId ?? matchGuid;
    if (!cacheKey) {
      throw new Error("Replay is missing an identifier for in-game playback.");
    }

    await stageLocalReplayForViewer(filePath, cacheKey);
    const response = await sendCommand(
      buildMessage(BALLCHASING_VIEWER_NOTIFIER, sanitizeCacheKey(cacheKey)),
      timeoutMs,
    );
    return assertSuccessfulViewerResponse(response);
  }

  if (ballchasingId) {
    if (!token) {
      throw new Error("Add a Ballchasing API token in Settings first.");
    }

    const response = await sendCommand(
      buildMessage(BALLCHASING_VIEWER_NOTIFIER, ballchasingId, token),
      timeoutMs,
    );
    return assertSuccessfulViewerResponse(response);
  }

  throw new Error("Replay file was not found on disk.");
}
