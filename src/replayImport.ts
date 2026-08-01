import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join, normalize } from "node:path";
import { downloadReplayFromBallchasing, listGroupReplayIds, parseBallchasingImportUrl, parseBallchasingReplayUrl } from "./ballchasing.js";
import {
  getReplaySortTimestamp,
  playerMatchesAccount,
} from "./format.js";
import {
  buildImportedReplayRecordFromFile,
  readReplayIndexMeta,
  readReplayMatchGuid,
} from "./replayParser.js";
import { readReplayName } from "./replayName.js";
import type { LinkedAccount } from "./accounts.js";
import type { ImportedBallchasingLink, ImportedReplayMeta, ReplaySortBy, SavedReplayRecord } from "./store.js";
import { getImportedBallchasingLink, getImportedReplayMeta } from "./store.js";
import {
  getCachedImportedIndex,
  getCachedImportedReplayRecord,
  getCachedMergedLibrary,
  getCachedReplayName,
  buildImportedIndexCacheKey,
  getImportedDirSignature,
  getReplayLibraryCacheKey,
  setCachedImportedIndex,
  setCachedMergedLibrary,
} from "./replayLibraryCache.js";
import { sanitizeReplayDownloadFileName } from "./security.js";

export {
  invalidateReplayLibraryCache,
  invalidateMergedLibraryCache,
  invalidateReplayFileCache,
  clearReplayParseCaches,
} from "./replayLibraryCache.js";

export const REPLAY_PAGE_SIZE = 50;
export const IMPORTED_SCAN_CAP = 2000;

export interface ImportedReplayIndexEntry {
  matchGuid: string;
  filePath: string;
  fileName: string;
  recordStartTimestamp: number;
  importedAt: string;
}

export interface ReplayLibraryRequest {
  replayDir: string;
  syncedReplays: SavedReplayRecord[];
  accounts: LinkedAccount[];
  page?: number;
  pageSize?: number;
  syncedOnly?: boolean;
  importedBallchasingLinks?: Record<string, ImportedBallchasingLink>;
  importedReplayMeta?: Record<string, ImportedReplayMeta>;
  sortBy?: ReplaySortBy;
}

export interface ReplayLibraryResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  replays: SavedReplayRecord[];
}

export function parseReplayFileName(fileName: string): {
  recordStartTimestamp: number;
  matchGuid: string;
} | null {
  const match = /(\d+)-([0-9A-F]{32})\.replay$/i.exec(fileName);
  if (!match) {
    return null;
  }

  return {
    recordStartTimestamp: Number(match[1]),
    matchGuid: match[2].toUpperCase(),
  };
}

function hashReplayIdentity(fileName: string): string {
  return createHash("md5").update(fileName).digest("hex").toUpperCase();
}

function normalizePath(filePath: string): string {
  return normalize(filePath).toLowerCase();
}

