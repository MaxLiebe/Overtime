import { writeFile } from "node:fs/promises";
import { accessTokenIsValid } from "./accounts.js";
import { EGS, EPIC_DEVICE_AUTH_CANCELLED } from "./egs.js";
import { EpicAuthError, epicErrorKind } from "./epicErrors.js";
import { PsyNet, PsyNetRPC } from "./psynet.js";
import type { EpicDeviceAuthCredentials, EosTokenResponse, TokenResponse } from "./types.js";
import { tryProvisionDeviceAuthFromAccessToken } from "./deviceAuth.js";
import { SESSION_EXPIRED_MESSAGE } from "./sessionNotify.js";

export interface AuthenticatedSession {
  rpc: PsyNetRPC;
  displayName: string;
  accountId: string;
  refreshToken: string;
  eosRefreshToken: string;
  eosRefreshExpiresAt?: string;
  deviceAuth?: EpicDeviceAuthCredentials;
}

export interface AuthenticateOptions {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  eosRefreshToken?: string;
  eosRefreshExpiresAt?: string;
  deviceAuth?: EpicDeviceAuthCredentials;
  displayName?: string;
  accountId?: string;
  /** Use tokens straight from an auth-code login — avoids a redundant refresh that can break exchange. */
  tokenResponse?: TokenResponse;
  /** Fresh EOS token from device-code login — skip Epic sign-in entirely. */
  eosTokenResponse?: EosTokenResponse;
  /** Called with rotated EG1 tokens as soon as Epic issues them. */
  onTokenRefreshed?: (auth: TokenResponse) => Promise<void>;
  /** Called whenever a new EOS token is issued — persists per-account EOS credentials. */
  onEosTokenRefreshed?: (eos: EosTokenResponse) => Promise<void>;
  /** Called when long-lived device_auth credentials are created. */
  onDeviceAuthProvisioned?: (deviceAuth: EpicDeviceAuthCredentials) => Promise<void>;
}

/** Epic could not be reached (or was down) for every sign-in route that was tried. */
export class EpicUnavailableError extends Error {
  constructor(detail: string) {
    super(`Couldn't reach Epic Games to sign in (${detail}). Overtime will try again on the next sync.`);
    this.name = "EpicUnavailableError";
  }
}

/** Epic rejected every saved credential for the account: the user has to sign in again. */
export class EpicSessionExpiredError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(SESSION_EXPIRED_MESSAGE);
    this.name = "EpicSessionExpiredError";
    this.detail = detail;
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

