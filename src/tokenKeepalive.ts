import { EGS } from "./egs.js";
import {
  accountAccessTokenIsValid,
  accountEosRefreshIsValid,
  loadAccounts,
  modifyAccounts,
  sessionFromAuth,
  sessionFromEos,
  updateAccount,
  type LinkedAccount,
} from "./accounts.js";

/** How often to scan linked accounts for tokens that need renewing. */
export const TOKEN_KEEPALIVE_INTERVAL_MS = 30 * 60_000;

/** Renew when the token expires within this window. */
const REFRESH_LEAD_MS = 90 * 60_000;

function expiresWithin(expiresAt: string | undefined, leadMs: number): boolean {
  if (!expiresAt?.trim()) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs - leadMs <= Date.now();
}

function needsEosRefresh(account: LinkedAccount): boolean {
  if (!account.eosRefreshToken?.trim()) {
    return false;
  }

  // Still usable now, but close enough to expiry that we should rotate.
  return (
    accountEosRefreshIsValid(account, 0) &&
    expiresWithin(account.eosRefreshExpiresAt, REFRESH_LEAD_MS)
  );
}

function needsEg1Refresh(account: LinkedAccount): boolean {
  if (!account.refreshToken?.trim()) {
    return false;
  }

  const eosMissingOrExpiring =
    !accountEosRefreshIsValid(account, 0) ||
    expiresWithin(account.eosRefreshExpiresAt, REFRESH_LEAD_MS);

  // Access still good and EOS refresh healthy — nothing to do.
  if (accountAccessTokenIsValid(account, REFRESH_LEAD_MS) && !eosMissingOrExpiring) {
    return false;
  }

  return eosMissingOrExpiring || !accountAccessTokenIsValid(account, REFRESH_LEAD_MS);
}

async function refreshEosOnly(account: LinkedAccount): Promise<Partial<LinkedAccount> | null> {
  const egs = new EGS();
  const eos = await egs.refreshEosToken(account.eosRefreshToken!.trim());
  return {
    ...sessionFromEos(eos),
    lastSyncError: undefined,
  };
}

async function refreshEg1AndEos(account: LinkedAccount): Promise<Partial<LinkedAccount> | null> {
  const egs = new EGS();
  const auth = await egs.authenticateWithRefreshToken(account.refreshToken.trim());
  const updates: Partial<LinkedAccount> = {
    ...sessionFromAuth(auth),
    ...(auth.refresh_token?.trim() ? { refreshToken: auth.refresh_token.trim() } : {}),
    lastSyncError: undefined,
  };

  try {
    const exchangeCode = await egs.getExchangeCode(auth.access_token);
    const eos = await egs.exchangeEosToken(exchangeCode);
    Object.assign(updates, sessionFromEos(eos));
  } catch {
    // EG1 refresh alone still extends the launcher session; EOS can wait for sync.
  }

  return updates;
}

/** HTTP-only token refresh for one account. Does not open PsyNet. */
export async function refreshAccountTokensIfNeeded(
  account: LinkedAccount,
): Promise<Partial<LinkedAccount> | null> {
  if (!account.enabled) {
    return null;
  }

  if (needsEosRefresh(account)) {
    return refreshEosOnly(account);
  }

  if (needsEg1Refresh(account)) {
    return refreshEg1AndEos(account);
  }

  return null;
}

export interface KeepAccountTokensAliveOptions {
  /** Skip while a sync (or other auth work) is in progress. */
  isBusy?: () => boolean;
}

/**
 * Quietly renew Epic tokens that are nearing expiry so sessions survive between syncs.
 * Failures are ignored — the next sync surfaces auth problems.
 */
export async function keepAccountTokensAlive(
  accountsPath: string,
  options?: KeepAccountTokensAliveOptions,
): Promise<LinkedAccount[]> {
  if (options?.isBusy?.()) {
    return loadAccounts(accountsPath);
  }

  let accounts = await loadAccounts(accountsPath);

  for (const account of accounts) {
    if (options?.isBusy?.()) {
      break;
    }

    if (!account.enabled) {
      continue;
    }

    try {
      const updates = await refreshAccountTokensIfNeeded(account);
      if (!updates) {
        continue;
      }

      accounts = await modifyAccounts(accountsPath, (current) =>
        updateAccount(current, account.accountId, updates),
      );
    } catch {
      // Keepalive must stay silent; sync will report hard failures.
    }
  }

  return accounts;
}