async function indexImportedReplayEntry(
  entry: string,
  replayDir: string,
  syncedGuids: Set<string>,
  syncedPaths: Set<string>,
  importedReplayMeta?: Record<string, ImportedReplayMeta>,
): Promise<ImportedReplayIndexEntry | null> {
  if (!entry.toLowerCase().endsWith(".replay")) {
    return null;
  }

  const loweredEntry = entry.toLowerCase();
  if (
    loweredEntry.includes("overtime-share") ||
    loweredEntry.includes("overtime-clipboard")
  ) {
    return null;
  }

  const filePath = join(replayDir, entry);
  if (syncedPaths.has(normalizePath(filePath))) {
    return null;
  }

  const fromName = parseReplayFileName(entry);
  const metaMatchGuid = getImportedReplayMeta(importedReplayMeta, filePath)?.matchGuid;
  let matchGuid =
    metaMatchGuid?.toUpperCase() ??
    fromName?.matchGuid?.toUpperCase() ??
    hashReplayIdentity(entry);
  let recordStartTimestamp = fromName?.recordStartTimestamp ?? 0;

  // Prefer match-start time from the replay header so sort order matches real match time,
  // not file mtime (which can put old imported replays above newer synced ones).
  if ((!fromName?.matchGuid && !metaMatchGuid) || !recordStartTimestamp) {
    const headerMeta = readReplayIndexMeta(filePath);
    if (!fromName?.matchGuid && !metaMatchGuid && headerMeta.matchGuid) {
      matchGuid = headerMeta.matchGuid;
    }
    if (!recordStartTimestamp && headerMeta.matchStartEpoch > 0) {
      recordStartTimestamp = headerMeta.matchStartEpoch;
    }
  }
  if (syncedGuids.has(matchGuid.toUpperCase())) {
    return null;
  }

  let importedAt = getImportedReplayMeta(importedReplayMeta, filePath)?.importedAt ?? "";
  if (!recordStartTimestamp || !importedAt) {
    try {
      const fileStat = await stat(filePath);
      if (!recordStartTimestamp) {
        recordStartTimestamp = Math.floor(fileStat.mtimeMs / 1000);
      }
      if (!importedAt) {
        importedAt = new Date(fileStat.mtimeMs).toISOString();
      }
    } catch {
      if (!recordStartTimestamp) {
        recordStartTimestamp = 0;
      }
      if (!importedAt) {
        importedAt = new Date(0).toISOString();
      }
    }
  }

  return {
    matchGuid,
    filePath,
    fileName: entry,
    recordStartTimestamp,
    importedAt,
  };
}

export async function indexImportedReplays(
  replayDir: string,
  syncedReplays: SavedReplayRecord[],
  importedReplayMeta?: Record<string, ImportedReplayMeta>,
): Promise<ImportedReplayIndexEntry[]> {
  const syncedGuids = new Set(
    syncedReplays.map((replay) => replay.matchGuid.toUpperCase()),
  );
  const syncedPaths = new Set(
    syncedReplays.map((replay) => normalizePath(replay.filePath)),
  );

  let entries: string[];
  try {
    entries = await readdir(replayDir);
  } catch {
    return [];
  }

  const INDEX_BATCH_SIZE = 40;
  const indexed: ImportedReplayIndexEntry[] = [];

  for (let offset = 0; offset < entries.length; offset += INDEX_BATCH_SIZE) {
    const batch = entries.slice(offset, offset + INDEX_BATCH_SIZE);
    const batchResults = (
      await Promise.all(
        batch.map((entry) =>
          indexImportedReplayEntry(
            entry,
            replayDir,
            syncedGuids,
            syncedPaths,
            importedReplayMeta,
          ),
        ),
      )
    ).filter((entry): entry is ImportedReplayIndexEntry => entry !== null);

    indexed.push(...batchResults);

    if (offset + INDEX_BATCH_SIZE < entries.length) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
  }

  indexed.sort((a, b) => b.recordStartTimestamp - a.recordStartTimestamp);
  return indexed.slice(0, IMPORTED_SCAN_CAP);
}

export async function buildImportedReplayRecord(
  entry: ImportedReplayIndexEntry,
  accounts: LinkedAccount[],
): Promise<SavedReplayRecord> {
  try {
    return buildImportedReplayRecordFromFile(entry, accounts);
  } catch {
    return {
      matchGuid: entry.matchGuid,
      accountId: "",
      accountDisplayName: "Imported",
      filePath: entry.filePath,
      fileName: entry.fileName,
      downloadedAt: new Date(entry.recordStartTimestamp * 1000).toISOString(),
      playlist: 0,
      playlistName: "Unknown",
      mapName: "Unknown",
      recordStartTimestamp: entry.recordStartTimestamp,
      team0Score: 0,
      team1Score: 0,
      secondsPlayed: 0,
      result: "Unknown",
      source: "imported",
      hasAccountMatch: false,
      importedAt: entry.importedAt,
    };
  }
}