function eosRefreshIsValid(refreshExpiresAt?: string, skewMs = 5 * 60_000): boolean {
  if (!refreshExpiresAt?.trim()) {
    return true;
  }

  const expiresAtMs = Date.parse(refreshExpiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs - skewMs > Date.now();
}

/** Result of the Epic half of sign-in, before Rocket League's servers are involved. */
interface EpicLogin {
  eos: EosTokenResponse;
  displayName: string;
  /** EG1 refresh token to keep, when this route produced one. */
  refreshToken?: string;
  /** EG1 access token, which (unlike an EOS token) can create device_auth credentials. */
  eg1AccessToken?: string;
}

interface SignInRoute {
  name: string;
  run: () => Promise<EpicLogin>;
}

async function eosFromEg1(egs: EGS, auth: TokenResponse): Promise<EosTokenResponse> {
  const exchangeCode = await egs.getExchangeCode(auth.access_token);
  return egs.exchangeEosToken(exchangeCode);
}

/**
 * Every way the saved credentials can produce an EOS token, most reliable first. Each
 * route is independent, so one dead token (a rotated refresh token, an access token Epic
 * revoked early) falls through to the next instead of failing the sync.
 */
function signInRoutes(egs: EGS, options: AuthenticateOptions): SignInRoute[] {
  const routes: SignInRoute[] = [];
  const name = options.displayName?.trim() ?? "";

  if (options.eosTokenResponse) {
    const eos = options.eosTokenResponse;
    routes.push({ name: "new login", run: async () => ({ eos, displayName: name }) });
  }

  if (options.tokenResponse) {
    const auth = options.tokenResponse;
    routes.push({
      name: "new login",
      run: async () => ({
        eos: await eosFromEg1(egs, auth),
        displayName: name || auth.displayName,
        refreshToken: auth.refresh_token,
        eg1AccessToken: auth.access_token,
      }),
    });
  }

  if (accessTokenIsValid(options.accessToken, options.accessTokenExpiresAt)) {
    const accessToken = options.accessToken!.trim();
    routes.push({
      name: "saved session",
      run: async () => {
        const exchangeCode = await egs.getExchangeCode(accessToken);
        return {
          eos: await egs.exchangeEosToken(exchangeCode),
          displayName: name,
          eg1AccessToken: accessToken,
        };
      },
    });
  }

  const deviceAuth = options.deviceAuth;
  if (deviceAuth?.accountId?.trim() && deviceAuth.deviceId?.trim() && deviceAuth.secret?.trim()) {
    routes.push({
      name: "lasting login",
      run: async () => {
        const auth = await egs.authenticateWithDeviceAuth(deviceAuth);
        await options.onTokenRefreshed?.(auth);
        return {
          eos: await eosFromEg1(egs, auth),
          displayName: name || auth.displayName,
          refreshToken: auth.refresh_token,
          eg1AccessToken: auth.access_token,
        };
      },
    });
  }

  const eosRefreshToken = options.eosRefreshToken?.trim();
  if (eosRefreshToken && eosRefreshIsValid(options.eosRefreshExpiresAt)) {
    routes.push({
      name: "Epic Online Services refresh",
      run: async () => ({
        eos: await egs.refreshEosToken(eosRefreshToken),
        displayName: name,
      }),
    });
  }

  const refreshToken = options.refreshToken?.trim();
  if (refreshToken) {
    routes.push({
      name: "refresh token",
      run: async () => {
        const auth = await egs.refreshWithAnyClient(refreshToken);
        await options.onTokenRefreshed?.(auth);
        return {
          eos: await eosFromEg1(egs, auth),
          displayName: name || auth.displayName,
          refreshToken: auth.refresh_token,
          eg1AccessToken: auth.access_token,
        };
      },
    });
  }

  return routes;
}

/**
 * Get an EOS token for the account, trying each saved credential in turn. Throws
 * `EpicUnavailableError` when Epic could not be reached for some route (so the saved login
 * may still be fine), and `EpicSessionExpiredError` only when Epic rejected all of them.
 */
async function signInToEpic(options: AuthenticateOptions): Promise<EpicLogin> {
  const egs = new EGS();
  const routes = signInRoutes(egs, options);
  if (routes.length === 0) {
    throw new EpicSessionExpiredError("no saved Epic credentials");
  }

  const failures: Array<{ route: string; error: unknown }> = [];
  for (const route of routes) {
    try {
      const login = await route.run();
      await options.onEosTokenRefreshed?.(login.eos);
      return login;
    } catch (error) {
      if (error instanceof Error && error.message === EPIC_DEVICE_AUTH_CANCELLED) {
        throw error;
      }
      failures.push({ route: route.name, error });
    }
  }

  const describe = ({ route, error }: { route: string; error: unknown }) =>
    `${route}: ${error instanceof Error ? error.message : String(error)}`;

  const transient = failures.find(({ error }) => epicErrorKind(error) === "transient");
  if (transient) {
    throw new EpicUnavailableError(describe(transient));
  }

  const unexpected = failures.find(({ error }) => epicErrorKind(error) === "other");
  if (unexpected && !failures.some(({ error }) => epicErrorKind(error) === "credentials")) {
    // Nothing said the login is dead; report what went wrong instead of asking to re-add.
    throw new EpicAuthError(`Epic sign-in failed (${describe(unexpected)})`, "other");
  }

  throw new EpicSessionExpiredError(failures.map(describe).join("; "));
}

/**
 * Sign in to Epic and then to Rocket League's servers.
 *
 * The two halves fail for different reasons and are reported separately: an Epic failure
 * means the saved login needs attention (or Epic is unreachable), while a PsyNet failure
 * (for example `BuildNotFound` after a game patch) says nothing about the login and must
 * not be reported as an expired session.
 */
export async function authenticate(
  options: AuthenticateOptions = {},
): Promise<AuthenticatedSession> {
  const login = await signInToEpic(options);

  // Create lasting credentials before contacting PsyNet, so a server-side rejection there
  // does not cost the user their saved login.
  let deviceAuth = options.deviceAuth;
  if (!deviceAuth && login.eg1AccessToken) {
    const provisioned = await tryProvisionDeviceAuthFromAccessToken(login.eg1AccessToken);
    if (provisioned) {
      deviceAuth = provisioned;
      await options.onDeviceAuthProvisioned?.(provisioned);
    }
  }

  const session = await authenticateFromEosToken(
    login.eos,
    login.displayName || options.displayName || "",
    login.refreshToken?.trim() || options.refreshToken || "",
  );
  return deviceAuth ? { ...session, deviceAuth } : session;
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

  await rpc.waitForOpen();

  const resolvedName = displayName.trim() || verifiedPlayerName;

  return {
    rpc,
    displayName: resolvedName,
    accountId: eosToken.account_id,
    refreshToken: refreshTokenFallback,
    eosRefreshToken: eosToken.refresh_token,
    eosRefreshExpiresAt: eosToken.refresh_expires_at,
  };
}

export type DeviceAuthorizationRequest = Awaited<
  ReturnType<EGS["startEg1DeviceAuthorization"]>
>;

export async function startDeviceAuthorization(): Promise<DeviceAuthorizationRequest> {
  // EG1 Switch device-code → exchange to iOS → lasting device_auth (see completeDeviceAuthorization).
  return new EGS().startEg1DeviceAuthorization();
}

/** Epic login that can be stored before PsyNet accepts the client build. */
export interface LinkedEpicLogin {
  displayName: string;
  accountId: string;
  refreshToken: string;
  eosRefreshToken: string;
  eosRefreshExpiresAt?: string;
  deviceAuth?: EpicDeviceAuthCredentials;
}

export async function completeDeviceAuthorization(
  device: DeviceAuthorizationRequest,
  options?: { signal?: AbortSignal },
): Promise<{
  eosToken: EosTokenResponse;
  session: LinkedEpicLogin;
  /** Set when Epic login succeeded but Rocket League PsyNet rejected the client. */
  psyNetError?: string;
}> {
  const egs = new EGS();
  // Switch client: device_code works. iOS client: can create lasting device_auth.
  const switchAuth = await egs.waitForEg1DeviceAuthorization(device, options);

  const toIosExchange = await egs.getExchangeCode(switchAuth.access_token);
  const iosAuth = await egs.authenticateWithExchangeCode(toIosExchange);

  // Must succeed — without device_auth, sessions die when short-lived tokens expire (~1 day).
  const deviceAuth = await egs.createDeviceAuth(iosAuth.access_token, iosAuth.account_id);

  const toEosExchange = await egs.getExchangeCode(iosAuth.access_token);
  const eosToken = await egs.exchangeEosToken(toEosExchange);
  if (options?.signal?.aborted) {
    throw new Error(EPIC_DEVICE_AUTH_CANCELLED);
  }

  const login: LinkedEpicLogin = {
    accountId: eosToken.account_id,
    displayName: (iosAuth.displayName || switchAuth.displayName).trim(),
    refreshToken: iosAuth.refresh_token?.trim() || "",
    eosRefreshToken: eosToken.refresh_token,
    eosRefreshExpiresAt: eosToken.refresh_expires_at,
    deviceAuth,
  };

  // PsyNet is a separate gate from the Epic login. A rejection there must not discard
  // device_auth: that credential is what lets later syncs retry without another sign-in.
  try {
    const session = await authenticateFromEosToken(
      eosToken,
      login.displayName,
      login.refreshToken,
    );
    // The first sync opens its own connection with this EOS token.
    await session.rpc.close();
    return {
      eosToken,
      session: {
        ...login,
        displayName: session.displayName || login.displayName,
      },
    };
  } catch (error) {
    if (
      options?.signal?.aborted ||
      (error instanceof Error && error.message === EPIC_DEVICE_AUTH_CANCELLED)
    ) {
      throw new Error(EPIC_DEVICE_AUTH_CANCELLED);
    }

    return {
      eosToken,
      session: login,
      psyNetError: error instanceof Error ? error.message : String(error),
    };
  }
}
