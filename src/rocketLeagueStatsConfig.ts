import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_STATS_API_PORT } from "./rocketLeagueStatsApi.js";
import { getUserTagameConfigDirCandidates } from "./replays.js";

export const STATS_API_DOCS_URL = "https://www.rocketleague.com/en/developer/stats-api";
export const TA_STATS_API_FILE_NAME = "TAStatsAPI.ini";

const STATS_API_SECTION = "[TAGame.MatchStatsExporter_TA]";
const DEFAULT_PACKET_SEND_RATE = 10;

export interface StatsApiConfigLocation {
  path: string;
  exists: boolean;
  packetSendRate?: number;
  port?: number;
  enabled: boolean;
}

export interface StatsApiCheckResult {
  status: "ready" | "needs_fix";
  message: string;
  detail?: string;
  configPath: string;
  packetSendRate?: number;
  port?: number;
  canAutoFix: boolean;
  gameRunning: boolean;
}

function getPrimaryUserConfigDir(replayDir?: string): string {
  if (replayDir?.trim()) {
    return join(dirname(replayDir.trim()), "Config");
  }

  const candidates = getUserTagameConfigDirCandidates();
  if (candidates.length > 0) {
    return candidates[0]!;
  }

  return join(
    homedir(),
    "Documents",
    "My Games",
    "Rocket League",
    "TAGame",
    "Config",
  );
}

export function getTAStatsApiConfigPath(replayDir?: string): string {
  return join(getPrimaryUserConfigDir(replayDir), TA_STATS_API_FILE_NAME);
}

function parseIniValue(content: string, key: string): number | undefined {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*([^\\s;#]+)`, "im"));
  if (!match?.[1]) {
    return undefined;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function readStatsApiConfig(path: string): Promise<StatsApiConfigLocation> {
  try {
    const content = await readFile(path, "utf8");
    const packetSendRate = parseIniValue(content, "PacketSendRate");
    const port = parseIniValue(content, "Port") ?? DEFAULT_STATS_API_PORT;
    const enabled = (packetSendRate ?? 0) > 0;

    return {
      path,
      exists: true,
      packetSendRate,
      port,
      enabled,
    };
  } catch {
    return {
      path,
      exists: false,
      enabled: false,
    };
  }
}

function upsertStatsApiIni(content: string): string {
  const lines = content.length > 0 ? content.replace(/\r\n/g, "\n").split("\n") : [];
  const sectionIndex = lines.findIndex((line) => line.trim() === STATS_API_SECTION);
  const sectionLines = ["Port=49123", `PacketSendRate=${DEFAULT_PACKET_SEND_RATE}`];

  if (sectionIndex >= 0) {
    let endIndex = sectionIndex + 1;
    while (endIndex < lines.length && !/^\s*\[/.test(lines[endIndex] ?? "")) {
      endIndex += 1;
    }

    const preserved = lines
      .slice(sectionIndex + 1, endIndex)
      .filter((line) => !/^\s*(Port|PacketSendRate)\s*=/.test(line));

    const nextSection = [STATS_API_SECTION, ...sectionLines, ...preserved];
    return [
      ...lines.slice(0, sectionIndex),
      ...nextSection,
      ...lines.slice(endIndex),
    ]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd()
      .concat("\n");
  }

  const prefix = lines.length > 0 ? `${lines.join("\n").trimEnd()}\n\n` : "";
  return `${prefix}${STATS_API_SECTION}\n${sectionLines.join("\n")}\n`;
}

export async function fixStatsApiConfig(replayDir?: string): Promise<StatsApiConfigLocation> {
  const targetPath = getTAStatsApiConfigPath(replayDir);
  await mkdir(dirname(targetPath), { recursive: true });

  let existing = "";
  try {
    existing = await readFile(targetPath, "utf8");
  } catch {
    existing = "";
  }

  await writeFile(targetPath, upsertStatsApiIni(existing), "utf8");
  return readStatsApiConfig(targetPath);
}

export async function checkStatsApiStatus(
  replayDir?: string,
): Promise<Omit<StatsApiCheckResult, "gameRunning">> {
  const configPath = getTAStatsApiConfigPath(replayDir);
  const config = await readStatsApiConfig(configPath);

  if (config.exists && config.enabled) {
    return {
      status: "ready",
      message: "Stats API is configured.",
      detail: "Overtime can count finished matches during your session.",
      configPath,
      packetSendRate: config.packetSendRate,
      port: config.port,
      canAutoFix: false,
    };
  }

  if (config.exists) {
    return {
      status: "needs_fix",
      message: "Stats API is disabled.",
      detail: "Enable it so Overtime can count finished matches during your session.",
      configPath,
      packetSendRate: config.packetSendRate,
      port: config.port,
      canAutoFix: true,
    };
  }

  return {
    status: "needs_fix",
    message: "Stats API is not configured.",
    detail: "Enable it so Overtime can count finished matches during your session.",
    configPath,
    canAutoFix: true,
  };
}

/** @deprecated Use getTAStatsApiConfigPath instead. */
export function getPreferredStatsApiFixPath(replayDir?: string): string {
  return getTAStatsApiConfigPath(replayDir);
}

/** @deprecated Use getTAStatsApiConfigPath instead. */
export function getStatsApiConfigCandidates(replayDir?: string): string[] {
  return [getTAStatsApiConfigPath(replayDir)];
}
