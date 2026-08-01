import { readdir, stat } from "node:fs/promises";
import type { LinkedAccount } from "./accounts.js";
import type { ImportedReplayMeta, SavedReplayRecord } from "./store.js";

export interface ImportedReplayIndexEntry {
  matchGuid: string;
  filePath: string;
  fileName: string;
  recordStartTimestamp: number;
  importedAt: string;
}

export interface ReplayLibraryCacheRequest {
  replayDir: string;
  syncedReplays: SavedReplayRecord[];
  accounts: LinkedAccount[];
  syncedOnly?: boolean;
  importedBallchasingLinks?: Record<string, { ballchasingId: string }>;
  importedReplayMeta?: Record<string, ImportedReplayMeta>;
  sortBy?: "match" | "import";
}

interface ParsedReplayCacheEntry {
  mtimeMs: number;
  record: SavedReplayRecord;
}

interface ReplayNameCacheEntry {
  mtimeMs: number;
  replayName?: string;
}

interface ImportedIndexCacheEntry {
  key: string;
  index: ImportedReplayIndexEntry[];
}

interface MergedLibraryCacheEntry {
  key: string;
  merged: SavedReplayRecord[];
}

const parsedImportedCache = new Map<string, ParsedReplayCacheEntry>();
const replayNameCache = new Map<string, ReplayNameCacheEntry>();
let importedIndexCache: ImportedIndexCacheEntry | null = null;
let mergedLibraryCache: MergedLibraryCacheEntry | null = null;

export function invalidateMergedLibraryCache(): void {
  mergedLibraryCache = null;
}

export function invalidateReplayLibraryCache(): void {
  importedIndexCache = null;
  mergedLibraryCache = null;
}

export function invalidateReplayFileCache(filePath: string): void {
  replayNameCache.delete(filePath);

  for (const key of parsedImportedCache.keys()) {
    if (key.startsWith(`${filePath}\u0003`)) {
      parsedImportedCache.delete(key);
    }
  }

  invalidateMergedLibraryCache();
}

export function clearReplayParseCaches(): void {
  parsedImportedCache.clear();
  replayNameCache.clear();
  invalidateReplayLibraryCache();
}

function normalizePathForCache(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

export async function getImportedDirSignature(replayDir: string): Promise<string> {
  try {
    const entries = await readdir(replayDir);
    return String(entries.filter((entry) => entry.toLowerCase().endsWith(".replay")).length);
  } catch {
    return "0";
  }
}

export function buildReplayLibraryCacheKey(
  options: ReplayLibraryCacheRequest,
  importedDirSignature: string,
): string {
  const syncedSignature = options.syncedReplays
    .map((replay) =>
      [
        replay.matchGuid,
        replay.filePath ?? "",
        replay.cloudOnly ? "1" : "0",
        replay.replayName ?? "",
        replay.recordStartTimestamp,
        replay.importedAt ?? "",
        replay.ballchasingId ?? "",
      ].join("\u0001"),
    )
    .join("\u0002");

  const metaSignature = Object.entries(options.importedReplayMeta ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value.matchGuid}:${value.importedAt}`)
    .join("\u0002");

  const linksSignature = Object.entries(options.importedBallchasingLinks ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value.ballchasingId}`)
    .join("\u0002");

  const accountSignature = options.accounts
    .map(
      (account) =>
        `${account.accountId}:${account.displayName}:${account.platformPlayerId ?? ""}`,
    )
    .join("\u0002");

  return [
    options.replayDir,
    options.sortBy ?? "match",
    options.syncedOnly ? "1" : "0",
    importedDirSignature,
    syncedSignature,
    metaSignature,
    linksSignature,
    accountSignature,
  ].join("\u0003");
}

export function buildImportedIndexCacheKey(
  options: ReplayLibraryCacheRequest,
  importedDirSignature: string,
): string {
  const syncedGuids = [
    ...new Set(
      options.syncedReplays.map((replay) => replay.matchGuid.toUpperCase()),
    ),
  ]
    .sort()
    .join("\u0002");

  const syncedPaths = [
    ...new Set(
      options.syncedReplays
        .map((replay) => replay.filePath?.trim())
        .filter((filePath): filePath is string => Boolean(filePath))
        .map((filePath) => normalizePathForCache(filePath)),
    ),
  ]
    .sort()
    .join("\u0002");

  const metaSignature = Object.entries(options.importedReplayMeta ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value.matchGuid}:${value.importedAt}`)
    .join("\u0002");

  const accountSignature = options.accounts
    .map(
      (account) =>
        `${account.accountId}:${account.displayName}:${account.platformPlayerId ?? ""}`,
    )
    .join("\u0002");

  return [
    "index-v2",
    options.replayDir,
    importedDirSignature,
    syncedGuids,
    syncedPaths,
    metaSignature,
    accountSignature,
  ].join("\u0003");
}

export async function getReplayLibraryCacheKey(
  options: ReplayLibraryCacheRequest,
): Promise<string> {
  const importedDirSignature = await getImportedDirSignature(options.replayDir);
  return buildReplayLibraryCacheKey(options, importedDirSignature);
}

export function getCachedImportedIndex(
  cacheKey: string,
): ImportedReplayIndexEntry[] | null {
  if (importedIndexCache?.key === cacheKey) {
    return importedIndexCache.index;
  }

  return null;
}

export function setCachedImportedIndex(
  cacheKey: string,
  index: ImportedReplayIndexEntry[],
): void {
  importedIndexCache = { key: cacheKey, index };
}

export function getCachedMergedLibrary(cacheKey: string): SavedReplayRecord[] | null {
  if (mergedLibraryCache?.key === cacheKey) {
    return mergedLibraryCache.merged;
  }

  return null;
}

export function setCachedMergedLibrary(
  cacheKey: string,
  merged: SavedReplayRecord[],
): void {
  mergedLibraryCache = { key: cacheKey, merged };
}

function buildImportedReplayCacheKey(
  filePath: string,
  accounts: LinkedAccount[],
): string {
  const accountSignature = accounts
    .map(
      (account) =>
        `${account.accountId}:${account.displayName}:${account.platformPlayerId ?? ""}`,
    )
    .join("\u0002");

  return `${filePath}\u0003${accountSignature}`;
}

export async function getCachedImportedReplayRecord(
  entry: ImportedReplayIndexEntry,
  accounts: LinkedAccount[],
  buildRecord: (
    entry: ImportedReplayIndexEntry,
    accounts: LinkedAccount[],
  ) => Promise<SavedReplayRecord>,
): Promise<SavedReplayRecord> {
  const cacheKey = buildImportedReplayCacheKey(entry.filePath, accounts);

  try {
    const fileStat = await stat(entry.filePath);
    const cached = parsedImportedCache.get(cacheKey);
    if (cached && cached.mtimeMs === fileStat.mtimeMs) {
      return cached.record;
    }

    const record = await buildRecord(entry, accounts);
    parsedImportedCache.set(cacheKey, {
      mtimeMs: fileStat.mtimeMs,
      record,
    });
    return record;
  } catch {
    return buildRecord(entry, accounts);
  }
}

export async function getCachedReplayName(
  filePath: string,
  readName: (filePath: string) => string | undefined,
): Promise<string | undefined> {
  try {
    const fileStat = await stat(filePath);
    const cached = replayNameCache.get(filePath);
    if (cached && cached.mtimeMs === fileStat.mtimeMs) {
      return cached.replayName;
    }

    const replayName = readName(filePath);
    replayNameCache.set(filePath, {
      mtimeMs: fileStat.mtimeMs,
      replayName,
    });
    return replayName;
  } catch {
    return readName(filePath);
  }
}
