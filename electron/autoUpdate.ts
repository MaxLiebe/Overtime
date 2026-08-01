import { app, BrowserWindow, Notification } from "electron";
import electronUpdater from "electron-updater";
import type { AppConfig } from "rlapi";

const { autoUpdater } = electronUpdater;

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string }
  | { state: "disabled" };

let currentStatus: UpdateStatus = { state: "idle" };
let listenersAttached = false;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let getMainWindow: (() => BrowserWindow | null) | null = null;
let getConfig: (() => AppConfig) | null = null;

function broadcastStatus(): void {
  const window = getMainWindow?.() ?? null;
  window?.webContents.send("update-status", currentStatus);
}

function setStatus(status: UpdateStatus): void {
  currentStatus = status;
  broadcastStatus();
}

function notifyUpdate(title: string, body: string): void {
  if (!Notification.isSupported()) {
    return;
  }
  new Notification({ title, body }).show();
}

/** electron-builder sets this for Windows portable builds. */
function isPortableBuild(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

/** Short user-facing text; never dump raw updater stack traces into the UI. */
function formatUpdateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (isPortableBuild()) {
    return "Auto-update needs the setup installer. Portable builds can’t update in place.";
  }

  if (
    lower.includes("cannot find") ||
    lower.includes("no published versions") ||
    lower.includes("releases.atom") ||
    lower.includes("404") ||
    (lower.includes("not found") && (lower.includes("latest") || lower.includes("yml")))
  ) {
    return "No update found on GitHub Releases. Use the setup installer, and publish a release that includes latest.yml.";
  }

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("bad credentials") ||
    lower.includes("access denied")
  ) {
    return "Could not reach GitHub Releases (access denied).";
  }

  if (lower.includes("enotfound") || lower.includes("net::") || lower.includes("network")) {
    return "Could not check for updates (network error).";
  }

  const firstLine = raw.split(/\r?\n/)[0]?.trim() || "Couldn't check for updates.";
  return firstLine.length > 140 ? `${firstLine.slice(0, 137)}…` : firstLine;
}

function configureUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Include GitHub pre-releases while Overtime is in early testing.
  // Stable-only checks use /releases/latest and miss pre-release tags.
  autoUpdater.allowPrerelease = true;
  // Explicit feed avoids a missing/mis-baked app-update.yml from older packs.
  autoUpdater.setFeedURL({
    provider: "github",
    owner: "MaxLiebe",
    repo: "Overtime",
  });
}

function attachListeners(): void {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;

  configureUpdater();

  autoUpdater.on("checking-for-update", () => {
    setStatus({ state: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    setStatus({ state: "available", version: info.version });
    notifyUpdate("Update available", `Overtime ${info.version} is downloading.`);
  });

  autoUpdater.on("update-not-available", (info) => {
    setStatus({ state: "not-available", version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    setStatus({ state: "downloading", percent: progress.percent });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setStatus({ state: "downloaded", version: info.version });
    notifyUpdate(
      "Update ready",
      `Overtime ${info.version} will install when you quit the app.`,
    );
  });

  autoUpdater.on("error", (error) => {
    setStatus({
      state: "error",
      message: formatUpdateError(error),
    });
  });
}

async function runCheck(): Promise<void> {
  const config = getConfig?.();
  if (!app.isPackaged || !config?.autoUpdateEnabled) {
    return;
  }

  if (isPortableBuild()) {
    setStatus({
      state: "error",
      message: "Auto-update needs the setup installer. Portable builds can’t update in place.",
    });
    return;
  }

  try {
    configureUpdater();
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setStatus({
      state: "error",
      message: formatUpdateError(error),
    });
  }
}

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

export function initAutoUpdater(options: {
  getMainWindow: () => BrowserWindow | null;
  getConfig: () => AppConfig;
}): void {
  getMainWindow = options.getMainWindow;
  getConfig = options.getConfig;
  applyAutoUpdateSetting(options.getConfig().autoUpdateEnabled);
}

export function applyAutoUpdateSetting(enabled: boolean): void {
  if (!app.isPackaged) {
    setStatus({ state: "disabled" });
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
    return;
  }

  if (!enabled) {
    setStatus({ state: "disabled" });
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
    return;
  }

  if (isPortableBuild()) {
    setStatus({
      state: "error",
      message: "Auto-update needs the setup installer. Portable builds can’t update in place.",
    });
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
    return;
  }

  attachListeners();
  configureUpdater();
  void runCheck();

  if (checkTimer) {
    clearInterval(checkTimer);
  }
  checkTimer = setInterval(() => {
    void runCheck();
  }, 4 * 60 * 60 * 1000);
}

export async function checkForUpdatesNow(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    setStatus({ state: "disabled" });
    return currentStatus;
  }

  const config = getConfig?.();
  if (!config?.autoUpdateEnabled) {
    setStatus({ state: "disabled" });
    return currentStatus;
  }

  if (isPortableBuild()) {
    setStatus({
      state: "error",
      message: "Auto-update needs the setup installer. Portable builds can’t update in place.",
    });
    return currentStatus;
  }

  attachListeners();
  await runCheck();
  return currentStatus;
}

export function quitAndInstallUpdate(): void {
  if (currentStatus.state !== "downloaded") {
    return;
  }
  autoUpdater.quitAndInstall();
}
