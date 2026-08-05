import net from "node:net";
import { resolve } from "node:path";
import WebSocket from "ws";
import type {
  MatchCreatedData,
  MatchDestroyedData,
  StatsApiUpdateState,
} from "./trackedMatch.js";

export const DEFAULT_STATS_API_HOST = "127.0.0.1";
export const DEFAULT_STATS_API_PORT = 49123;
export const DEFAULT_STATS_API_WEB_PORT = 49124;

/** Rocket League accepts LoadReplay paths with forward slashes; backslashes are ignored. */
export function normalizeStatsApiReplayPath(filePath: string): string {
  return resolve(filePath.trim()).replace(/\\/g, "/");
}

export interface MatchEndedData {
  MatchGuid?: string;
  WinnerTeamNum?: number;
}

export type StatsApiData =
  | MatchEndedData
  | MatchCreatedData
  | MatchDestroyedData
  | StatsApiUpdateState;

export interface StatsApiEnvelope {
  Event?: string;
  Data?: string | StatsApiData;
}

/** Split concatenated JSON objects from the Stats API TCP stream. */
export function extractJsonFrames(buffer: string): { frames: string[]; remainder: string } {
  const frames: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let index = 0; index < buffer.length; index += 1) {
    const character = buffer[index]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (character === "\\" && inString) {
      escape = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        frames.push(buffer.slice(start, index + 1));
        start = -1;
      }
    }
  }

  const remainder = start >= 0 ? buffer.slice(start) : "";
  return { frames, remainder };
}

export function parseStatsApiData(data: StatsApiEnvelope["Data"]): StatsApiData {
  if (typeof data === "string") {
    return JSON.parse(data) as StatsApiData;
  }

  return data ?? {};
}

export interface RocketLeagueStatsClientOptions {
  host?: string;
  port?: number;
  reconnectDelayMs?: number;
  onMatchCreated?: (matchGuid: string) => void;
  /** MatchInitialized should not wipe an in-progress roster. */
  onMatchInitialized?: (matchGuid: string) => void;
  onUpdateState?: (data: StatsApiUpdateState) => void;
  onMatchEnded?: (matchGuid: string, winnerTeamNum?: number) => void;
  onMatchDestroyed?: (matchGuid: string) => void;
  /** Fired when a saved replay starts (not goal replays). */
  onReplayCreated?: () => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

/** Passive TCP client for Rocket League's official Stats API. */
export class RocketLeagueStatsClient {
  private socket: net.Socket | null = null;
  private buffer = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(private readonly options: RocketLeagueStatsClientOptions = {}) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const wasConnected = this.isConnected();
    this.socket?.destroy();
    this.socket = null;
    this.buffer = "";

    if (wasConnected) {
      this.notifyDisconnected();
    }
  }

  isActive(): boolean {
    return !this.stopped;
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /** Send a Stats API command on the active TCP connection. */
  sendCommand(command: string, data: Record<string, unknown>): boolean {
    if (!this.isConnected() || !this.socket) {
      return false;
    }

    try {
      this.socket.write(JSON.stringify({ Command: command, Data: data }));
      return true;
    } catch {
      return false;
    }
  }

  private notifyDisconnected(): void {
    this.options.onDisconnected?.();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.options.reconnectDelayMs ?? 5000);
  }

  private connect(): void {
    if (this.stopped || this.socket) {
      return;
    }

    const socket = net.createConnection({
      host: this.options.host ?? DEFAULT_STATS_API_HOST,
      port: this.options.port ?? DEFAULT_STATS_API_PORT,
    });

    this.socket = socket;

    socket.on("connect", () => {
      this.options.onConnected?.();
    });

    socket.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      this.drainBuffer();
    });

    socket.on("close", () => {
      const wasConnected = this.socket !== null;
      this.socket = null;
      if (wasConnected) {
        this.notifyDisconnected();
      }
      this.scheduleReconnect();
    });

    socket.on("error", () => {
      const wasConnected = this.socket !== null;
      socket.destroy();
      this.socket = null;
      if (wasConnected) {
        this.notifyDisconnected();
      }
      this.scheduleReconnect();
    });
  }

  private drainBuffer(): void {
    const { frames, remainder } = extractJsonFrames(this.buffer);
    this.buffer = remainder;

    for (const frame of frames) {
      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: string): void {
    try {
      const envelope = JSON.parse(frame) as StatsApiEnvelope;
      const event = envelope.Event?.trim();
      if (!event) {
        return;
      }

      const data = parseStatsApiData(envelope.Data);

      if (event === "MatchCreated") {
        const matchGuid = (data as MatchCreatedData).MatchGuid?.trim();
        if (matchGuid) {
          this.options.onMatchCreated?.(matchGuid);
        }
        return;
      }

      if (event === "MatchInitialized") {
        const matchGuid = (data as MatchCreatedData).MatchGuid?.trim();
        if (matchGuid) {
          this.options.onMatchInitialized?.(matchGuid);
        }
        return;
      }

      if (event === "UpdateState") {
        this.options.onUpdateState?.(data as StatsApiUpdateState);
        return;
      }

      if (event === "MatchEnded") {
        const ended = data as MatchEndedData;
        const matchGuid = ended.MatchGuid?.trim();
        if (matchGuid) {
          this.options.onMatchEnded?.(matchGuid, ended.WinnerTeamNum);
        }
        return;
      }

      if (event === "MatchDestroyed") {
        const matchGuid = (data as MatchDestroyedData).MatchGuid?.trim();
        if (matchGuid) {
          this.options.onMatchDestroyed?.(matchGuid);
        }
        return;
      }

      if (event === "ReplayCreated") {
        this.options.onReplayCreated?.();
      }
    } catch {
      // Ignore malformed frames while the socket is mid-stream.
    }
  }
}

