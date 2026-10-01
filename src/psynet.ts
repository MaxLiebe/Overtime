import WebSocket from "ws";
import { decodeBuildId } from "./buildId.js";
import {
  BASE_URL,
  GAME_VERSION,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  PSY_BUILD_SECRET,
} from "./constants.js";
import { newPlayerId, type PlayerId } from "./playerId.js";
import { generatePsySig } from "./psySig.js";
import { resolvePsyNetVersion } from "./psyNetVersion.js";
import { RequestIdCounter } from "./requestId.js";
import {
  EventType,
  PsyNetRequestError,
  type AuthPlayerRequest,
  type AuthPlayerResponse,
  type PsyNetEvent,
} from "./types.js";
import { PsyNetRPC } from "./psynetRpc.js";

/**
 * PsyNet rejects an unusable client build in two ways, both before it looks at the auth
 * ticket: `VersionMismatch` for a build it knows but considers outdated, and
 * `BuildNotFound` for a build it will not acknowledge at all.
 */
const STALE_BUILD_ERROR_TYPES = new Set(["VersionMismatch", "BuildNotFound"]);

function isStaleBuildError(error: unknown): boolean {
  return (
    error instanceof PsyNetRequestError && STALE_BUILD_ERROR_TYPES.has(error.psyError.Type)
  );
}

/** True when PsyNet will not open a session for this client build. */
export function isPsyNetBuildRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("BuildNotFound");
}

export const LOCAL_REPLAY_FALLBACK_MESSAGE =
  "Epic login saved. Rocket League is not letting Overtime download replays from its servers. Replays this PC already saved still show in the library.";

export class PsyNet {
  private readonly requestId = new RequestIdCounter();
  private readonly fetchFn: typeof fetch;
  private readonly replayDir?: string;
  /** Caller supplied an explicit version — never override it from Launch.log. */
  private readonly versionPinned: boolean;
  gameVersion: string;
  featureSet: string;
  buildId: string;

  constructor(options?: {
    fetchFn?: typeof fetch;
    gameVersion?: string;
    featureSet?: string;
    /** Prefer Launch.log next to this demos folder when resolving the client version. */
    replayDir?: string;
  }) {
    this.fetchFn = options?.fetchFn ?? fetch;
    this.replayDir = options?.replayDir;
    this.versionPinned = Boolean(options?.gameVersion && options?.featureSet);
    const detected = resolvePsyNetVersion({ replayDir: options?.replayDir });
    this.gameVersion = options?.gameVersion ?? detected.gameVersion;
    this.featureSet = options?.featureSet ?? detected.featureSet;
    this.buildId = String(decodeBuildId(this.gameVersion));
  }

  setVersion(gameVersion: string, featureSet: string): void {
    this.gameVersion = gameVersion;
    this.featureSet = featureSet;
    this.buildId = String(decodeBuildId(gameVersion));
  }

  /** Re-read Launch.log, bypassing the cache. Returns true when the version changed. */
  private refreshVersionFromLaunchLog(): boolean {
    if (this.versionPinned) {
      return false;
    }

    let detected: { gameVersion: string; featureSet: string };
    try {
      detected = resolvePsyNetVersion({ replayDir: this.replayDir, forceRefresh: true });
    } catch {
      return false;
    }

    if (
      detected.gameVersion === this.gameVersion &&
      detected.featureSet === this.featureSet
    ) {
      return false;
    }

    this.setVersion(detected.gameVersion, detected.featureSet);
    return true;
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
    try {
      return await this.sendJson<T>(path, params);
    } catch (error) {
      if (!isStaleBuildError(error)) {
        throw error;
      }

      // Epic ships new Rocket League builds regularly. The version we just used may predate
      // the update (cached at startup, or the bundled fallback), so re-read Launch.log and
      // retry once before giving up.
      let finalError = error as PsyNetRequestError;
      if (this.refreshVersionFromLaunchLog()) {
        try {
          return await this.sendJson<T>(path, params);
        } catch (retryError) {
          if (!isStaleBuildError(retryError)) {
            throw retryError;
          }
          finalError = retryError as PsyNetRequestError;
        }
      }

      throw new PsyNetRequestError({
        Type: finalError.psyError.Type,
        Message: this.describeStaleBuildError(finalError.psyError.Type),
      });
    }
  }

  /** Secret PsyNet requires on HTTP auth for the bundled game build. */
  private psyBuildSecret(): string | undefined {
    return this.gameVersion === GAME_VERSION ? PSY_BUILD_SECRET : undefined;
  }

  private describeStaleBuildError(type: string): string {
    if (type === "BuildNotFound") {
      if (!this.psyBuildSecret()) {
        return `Rocket League build ${this.gameVersion} is newer than the build Overtime can sign in with (${GAME_VERSION}). Match sync stays unavailable until Overtime is updated for this build.`;
      }

      return `Rocket League rejected the build secret for ${this.gameVersion} (${this.buildId}). Match sync stays unavailable until Overtime is updated for this build.`;
    }

    return `Rocket League PsyNet rejected game build ${this.gameVersion} as outdated. Launch Rocket League once so Overtime can read the latest build from Launch.log, then try again.`;
  }

  private async sendJson<T>(path: string[], params: unknown): Promise<T> {
    const url = `${BASE_URL}/${path.join("/")}`;
    const body = JSON.stringify(params);

    const requestId = this.requestId.getId();
    const buildSecret = this.psyBuildSecret();
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `RL Win/${this.gameVersion} gzip (x86_64-pc-win32) curl-7.67.0 Schannel`,
        PsyBuildID: this.buildId,
        PsyEnvironment: "Prod",
        PsyRequestID: requestId,
        PsySig: generatePsySig(body),
        ...(buildSecret ? { PsyBuildSecret: buildSecret } : {}),
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
