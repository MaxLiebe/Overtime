import { EGS } from "./egs.js";
import {
  EGS_DEVICE_AUTH_CLIENT_ID,
  EGS_DEVICE_AUTH_CLIENT_SECRET,
} from "./constants.js";
import type { EpicDeviceAuthCredentials, EosTokenResponse, TokenResponse } from "./types.js";
import {
  sessionFromAuth,
  sessionFromEos,
  type LinkedAccount,
} from "./accounts.js";
import { accountHasDeviceAuth } from "./deviceAuthStore.js";

/**
 * Create long-lived device_auth credentials from any usable EG1/EOS access token
 * by exchanging into the iOS client (which can create deviceAuths).
 */
export async function provisionDeviceAuthFromAccessToken(
  accessToken: string,
): Promise<EpicDeviceAuthCredentials> {
  const egs = new EGS();
  const exchangeCode = await egs.getExchangeCode(accessToken);
  const iosAuth = await egs.authenticateWithExchangeCode(
    exchangeCode,
    EGS_DEVICE_AUTH_CLIENT_ID,
    EGS_DEVICE_AUTH_CLIENT_SECRET,
  );

  return egs.createDeviceAuth(iosAuth.access_token, iosAuth.account_id);
}

/** Best-effort provisioning — returns null when Epic rejects the exchange/create path. */
export async function tryProvisionDeviceAuthFromAccessToken(
  accessToken: string | undefined,
): Promise<EpicDeviceAuthCredentials | null> {
  if (!accessToken?.trim()) {
    return null;
  }

  try {
    return await provisionDeviceAuthFromAccessToken(accessToken.trim());
  } catch {
    return null;
  }
}

export async function authenticateWithStoredDeviceAuth(
  credentials: EpicDeviceAuthCredentials,
): Promise<{ auth: TokenResponse; eos?: EosTokenResponse }> {
  const egs = new EGS();
  const auth = await egs.authenticateWithDeviceAuth(credentials);

  try {
    const exchangeCode = await egs.getExchangeCode(auth.access_token);
    const eos = await egs.exchangeEosToken(exchangeCode);
    return { auth, eos };
  } catch {
    return { auth };
  }
}

export async function refreshViaDeviceAuth(
  account: LinkedAccount,
): Promise<Partial<LinkedAccount> | null> {
  if (!accountHasDeviceAuth(account) || !account.deviceAuth) {
    return null;
  }

  const { auth, eos } = await authenticateWithStoredDeviceAuth(account.deviceAuth);
  return {
    ...sessionFromAuth(auth),
    ...(auth.refresh_token?.trim() ? { refreshToken: auth.refresh_token.trim() } : {}),
    ...(eos ? sessionFromEos(eos) : {}),
    lastSyncError: undefined,
  };
}

export async function revokeStoredDeviceAuth(
  credentials: EpicDeviceAuthCredentials,
): Promise<void> {
  try {
    const egs = new EGS();
    const auth = await egs.authenticateWithDeviceAuth(credentials);
    await egs.deleteDeviceAuth(auth.access_token, credentials.accountId, credentials.deviceId);
  } catch {
    // Local delete still proceeds even if remote revoke fails.
  }
}