function stubImportedRecord(entry: ImportedReplayIndexEntry): SavedReplayRecord {
  return {
    matchGuid: entry.matchGuid,
    accountId: "",
    accountDisplayName: "Imported",
    filePath: entry.filePath,
    fileName: entry.fileName,
    downloadedAt: entry.importedAt,
    importedAt: entry.importedAt,
    playlist: 0,
    playlistName: "Unknown",
    mapName: "Unknown",
    recordStartTimestamp: entry.recordStartTimestamp,
    team0Score: 0,
    team1Score: 0,
    secondsPlayed: 0,
    result: "Unknown",
    source: "imported",
  };
}

function applyImportedBallchasingLink(
  replay: SavedReplayRecord,
  links?: Record<string, ImportedBallchasingLink>,
): SavedReplayRecord {
  const link = getImportedBallchasingLink(links, replay.filePath);
  if (!link) {
    return replay;
  }

  return {
    ...replay,
    ballchasingId: link.ballchasingId,
    ballchasingUrl: link.ballchasingUrl,
    ballchasingUploadedAt: link.ballchasingUploadedAt,
    ballchasingError: undefined,
    ballchasingErrorKind: undefined,
  };
}

export interface FindReplayByMatchGuidRequest {
  matchGuid: string;
  replayDir: string;
  syncedReplays: SavedReplayRecord[];
  accounts: LinkedAccount[];
  importedBallchasingLinks?: Record<string, ImportedBallchasingLink>;
  importedReplayMeta?: Record<string, ImportedReplayMeta>;
}

export async function findReplayByMatchGuid(
  options: FindReplayByMatchGuidRequest,
): Promise<SavedReplayRecord | null> {
  const upper = options.matchGuid.toUpperCase();
  const synced = options.syncedReplays.find(
    (replay) => replay.matchGuid.toUpperCase() === upper,
  );
  if (synced) {
    return synced;
  }

  const importedIndex = await indexImportedReplays(
    options.replayDir,
    options.syncedReplays,
    options.importedReplayMeta,
  );
  const entry = importedIndex.find((item) => item.matchGuid.toUpperCase() === upper);
  if (entry) {
    const record = await buildImportedReplayRecord(entry, options.accounts);
    return applyImportedBallchasingLink(record, options.importedBallchasingLinks);
  }

  if (options.importedReplayMeta) {
    for (const [metaKey, meta] of Object.entries(options.importedReplayMeta)) {
      if (meta.matchGuid?.toUpperCase() !== upper) {
        continue;
      }

      const metaEntry = importedIndex.find(
        (item) => normalizePath(item.filePath) === metaKey,
      );
      if (!metaEntry) {
        continue;
      }

      const record = await buildImportedReplayRecord(metaEntry, options.accounts);
      return applyImportedBallchasingLink(record, options.importedBallchasingLinks);
    }
  }

  return null;
}

function replayLibraryRecordScore(replay: SavedReplayRecord): number {
  let score = 0;
  if (replay.ballchasingId || replay.ballchasingUploadedAt) {
    score += 8;
  }
  if (replay.replayName?.trim()) {
    score += 4;
  }
  if (replay.accountId) {
    score += 2;
  }
  if (replay.source !== "imported") {
    score += 1;
  }
  if (replay.recordStartTimestamp > 0) {
    score += 1;
  }
  return score;
}

function dedupeMergedReplays(replays: SavedReplayRecord[]): SavedReplayRecord[] {
  const result: SavedReplayRecord[] = [];

  for (const replay of replays) {
    const guidKey = replay.matchGuid.toUpperCase();
    const pathKey = replay.filePath?.trim() ? normalizePath(replay.filePath) : "";

    const pathIndex = pathKey
      ? result.findIndex(
          (item) =>
            item.filePath?.trim() && normalizePath(item.filePath) === pathKey,
        )
      : -1;
    const guidIndex = result.findIndex(
      (item) => item.matchGuid.toUpperCase() === guidKey,
    );

    if (pathIndex >= 0) {
      if (
        replayLibraryRecordScore(replay) >
        replayLibraryRecordScore(result[pathIndex])
      ) {
        result[pathIndex] = replay;
      }
      continue;
    }

    if (guidIndex >= 0) {
      if (
        replayLibraryRecordScore(replay) >
        replayLibraryRecordScore(result[guidIndex])
      ) {
        result[guidIndex] = replay;
      }
      continue;
    }

    result.push(replay);
  }

  return result;
}

