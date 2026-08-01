import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { EGS } from "./egs.js";
import { PsyNet, PsyNetRPC } from "./psynet.js";
import type { EosTokenResponse, TokenResponse } from "./types.js";

const REFRESH_TOKEN_FILE = ".rlshops";

export interface AuthenticatedSession {
  rpc: PsyNetRPC;
  displayName: string;
  accountId: string;
  refreshToken: string;
  eosRefreshToken: string;
  eosRefreshExpiresAt?: string;
}

export interface AuthenticateOptions {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  eosRefreshToken?: string;
  eosRefreshExpiresAt?: string;
  displayName?: string;
  accountId?: string;
  /** Use tokens straight from an auth-code login — avoids a redundant refresh that can break exchange. */
  tokenResponse?: TokenResponse;
  /** Fresh EOS token from device-code login — skip launcher auth entirely. */
  eosTokenResponse?: EosTokenResponse;
  refreshTokenPath?: string;
  authCode?: string;
  onAuthCodeNeeded?: () => Promise<string>;
  /** Called with rotated tokens immediately after refresh, before exchange. */
  onTokenRefreshed?: (auth: TokenResponse) => Promise<void>;
  /** Called when EOS refresh succeeds — persists per-account EOS credentials. */
  onEosTokenRefreshed?: (eos: EosTokenResponse) => Promise<void>;
}

export async function getAuthLoginUrl(options?: { forceLogin?: boolean }): Promise<string> {
  return new EGS().getAuthUrl(options);
}

export async function hasRefreshToken(
  refreshTokenPath = REFRESH_TOKEN_FILE,
): Promise<boolean> {
  try {
    const refreshTokenData = await readFile(refreshTokenPath, "utf8");
    return refreshTokenData.trim().length > 0;
  } catch {
    return false;
  }
}

export async function loginWithAuthCode(
  authCode: string,
  refreshTokenPath?: string,
): Promise<TokenResponse> {
  const egs = new EGS();
  const auth = await egs.authenticateWithCode(authCode.trim());
  if (refreshTokenPath) {
    await writeFile(refreshTokenPath, auth.refresh_token, "utf8");
  }
  return auth;
}

function accessTokenIsValid(accessToken?: string, expiresAt?: string, skewMs = 5 * 60_000): boolean {
  if (!accessToken?.trim() || !expiresAt?.trim()) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs - skewMs > Date.now();
}

function eosRefreshIsValid(refreshExpiresAt?: string, skewMs = 5 * 60_000): boolean {
  if (!refreshExpiresAt?.trim()) {
    return true;
  }

  const expiresAtMs = Date.parse(refreshExpiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs - skewMs > Date.now();
}

function sessionFromEosTokenResponse(
  eosToken: EosTokenResponse,
  displayName: string,
  refreshTokenFallback = "",
): AuthenticatedSession {
  return {
    rpc: undefined as unknown as PsyNetRPC,
    displayName,
    accountId: eosToken.account_id,
    refreshToken: refreshTokenFallback,
    eosRefreshToken: eosToken.refresh_token,
    eosRefreshExpiresAt: eosToken.refresh_expires_at,
  };
}

export async function connectEpicSession(
  auth: TokenResponse,
  refreshTokenFallback?: string,
  options?: {
    allowRefreshFallback?: boolean;
    onEosTokenRefreshed?: (eos: EosTokenResponse) => Promise<void>;
  },
): Promise<AuthenticatedSession> {
  const egs = new EGS();

  let exchangeCode: string;
  try {
    exchangeCode = await egs.getExchangeCode(auth.access_token);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Epic exchange failed: ${message}`);
  }

  let eosToken: EosTokenResponse;
  try {
    eosToken = await egs.exchangeEosToken(exchangeCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Epic EOS token failed: ${message}`);
  }

  await options?.onEosTokenRefreshed?.(eosToken);

  const psyNet = new PsyNet();
  const { rpc, verifiedPlayerName } = await psyNet.authPlayer(
    eosToken.access_token,
    eosToken.account_id,
    auth.displayName,
  );

  await waitForConnection(rpc);

  const displayName = auth.displayName.trim() || verifiedPlayerName;

  return {
    rpc,
    displayName,
    accountId: eosToken.account_id,
    refreshToken:
      auth.refresh_token?.trim() ||
      (options?.allowRefreshFallback !== false ? refreshTokenFallback?.trim() : "") ||
      "",
    eosRefreshToken: eosToken.refresh_token,
    eosRefreshExpiresAt: eosToken.refresh_expires_at,
  };
}

async function authenticateViaEosRefresh(
  options: AuthenticateOptions,
): Promise<AuthenticatedSession | null> {
  if (!options.eosRefreshToken?.trim() || !options.displayName?.trim()) {
    return null;
  }

  if (!eosRefreshIsValid(options.eosRefreshExpiresAt)) {
    return null;
  }

  const egs = new EGS();
  try {
    const eosToken = await egs.refreshEosToken(options.eosRefreshToken.trim());
    await options.onEosTokenRefreshed?.(eosToken);
    return authenticateFromEosToken(eosToken, options.displayName, options.refreshToken ?? "");
  } catch {
    return null;
  }
}

