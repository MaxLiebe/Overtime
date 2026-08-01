import WebSocket from "ws";
import { decodeBuildId } from "./buildId.js";
import { BASE_URL, FEATURE_SET, GAME_VERSION, PING_INTERVAL_MS, PONG_TIMEOUT_MS } from "./constants.js";
import { newPlayerId, type PlayerId } from "./playerId.js";
import { generatePsySig } from "./psySig.js";
import { RequestIdCounter } from "./requestId.js";
import {
  EventType,
  PsyNetRequestError,
  type AuthPlayerRequest,
  type AuthPlayerResponse,
  type PsyNetEvent,
} from "./types.js";
import { PsyNetRPC } from "./psynetRpc.js";

export class PsyNet {
  private readonly requestId = new RequestIdCounter();
  private readonly fetchFn: typeof fetch;
  gameVersion: string;
  featureSet: string;
  buildId: string;

  constructor(options?: {
    fetchFn?: typeof fetch;
    gameVersion?: string;
    featureSet?: string;
  }) {
    this.fetchFn = options?.fetchFn ?? fetch;
    this.gameVersion = options?.gameVersion ?? GAME_VERSION;
    this.featureSet = options?.featureSet ?? FEATURE_SET;
    this.buildId = String(decodeBuildId(this.gameVersion));
  }

  setVersion(gameVersion: string, featureSet: string): void {
    this.gameVersion = gameVersion;
    this.featureSet = featureSet;
    this.buildId = String(decodeBuildId(gameVersion));
  }

  async authPlayer(
    authToken: string,
    accountId: string,
    accountName: string,
  ): Promise<{ rpc: PsyNetRPC; verifiedPlayerName: string }> {
    const localPlayerId = newPlayerId("Epic", accountId);
    const request: AuthPlayerRequest = {
      Platform: "Epic",
      PlayerName: accountName,
      PlayerID: accountId,
      Language: "INT",
      AuthTicket: authToken,
      BuildRegion: "",
      FeatureSet: this.featureSet,
      Device: "PC",
      LocalFirstPlayerID: localPlayerId,
      bSkipAuth: false,
      bSetAsPrimaryAccount: true,
      EpicAuthTicket: authToken,
      EpicAccountID: accountId,
    };

    const response = await this.postJson<AuthPlayerResponse>(
      ["Auth", "AuthPlayer", "v2"],
      request,
    );

    return {
      rpc: this.establishSocket(
        response.PerConURLv2,
        localPlayerId,
        response.PsyToken,
        response.SessionID,
      ),
      verifiedPlayerName: response.VerifiedPlayerName,
    };
  }

  async authPlayerSteam(
    authToken: string,
    epicAccountId: string,
    steamAccountId: string,
    accountName: string,
  ): Promise<{ rpc: PsyNetRPC; verifiedPlayerName: string }> {
    const localPlayerId = newPlayerId("Steam", steamAccountId);
    const request: AuthPlayerRequest = {
      Platform: "Steam",
      PlayerName: accountName,
      PlayerID: steamAccountId,
      Language: "INT",
      AuthTicket: authToken,
      BuildRegion: "",
      FeatureSet: this.featureSet,
      Device: "PC",
      LocalFirstPlayerID: localPlayerId,
      bSkipAuth: false,
      bSetAsPrimaryAccount: true,
      EpicAuthTicket: authToken,
      EpicAccountID: epicAccountId,
    };

    const response = await this.postJson<AuthPlayerResponse>(
      ["Auth", "AuthPlayer", "v2"],
      request,
    );

    return {
      rpc: this.establishSocket(
        response.PerConURLv2,
        localPlayerId,
        response.PsyToken,
        response.SessionID,
      ),
      verifiedPlayerName: response.VerifiedPlayerName,
    };
  }

  private establishSocket(
    url: string,
    playerId: PlayerId,
    psyToken: string,
    sessionId: string,
  ): PsyNetRPC {
    const ws = new WebSocket(url, {
      headers: {
        PsyBuildID: this.buildId,
        "User-Agent": `RL Win/${this.gameVersion} gzip`,
        PsyEnvironment: "Prod",
        PsyToken: psyToken,
        PsySessionID: sessionId,
      },
    });

    const rpc = new PsyNetRPC(ws, playerId, this.requestId);
    rpc.start();
    return rpc;
  }

  private async postJson<T>(path: string[], params: unknown): Promise<T> {
    const url = `${BASE_URL}/${path.join("/")}`;
    const body = JSON.stringify(params);

    const requestId = this.requestId.getId();
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `RL Win/${this.gameVersion} gzip (x86_64-pc-win32) curl-7.67.0 Schannel`,
        PsyBuildID: this.buildId,
        PsyEnvironment: "Prod",
        PsyRequestID: requestId,
        PsySig: generatePsySig(body),
      },
      body,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`unexpected status: ${response.status} ${response.statusText}`);
    }

    const wrapper = JSON.parse(text) as {
      Result?: unknown;
      Error?: { Type: string; Message: string };
    };

    if (wrapper.Error) {
      throw new PsyNetRequestError(wrapper.Error);
    }

    return wrapper.Result as T;
  }
}

export { PsyNetRPC, EventType, type PsyNetEvent, PING_INTERVAL_MS, PONG_TIMEOUT_MS };
