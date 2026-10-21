import type WebSocket from "ws";
import { PING_INTERVAL_MS, PONG_TIMEOUT_MS } from "./constants.js";
import type { PlayerId } from "./playerId.js";
import { generatePsySig } from "./psySig.js";
import { RequestIdCounter } from "./requestId.js";
import {
  EventType,
  PsyNetRequestError,
  type ParsedPsyResponse,
  type PsyNetEvent,
} from "./types.js";

type PendingRequest = {
  resolve: (response: ParsedPsyResponse) => void;
  reject: (error: Error) => void;
};

/** PsyNet answers in well under a second; a silent minute means the socket is dead. */
const REQUEST_TIMEOUT_MS = 60_000;

export class PsyNetRPC {
  readonly localPlayerId: PlayerId;
  private readonly ws: WebSocket;
  private readonly requestId: RequestIdCounter;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly eventListeners = new Set<(event: PsyNetEvent) => void>();
  private connected = false;
  private pingTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private pongReceived = false;
  private readonly opened: Promise<void>;
  private resolveOpened!: () => void;
  private rejectOpened!: (error: Error) => void;
  private settledOpen = false;

  constructor(ws: WebSocket, localPlayerId: PlayerId, requestId: RequestIdCounter) {
    this.ws = ws;
    this.localPlayerId = localPlayerId;
    this.requestId = requestId;
    this.opened = new Promise<void>((resolve, reject) => {
      this.resolveOpened = resolve;
      this.rejectOpened = reject;
    });
    // Nobody may be awaiting yet; avoid an unhandled rejection if the socket fails early.
    this.opened.catch(() => undefined);
  }

  start(): void {
    this.ws.on("open", () => {
      this.connected = true;
      this.settleOpen();
      this.schedulePing();
    });

    this.ws.on("message", (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on("close", (code) => {
      this.settleOpen(new Error(`Rocket League servers closed the connection (code ${code})`));
      this.handleDisconnect();
    });

    this.ws.on("error", (error) => {
      this.settleOpen(
        new Error(`Could not connect to Rocket League servers (${error.message || "socket error"})`),
      );
      this.handleDisconnect();
    });
  }

  private settleOpen(error?: Error): void {
    if (this.settledOpen) {
      return;
    }
    this.settledOpen = true;
    if (error) {
      this.rejectOpened(error);
    } else {
      this.resolveOpened();
    }
  }

  /** Resolve once the socket is open; reject as soon as it fails or after `timeoutMs`. */
  async waitForOpen(timeoutMs = 15_000): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Timed out connecting to Rocket League servers"));
      }, timeoutMs);
    });

    try {
      await Promise.race([this.opened, timeout]);
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  isConnected(): boolean {
    return this.connected && this.ws.readyState === this.ws.OPEN;
  }

  onEvent(listener: (event: PsyNetEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async close(): Promise<void> {
    this.settleOpen(new Error("connection closed"));
    const wasConnected = this.connected;
    this.connected = false;
    this.clearPingTimers();

    for (const [requestId, pending] of this.pendingRequests) {
      pending.reject(new Error("connection closed"));
      this.pendingRequests.delete(requestId);
    }

    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.close();
    } else if (this.ws.readyState === this.ws.CONNECTING) {
      // A socket that never opened would otherwise linger until the OS gives up on it.
      this.ws.terminate();
    }

    if (wasConnected) {
      this.emitEvent(EventType.Disconnected, "");
    }
  }

  async sendRequestSync<T>(
    service: string,
    data: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.sendRequest(service, data, signal);
    if (response.Error) {
      throw new PsyNetRequestError(response.Error);
    }
    return response.Result as T;
  }

  private sendRequest(
    service: string,
    data: unknown,
    signal?: AbortSignal,
  ): Promise<ParsedPsyResponse> {
    if (!this.isConnected()) {
      return Promise.reject(new Error("websocket connection not established"));
    }

    const requestId = this.requestId.getId();
    const message = this.buildMessage(
      {
        PsyService: service,
        PsyRequestID: requestId,
      },
      data,
    );

    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        this.pendingRequests.delete(requestId);
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortHandler);
      };
      const abortHandler = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };

      if (signal?.aborted) {
        abortHandler();
        return;
      }

      signal?.addEventListener("abort", abortHandler, { once: true });
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Rocket League servers did not answer ${service} in time`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        resolve: (response) => {
          cleanup();
          resolve(response);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });

      this.ws.send(message, (error) => {
        if (error) {
          cleanup();
          reject(error);
        }
      });
    });
  }

  private buildMessage(headers: Record<string, string>, body: unknown): string {
    let jsonData = "";
    if (body !== undefined && body !== null) {
      jsonData = JSON.stringify(body);
      headers.PsySig = generatePsySig(jsonData);
    }

    const headerLines = Object.entries(headers).map(
      ([key, value]) => `${key}: ${value}\r\n`,
    );

    return `${headerLines.join("")}\r\n${jsonData}`;
  }

  private handleMessage(message: string): void {
    if (message.startsWith("PsyPong:")) {
      this.pongReceived = true;
      if (this.pongTimer) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
      this.schedulePing();
      return;
    }

    try {
      const response = this.parseMessage(message);
      if (response.ResponseID) {
        const pending = this.pendingRequests.get(response.ResponseID);
        if (pending) {
          this.pendingRequests.delete(response.ResponseID);
          pending.resolve(response);
          return;
        }
      }
    } catch {
      this.emitEvent(EventType.Message, message);
      return;
    }

    this.emitEvent(EventType.Message, message);
  }

  private parseMessage(message: string): ParsedPsyResponse {
    const delimiter = "\r\n\r\n";
    const index = message.indexOf(delimiter);
    if (index === -1) {
      throw new Error("message does not contain expected delimiter");
    }

    const headersPart = message.slice(0, index);
    const jsonPayload = message.slice(index + delimiter.length);
    const headers: Record<string, string> = {};

    for (const line of headersPart.split("\r\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        headers[key] = value;
      }
    }

    const parsed = JSON.parse(jsonPayload) as {
      Result?: unknown;
      Error?: { Type: string; Message: string } | null;
    };

    return {
      ResponseID: headers.PsyResponseID ?? "",
      Result: parsed.Result,
      Error: parsed.Error ?? null,
    };
  }

  private schedulePing(): void {
    if (!this.connected) {
      return;
    }

    this.pingTimer = setTimeout(() => {
      this.sendPing();
    }, PING_INTERVAL_MS);
  }

  private sendPing(): void {
    if (!this.isConnected()) {
      return;
    }

    const pingMessage = this.buildMessage({ PsyPing: "" }, null);
    this.pongReceived = false;

    this.ws.send(pingMessage, (error) => {
      if (error) {
        void this.close();
        return;
      }

      this.pongTimer = setTimeout(() => {
        if (!this.pongReceived) {
          void this.close();
        }
      }, PONG_TIMEOUT_MS);
    });
  }

  private clearPingTimers(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private handleDisconnect(): void {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.clearPingTimers();

    for (const [requestId, pending] of this.pendingRequests) {
      pending.reject(new Error("connection closed"));
      this.pendingRequests.delete(requestId);
    }

    this.emitEvent(EventType.Disconnected, "");
  }

  private emitEvent(type: EventType, content: string): void {
    const event: PsyNetEvent = { type, content };
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }
}
