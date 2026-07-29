import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TokenResponse } from "./types.js";

export interface LinkedAccount {
  accountId: string;
  displayName: string;
  refreshToken: string;
  addedAt: string;
  enabled: boolean;
  lastSyncAt?: string;
  lastSyncMessage?: string;
  lastSyncError?: string;
}

export function getAccountsPath(userDataDir: string): string {
  return join(userDataDir, "accounts.json");
}

export async function loadAccounts(accountsPath: string): Promise<LinkedAccount[]> {
  try {
    const raw = await readFile(accountsPath, "utf8");
    const parsed = JSON.parse(raw) as LinkedAccount[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAccounts(
  accountsPath: string,
  accounts: LinkedAccount[],
): Promise<void> {
  await mkdir(dirname(accountsPath), { recursive: true });
  await writeFile(accountsPath, `${JSON.stringify(accounts, null, 2)}\n`, "utf8");
}

export function upsertAccount(
  accounts: LinkedAccount[],
  auth: TokenResponse,
): LinkedAccount[] {
  const next = accounts.filter((account) => account.accountId !== auth.account_id);
  const existing = accounts.find((account) => account.accountId === auth.account_id);

  next.unshift({
    accountId: auth.account_id,
    displayName: auth.displayName,
    refreshToken: auth.refresh_token,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    enabled: existing?.enabled ?? true,
    lastSyncAt: existing?.lastSyncAt,
    lastSyncMessage: existing?.lastSyncMessage,
    lastSyncError: existing?.lastSyncError,
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

    const migrated: LinkedAccount[] = [
      {
        accountId: options.fallbackAccountId ?? "legacy-account",
        displayName: options.fallbackDisplayName ?? "Epic account",
        refreshToken,
        addedAt: new Date().toISOString(),
        enabled: true,
      },
    ];

    await saveAccounts(options.accountsPath, migrated);
    return migrated;
  } catch {
    return accounts;
  }
}
