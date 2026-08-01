import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EosTokenResponse, TokenResponse } from "./types.js";
import { SESSION_REVOKED_MESSAGE } from "./sessionNotify.js";

export interface LinkedAccount {
  accountId: string;
  displayName: string;
  refreshToken: string;
  /** Cached OAuth access token — avoids refresh while still valid. */
  accessToken?: string;
  accessTokenExpiresAt?: string;
  /** EOS refresh token — independent per account, used when launcher refresh is revoked. */
  eosRefreshToken?: string;
  eosRefreshExpiresAt?: string;
  addedAt: string;
  enabled: boolean;
  platformPlayerId?: string;
  lastSyncAt?: string;
  lastSyncMessage?: string;
  lastSyncError?: string;
}

/** Account fields safe to expose to the renderer (no OAuth/EOS secrets). */
export type PublicLinkedAccount = Omit<
  LinkedAccount,
  | "refreshToken"
  | "accessToken"
  | "accessTokenExpiresAt"
  | "eosRefreshToken"
  | "eosRefreshExpiresAt"
>;

export function toPublicAccount(account: LinkedAccount): PublicLinkedAccount {
  const {
    refreshToken: _refreshToken,
    accessToken: _accessToken,
    accessTokenExpiresAt: _accessTokenExpiresAt,
    eosRefreshToken: _eosRefreshToken,
    eosRefreshExpiresAt: _eosRefreshExpiresAt,
    ...publicAccount
  } = account;
  return publicAccount;
}

export function toPublicAccounts(accounts: LinkedAccount[]): PublicLinkedAccount[] {
  return accounts.map(toPublicAccount);
}

type StoredAccount = Omit<
  LinkedAccount,
  "refreshToken" | "accessToken" | "accessTokenExpiresAt" | "eosRefreshToken" | "eosRefreshExpiresAt"
> & {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt?: string;
  eosRefreshToken?: string;
  eosRefreshExpiresAt?: string;
};

export function getAccountsPath(userDataDir: string): string {
  return join(userDataDir, "accounts.json");
}

function getTokensDir(accountsPath: string): string {
  return join(dirname(accountsPath), "tokens");
}

function getTokenPath(accountsPath: string, accountId: string): string {
  return join(getTokensDir(accountsPath), `${accountId}.token`);
}

function getSessionPath(accountsPath: string, accountId: string): string {
  return join(getTokensDir(accountsPath), `${accountId}.session.json`);
}

function getEosTokenPath(accountsPath: string, accountId: string): string {
  return join(getTokensDir(accountsPath), `${accountId}.eos.json`);
}

interface StoredEosRefresh {
  eosRefreshToken?: string;
  eosRefreshExpiresAt?: string;
}

async function writeAccountRefreshTokenFile(
  accountsPath: string,
  accountId: string,
  refreshToken: string,
): Promise<void> {
  const token = refreshToken.trim();
  if (!token) {
    return;
  }

  const tokenPath = getTokenPath(accountsPath, accountId);
  await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
  await writeFile(tokenPath, token, { encoding: "utf8", mode: 0o600 });
}

/** Persist a refresh token immediately — serialized through the accounts write chain. */
export async function setAccountRefreshToken(
  accountsPath: string,
  accountId: string,
  refreshToken: string,
): Promise<void> {
  await modifyAccounts(accountsPath, (accounts) =>
    updateAccount(accounts, accountId, { refreshToken: refreshToken.trim() }),
  );
}

async function loadAccountRefreshToken(
  accountsPath: string,
  accountId: string,
): Promise<string | null> {
  try {
    const token = (await readFile(getTokenPath(accountsPath, accountId), "utf8")).trim();
    return token || null;
  } catch {
    return null;
  }
}

async function deleteAccountRefreshToken(
  accountsPath: string,
  accountId: string,
): Promise<void> {
  try {
    await unlink(getTokenPath(accountsPath, accountId));
  } catch {
    // Token file may already be gone.
  }
}

interface StoredAccountSession {
  accessToken?: string;
  accessTokenExpiresAt?: string;
}

async function loadAccountSession(
  accountsPath: string,
  accountId: string,
): Promise<StoredAccountSession | null> {
  try {
    const raw = await readFile(getSessionPath(accountsPath, accountId), "utf8");
    const parsed = JSON.parse(raw) as StoredAccountSession;
    if (!parsed.accessToken?.trim() || !parsed.accessTokenExpiresAt?.trim()) {
      return null;
    }
    return {
      accessToken: parsed.accessToken.trim(),
      accessTokenExpiresAt: parsed.accessTokenExpiresAt.trim(),
    };
  } catch {
    return null;
  }
}