export async function authenticate(
  options: AuthenticateOptions = {},
): Promise<AuthenticatedSession> {
  const usePerAccountToken = Boolean(
    options.refreshToken?.trim() ||
      options.tokenResponse ||
      options.accessToken?.trim() ||
      options.eosRefreshToken?.trim(),
  );
  const refreshTokenPath =
    options.refreshTokenPath !== undefined
      ? options.refreshTokenPath || null
      : usePerAccountToken
        ? null
        : REFRESH_TOKEN_FILE;
  const egs = new EGS();

  let auth: TokenResponse;

  if (options.eosTokenResponse) {
    await options.onEosTokenRefreshed?.(options.eosTokenResponse);
    return authenticateFromEosToken(
      options.eosTokenResponse,
      options.displayName ?? "",
      options.refreshToken ?? "",
    );
  }

  if (options.tokenResponse) {
    auth = options.tokenResponse;
  } else if (
    accessTokenIsValid(options.accessToken, options.accessTokenExpiresAt) &&
    options.displayName &&
    options.accountId
  ) {
    auth = {
      access_token: options.accessToken!.trim(),
      refresh_token: options.refreshToken ?? "",
      expires_in: 0,
      expires_at: options.accessTokenExpiresAt!,
      token_type: "bearer",
      client_id: "",
      internal_client: false,
      client_service: "",
      account_id: options.accountId,
      displayName: options.displayName,
      app: "",
      in_app_id: "",
      device_id: "",
    };
  } else {
    const eosSession = await authenticateViaEosRefresh(options);
    if (eosSession) {
      return eosSession;
    }

    if (options.authCode) {
      auth = await loginWithAuthCode(options.authCode, refreshTokenPath ?? undefined);
    } else if (options.refreshToken?.trim()) {
      auth = await egs.authenticateWithRefreshToken(options.refreshToken.trim());
      await options.onTokenRefreshed?.(auth);
    } else {
      try {
        if (!refreshTokenPath) {
          throw new Error("No Epic account linked. Add an account in settings first.");
        }

        const refreshTokenData = await readFile(refreshTokenPath, "utf8");
        const refreshToken = refreshTokenData.trim();
        if (refreshToken) {
          auth = await egs.authenticateWithRefreshToken(refreshToken);
        } else if (options.onAuthCodeNeeded) {
          const authCode = await options.onAuthCodeNeeded();
          auth = await loginWithAuthCode(authCode, refreshTokenPath);
        } else {
          auth = await authenticateWithCode(egs, refreshTokenPath);
        }
      } catch {
        if (options.onAuthCodeNeeded) {
          const authCode = await options.onAuthCodeNeeded();
          auth = await loginWithAuthCode(authCode, refreshTokenPath ?? undefined);
        } else {
          throw new Error("No Epic account linked. Add an account in settings first.");
        }
      }
    }
  }

  if (!options.tokenResponse && !options.refreshToken?.trim() && refreshTokenPath) {
    await writeFile(refreshTokenPath, auth.refresh_token, "utf8");
  }

  const usedRefreshGrant =
    Boolean(options.refreshToken?.trim()) &&
    !options.tokenResponse &&
    !accessTokenIsValid(options.accessToken, options.accessTokenExpiresAt);

  const session = await connectEpicSession(auth, options.refreshToken ?? auth.refresh_token, {
    allowRefreshFallback: !usedRefreshGrant,
    onEosTokenRefreshed: options.onEosTokenRefreshed,
  });
  return session;
}

async function authenticateWithCode(
  egs: EGS,
  refreshTokenPath: string,
): Promise<TokenResponse> {
  console.log("Open this URL in your browser to authenticate:");
  console.log(egs.getAuthUrl());
  console.log();

  const rl = createInterface({ input, output });
  const authCode = (await rl.question("Auth code: ")).trim();
  rl.close();

  return loginWithAuthCode(authCode, refreshTokenPath);
}

async function waitForConnection(rpc: PsyNetRPC, timeoutMs = 15_000): Promise<void> {
  if (rpc.isConnected()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket connection"));
    }, timeoutMs);

    const interval = setInterval(() => {
      if (rpc.isConnected()) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

export async function authenticateFromEosToken(
  eosToken: EosTokenResponse,
  displayName: string,
  refreshTokenFallback = "",
): Promise<AuthenticatedSession> {
  const psyNet = new PsyNet();
  const { rpc, verifiedPlayerName } = await psyNet.authPlayer(
    eosToken.access_token,
    eosToken.account_id,
    displayName,
  );

  await waitForConnection(rpc);

  const resolvedName = displayName.trim() || verifiedPlayerName;

  return {
    ...sessionFromEosTokenResponse(eosToken, resolvedName, refreshTokenFallback),
    rpc,
    displayName: resolvedName,
  };
}

export async function loginWithDeviceCode(): Promise<{
  eosToken: EosTokenResponse;
  session: AuthenticatedSession;
}> {
  const egs = new EGS();
  const device = await egs.authenticateWithDevice();
  const eosToken = await egs.waitForDeviceAuthorization(device);
  const session = await authenticateFromEosToken(eosToken, "");
  return { eosToken, session };
}

export type DeviceAuthorizationRequest = Awaited<
  ReturnType<EGS["authenticateWithDevice"]>
>;

export async function startDeviceAuthorization(): Promise<DeviceAuthorizationRequest> {
  return new EGS().authenticateWithDevice();
}

export async function completeDeviceAuthorization(
  device: DeviceAuthorizationRequest,
  options?: { signal?: AbortSignal },
): Promise<{ eosToken: EosTokenResponse; session: AuthenticatedSession }> {
  const egs = new EGS();
  const eosToken = await egs.waitForDeviceAuthorization(device, options);
  const session = await authenticateFromEosToken(eosToken, "");
  return { eosToken, session };
}
