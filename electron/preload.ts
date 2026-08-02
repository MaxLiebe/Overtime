import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppConfig,
  AppState,
  PublicAppConfig,
  PublicLinkedAccount,
  ReplayLibraryResult,
  SyncProgressEvent,
  TrackedMatch,
} from "rlapi";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "not-available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string }
  | { state: "disabled" };

export interface ElectronApi {
  getPlatformInfo: () => Promise<{ platform: string; inGameReplaySupported: boolean }>;
  getConfig: () => Promise<PublicAppConfig>;
  getGameMonitorState: () => Promise<import("rlapi").GameMonitorState>;
  getTrackedMatches: () => Promise<TrackedMatch[]>;
  setConfig: (partial: Partial<AppConfig>) => Promise<PublicAppConfig>;
  getState: () => Promise<AppState>;
  getAccounts: () => Promise<PublicLinkedAccount[]>;
  addEpicAccount: () => Promise<PublicLinkedAccount>;
  cancelEpicDeviceAuth: () => Promise<void>;
  reopenEpicDeviceAuth: () => Promise<boolean>;
  setAccountEnabled: (accountId: string, enabled: boolean) => Promise<PublicLinkedAccount[]>;
  removeAccount: (accountId: string) => Promise<PublicLinkedAccount[]>;
  loginWithEpic: () => Promise<PublicLinkedAccount>;
  syncNow: (options?: {
    allowWhileGameRunning?: boolean;
  }) => Promise<{ state: AppState; accounts: PublicLinkedAccount[] }>;
  validateBallchasingToken: (token: string) => Promise<boolean>;
  checkRlStatsApi: () => Promise<import("rlapi").StatsApiCheckResult>;
  fixRlStatsApi: () => Promise<import("rlapi").StatsApiCheckResult>;
  uploadReplayBallchasing: (payload: {
    matchGuid: string;
    filePath: string;
    uploadFileName?: string;
    title?: string;
  }) => Promise<{ replay: import("rlapi").SavedReplayRecord; state: AppState }>;
  restoreCloudReplay: (matchGuid: string) => Promise<{
    replay: import("rlapi").SavedReplayRecord;
    state: AppState;
  }>;
  removeReplayLocalFile: (matchGuid: string) => Promise<{
    replay: import("rlapi").SavedReplayRecord;
    state: AppState;
  }>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;
  writeClipboardText: (text: string) => Promise<void>;
  copyReplayFile: (payload: {
    filePath: string;
    copyAsName?: string;
  }) => Promise<void>;
  selectReplayDir: () => Promise<PublicAppConfig | null>;
  getUpdateStatus: () => Promise<UpdateStatus>;
  checkForUpdates: () => Promise<UpdateStatus>;
  quitAndInstallUpdate: () => Promise<void>;
  getReplayLibrary: (options?: {
    page?: number;
    syncedOnly?: boolean;
    sortBy?: "match" | "import";
  }) => Promise<ReplayLibraryResult>;
  pickReplayFiles: () => Promise<string[]>;
  importReplayFiles: (sourcePaths: string[]) => Promise<{
    imported: import("rlapi").SavedReplayRecord[];
    errors: string[];
  }>;
  importReplayFromBallchasing: (url: string) => Promise<{
    imported: import("rlapi").SavedReplayRecord[];
    errors: string[];
  }>;
  deleteReplay: (payload: {
    matchGuid: string;
    filePath: string;
  }) => Promise<{ state: AppState }>;
  deleteReplays: (payloads: {
    matchGuid: string;
    filePath: string;
  }[]) => Promise<{ state: AppState; deletedCount: number; errors: string[] }>;
  renameReplay: (payload: {
    matchGuid: string;
    filePath: string;
    replayName: string;
  }) => Promise<{ replayName: string; state: AppState }>;
  checkBallchasingViewer: () => Promise<boolean>;
  playReplayInGame: (payload: {
    ballchasingId?: string;
    ballchasingUrl?: string;
    filePath?: string;
    matchGuid?: string;
  }) => Promise<string>;
  getProPlayerProfile: (payload: {
    playerId: string;
    playerName: string;
  }) => Promise<import("rlapi").ProPlayerProfile | null>;
  getPathForFile: (file: File) => string;
  onStateUpdated: (callback: (state: AppState) => void) => () => void;
  onAccountsUpdated: (callback: (accounts: PublicLinkedAccount[]) => void) => () => void;
  onConfigUpdated: (callback: (config: PublicAppConfig) => void) => () => void;
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;
  onGameMonitorUpdated: (callback: (state: import("rlapi").GameMonitorState) => void) => () => void;
  onTrackedMatchesUpdated: (callback: (matches: TrackedMatch[]) => void) => () => void;
  onSyncStarted: (callback: () => void) => () => void;
  onSyncCompleted: (callback: () => void) => () => void;
  onSyncError: (callback: (message: string) => void) => () => void;
  onSyncProgress: (callback: (event: SyncProgressEvent) => void) => () => void;
  onEpicDeviceAuthStarted: (callback: (progress: { userCode: string; verificationUri: string }) => void) => () => void;
  onEpicDeviceAuthFinished: (callback: () => void) => () => void;
  onBallchasingImportProgress: (
    callback: (progress: {
      phase: "listing" | "downloading";
      current: number;
      total: number;
      replayId?: string;
    }) => void,
  ) => () => void;
  onSessionInvalidated: (
    callback: (payload: {
      accountId: string;
      displayName: string;
      message: string;
    }) => void,
  ) => () => void;
}

