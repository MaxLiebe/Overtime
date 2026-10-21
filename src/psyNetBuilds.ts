import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fetchWithTimeout } from "./http.js";
import { writeFileAtomic } from "./atomicFile.js";

/**
 * Everything PsyNet needs to accept a client build. Psyonix rotates the secret with each
 * Rocket League patch; a request without the secret for its build gets `BuildNotFound`.
 */
export interface PsyNetBuild {
  gameVersion: string;
  featureSet: string;
  buildSecret: string;
}

/**
 * Builds Overtime ships with, newest first. Keep the previous build for a while after a
 * patch: users who have not restarted Rocket League yet still report the old version.
 */
export const BUNDLED_PSYNET_BUILDS: readonly PsyNetBuild[] = [
  {
    // Rocket League patch of 2026-10-01.
    gameVersion: "261001.2867.529371",
    featureSet: "PrimeUpdate60",
    buildSecret: "1c72102bca07fb3ba34ef640656901df0658107ffe17bb3a6e9cd1cc578392ea",
  },
  {
    // Rocket League patch of 2026-09-18.
    gameVersion: "260918.75141.528314",
    featureSet: "PrimeUpdate60",
    buildSecret: "ce31914a39dbf2f3ab13ea54d00b7fe87bc5473a2f04707d78de54039ded8951",
  },
];

/**
 * Published from this repository so a new build secret reaches every install as soon as
 * it is committed, instead of waiting for users to download a new Overtime release.
 */
export const REMOTE_PSYNET_BUILDS_URL =
  "https://raw.githubusercontent.com/MaxLiebe/Overtime/main/psynet-builds.json";

const REMOTE_REFRESH_INTERVAL_MS = 60 * 60_000;
/** After a rejection, re-check sooner, but not on every account of every sync. */
const REMOTE_FORCED_REFRESH_MIN_INTERVAL_MS = 5 * 60_000;
const REMOTE_FETCH_TIMEOUT_MS = 8_000;

const VERSION_PATTERN = /^\d+(?:\.\d+){1,5}$/;
const FEATURE_SET_PATTERN = /^[A-Za-z0-9_.]{1,64}$/;
const SECRET_PATTERN = /^[A-Za-z0-9+/=_-]{16,256}$/;

let remoteBuilds: PsyNetBuild[] = [];
let remoteFetchedAt = 0;
let remoteRefresh: Promise<void> | null = null;
let cachePath: string | null = null;
let cacheLoaded = false;
/** The build PsyNet most recently accepted in this process. Tried first next time. */
let lastAcceptedVersion: string | null = null;

export function compareGameVersions(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function parseBuilds(raw: unknown): PsyNetBuild[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { builds?: unknown }).builds)
      ? (raw as { builds: unknown[] }).builds
      : [];

  const builds: PsyNetBuild[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const value = entry as Partial<Record<keyof PsyNetBuild, unknown>>;
    const gameVersion = typeof value.gameVersion === "string" ? value.gameVersion.trim() : "";
    const featureSet = typeof value.featureSet === "string" ? value.featureSet.trim() : "";
    const buildSecret = typeof value.buildSecret === "string" ? value.buildSecret.trim() : "";
    if (
      VERSION_PATTERN.test(gameVersion) &&
      FEATURE_SET_PATTERN.test(featureSet) &&
      SECRET_PATTERN.test(buildSecret)
    ) {
      builds.push({ gameVersion, featureSet, buildSecret });
    }
  }
  return builds;
}

/**
 * Persist downloaded build info under the app's data folder so a PC that starts offline,
 * or while GitHub is unreachable, still knows the latest secret it has seen.
 */
export function configurePsyNetBuildCache(path: string | null): void {
  cachePath = path?.trim() || null;
  cacheLoaded = false;
}

async function loadCacheOnce(): Promise<void> {
  if (cacheLoaded || !cachePath) {
    return;
  }
  cacheLoaded = true;
  try {
    const cached = parseBuilds(JSON.parse(await readFile(cachePath, "utf8")));
    if (cached.length > 0 && remoteBuilds.length === 0) {
      remoteBuilds = cached;
    }
  } catch {
    // No cache yet.
  }
}

async function fetchRemoteBuilds(fetchFn: typeof fetch): Promise<void> {
  try {
    const response = await fetchWithTimeout(
      fetchFn,
      REMOTE_PSYNET_BUILDS_URL,
      { headers: { Accept: "application/json", "Cache-Control": "no-cache" } },
      REMOTE_FETCH_TIMEOUT_MS,
    );
    if (!response.ok) {
      return;
    }
    const builds = parseBuilds(JSON.parse(await response.text()));
    if (builds.length === 0) {
      return;
    }
    remoteBuilds = builds;
    if (cachePath) {
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFileAtomic(cachePath, `${JSON.stringify({ builds }, null, 2)}\n`);
    }
  } catch {
    // Offline or GitHub unreachable: bundled and cached builds still apply.
  } finally {
    remoteFetchedAt = Date.now();
  }
}

/**
 * Refresh the published build list. Throttled, never throws, and safe to call before
 * every PsyNet sign-in. `force` shortens the throttle after PsyNet rejected every build.
 */
export async function refreshPsyNetBuilds(options?: {
  force?: boolean;
  fetchFn?: typeof fetch;
}): Promise<void> {
  await loadCacheOnce();

  const minInterval = options?.force
    ? REMOTE_FORCED_REFRESH_MIN_INTERVAL_MS
    : REMOTE_REFRESH_INTERVAL_MS;
  if (remoteFetchedAt && Date.now() - remoteFetchedAt < minInterval) {
    return;
  }

  remoteRefresh ??= fetchRemoteBuilds(options?.fetchFn ?? fetch).finally(() => {
    remoteRefresh = null;
  });
  await remoteRefresh;
}

/** Bundled and published builds, newest first, one entry per game version. */
export function getKnownPsyNetBuilds(): PsyNetBuild[] {
  const byVersion = new Map<string, PsyNetBuild>();
  // Published entries win over bundled ones for the same version (a corrected secret).
  for (const build of [...BUNDLED_PSYNET_BUILDS, ...remoteBuilds]) {
    byVersion.set(build.gameVersion, build);
  }
  return [...byVersion.values()].sort((a, b) =>
    compareGameVersions(b.gameVersion, a.gameVersion),
  );
}

export function findPsyNetBuild(gameVersion: string): PsyNetBuild | undefined {
  return getKnownPsyNetBuilds().find((build) => build.gameVersion === gameVersion);
}

export function getLatestKnownPsyNetBuild(): PsyNetBuild {
  return getKnownPsyNetBuilds()[0] ?? BUNDLED_PSYNET_BUILDS[0]!;
}

export function rememberAcceptedPsyNetBuild(gameVersion: string): void {
  lastAcceptedVersion = gameVersion;
}

export function getLastAcceptedPsyNetVersion(): string | null {
  return lastAcceptedVersion;
}

/** Test hook: forget remote, cached and accepted builds. */
export function resetPsyNetBuildState(): void {
  remoteBuilds = [];
  remoteFetchedAt = 0;
  remoteRefresh = null;
  cacheLoaded = false;
  lastAcceptedVersion = null;
}