async function writeAccountSessionFile(
  accountsPath: string,
  accountId: string,
  session: StoredAccountSession,
): Promise<void> {
  const sessionPath = getSessionPath(accountsPath, accountId);
  await mkdir(dirname(sessionPath), { recursive: true, mode: 0o700 });
  await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function deleteAccountSession(
  accountsPath: string,
  accountId: string,
): Promise<void> {
  try {
    await unlink(getSessionPath(accountsPath, accountId));
  } catch {
    // Session file may already be gone.
  }
}

async function loadAccountEosRefresh(
  accountsPath: string,
  accountId: string,
): Promise<StoredEosRefresh | null> {
  try {
    const raw = await readFile(getEosTokenPath(accountsPath, accountId), "utf8");
    const parsed = JSON.parse(raw) as StoredEosRefresh;
    if (!parsed.eosRefreshToken?.trim()) {
      return null;
    }
    return {
      eosRefreshToken: parsed.eosRefreshToken.trim(),
      eosRefreshExpiresAt: parsed.eosRefreshExpiresAt?.trim(),
    };
  } catch {
    return null;
  }
}

async function writeAccountEosRefreshFile(
  accountsPath: string,
  accountId: string,
  eos: StoredEosRefresh,
): Promise<void> {
  const token = eos.eosRefreshToken?.trim();
  if (!token) {
    return;
  }

  const eosPath = getEosTokenPath(accountsPath, accountId);
  await mkdir(dirname(eosPath), { recursive: true, mode: 0o700 });
  await writeFile(
    eosPath,
    `${JSON.stringify(
      {
        eosRefreshToken: token,
        eosRefreshExpiresAt: eos.eosRefreshExpiresAt?.trim(),
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

async function deleteAccountEosRefresh(
  accountsPath: string,
  accountId: string,
): Promise<void> {
  try {
    await unlink(getEosTokenPath(accountsPath, accountId));
  } catch {
    // EOS token file may already be gone.
  }
}

export function accountAccessTokenIsValid(account: LinkedAccount, skewMs = 5 * 60_000): boolean {
  if (!account.accessToken?.trim() || !account.accessTokenExpiresAt?.trim()) {
    return false;
  }

  const expiresAt = Date.parse(account.accessTokenExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt - skewMs > Date.now();
}

export function sessionFromAuth(auth: TokenResponse): Pick<
  LinkedAccount,
  "accessToken" | "accessTokenExpiresAt" | "refreshToken" | "displayName"
> {
  return {
    accessToken: auth.access_token,
    accessTokenExpiresAt: auth.expires_at,
    refreshToken: auth.refresh_token,
    displayName: auth.displayName,
  };
}

export function sessionFromEos(eos: EosTokenResponse): Pick<
  LinkedAccount,
  "eosRefreshToken" | "eosRefreshExpiresAt"
> {
  return {
    eosRefreshToken: eos.refresh_token,
    eosRefreshExpiresAt: eos.refresh_expires_at,
  };
}

export function accountEosRefreshIsValid(account: LinkedAccount, skewMs = 5 * 60_000): boolean {
  if (!account.eosRefreshToken?.trim()) {
    return false;
  }

  if (!account.eosRefreshExpiresAt?.trim()) {
    return true;
  }

  const expiresAt = Date.parse(account.eosRefreshExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt - skewMs > Date.now();
}

export function accountCanAuthenticate(account: LinkedAccount): boolean {
  return (
    accountAccessTokenIsValid(account) ||
    Boolean(account.refreshToken.trim()) ||
    accountEosRefreshIsValid(account)
  );
}

/** Epic invalidates earlier refresh tokens when another account signs in on the same client. */
export async function invalidateOtherAccountSessions(
  accountsPath: string,
  keepAccountId: string,
): Promise<LinkedAccount[]> {
  return modifyAccounts(accountsPath, (accounts) =>
    accounts.map((account) => {
      if (account.accountId === keepAccountId) {
        return account;
      }

      const stillUsable =
        accountAccessTokenIsValid(account) || accountEosRefreshIsValid(account);

      return {
        ...account,
        refreshToken: "",
        lastSyncError: stillUsable
          ? undefined
          : SESSION_REVOKED_MESSAGE,
      };
    }),
  );
}

async function hydrateAccounts(accountsPath: string, stored: StoredAccount[]): Promise<LinkedAccount[]> {
  const accounts: LinkedAccount[] = [];

  for (const entry of stored) {
    const fromFile = await loadAccountRefreshToken(accountsPath, entry.accountId);
    const refreshToken = fromFile ?? entry.refreshToken?.trim() ?? "";
    const session = await loadAccountSession(accountsPath, entry.accountId);
    const eos = await loadAccountEosRefresh(accountsPath, entry.accountId);

    if (!fromFile && refreshToken) {
      await writeAccountRefreshTokenFile(accountsPath, entry.accountId, refreshToken);
    }

    accounts.push({
      ...entry,
      refreshToken,
      accessToken: session?.accessToken ?? entry.accessToken,
      accessTokenExpiresAt: session?.accessTokenExpiresAt ?? entry.accessTokenExpiresAt,
      eosRefreshToken: eos?.eosRefreshToken ?? entry.eosRefreshToken,
      eosRefreshExpiresAt: eos?.eosRefreshExpiresAt ?? entry.eosRefreshExpiresAt,
    });
  }

  return accounts;
}

export async function loadAccounts(accountsPath: string): Promise<LinkedAccount[]> {
  try {
    const raw = await readFile(accountsPath, "utf8");
    const parsed = JSON.parse(raw) as StoredAccount[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return hydrateAccounts(accountsPath, parsed);
  } catch {
    return [];
  }
}

async function saveAccountsMetadata(
  accountsPath: string,
  accounts: LinkedAccount[],
): Promise<void> {
  const metadata: StoredAccount[] = accounts.map(
    ({
      refreshToken: _refreshToken,
      accessToken: _accessToken,
      accessTokenExpiresAt: _accessTokenExpiresAt,
      eosRefreshToken: _eosRefreshToken,
      eosRefreshExpiresAt: _eosRefreshExpiresAt,
      ...account
    }) => account,
  );
  await mkdir(dirname(accountsPath), { recursive: true });
  await writeFile(accountsPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function persistAccountTokens(
  accountsPath: string,
  previous: LinkedAccount[],
  next: LinkedAccount[],
): Promise<void> {
  const previousIds = new Set(previous.map((account) => account.accountId));
  const nextIds = new Set(next.map((account) => account.accountId));

  for (const accountId of previousIds) {
    if (!nextIds.has(accountId)) {
      await deleteAccountRefreshToken(accountsPath, accountId);
      await deleteAccountSession(accountsPath, accountId);
      await deleteAccountEosRefresh(accountsPath, accountId);
    }
  }

  for (const account of next) {
    const previousAccount = previous.find((item) => item.accountId === account.accountId);

    if (account.refreshToken && account.refreshToken !== previousAccount?.refreshToken) {
      await writeAccountRefreshTokenFile(accountsPath, account.accountId, account.refreshToken);
    } else if (!account.refreshToken?.trim() && previousAccount?.refreshToken?.trim()) {
      await deleteAccountRefreshToken(accountsPath, account.accountId);
    }

    const sessionChanged =
      account.accessToken !== previousAccount?.accessToken ||
      account.accessTokenExpiresAt !== previousAccount?.accessTokenExpiresAt;

    if (sessionChanged) {
      if (account.accessToken?.trim() && account.accessTokenExpiresAt?.trim()) {
        await writeAccountSessionFile(accountsPath, account.accountId, {
          accessToken: account.accessToken,
          accessTokenExpiresAt: account.accessTokenExpiresAt,
        });
      } else {
        await deleteAccountSession(accountsPath, account.accountId);
      }
    }

    const eosChanged =
      account.eosRefreshToken !== previousAccount?.eosRefreshToken ||
      account.eosRefreshExpiresAt !== previousAccount?.eosRefreshExpiresAt;

    if (eosChanged) {
      if (account.eosRefreshToken?.trim()) {
        await writeAccountEosRefreshFile(accountsPath, account.accountId, {
          eosRefreshToken: account.eosRefreshToken,
          eosRefreshExpiresAt: account.eosRefreshExpiresAt,
        });
      } else {
        await deleteAccountEosRefresh(accountsPath, account.accountId);
      }
    }
  }
}

let accountsWriteChain: Promise<void> = Promise.resolve();

/** Reload from disk, apply changes, and save — token files are updated per account only. */
export async function modifyAccounts(
  accountsPath: string,
  mutator: (accounts: LinkedAccount[]) => LinkedAccount[],
): Promise<LinkedAccount[]> {
  let nextAccounts: LinkedAccount[] = [];

  accountsWriteChain = accountsWriteChain.then(async () => {
    const current = await loadAccounts(accountsPath);
    nextAccounts = mutator(current);
    await persistAccountTokens(accountsPath, current, nextAccounts);
    await saveAccountsMetadata(accountsPath, nextAccounts);
  });

  await accountsWriteChain;
  return nextAccounts;
}

/** @deprecated Use modifyAccounts — kept for callers that write full account snapshots intentionally. */
export async function saveAccounts(
  accountsPath: string,
  accounts: LinkedAccount[],
): Promise<void> {
  const current = await loadAccounts(accountsPath);
  await persistAccountTokens(accountsPath, current, accounts);
  await saveAccountsMetadata(accountsPath, accounts);
}

export function upsertAccount(
  accounts: LinkedAccount[],
  auth: TokenResponse,
): LinkedAccount[] {
  const next = accounts.filter((account) => account.accountId !== auth.account_id);
  const existing = accounts.find((account) => account.accountId === auth.account_id);
  const session = sessionFromAuth(auth);

  next.unshift({
    accountId: auth.account_id,
    displayName: auth.displayName,
    refreshToken: auth.refresh_token,
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    enabled: existing?.enabled ?? true,
    platformPlayerId: existing?.platformPlayerId,
    lastSyncAt: existing?.lastSyncAt,
    lastSyncMessage: existing?.lastSyncMessage,
    lastSyncError: undefined,
  });

  return next;
}

export function upsertAccountFromEos(
  accounts: LinkedAccount[],
  session: {
    accountId: string;
    displayName: string;
    eosRefreshToken: string;
    eosRefreshExpiresAt?: string;
  },
): LinkedAccount[] {
  const next = accounts.filter((account) => account.accountId !== session.accountId);
  const existing = accounts.find((account) => account.accountId === session.accountId);
  const eosSession = {
    eosRefreshToken: session.eosRefreshToken,
    eosRefreshExpiresAt: session.eosRefreshExpiresAt,
  };

  next.unshift({
    accountId: session.accountId,
    displayName: session.displayName,
    refreshToken: existing?.refreshToken ?? "",
    accessToken: existing?.accessToken,
    accessTokenExpiresAt: existing?.accessTokenExpiresAt,
    eosRefreshToken: eosSession.eosRefreshToken,
    eosRefreshExpiresAt: eosSession.eosRefreshExpiresAt,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    enabled: existing?.enabled ?? true,
    platformPlayerId: existing?.platformPlayerId,
    lastSyncAt: existing?.lastSyncAt,
    lastSyncMessage: existing?.lastSyncMessage,
    lastSyncError: undefined,
  });

  return next;
}

export function removeAccount(
  accounts: LinkedAccount[],
  accountId: string,
): LinkedAccount[] {
  return accounts.filter((account) => account.accountId !== accountId);
}

export function updateAccount(
  accounts: LinkedAccount[],
  accountId: string,
  updates: Partial<LinkedAccount>,
): LinkedAccount[] {
  return accounts.map((account) =>
    account.accountId === accountId ? { ...account, ...updates } : account,
  );
}

export async function migrateLegacyRefreshToken(options: {
  accountsPath: string;
  refreshTokenPath: string;
  fallbackDisplayName?: string;
  fallbackAccountId?: string;
}): Promise<LinkedAccount[]> {
  const accounts = await loadAccounts(options.accountsPath);
  if (accounts.length > 0) {
    return accounts;
  }

  try {
    const refreshToken = (await readFile(options.refreshTokenPath, "utf8")).trim();
    if (!refreshToken) {
      return accounts;
    }

    const accountId = options.fallbackAccountId ?? "legacy-account";
    const migrated: LinkedAccount[] = [
      {
        accountId,
        displayName: options.fallbackDisplayName ?? "Epic account",
        refreshToken,
        addedAt: new Date().toISOString(),
        enabled: true,
      },
    ];

    await persistAccountTokens(options.accountsPath, [], migrated);
    await saveAccountsMetadata(options.accountsPath, migrated);
    return migrated;
  } catch {
    return accounts;
  }
}
