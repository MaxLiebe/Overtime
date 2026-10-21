/** Default ceiling for one HTTP request to Epic or PsyNet. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * The request never produced an HTTP response: DNS failure, refused or reset connection,
 * or a timeout. Always worth retrying later; never a sign that credentials are bad.
 */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

function hostOf(url: string | URL): string {
  try {
    return new URL(String(url)).host;
  } catch {
    return String(url);
  }
}

function describeCause(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  // undici wraps the useful part (ENOTFOUND, ECONNRESET, ...) in `cause`.
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) {
    const code = (cause as Error & { code?: string }).code;
    return code && !cause.message.includes(code) ? `${code}: ${cause.message}` : cause.message;
  }
  return error.message;
}

/**
 * `fetch` with a hard timeout. Without one, a stalled connection leaves a sync stuck in
 * "Syncing…" until the app restarts. Transport failures surface as `NetworkError`; a
 * caller-supplied abort is rethrown unchanged.
 */
export async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;

  try {
    return await fetchFn(url, { ...init, signal });
  } catch (error) {
    if (init.signal?.aborted) {
      throw error;
    }
    if (timeoutSignal.aborted) {
      throw new NetworkError(`${hostOf(url)} did not respond within ${Math.round(timeoutMs / 1000)}s`, {
        cause: error,
      });
    }
    throw new NetworkError(`Could not reach ${hostOf(url)} (${describeCause(error)})`, {
      cause: error,
    });
  }
}

/** Statuses that mean "try again later" rather than "this request is wrong". */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `operation`, retrying while `shouldRetry` approves the error. Delays are taken from
 * `delaysMs` in order; its length is the number of retries.
 */
export async function withRetries<T>(
  operation: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  delaysMs: readonly number[] = [1_000, 3_000],
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= delaysMs.length || !shouldRetry(error)) {
        throw error;
      }
      await delay(delaysMs[attempt]!);
    }
  }
}
