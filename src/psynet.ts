import WebSocket from "ws";
import { decodeBuildId } from "./buildId.js";
import { BASE_URL, PING_INTERVAL_MS, PONG_TIMEOUT_MS } from "./constants.js";
import { fetchWithTimeout, isTransientStatus, NetworkError, withRetries } from "./http.js";
import { newPlayerId, type PlayerId } from "./playerId.js";
import { generatePsySig } from "./psySig.js";
import {
  findPsyNetBuild,
  getKnownPsyNetBuilds,
  getLastAcceptedPsyNetVersion,
  getLatestKnownPsyNetBuild,
  refreshPsyNetBuilds,
  rememberAcceptedPsyNetBuild,
} from "./psyNetBuilds.js";
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
 * `BuildNotFound` for a build (or build secret) it will not acknowledge at all.
 */
const STALE_BUILD_ERROR_TYPES = new Set(["VersionMismatch", "BuildNotFound"]);

function isStaleBuildError(error: unknown): boolean {
  return (
    error instanceof PsyNetRequestError && STALE_BUILD_ERROR_TYPES.has(error.psyError.Type)
  );
}

/** True when PsyNet will not open a session for any client build Overtime knows. */
export function isPsyNetBuildRejected(error: unknown): boolean {
  if (isStaleBuildError(error)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return [...STALE_BUILD_ERROR_TYPES].some((type) => message.includes(type));
}

export const LOCAL_REPLAY_FALLBACK_MESSAGE =
  "Signed in to Epic, but Rocket League's servers don't accept this version of Overtime since the latest game update, so new replays can't be downloaded yet. Overtime checks for support automatically. Replays already on this PC still show in the library.";

/** A transport failure or server error worth one more try. */
function isRetryablePsyNetError(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof PsyNetHttpError && error.transient);
}

class PsyNetHttpError extends Error {
  readonly transient: boolean;

  constructor(status: number, statusText: string) {
    super(`Rocket League servers answered ${status} ${statusText}`.trim());
    this.name = "PsyNetHttpError";
    this.transient = isTransientStatus(status);
  }
}

interface BuildCandidate {
  gameVersion: string;
  featureSet: string;
  buildSecret?: string;
}

export class PsyNet {
  private readonly requestId = new RequestIdCounter();
  private readonly fetchFn: typeof fetch;
  private readonly replayDir?: string;
  /** Caller supplied an explicit version — never override it from Launch.log or the build list. */
  private readonly versionPinned: boolean;
  gameVersion: string;
  featureSet: string;
  buildId: string;
  private buildSecret: string | undefined;

  constructor(options?: {
    fetchFn?: typeof fetch;
    gameVersion?: string;
    featureSet?: string;
    buildSecret?: string;
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
    this.buildSecret = options?.buildSecret ?? findPsyNetBuild(this.gameVersion)?.buildSecret;
  }

  setVersion(gameVersion: string, featureSet: string, buildSecret?: string): void {
    this.gameVersion = gameVersion;
    this.featureSet = featureSet;
    this.buildId = String(decodeBuildId(gameVersion));
    this.buildSecret = buildSecret ?? findPsyNetBuild(gameVersion)?.buildSecret;
  }

  async authPlayer(
    authToken: string,
    accountId: string,
    accountName: string,
  ): Promise<{ rpc: PsyNetRPC; verifiedPlayerName: string }> {
    return this.authenticatePlayer("Epic", accountId, authToken, accountId, accountName);
  }

  async authPlayerSteam(
    authToken: string,
    epicAccountId: string,
    steamAccountId: string,
    accountName: string,
  ): Promise<{ rpc: PsyNetRPC; verifiedPlayerName: string }> {
    return this.authenticatePlayer("Steam", steamAccountId, authToken, epicAccountId, accountName);
  }

  private async authenticatePlayer(
    platform: "Epic" | "Steam",
    platformAccountId: string,
    authToken: string,
    epicAccountId: string,
    accountName: string,
  ): Promise<{ rpc: PsyNetRPC; verifiedPlayerName: string }> {
    const localPlayerId = newPlayerId(platform, platformAccountId);
    const buildRequest = (): AuthPlayerRequest => ({
      Platform: platform,
      PlayerName: accountName,
      PlayerID: platformAccountId,
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
    });

    const response = await this.postWithKnownBuilds<AuthPlayerResponse>(
      ["Auth", "AuthPlayer", "v2"],
      buildRequest,
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
      handshakeTimeout: 15_000,
    });

    const rpc = new PsyNetRPC(ws, playerId, this.requestId);
    rpc.start();
    return rpc;
  }