const api: ElectronApi = {
  getPlatformInfo: () => ipcRenderer.invoke("get-platform-info"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  getGameMonitorState: () => ipcRenderer.invoke("get-game-monitor-state"),
  getTrackedMatches: () => ipcRenderer.invoke("get-tracked-matches"),
  setConfig: (partial) => ipcRenderer.invoke("set-config", partial),
  getState: () => ipcRenderer.invoke("get-state"),
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  addEpicAccount: () => ipcRenderer.invoke("add-epic-account"),
  cancelEpicDeviceAuth: () => ipcRenderer.invoke("cancel-epic-device-auth"),
  reopenEpicDeviceAuth: () => ipcRenderer.invoke("reopen-epic-device-auth"),
  setAccountEnabled: (accountId, enabled) =>
    ipcRenderer.invoke("set-account-enabled", accountId, enabled),
  removeAccount: (accountId) => ipcRenderer.invoke("remove-account", accountId),
  loginWithEpic: () => ipcRenderer.invoke("login-with-epic"),
  syncNow: (options) => ipcRenderer.invoke("sync-now", options),
  validateBallchasingToken: (token) =>
    ipcRenderer.invoke("validate-ballchasing-token", token),
  checkRlStatsApi: () => ipcRenderer.invoke("check-rl-stats-api"),
  fixRlStatsApi: () => ipcRenderer.invoke("fix-rl-stats-api"),
  uploadReplayBallchasing: (payload) =>
    ipcRenderer.invoke("upload-replay-ballchasing", payload),
  restoreCloudReplay: (matchGuid) =>
    ipcRenderer.invoke("restore-cloud-replay", matchGuid),
  removeReplayLocalFile: (matchGuid) =>
    ipcRenderer.invoke("remove-replay-local-file", matchGuid),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  showItemInFolder: (filePath) => ipcRenderer.invoke("show-item-in-folder", filePath),
  writeClipboardText: (text) => ipcRenderer.invoke("write-clipboard-text", text),
  copyReplayFile: (payload) => ipcRenderer.invoke("copy-replay-file", payload),
  selectReplayDir: () => ipcRenderer.invoke("select-replay-dir"),
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  quitAndInstallUpdate: () => ipcRenderer.invoke("quit-and-install-update"),
  getReplayLibrary: (options) => ipcRenderer.invoke("get-replay-library", options ?? {}),
  pickReplayFiles: () => ipcRenderer.invoke("pick-replay-files"),
  importReplayFiles: (sourcePaths) =>
    ipcRenderer.invoke("import-replay-files", sourcePaths),
  importReplayFromBallchasing: (url) =>
    ipcRenderer.invoke("import-replay-from-ballchasing", url),
  deleteReplay: (payload) => ipcRenderer.invoke("delete-replay", payload),
  deleteReplays: (payloads) => ipcRenderer.invoke("delete-replays", payloads),
  renameReplay: (payload) => ipcRenderer.invoke("rename-replay", payload),
  checkBallchasingViewer: () => ipcRenderer.invoke("check-ballchasing-viewer"),
  playReplayInGame: (payload) => ipcRenderer.invoke("play-replay-in-game", payload),
  getProPlayerProfile: (payload) => ipcRenderer.invoke("get-pro-player-profile", payload),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onStateUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) =>
      callback(state);
    ipcRenderer.on("state-updated", listener);
    return () => ipcRenderer.removeListener("state-updated", listener);
  },
  onAccountsUpdated: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      nextAccounts: PublicLinkedAccount[],
    ) => callback(nextAccounts);
    ipcRenderer.on("accounts-updated", listener);
    return () => ipcRenderer.removeListener("accounts-updated", listener);
  },
  onConfigUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, nextConfig: PublicAppConfig) =>
      callback(nextConfig);
    ipcRenderer.on("config-updated", listener);
    return () => ipcRenderer.removeListener("config-updated", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) =>
      callback(status);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
  onGameMonitorUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, monitor: import("rlapi").GameMonitorState) =>
      callback(monitor);
    ipcRenderer.on("game-monitor-updated", listener);
    return () => ipcRenderer.removeListener("game-monitor-updated", listener);
  },
  onTrackedMatchesUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, matches: TrackedMatch[]) =>
      callback(matches);
    ipcRenderer.on("tracked-matches-updated", listener);
    return () => ipcRenderer.removeListener("tracked-matches-updated", listener);
  },
  onSyncStarted: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("sync-started", listener);
    return () => ipcRenderer.removeListener("sync-started", listener);
  },
  onSyncCompleted: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("sync-completed", listener);
    return () => ipcRenderer.removeListener("sync-completed", listener);
  },
  onSyncError: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) =>
      callback(message);
    ipcRenderer.on("sync-error", listener);
    return () => ipcRenderer.removeListener("sync-error", listener);
  },
  onSyncProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: SyncProgressEvent) =>
      callback(progress);
    ipcRenderer.on("sync-progress", listener);
    return () => ipcRenderer.removeListener("sync-progress", listener);
  },
  onEpicDeviceAuthStarted: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: { userCode: string; verificationUri: string },
    ) => callback(progress);
    ipcRenderer.on("epic-device-auth-started", listener);
    return () => ipcRenderer.removeListener("epic-device-auth-started", listener);
  },
  onEpicDeviceAuthFinished: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("epic-device-auth-finished", listener);
    return () => ipcRenderer.removeListener("epic-device-auth-finished", listener);
  },
  onBallchasingImportProgress: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: {
        phase: "listing" | "downloading";
        current: number;
        total: number;
        replayId?: string;
      },
    ) => callback(progress);
    ipcRenderer.on("ballchasing-import-progress", listener);
    return () => ipcRenderer.removeListener("ballchasing-import-progress", listener);
  },
  onSessionInvalidated: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { accountId: string; displayName: string; message: string },
    ) => callback(payload);
    ipcRenderer.on("session-invalidated", listener);
    return () => ipcRenderer.removeListener("session-invalidated", listener);
  },
};

contextBridge.exposeInMainWorld("api", api);

declare global {
  interface Window {
    api: ElectronApi;
  }
}
