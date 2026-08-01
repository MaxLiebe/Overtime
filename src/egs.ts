import {
  EOS_CLIENT_ID,
  EOS_DEPLOYMENT_ID,
  EOS_SECRET,
  EGS_CLIENT_ID,
  EGS_CLIENT_SECRET,
  EGS_OAUTH_HOST,
  EGS_USER_AGENT,
} from "./constants.js";
import type {
  DeviceAuthResponse,
  EosTokenResponse,
  TokenResponse,
} from "./types.js";

export const EPIC_DEVICE_AUTH_CANCELLED = "Epic sign-in was cancelled.";

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

export function extractAuthCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    const queryCode = parsed.searchParams.get("code");
    if (queryCode && isValidEpicAuthCode(queryCode)) {
      return queryCode;
    }

    if (parsed.hash.startsWith("#")) {
      const hashCode = new URLSearchParams(parsed.hash.slice(1)).get("code");
      if (hashCode && isValidEpicAuthCode(hashCode)) {
        return hashCode;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function isValidEpicAuthCode(code: string): boolean {
  return /^[a-f0-9]{32}$/i.test(code);
}

export interface EpicRedirectResponse {
  redirectUrl?: string | null;
  authorizationCode?: string | null;
  exchangeCode?: string | null;
  sid?: string | null;
}

/** Parse Epic's /id/api/redirect JSON response or embedded redirect URL. */
export function parseEpicAuthResponse(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as EpicRedirectResponse;
      if (parsed.authorizationCode && isValidEpicAuthCode(parsed.authorizationCode)) {
        return parsed.authorizationCode;
      }
      if (parsed.redirectUrl) {
        return extractAuthCodeFromUrl(parsed.redirectUrl);
      }
      return null;
    } catch {
      return null;
    }
  }

  return extractAuthCodeFromUrl(trimmed);
}

export function isEpicRedirectPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.endsWith("epicgames.com") &&
      parsed.pathname === "/id/api/redirect"
    );
  } catch {
    return false;
  }
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

  private async requestToken(params: Record<string, string>): Promise<TokenResponse> {
    const body = new URLSearchParams(params);
    const auth = Buffer.from(`${EGS_CLIENT_ID}:${EGS_CLIENT_SECRET}`).toString("base64");

    const response = await this.fetchFn(
      `https://${EGS_OAUTH_HOST}/account/api/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": EGS_USER_AGENT,
          Authorization: `Basic ${auth}`,
        },
        body,
      },
    );

    const text = await response.text();
    const token = JSON.parse(text) as TokenResponse & {
      errorCode?: string;
      errorMessage?: string;
    };

    if (!response.ok) {
      throw new Error(
        `authentication failed: ${response.status} - ${token.errorCode ?? "unknown"} - ${token.errorMessage ?? text}`,
      );
    }

    return token;
  }

  async getExchangeCode(accessToken: string): Promise<string> {
    const response = await this.fetchFn(
      `https://${EGS_OAUTH_HOST}/account/api/oauth/exchange`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          "User-Agent": EGS_USER_AGENT,
        },
      },
    );

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`unexpected status code ${response.status}: ${text}`);
    }

    const data = JSON.parse(text) as { code: string };
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

  async authenticateWithDevice(): Promise<DeviceAuthResponse> {
    const response = await this.fetchFn(
      "https://api.epicgames.dev/epic/oauth/v2/deviceAuthorization",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": EGS_USER_AGENT,
        },
        body: new URLSearchParams({ client_id: EOS_CLIENT_ID }),
      },
    );

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`unexpected status code ${response.status}: ${text}`);
    }

    return JSON.parse(text) as DeviceAuthResponse;
  }

  async waitForDeviceAuthorization(
    device: DeviceAuthResponse,
    options?: { signal?: AbortSignal },
  ): Promise<EosTokenResponse> {
    const attempts = Math.floor(device.expires_in / device.interval);

    for (let i = 0; i < attempts; i++) {
      if (options?.signal?.aborted) {
        throw new Error(EPIC_DEVICE_AUTH_CANCELLED);
      }

      try {
        return await this.requestEosToken({
          grant_type: "device_code",
          device_code: device.device_code,
        });
      } catch {
        await abortableDelay(device.interval * 1000, options?.signal);
      }
    }

    throw new Error("device authorization timed out");
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

    const response = await this.fetchFn(
      "https://api.epicgames.dev/epic/oauth/v2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
          "User-Agent": EGS_USER_AGENT,
        },
        body,
      },
    );

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`unexpected status code ${response.status}: ${text}`);
    }

    return JSON.parse(text) as EosTokenResponse;
  }
}
