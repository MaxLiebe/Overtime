import {
  EOS_CLIENT_ID,
  EOS_DEPLOYMENT_ID,
  EOS_SECRET,
  EGS_CLIENT_ID,
  EGS_CLIENT_SECRET,
  EGS_DEVICE_AUTH_CLIENT_ID,
  EGS_DEVICE_AUTH_CLIENT_SECRET,
  EGS_DEVICE_CODE_CLIENT_ID,
  EGS_DEVICE_CODE_CLIENT_SECRET,
  EGS_OAUTH_HOST,
  EGS_USER_AGENT,
} from "./constants.js";
import { EpicAuthError, epicErrorFromResponse, isTransientEpicError } from "./epicErrors.js";
import { fetchWithTimeout, withRetries } from "./http.js";
import type {
  DeviceAuthResponse,
  EpicDeviceAuthCredentials,
  EosTokenResponse,
  TokenResponse,
} from "./types.js";

export const EPIC_DEVICE_AUTH_CANCELLED = "Epic sign-in was cancelled.";

function clientSecretForId(clientId: string): string {
  if (clientId === EGS_DEVICE_AUTH_CLIENT_ID) {
    return EGS_DEVICE_AUTH_CLIENT_SECRET;
  }
  if (clientId === EGS_DEVICE_CODE_CLIENT_ID) {
    return EGS_DEVICE_CODE_CLIENT_SECRET;
  }
  if (clientId === EGS_CLIENT_ID) {
    return EGS_CLIENT_SECRET;
  }
  // Fall back to the lasting-login client — unknown ids cannot use device_auth.
  return EGS_DEVICE_AUTH_CLIENT_SECRET;
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error(EPIC_DEVICE_AUTH_CANCELLED));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(EPIC_DEVICE_AUTH_CANCELLED));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function getEpicRedirectUrl(): string {
  return `https://www.epicgames.com/id/api/redirect?clientId=${EGS_CLIENT_ID}&responseType=code`;
}