  /**
   * Builds to try, in order: the one PsyNet accepted last, the installed game's build from
   * Launch.log (when Overtime has its secret), then every other known build, newest first.
   * Rocket League patches rotate the build secret, so the installed build is only usable
   * once its secret is bundled or published; until then an older build often still works.
   */
  private buildCandidates(): BuildCandidate[] {
    if (this.versionPinned) {
      return [
        { gameVersion: this.gameVersion, featureSet: this.featureSet, buildSecret: this.buildSecret },
      ];
    }

    const candidates: BuildCandidate[] = [];
    const seen = new Set<string>();
    const add = (candidate: BuildCandidate | undefined) => {
      if (!candidate?.buildSecret || seen.has(candidate.gameVersion)) {
        return;
      }
      seen.add(candidate.gameVersion);
      candidates.push(candidate);
    };

    const lastAccepted = getLastAcceptedPsyNetVersion();
    if (lastAccepted) {
      add(findPsyNetBuild(lastAccepted));
    }

    let installed = { gameVersion: this.gameVersion, featureSet: this.featureSet };
    try {
      installed = resolvePsyNetVersion({ replayDir: this.replayDir });
    } catch {
      // Keep the version resolved at construction.
    }
    const installedBuild = findPsyNetBuild(installed.gameVersion);
    if (installedBuild) {
      add({ ...installedBuild, featureSet: installed.featureSet || installedBuild.featureSet });
    }

    for (const build of getKnownPsyNetBuilds()) {
      add(build);
    }
    return candidates;
  }

  private async postWithKnownBuilds<T>(path: string[], buildParams: () => unknown): Promise<T> {
    if (!this.versionPinned) {
      await refreshPsyNetBuilds({ fetchFn: this.fetchFn });
    }

    let lastStaleError: PsyNetRequestError | undefined;
    const tried = new Set<string>();

    // Second pass only runs when every known build was rejected and the published build
    // list changed in the meantime (a new secret went up after a patch).
    for (let pass = 0; pass < 2; pass++) {
      for (const candidate of this.buildCandidates()) {
        if (tried.has(candidate.gameVersion)) {
          continue;
        }
        tried.add(candidate.gameVersion);
        this.setVersion(candidate.gameVersion, candidate.featureSet, candidate.buildSecret);

        try {
          const result = await this.sendJsonWithRetry<T>(path, buildParams());
          if (!this.versionPinned) {
            rememberAcceptedPsyNetBuild(candidate.gameVersion);
          }
          return result;
        } catch (error) {
          if (!isStaleBuildError(error)) {
            throw error;
          }
          lastStaleError = error as PsyNetRequestError;
        }
      }

      if (this.versionPinned || pass > 0) {
        break;
      }
      await refreshPsyNetBuilds({ force: true, fetchFn: this.fetchFn });
    }

    throw new PsyNetRequestError({
      Type: lastStaleError?.psyError.Type ?? "BuildNotFound",
      Message: this.describeStaleBuildError(),
    });
  }

  private describeStaleBuildError(): string {
    let installedVersion = this.gameVersion;
    try {
      installedVersion = resolvePsyNetVersion({ replayDir: this.replayDir }).gameVersion;
    } catch {
      // Use the last version tried.
    }
    const latestKnown = getLatestKnownPsyNetBuild().gameVersion;
    return `Rocket League's servers rejected every game build Overtime knows (newest: ${latestKnown}; installed game: ${installedVersion}). This happens right after a Rocket League update, until Overtime learns the new build. Overtime checks for that automatically.`;
  }

  private async sendJsonWithRetry<T>(path: string[], params: unknown): Promise<T> {
    return withRetries(() => this.sendJson<T>(path, params), isRetryablePsyNetError, [1_500]);
  }

  private async sendJson<T>(path: string[], params: unknown): Promise<T> {
    const url = `${BASE_URL}/${path.join("/")}`;
    const body = JSON.stringify(params);

    const requestId = this.requestId.getId();
    const response = await fetchWithTimeout(this.fetchFn, url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `RL Win/${this.gameVersion} gzip (x86_64-pc-win32) curl-7.67.0 Schannel`,
        PsyBuildID: this.buildId,
        PsyEnvironment: "Prod",
        PsyRequestID: requestId,
        PsySig: generatePsySig(body),
        ...(this.buildSecret ? { PsyBuildSecret: this.buildSecret } : {}),
      },
      body,
    });

    const text = await response.text();

    let wrapper: { Result?: unknown; Error?: { Type: string; Message: string } } | undefined;
    try {
      wrapper = JSON.parse(text) as typeof wrapper;
    } catch {
      wrapper = undefined;
    }

    // PsyNet reports its own errors (including BuildNotFound) in the body, sometimes
    // alongside a non-2xx status; read those before treating the status as the failure.
    if (wrapper?.Error) {
      throw new PsyNetRequestError(wrapper.Error);
    }
    if (!response.ok || !wrapper) {
      throw new PsyNetHttpError(response.status, response.statusText);
    }

    return wrapper.Result as T;
  }
}

export { PsyNetRPC, EventType, type PsyNetEvent, PING_INTERVAL_MS, PONG_TIMEOUT_MS };
