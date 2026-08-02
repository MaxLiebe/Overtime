import net from "node:net";
import type {
  MatchCreatedData,
  MatchDestroyedData,
  StatsApiUpdateState,
} from "./trackedMatch.js";

export const DEFAULT_STATS_API_HOST = "127.0.0.1";
export const DEFAULT_STATS_API_PORT = 49123;

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
  onUpdateState?: (data: StatsApiUpdateState) => void;
  onMatchEnded?: (matchGuid: string, winnerTeamNum?: number) => void;
  onMatchDestroyed?: (matchGuid: string) => void;
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

      if (event === "MatchCreated" || event === "MatchInitialized") {
        const matchGuid = (data as MatchCreatedData).MatchGuid?.trim();
        if (matchGuid) {
          this.options.onMatchCreated?.(matchGuid);
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
      }
    } catch {
      // Ignore malformed frames while the socket is mid-stream.
    }
  }
}
