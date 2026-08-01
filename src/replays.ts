import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";
import { GAME_VERSION } from "./constants.js";
import { buildReplaySyncFileName, type ReplayFileNameContext } from "./format.js";
import { uniqueReplayDestination } from "./replayImport.js";
import {
  getDefaultProtonReplayDirSync,
  getProtonReplayDirCandidatesSync,
} from "./protonReplayDir.js";
import type { Match, MatchEntry } from "./types.js";

const DEFAULT_STATE_FILE = ".replay-saver-state.json";

export interface ReplaySaverState {
  downloadedMatchGuids: string[];
}

export interface SyncReplaysOptions {
  replayDir?: string;
  knownGuids?: Iterable<string>;
  fetchFn?: typeof fetch;
  fileNameContext?: ReplayFileNameContext;
  onGuidsUpdated?: (guids: string[]) => Promise<void> | void;
  onDownloadsQueued?: (items: Array<{ matchGuid: string; fileName: string }>) => void;
  onDownloadStart?: (info: {
    matchGuid: string;
    fileName: string;
    index: number;
    total: number;
  }) => void;
  onDownloadProgress?: (info: {
    matchGuid: string;
    bytesReceived: number;
    bytesTotal?: number;
  }) => void;
  onDownloadComplete?: (info: { matchGuid: string; fileName: string }) => void;
  onDownloadFailed?: (info: {
    matchGuid: string;
    fileName: string;
    error: string;
  }) => void;
  /** Match GUIDs that should not be downloaded (e.g. cloud-only replays). */
  skipDownloadGuids?: Iterable<string>;
  /** @deprecated Use knownGuids + onGuidsUpdated instead */
  statePath?: string;
}

export interface SyncReplaysResult {
  checked: number;
  downloaded: Array<{ filePath: string; fileName: string; matchGuid: string }>;
  skippedExisting: number;
  skippedNoReplayUrl: number;
  failed: Array<{ matchGuid: string; error: string }>;
}

const RL_DEMOS_SUFFIX = join("My Games", "Rocket League", "TAGame", "Demos");
const RL_TAGAME_CONFIG_SUFFIX = join("My Games", "Rocket League", "TAGame", "Config");

function expandWindowsEnvVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`);
}

function readWindowsRegistryDocumentsFolder(): string | undefined {
  const keys = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders",
  ];

  for (const key of keys) {
    try {
      const output = execSync(`reg query "${key}" /v Personal`, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      });
      const match = output.match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      if (match?.[1]) {
        return expandWindowsEnvVars(match[1].trim());
      }
    } catch {
      // Try the next registry location.
    }
  }

  return undefined;
}

function getWindowsDocumentsFolder(): string | undefined {
  try {
    const output = execSync(
      "powershell -NoProfile -Command \"[Environment]::GetFolderPath('MyDocuments')\"",
      { encoding: "utf8", windowsHide: true, timeout: 5000 },
    ).trim();
    if (output) {
      return output;
    }
  } catch {
    // Fall back to registry lookup below.
  }

  return readWindowsRegistryDocumentsFolder();
}

function getWindowsDocumentsCandidates(): string[] {
  const home = homedir();
  const candidates = [
    getWindowsDocumentsFolder(),
    process.env.OneDrive ? join(process.env.OneDrive, "Documents") : undefined,
    process.env.OneDrive ? join(process.env.OneDrive, "Documenten") : undefined,
    process.env.OneDriveCommercial
      ? join(process.env.OneDriveCommercial, "Documents")
      : undefined,
    process.env.OneDriveCommercial
      ? join(process.env.OneDriveCommercial, "Documenten")
      : undefined,
    join(home, "Documents"),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

function getWindowsReplayDirCandidates(): string[] {
  return getWindowsDocumentsCandidates().map((documents) => join(documents, RL_DEMOS_SUFFIX));
}

async function countReplayFiles(replayDir: string): Promise<number> {
  try {
    const entries = await readdir(replayDir);
    return entries.filter((entry) => entry.endsWith(".replay")).length;
  } catch {
    return 0;
  }
}

function getLinuxReplayDirCandidates(): string[] {
  return getProtonReplayDirCandidatesSync();
}

export function getReplayDirCandidates(): string[] {
  switch (platform()) {
    case "win32":
      return getWindowsReplayDirCandidates();
    case "linux":
      return getLinuxReplayDirCandidates();
    case "darwin":
      return [join(homedir(), "Library", "Application Support", "Rocket League", "TAGame", "Demos")];
    default:
      return getLinuxReplayDirCandidates();
  }
}

export function getUserTagameConfigDirCandidates(): string[] {
  const seen = new Set<string>();
  const dirs: string[] = [];

  const add = (dir: string | undefined) => {
    if (!dir?.trim() || seen.has(dir)) {
      return;
    }

    seen.add(dir);
    dirs.push(dir);
  };

  for (const replayDir of getReplayDirCandidates()) {
    add(join(dirname(replayDir), "Config"));
  }

  switch (platform()) {
    case "win32":
      for (const documents of getWindowsDocumentsCandidates()) {
        add(join(documents, RL_TAGAME_CONFIG_SUFFIX));
      }
      break;
    case "darwin":
      add(
        join(
          homedir(),
          "Library",
          "Application Support",
          "Rocket League",
          "TAGame",
          "Config",
        ),
      );
      break;
    case "linux":
    default:
      for (const replayDir of getProtonReplayDirCandidatesSync()) {
        add(join(dirname(replayDir), "Config"));
      }
      break;
  }

  return dirs;
}

export function getDefaultReplayDir(): string {
  const home = homedir();

  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Rocket League", "TAGame", "Demos");
    case "win32": {
      const candidates = getWindowsReplayDirCandidates();
      return candidates[0] ?? join(home, "Documents", RL_DEMOS_SUFFIX);
    }
    case "linux":
    default:
      return getDefaultProtonReplayDirSync();
  }
}

export async function resolveReplayDir(configuredDir?: string): Promise<string> {
  const defaultDir = getDefaultReplayDir();

  if (!configuredDir?.trim()) {
    return defaultDir;
  }

  const configured = configuredDir.trim();
  const configuredReplayCount = await countReplayFiles(configured);

  if (platform() === "win32") {
    const naiveDir = join(homedir(), "Documents", RL_DEMOS_SUFFIX);
    const candidates = getWindowsReplayDirCandidates();
    const isKnownWindowsPath =
      configured === naiveDir || candidates.includes(configured);

    if (isKnownWindowsPath) {
      const defaultReplayCount = await countReplayFiles(defaultDir);

      if (
        configured === naiveDir &&
        defaultDir !== naiveDir &&
        defaultReplayCount > configuredReplayCount
      ) {
        return defaultDir;
      }

      if (configuredReplayCount === 0 && defaultReplayCount > 0) {
        return defaultDir;
      }

      for (const candidate of candidates) {
        if (candidate === configured) {
          continue;
        }
        const candidateCount = await countReplayFiles(candidate);
        if (candidateCount > configuredReplayCount) {
          return candidate;
        }
      }
    }
  }

  if (platform() === "linux") {
    const candidates = getLinuxReplayDirCandidates();
    const isKnownLinuxPath = candidates.includes(configured);

    if (isKnownLinuxPath || configuredReplayCount === 0) {
      const defaultReplayCount = await countReplayFiles(defaultDir);

      if (configuredReplayCount === 0 && defaultReplayCount > 0) {
        return defaultDir;
      }

      for (const candidate of candidates) {
        if (candidate === configured) {
          continue;
        }
        const candidateCount = await countReplayFiles(candidate);
        if (candidateCount > configuredReplayCount) {
          return candidate;
        }
      }
    }
  }

  if (configuredReplayCount === 0 && (await replayDirExists(defaultDir))) {
    return defaultDir;
  }

  return configured;
}

export function getReplayFileName(
  match: Match,
  context?: ReplayFileNameContext,
): string {
  return buildReplaySyncFileName(match, context);
}

export function getReplayFilePath(
  replayDir: string,
  match: Match,
  context?: ReplayFileNameContext,
): string {
  return join(replayDir, getReplayFileName(match, context));
}

export async function loadReplaySaverState(
  statePath = DEFAULT_STATE_FILE,
): Promise<ReplaySaverState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ReplaySaverState>;
    return {
      downloadedMatchGuids: parsed.downloadedMatchGuids ?? [],
    };
  } catch {
    return { downloadedMatchGuids: [] };
  }
}

export async function saveReplaySaverState(
  state: ReplaySaverState,
  statePath = DEFAULT_STATE_FILE,
): Promise<void> {
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function scanExistingReplayGuids(replayDir: string): Promise<Set<string>> {
  const guids = new Set<string>();

  let entries: string[];
  try {
    entries = await readdir(replayDir);
  } catch {
    return guids;
  }

  const guidPattern = /[0-9A-F]{32}/gi;
  for (const entry of entries) {
    if (!entry.endsWith(".replay")) {
      continue;
    }

    for (const match of entry.matchAll(guidPattern)) {
      guids.add(match[0].toUpperCase());
    }
  }

  return guids;
}

export async function replayFileExists(
  replayDir: string,
  match: Match,
  context?: ReplayFileNameContext,
): Promise<boolean> {
  try {
    await access(getReplayFilePath(replayDir, match, context));
    return true;
  } catch {
    try {
      const entries = await readdir(replayDir);
      const upperGuid = match.MatchGUID.toUpperCase();
      return entries.some(
        (entry) => entry.toUpperCase().includes(upperGuid) && entry.endsWith(".replay"),
      );
    } catch {
      return false;
    }
  }
}

export async function isReplayDownloaded(
  matchGuid: string,
  replayDir: string,
  match: Match,
): Promise<boolean> {
  return replayFileExists(replayDir, match);
}

export async function downloadReplay(
  entry: MatchEntry,
  replayDir: string,
  fetchFn: typeof fetch = fetch,
  onProgress?: (bytesReceived: number, bytesTotal?: number) => void,
  context?: ReplayFileNameContext,
): Promise<string> {
  if (!entry.ReplayUrl) {
    throw new Error("match has no replay URL");
  }

  await mkdir(replayDir, { recursive: true });

  const fileName = getReplayFileName(entry.Match, context);
  const destination = await uniqueReplayDestination(replayDir, fileName);
  const response = await fetchFn(entry.ReplayUrl, {
    headers: {
      "User-Agent": `RL Win/${GAME_VERSION} gzip`,
    },
  });

  if (!response.ok) {
    throw new Error(`download failed with status ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const bytesTotal = contentLength ? Number.parseInt(contentLength, 10) : undefined;
  const body = response.body;

  let replayData: Buffer;
  if (body) {
    const chunks: Buffer[] = [];
    let bytesReceived = 0;
    const reader = body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      chunks.push(chunk);
      bytesReceived += chunk.length;
      onProgress?.(bytesReceived, bytesTotal);
    }

    replayData = Buffer.concat(chunks);
  } else {
    replayData = Buffer.from(await response.arrayBuffer());
    onProgress?.(replayData.length, replayData.length);
  }

  if (replayData.length === 0) {
    throw new Error("downloaded replay file is empty");
  }

  await writeFile(destination, replayData);
  return destination;
}