export interface StatsApiSocketOptions {
  host?: string;
  port?: number;
  webPort?: number;
  timeoutMs?: number;
}

/** Probe whether Rocket League is accepting Stats API TCP connections. */
export async function isStatsApiReachable(
  options: StatsApiSocketOptions = {},
): Promise<boolean> {
  const host = options.host ?? DEFAULT_STATS_API_HOST;
  const port = options.port ?? DEFAULT_STATS_API_PORT;
  const timeoutMs = options.timeoutMs ?? 2000;

  return new Promise((resolvePromise) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (reachable: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolvePromise(reachable);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
  });
}

/** Probe whether Rocket League's Stats API WebSocket (WebPort) is accepting connections. */
export async function isStatsApiWebReachable(
  options: StatsApiSocketOptions = {},
): Promise<boolean> {
  const host = options.host ?? DEFAULT_STATS_API_HOST;
  const webPort = options.webPort ?? DEFAULT_STATS_API_WEB_PORT;
  const timeoutMs = options.timeoutMs ?? 2000;

  return new Promise((resolvePromise) => {
    const ws = new WebSocket(`ws://${host}:${webPort}`);
    let settled = false;

    const finish = (reachable: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      resolvePromise(reachable);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);

    ws.on("open", () => finish(true));
    ws.on("error", () => finish(false));
  });
}

/**
 * Open a short-lived Stats API connection, send one command, then disconnect.
 * Prefer {@link RocketLeagueStatsClient.sendCommand} when a persistent client is already connected
 * — Rocket League only accepts one TCP client at a time.
 */
export async function sendStatsApiCommandOnce(
  command: string,
  data: Record<string, unknown>,
  options: StatsApiSocketOptions = {},
): Promise<void> {
  const host = options.host ?? DEFAULT_STATS_API_HOST;
  const port = options.port ?? DEFAULT_STATS_API_PORT;
  const timeoutMs = options.timeoutMs ?? 5000;
  const payload = JSON.stringify({ Command: command, Data: data });

  await new Promise<void>((resolvePromise, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      action();
      socket.destroy();
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(new Error("Timed out connecting to Rocket League Stats API.")),
      );
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(payload, (error) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        // Brief pause so the game can ingest the command before we drop the socket.
        setTimeout(() => finish(() => resolvePromise()), 150);
      });
    });

    socket.on("error", (error) => {
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error("Could not connect to Rocket League Stats API."),
        ),
      );
    });
  });
}

/** Send a Stats API command over the WebSocket WebPort (preferred for LoadReplay). */
export async function sendStatsApiCommandWs(
  command: string,
  data: Record<string, unknown>,
  options: StatsApiSocketOptions = {},
): Promise<void> {
  const host = options.host ?? DEFAULT_STATS_API_HOST;
  const webPort = options.webPort ?? DEFAULT_STATS_API_WEB_PORT;
  const timeoutMs = options.timeoutMs ?? 5000;
  const payload = JSON.stringify({ Command: command, Data: data });

  await new Promise<void>((resolvePromise, reject) => {
    const ws = new WebSocket(`ws://${host}:${webPort}`);
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      action();
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    };

    const timer = setTimeout(() => {
      finish(() =>
        reject(new Error("Timed out connecting to Rocket League Stats API WebSocket.")),
      );
    }, timeoutMs);

    ws.on("open", () => {
      ws.send(payload, (error) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        // Keep the socket briefly so the game can ingest the command.
        setTimeout(() => finish(() => resolvePromise()), 250);
      });
    });

    ws.on("error", (error) => {
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error("Could not connect to Rocket League Stats API WebSocket."),
        ),
      );
    });
  });
}

export async function loadReplayViaStatsApi(
  replayPath: string,
  options: StatsApiSocketOptions & {
    sendCommand?: (command: string, data: Record<string, unknown>) => boolean;
  } = {},
): Promise<void> {
  if (!replayPath.trim()) {
    throw new Error("Replay path is required.");
  }

  // Forward slashes are required — Windows backslash paths are silently ignored.
  const data = { Path: normalizeStatsApiReplayPath(replayPath) };

  try {
    await sendStatsApiCommandWs("LoadReplay", data, options);
    return;
  } catch {
    // Fall through to the TCP socket when WebPort is unavailable.
  }

  if (options.sendCommand?.("LoadReplay", data)) {
    return;
  }

  await sendStatsApiCommandOnce("LoadReplay", data, options);
}
