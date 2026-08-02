import type { LinkedAccount } from "./accounts.js";

export const SESSION_EXPIRED_MESSAGE =
  "Session expired. Re-add this account in Settings.";
export const SESSION_REVOKED_MESSAGE = SESSION_EXPIRED_MESSAGE;

const SESSION_ERROR_MARKERS = [
  "session expired",
  "sign in again",
  "sign back in",
  "re-authenticate",
  "authentication failed",
  "invalid refresh",
  "token expired",
  "not authenticated",
  "eos refresh",
];

export function isSessionInvalidationError(message: string | undefined): boolean {
  if (!message?.trim()) {
    return false;
  }

  const normalized = message.toLowerCase();
  return SESSION_ERROR_MARKERS.some((marker) => normalized.includes(marker));
}

export function findNewSessionInvalidations(
  previous: LinkedAccount[],
  next: LinkedAccount[],
): LinkedAccount[] {
  const invalidated: LinkedAccount[] = [];

  for (const account of next) {
    const error = account.lastSyncError?.trim();
    if (!error || !isSessionInvalidationError(error)) {
      continue;
    }

    const before = previous.find((item) => item.accountId === account.accountId);
    if (before?.lastSyncError?.trim() === error) {
      continue;
    }

    invalidated.push(account);
  }

  return invalidated;
}
