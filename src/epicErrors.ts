import { isTransientStatus, NetworkError } from "./http.js";

/**
 * - `credentials`: Epic rejected the saved login itself (revoked, expired, password changed).
 *   Only this kind should ever ask the user to sign in again.
 * - `transient`: network trouble, rate limiting or an Epic outage. Retry later.
 * - `pending`: device-code login still waiting for the user to approve it.
 * - `other`: anything else (unexpected response shape, unknown error code).
 */
export type EpicErrorKind = "credentials" | "transient" | "pending" | "other";

export class EpicAuthError extends Error {
  readonly kind: EpicErrorKind;
  readonly status?: number;
  readonly errorCode?: string;

  constructor(
    message: string,
    kind: EpicErrorKind,
    details?: { status?: number; errorCode?: string; cause?: unknown },
  ) {
    super(message, details?.cause !== undefined ? { cause: details.cause } : undefined);
    this.name = "EpicAuthError";
    this.kind = kind;
    this.status = details?.status;
    this.errorCode = details?.errorCode;
  }
}

const PENDING_ERROR_CODES = [
  "authorization_pending",
  "slow_down",
];

/**
 * Epic error codes that mean the credential we sent will never work again. Matched as
 * substrings because Epic prefixes them inconsistently (`errors.com.epicgames.account.…`,
 * `errors.com.epicgames.oauth.…`, bare OAuth `invalid_grant`).
 */
const CREDENTIAL_ERROR_CODES = [
  "invalid_grant",
  "invalid_token",
  "invalid_refresh_token",
  "invalid_exchange_code",
  "invalid_account_credentials",
  "token_not_found",
  "account_not_found",
  "account_inactive",
  "account_locked",
  "expired_token",
  "refresh_token_expired",
];

export function classifyEpicError(status: number, errorCode?: string): EpicErrorKind {
  const code = errorCode?.toLowerCase() ?? "";
  if (PENDING_ERROR_CODES.some((marker) => code.includes(marker))) {
    return "pending";
  }
  if (isTransientStatus(status)) {
    return "transient";
  }
  if (CREDENTIAL_ERROR_CODES.some((marker) => code.includes(marker))) {
    return "credentials";
  }
  // A bare 401 from Epic's account service is a dead token even without a known code.
  if (status === 401) {
    return "credentials";
  }
  return "other";
}

/** Build an `EpicAuthError` from a non-2xx Epic response body (JSON or not). */
export function epicErrorFromResponse(
  action: string,
  status: number,
  bodyText: string,
): EpicAuthError {
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as {
      errorCode?: string;
      errorMessage?: string;
      error?: string;
      error_description?: string;
    };
    errorCode = parsed.errorCode ?? parsed.error;
    errorMessage = parsed.errorMessage ?? parsed.error_description;
  } catch {
    // Outages return HTML; keep only a short, single-line excerpt.
    errorMessage = bodyText.replace(/\s+/g, " ").trim().slice(0, 120) || undefined;
  }

  const kind = classifyEpicError(status, errorCode);
  const detail = [errorCode, errorMessage].filter(Boolean).join(" - ");
  return new EpicAuthError(`${action} failed (${status})${detail ? `: ${detail}` : ""}`, kind, {
    status,
    errorCode,
  });
}

export function epicErrorKind(error: unknown): EpicErrorKind {
  if (error instanceof EpicAuthError) {
    return error.kind;
  }
  if (error instanceof NetworkError) {
    return "transient";
  }
  return "other";
}

export function isTransientEpicError(error: unknown): boolean {
  return epicErrorKind(error) === "transient";
}