export async function syncReplays(
  matches: MatchEntry[],
  options: SyncReplaysOptions = {},
): Promise<SyncReplaysResult> {
  const replayDir = options.replayDir ?? getDefaultReplayDir();
  const fetchFn = options.fetchFn ?? fetch;

  let downloadedGuids: string[];
  if (options.knownGuids) {
    downloadedGuids = [...options.knownGuids];
  } else if (options.statePath) {
    const state = await loadReplaySaverState(options.statePath);
    downloadedGuids = state.downloadedMatchGuids;
  } else {
    downloadedGuids = [];
  }

  const knownGuids = new Set(
    [
      ...downloadedGuids,
      ...(await scanExistingReplayGuids(replayDir)),
    ].map((guid) => guid.toUpperCase()),
  );
  const skipDownloadGuids = new Set(
    [...(options.skipDownloadGuids ?? [])].map((guid) => guid.toUpperCase()),
  );

  const result: SyncReplaysResult = {
    checked: matches.length,
    downloaded: [],
    skippedExisting: 0,
    skippedNoReplayUrl: 0,
    failed: [],
  };

  const toDownload: MatchEntry[] = [];
  const fileNameContext = options.fileNameContext;

  for (const entry of matches) {
    const matchGuid = entry.Match.MatchGUID;
    if (!matchGuid) {
      continue;
    }

    if (!entry.ReplayUrl) {
      result.skippedNoReplayUrl += 1;
      continue;
    }

    if (skipDownloadGuids.has(matchGuid.toUpperCase())) {
      result.skippedExisting += 1;
      knownGuids.add(matchGuid.toUpperCase());
      continue;
    }

    const alreadyDownloaded = await replayFileExists(replayDir, entry.Match, fileNameContext);
    if (alreadyDownloaded) {
      result.skippedExisting += 1;
      knownGuids.add(matchGuid.toUpperCase());
      continue;
    }

    toDownload.push(entry);
  }

  if (toDownload.length > 0) {
    options.onDownloadsQueued?.(
      toDownload.map((entry) => ({
        matchGuid: entry.Match.MatchGUID,
        fileName: getReplayFileName(entry.Match, fileNameContext),
      })),
    );
  }

  for (const [index, entry] of toDownload.entries()) {
    const matchGuid = entry.Match.MatchGUID;
    const fileName = getReplayFileName(entry.Match, fileNameContext);

    options.onDownloadStart?.({
      matchGuid,
      fileName,
      index: index + 1,
      total: toDownload.length,
    });

    try {
      const destination = await downloadReplay(
        entry,
        replayDir,
        fetchFn,
        (bytesReceived, bytesTotal) => {
          options.onDownloadProgress?.({ matchGuid, bytesReceived, bytesTotal });
        },
        fileNameContext,
      );
      knownGuids.add(matchGuid.toUpperCase());
      downloadedGuids.push(matchGuid);
      result.downloaded.push({
        filePath: destination,
        fileName,
        matchGuid,
      });
      options.onDownloadComplete?.({ matchGuid, fileName });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({
        matchGuid,
        error: message,
      });
      options.onDownloadFailed?.({ matchGuid, fileName, error: message });
    }
  }

  downloadedGuids = [...new Set([...downloadedGuids, ...knownGuids])];

  if (options.onGuidsUpdated) {
    await options.onGuidsUpdated(downloadedGuids);
  } else if (options.statePath) {
    await saveReplaySaverState(
      { downloadedMatchGuids: downloadedGuids },
      options.statePath,
    );
  }

  return result;
}

export async function replayDirExists(replayDir: string): Promise<boolean> {
  try {
    await access(replayDir);
    return true;
  } catch {
    return false;
  }
}