async function hydrateReplayLibraryRecord(
  replay: SavedReplayRecord,
  importedIndex: ImportedReplayIndexEntry[],
  options: ReplayLibraryRequest,
): Promise<SavedReplayRecord> {
  if (replay.source === "imported") {
    const entry = importedIndex.find(
      (item) => item.matchGuid.toUpperCase() === replay.matchGuid.toUpperCase(),
    );
    if (!entry) {
      return applyImportedBallchasingLink(replay, options.importedBallchasingLinks);
    }

    const record = await getCachedImportedReplayRecord(
      entry,
      options.accounts,
      buildImportedReplayRecord,
    );
    const withLink = applyImportedBallchasingLink(record, options.importedBallchasingLinks);

    // Always prefer parsed match metadata for sorting/display, then overlay any
    // richer Ballchasing/rename state already attached to the library entry.
    return {
      ...withLink,
      matchGuid: replay.matchGuid,
      ballchasingId: replay.ballchasingId || withLink.ballchasingId,
      ballchasingUrl: replay.ballchasingUrl || withLink.ballchasingUrl,
      ballchasingUploadedAt: replay.ballchasingUploadedAt || withLink.ballchasingUploadedAt,
      ballchasingError: replay.ballchasingError ?? withLink.ballchasingError,
      ballchasingErrorKind: replay.ballchasingErrorKind ?? withLink.ballchasingErrorKind,
      replayName: replay.replayName?.trim() || withLink.replayName,
      cloudOnly: replay.cloudOnly ?? withLink.cloudOnly,
      recordStartTimestamp:
        record.recordStartTimestamp ||
        replay.recordStartTimestamp ||
        entry.recordStartTimestamp,
    };
  }

  if (replay.replayName?.trim() || replay.cloudOnly || !replay.filePath?.trim()) {
    return replay;
  }

  try {
    const replayName = await getCachedReplayName(replay.filePath, readReplayName);
    if (!replayName) {
      return replay;
    }

    return { ...replay, replayName };
  } catch {
    return replay;
  }
}

async function buildMergedReplayLibrary(
  options: ReplayLibraryRequest,
  mergedCacheKey: string,
): Promise<{ merged: SavedReplayRecord[]; importedIndex: ImportedReplayIndexEntry[] }> {
  const importedDirSignature = await getImportedDirSignature(options.replayDir);
  const importedIndexKey = buildImportedIndexCacheKey(options, importedDirSignature);

  let importedIndex: ImportedReplayIndexEntry[] = [];
  if (!options.syncedOnly) {
    const cachedIndex = getCachedImportedIndex(importedIndexKey);
    if (cachedIndex) {
      importedIndex = cachedIndex;
    } else {
      importedIndex = await indexImportedReplays(
        options.replayDir,
        options.syncedReplays,
        options.importedReplayMeta,
      );
      setCachedImportedIndex(importedIndexKey, importedIndex);
    }
  }

  const cachedMerged = getCachedMergedLibrary(mergedCacheKey);
  if (cachedMerged) {
    return { merged: cachedMerged, importedIndex };
  }

  const synced = options.syncedReplays.map((replay) => ({
    ...replay,
    source: replay.source ?? "synced",
    hasAccountMatch: true,
  }));

  let merged: SavedReplayRecord[] = dedupeMergedReplays([
    ...synced,
    ...importedIndex.map((entry) => stubImportedRecord(entry)),
  ]);

  const sortBy = options.sortBy ?? "match";
  merged.sort(
    (a, b) => getReplaySortTimestamp(b, sortBy) - getReplaySortTimestamp(a, sortBy),
  );

  setCachedMergedLibrary(mergedCacheKey, merged);
  return { merged, importedIndex };
}