export class EGS {
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = fetch) {
    this.fetchFn = fetchFn;
  }

  getAuthUrl(options?: { forceLogin?: boolean }): string {
    const redirectUrl = getEpicRedirectUrl();
    let url = `https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(redirectUrl)}`;
    if (options?.forceLogin) {
      url += "&prompt=login";
    }
    return url;
  }

  async authenticateWithCode(authCode: string): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: "authorization_code",
      code: authCode,
      token_type: "eg1",
    });
  }

  async authenticateWithRefreshToken(refreshToken: string): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      token_type: "eg1",
    });
  }

  async authenticateWithExchangeCode(
    exchangeCode: string,
    clientId = EGS_DEVICE_AUTH_CLIENT_ID,
    clientSecret = EGS_DEVICE_AUTH_CLIENT_SECRET,
  ): Promise<TokenResponse> {
    return this.requestToken(
      {
        grant_type: "exchange_code",
        exchange_code: exchangeCode,
        token_type: "eg1",
      },
      clientId,
      clientSecret,
    );
  }

  async authenticateWithDeviceAuth(
    credentials: EpicDeviceAuthCredentials,
  ): Promise<TokenResponse> {
    return this.requestToken(
      {
        grant_type: "device_auth",
        account_id: credentials.accountId,
        device_id: credentials.deviceId,
        secret: credentials.secret,
        token_type: "eg1",
      },
      credentials.clientId,
      clientSecretForId(credentials.clientId),
    );
  }

  /**
   * Start EG1 device-code login with the Fortnite Switch client.
   * Requires a client_credentials bearer (Basic auth is rejected by Epic).
   * After login we exchange into the iOS client to create lasting device_auth.
   */
  async startEg1DeviceAuthorization(): Promise<DeviceAuthResponse> {
    const clientToken = await this.requestToken(
      {
        grant_type: "client_credentials",
        token_type: "eg1",
      },
      EGS_DEVICE_CODE_CLIENT_ID,
      EGS_DEVICE_CODE_CLIENT_SECRET,
    );

    const device = await this.requestJson<DeviceAuthResponse>(
      "Starting Epic sign-in",
      `https://${EGS_OAUTH_HOST}/account/api/oauth/deviceAuthorization`,
      {
        method: "POST",
        headers: {
          Authorization: `bearer ${clientToken.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": EGS_USER_AGENT,
        },
        body: "",
      },
    );

    if (!device.device_code?.trim() || !device.user_code?.trim()) {
      throw new EpicAuthError("Starting Epic sign-in failed: incomplete response", "other");
    }

    if (!device.verification_uri?.trim()) {
      device.verification_uri = "https://www.epicgames.com/activate";
    }

    return device;
  }

  async waitForEg1DeviceAuthorization(
    device: DeviceAuthResponse,
    options?: { signal?: AbortSignal },
  ): Promise<TokenResponse> {
    const intervalMs = Math.max(1, device.interval || 5) * 1000;
    const deadline = Date.now() + Math.max(60, device.expires_in || 600) * 1000;
    let lastError: unknown;

    while (Date.now() < deadline) {
      if (options?.signal?.aborted) {
        throw new Error(EPIC_DEVICE_AUTH_CANCELLED);
      }

      try {
        return await this.requestToken(
          {
            grant_type: "device_code",
            device_code: device.device_code,
            token_type: "eg1",
          },
          EGS_DEVICE_CODE_CLIENT_ID,
          EGS_DEVICE_CODE_CLIENT_SECRET,
        );
      } catch (error) {
        // Epic answers "authorization_pending" until the user approves. Stop early only when
        // the code itself is dead (expired or already used); keep polling through anything
        // else, including network blips.
        const deadCode =
          error instanceof EpicAuthError &&
          (error.kind === "credentials" || Boolean(error.errorCode?.includes("not_found")));
        if (deadCode) {
          throw new Error(
            "The Epic sign-in code expired or was already used. Start the sign-in again.",
          );
        }
        lastError = error;
      }

      await abortableDelay(intervalMs, options?.signal);
    }

    throw new Error(
      lastError && isTransientEpicError(lastError)
        ? `Epic sign-in timed out: ${(lastError as Error).message}`
        : "Epic sign-in timed out. Start the sign-in again and approve it in your browser.",
    );
  }

  async createDeviceAuth(
    accessToken: string,
    accountId: string,
  ): Promise<EpicDeviceAuthCredentials> {
    const data = await this.requestJson<{
      deviceId?: string;
      secret?: string;
      accountId?: string;
    }>(
      "Creating a lasting Epic login",
      `https://${EGS_OAUTH_HOST}/account/api/public/account/${encodeURIComponent(accountId)}/deviceAuth`,
      {
        method: "POST",
        headers: {
          Authorization: `bearer ${accessToken}`,
          "User-Agent": EGS_USER_AGENT,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );

    const deviceId = data.deviceId?.trim();
    const secret = data.secret?.trim();
    const resolvedAccountId = data.accountId?.trim() || accountId.trim();
    if (!deviceId || !secret || !resolvedAccountId) {
      throw new EpicAuthError("Creating a lasting Epic login failed: incomplete response", "other");
    }

    return {
      accountId: resolvedAccountId,
      deviceId,
      secret,
      clientId: EGS_DEVICE_AUTH_CLIENT_ID,
    };
  }

  async deleteDeviceAuth(
    accessToken: string,
    accountId: string,
    deviceId: string,
  ): Promise<void> {
    const response = await fetchWithTimeout(
      this.fetchFn,
      `https://${EGS_OAUTH_HOST}/account/api/public/account/${encodeURIComponent(accountId)}/deviceAuth/${encodeURIComponent(deviceId)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `bearer ${accessToken}`,
          "User-Agent": EGS_USER_AGENT,
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      throw epicErrorFromResponse("Revoking the Epic login", response.status, await response.text());
    }
  }

  private async requestToken(
    params: Record<string, string>,
    clientId = EGS_CLIENT_ID,
    clientSecret = EGS_CLIENT_SECRET,
  ): Promise<TokenResponse> {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    // Refresh tokens rotate on use. If a refresh request times out after Epic processed it,
    // replaying it would fail with invalid_grant and look like a dead login, so only retry
    // those when Epic answered with an explicit "try again" status.
    const retryOnNetworkError = params.grant_type !== "refresh_token";
    // Device-code polling has its own loop; retrying inside it only delays the next poll.
    const retry = params.grant_type !== "device_code";

    return this.requestJson<TokenResponse>(
      "Epic sign-in",
      `https://${EGS_OAUTH_HOST}/account/api/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": EGS_USER_AGENT,
          Authorization: `Basic ${auth}`,
        },
        body: new URLSearchParams(params).toString(),
      },
      { retry, retryOnNetworkError },
    );
  }

  /**
   * Refresh an EG1 refresh token. Accounts linked through device-code login hold a token
   * issued to the Fortnite iOS client, while older accounts hold a launcher token; Epic
   * only accepts a refresh token from the client that issued it, so try both.
   */
  async refreshWithAnyClient(refreshToken: string): Promise<TokenResponse> {
    const clients: Array<[string, string]> = [
      [EGS_DEVICE_AUTH_CLIENT_ID, EGS_DEVICE_AUTH_CLIENT_SECRET],
      [EGS_CLIENT_ID, EGS_CLIENT_SECRET],
    ];
    let lastError: unknown;
    for (const [clientId, clientSecret] of clients) {
      try {
        return await this.requestToken(
          { grant_type: "refresh_token", refresh_token: refreshToken, token_type: "eg1" },
          clientId,
          clientSecret,
        );
      } catch (error) {
        if (isTransientEpicError(error)) {
          throw error;
        }
        lastError = error;
      }
    }
    throw lastError;
  }

  private async requestJson<T>(
    action: string,
    url: string,
    init: RequestInit,
    options?: { retry?: boolean; retryOnNetworkError?: boolean },
  ): Promise<T> {
    const send = async (): Promise<T> => {
      const response = await fetchWithTimeout(this.fetchFn, url, init);
      const text = await response.text();
      if (!response.ok) {
        throw epicErrorFromResponse(action, response.status, text);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new EpicAuthError(`${action} failed: Epic sent an unreadable response`, "transient", {
          status: response.status,
        });
      }
    };

    if (options?.retry === false) {
      return send();
    }

    const retryOnNetworkError = options?.retryOnNetworkError ?? true;
    return withRetries(send, (error) =>
      error instanceof EpicAuthError
        ? error.kind === "transient"
        : retryOnNetworkError && isTransientEpicError(error),
    );
  }

  async getExchangeCode(accessToken: string): Promise<string> {
    const data = await this.requestJson<{ code?: string }>(
      "Epic exchange",
      `https://${EGS_OAUTH_HOST}/account/api/oauth/exchange`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          "User-Agent": EGS_USER_AGENT,
        },
      },
    );
    if (!data.code?.trim()) {
      throw new EpicAuthError("Epic exchange failed: no exchange code returned", "other");
    }
    return data.code;
  }

  async exchangeEosToken(exchangeCode: string): Promise<EosTokenResponse> {
    return this.requestEosToken({
      grant_type: "exchange_code",
      exchange_code: exchangeCode,
    });
  }

  async exchangeEosTokenFromSteam(steamTicket: string): Promise<EosTokenResponse> {
    return this.requestEosToken({
      grant_type: "external_auth",
      external_auth_type: "steam_session_ticket",
      external_auth_token: steamTicket,
    });
  }

  async refreshEosToken(refreshToken: string): Promise<EosTokenResponse> {
    return this.requestEosToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  private async requestEosToken(
    params: Record<string, string>,
  ): Promise<EosTokenResponse> {
    const body = new URLSearchParams({
      ...params,
      deployment_id: EOS_DEPLOYMENT_ID,
      scope: "basic_profile",
    });

    const auth = Buffer.from(`${EOS_CLIENT_ID}:${EOS_SECRET}`).toString("base64");

    return this.requestJson<EosTokenResponse>(
      "Epic Online Services sign-in",
      "https://api.epicgames.dev/epic/oauth/v2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
          "User-Agent": EGS_USER_AGENT,
        },
        body: body.toString(),
      },
      { retryOnNetworkError: params.grant_type !== "refresh_token" },
    );
  }
}
