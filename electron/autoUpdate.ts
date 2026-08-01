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

function attachListeners(): void {
  if (listenersAttached) {
    return;
  }
  listenersAttached = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

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
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

async function runCheck(): Promise<void> {
  const config = getConfig?.();
  if (!app.isPackaged || !config?.autoUpdateEnabled) {
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setStatus({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
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

  attachListeners();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
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
