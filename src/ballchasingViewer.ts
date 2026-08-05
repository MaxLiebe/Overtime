import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { downloadReplayFromBallchasing } from "./ballchasing.js";
import { isInGameReplaySupported } from "./platform.js";
import { isRocketLeagueRunning } from "./rocketLeagueProcess.js";
import {
  isStatsApiReachable,
  isStatsApiWebReachable,
  loadReplayViaStatsApi,
} from "./rocketLeagueStatsApi.js";

export { isInGameReplaySupported } from "./platform.js";

export interface PlayReplayInGameOptions {
  ballchasingId?: string;
  ballchasingUrl?: string;
  filePath?: string;
  matchGuid?: string;
  token?: string;
  port?: number;
  webPort?: number;
  /** Prefer the persistent Stats API client (only one TCP client is allowed). */
  sendCommand?: (command: string, data: Record<string, unknown>) => boolean;
  /** True when Overtime already holds the Stats API socket. */
  isStatsApiConnected?: () => boolean;
}

export interface InGameReplayAvailabilityOptions {
  port?: number;
  webPort?: number;
  isStatsApiConnected?: () => boolean;
  timeoutMs?: number;
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function sanitizeTempKey(key: string): string {
  return key.replace(/[<>:"/\\|?*\s]/g, "_").trim() || "replay";
}

async function resolveLocalReplayPath(options: PlayReplayInGameOptions): Promise<string> {
  const filePath = options.filePath?.trim();
  if (filePath) {
    const absolute = resolve(filePath);
    if (!(await fileExists(absolute))) {
      throw new Error("Replay file was not found on disk.");
    }
    return absolute;
  }

  const ballchasingId = getBallchasingReplayId(options);
  if (!ballchasingId) {
    throw new Error("Replay file was not found on disk.");
  }

  const token = options.token?.trim() ?? "";
  if (!token) {
    throw new Error("Add a Ballchasing API token in Settings first.");
  }

  const { data, fileName } = await downloadReplayFromBallchasing(ballchasingId, token);
  const safeName = sanitizeTempKey(
    fileName.toLowerCase().endsWith(".replay") ? fileName : `${fileName}.replay`,
  );
  const destination = join(tmpdir(), `overtime-play-${sanitizeTempKey(ballchasingId)}-${safeName}`);
  await writeFile(destination, data);
  return destination;
}

/** True when Rocket League is running and the Stats API TCP port is reachable. */
export async function isInGameReplayAvailable(
  options: InGameReplayAvailabilityOptions = {},
): Promise<boolean> {
  if (!isInGameReplaySupported()) {
    return false;
  }

  if (!(await isRocketLeagueRunning())) {
    return false;
  }

  if (options.isStatsApiConnected?.()) {
    return true;
  }

  if (
    await isStatsApiWebReachable({
      webPort: options.webPort,
      timeoutMs: options.timeoutMs,
    })
  ) {
    return true;
  }

  return isStatsApiReachable({
    port: options.port,
    timeoutMs: options.timeoutMs,
  });
}

/** @deprecated Use {@link isInGameReplayAvailable}. Kept for existing IPC naming. */
export async function isBallchasingViewerAvailable(
  options: InGameReplayAvailabilityOptions = {},
): Promise<boolean> {
  return isInGameReplayAvailable(options);
}

export async function playReplayInGame(
  options: PlayReplayInGameOptions,
): Promise<string> {
  if (!isInGameReplaySupported()) {
    throw new Error("In-game replay playback is only supported on Windows.");
  }

  if (!(await isRocketLeagueRunning())) {
    throw new Error("Start Rocket League before playing a replay in-game.");
  }

  const available = await isInGameReplayAvailable({
    port: options.port,
    webPort: options.webPort,
    isStatsApiConnected: options.isStatsApiConnected,
  });
  if (!available) {
    throw new Error(
      "Rocket League Stats API is not reachable. Enable it in Settings (PacketSendRate > 0) and restart Rocket League.",
    );
  }

  const replayPath = await resolveLocalReplayPath(options);

  try {
    await loadReplayViaStatsApi(replayPath, {
      port: options.port,
      webPort: options.webPort,
      sendCommand: options.sendCommand,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send LoadReplay to Rocket League.";
    throw new Error(
      `${message} Make sure the Stats API is enabled and Rocket League is running.`,
    );
  }

  return "Replay load command sent to Rocket League.";
}