function paginateReplayLibrary(
  merged: SavedReplayRecord[],
  page: number,
  pageSize: number,
): ReplayLibraryResult {
  const total = merged.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    total,
    page: safePage,
    pageSize,
    totalPages,
    replays: merged.slice(start, start + pageSize),
  };
}

export async function buildReplayLibrary(
  options: ReplayLibraryRequest,
): Promise<ReplayLibraryResult> {
  const pageSize = options.pageSize ?? REPLAY_PAGE_SIZE;
  const page = Math.max(1, options.page ?? 1);
  const sortBy = options.sortBy ?? "match";
  const cacheKey = await getReplayLibraryCacheKey(options);
  const { merged, importedIndex } = await buildMergedReplayLibrary(options, cacheKey);
  const pageResult = paginateReplayLibrary(merged, page, pageSize);
  const replays = await Promise.all(
    pageResult.replays.map((replay) =>
      hydrateReplayLibraryRecord(replay, importedIndex, options),
    ),
  );

  // Re-sort after hydration so MatchStartEpoch from the file wins over stub mtimes.
  replays.sort(
    (a, b) => getReplaySortTimestamp(b, sortBy) - getReplaySortTimestamp(a, sortBy),
  );

  return {
    ...pageResult,
    replays,
  };
}

export async function uniqueReplayDestination(
  replayDir: string,
  fileName: string,
): Promise<string> {
  const safeName = sanitizeReplayDownloadFileName(fileName);
  const ext = ".replay";
  const base = safeName.slice(0, -ext.length);

  let candidate = join(replayDir, safeName);
  let counter = 1;

  while (true) {
    try {
      await stat(candidate);
      candidate = join(replayDir, `${base} (${counter})${ext}`);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

export async function importReplayFiles(
  sourcePaths: string[],
  replayDir: string,
  accounts: LinkedAccount[] = [],
): Promise<{ imported: SavedReplayRecord[]; errors: string[] }> {
  await mkdir(replayDir, { recursive: true });

  const imported: SavedReplayRecord[] = [];
  const errors: string[] = [];

  for (const sourcePath of sourcePaths) {
    if (!sourcePath.toLowerCase().endsWith(".replay")) {
      errors.push(`${basename(sourcePath)}: not a .replay file`);
      continue;
    }

    try {
      const destination = await uniqueReplayDestination(replayDir, basename(sourcePath));
      const importedAt = new Date().toISOString();
      await copyFile(sourcePath, destination);

      const fromName = parseReplayFileName(basename(destination));
      const fileStat = await stat(destination);
      const entry: ImportedReplayIndexEntry = {
        matchGuid: fromName?.matchGuid ?? hashReplayIdentity(basename(destination)),
        filePath: destination,
        fileName: basename(destination),
        recordStartTimestamp:
          fromName?.recordStartTimestamp ?? Math.floor(fileStat.mtimeMs / 1000),
        importedAt,
      };

      const record = await buildImportedReplayRecord(entry, accounts);
      imported.push({ ...record, importedAt });
    } catch (error) {
      errors.push(
        `${basename(sourcePath)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { imported, errors };
}

export async function importReplayFromBallchasingUrl(
  url: string,
  replayDir: string,
  accounts: LinkedAccount[] = [],
  token = "",
): Promise<{ imported: SavedReplayRecord[]; errors: string[] }> {
  const target = parseBallchasingImportUrl(url);
  if (!target || target.kind !== "replay") {
    return { imported: [], errors: ["Invalid Ballchasing replay URL."] };
  }

  return importReplayFromBallchasingId(target.id, replayDir, accounts, token);
}

export interface BallchasingImportProgress {
  phase: "listing" | "downloading";
  current: number;
  total: number;
  replayId?: string;
}

export async function importReplaysFromBallchasingGroup(
  url: string,
  replayDir: string,
  accounts: LinkedAccount[] = [],
  token = "",
  onProgress?: (progress: BallchasingImportProgress) => void,
): Promise<{ imported: SavedReplayRecord[]; errors: string[] }> {
  const target = parseBallchasingImportUrl(url);
  if (!target || target.kind !== "group") {
    return { imported: [], errors: ["Invalid Ballchasing group URL."] };
  }

  if (!token.trim()) {
    return {
      imported: [],
      errors: ["Add a Ballchasing API token in Settings first."],
    };
  }

  onProgress?.({ phase: "listing", current: 0, total: 0 });

  let replayIds: string[];
  try {
    replayIds = await listGroupReplayIds(target.id, token.trim());
  } catch (error) {
    return {
      imported: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (replayIds.length === 0) {
    return { imported: [], errors: ["That Ballchasing group has no replays."] };
  }

  const imported: SavedReplayRecord[] = [];
  const errors: string[] = [];

  for (const [index, replayId] of replayIds.entries()) {
    onProgress?.({
      phase: "downloading",
      current: index + 1,
      total: replayIds.length,
      replayId,
    });

    const result = await importReplayFromBallchasingId(
      replayId,
      replayDir,
      accounts,
      token,
    );
    imported.push(...result.imported);
    errors.push(...result.errors);
  }

  return { imported, errors };
}

async function importReplayFromBallchasingId(
  replayId: string,
  replayDir: string,
  accounts: LinkedAccount[] = [],
  token = "",
): Promise<{ imported: SavedReplayRecord[]; errors: string[] }> {
  if (!token.trim()) {
    return {
      imported: [],
      errors: ["Add a Ballchasing API token in Settings first."],
    };
  }

  await mkdir(replayDir, { recursive: true });

  try {
    const { data, fileName } = await downloadReplayFromBallchasing(replayId, token.trim());
    const normalizedName = fileName.toLowerCase().endsWith(".replay")
      ? fileName
      : `${fileName}.replay`;
    const destination = await uniqueReplayDestination(replayDir, normalizedName);
    const importedAt = new Date().toISOString();
    await writeFile(destination, data);

    const fromName = parseReplayFileName(basename(destination));
    const headerMatchGuid = readReplayMatchGuid(destination);
    const fileStat = await stat(destination);
    const entry: ImportedReplayIndexEntry = {
      matchGuid:
        headerMatchGuid ?? fromName?.matchGuid ?? hashReplayIdentity(basename(destination)),
      filePath: destination,
      fileName: basename(destination),
      recordStartTimestamp:
        fromName?.recordStartTimestamp ?? Math.floor(fileStat.mtimeMs / 1000),
      importedAt,
    };

    const record = await buildImportedReplayRecord(entry, accounts);
    return {
      imported: [
        {
          ...record,
          importedAt,
          ballchasingId: replayId,
          ballchasingUrl: `https://ballchasing.com/replay/${replayId}`,
          ballchasingUploadedAt: importedAt,
        },
      ],
      errors: [],
    };
  } catch (error) {
    return {
      imported: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function accountPresentInReplay(
  replay: SavedReplayRecord,
  accounts: LinkedAccount[],
): boolean {
  if (replay.source !== "imported") {
    return true;
  }

  if (replay.hasAccountMatch === false) {
    return false;
  }

  if (replay.accountId) {
    return accounts.some((account) => account.accountId === replay.accountId);
  }

  if (replay.players?.length) {
    return replay.players.some((player) =>
      accounts.some(
        (account) =>
          playerMatchesAccount(player.playerId, account.accountId) ||
          player.playerName.localeCompare(account.displayName, undefined, {
            sensitivity: "accent",
          }) === 0,
      ),
    );
  }

  return Boolean(replay.accountId);
}
