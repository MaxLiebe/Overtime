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
}

export interface AuthenticateOptions {
  refreshToken?: string;
  refreshTokenPath?: string;
  authCode?: string;
  onAuthCodeNeeded?: () => Promise<string>;
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
  refreshTokenPath = REFRESH_TOKEN_FILE,
): Promise<TokenResponse> {
  const egs = new EGS();
  const auth = await egs.authenticateWithCode(authCode.trim());
  await writeFile(refreshTokenPath, auth.refresh_token, "utf8");
  return auth;
}

export async function authenticate(
  options: AuthenticateOptions = {},
): Promise<AuthenticatedSession> {
  const refreshTokenPath = options.refreshTokenPath ?? REFRESH_TOKEN_FILE;
  const egs = new EGS();

  let auth: TokenResponse;

  if (options.authCode) {
    auth = await loginWithAuthCode(options.authCode, refreshTokenPath);
  } else if (options.refreshToken?.trim()) {
    auth = await egs.authenticateWithRefreshToken(options.refreshToken.trim());
  } else {
    try {
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
        auth = await loginWithAuthCode(authCode, refreshTokenPath);
      } else {
        throw new Error("No Epic account linked. Add an account in settings first.");
      }
    }
  }

  if (refreshTokenPath) {
    await writeFile(refreshTokenPath, auth.refresh_token, "utf8");
  }

  const exchangeCode = await egs.getExchangeCode(auth.access_token);
  const eosToken = await egs.exchangeEosToken(exchangeCode);

  const psyNet = new PsyNet();
  const rpc = await psyNet.authPlayer(
    eosToken.access_token,
    eosToken.account_id,
    auth.displayName,
  );

  await waitForConnection(rpc);

  return {
    rpc,
    displayName: auth.displayName,
    accountId: eosToken.account_id,
    refreshToken: auth.refresh_token,
  };
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
): Promise<AuthenticatedSession> {
  const psyNet = new PsyNet();
  const rpc = await psyNet.authPlayer(
    eosToken.access_token,
    eosToken.account_id,
    displayName,
  );

  await waitForConnection(rpc);

  return {
    rpc,
    displayName,
    accountId: eosToken.account_id,
    refreshToken: eosToken.refresh_token,
  };
}
