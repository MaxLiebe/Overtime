import { contextBridge, ipcRenderer } from "electron";
import type { AppConfig, AppState, LinkedAccount } from "rlapi";

export interface ElectronApi {
  getConfig: () => Promise<AppConfig>;
  setConfig: (partial: Partial<AppConfig>) => Promise<AppConfig>;
  getState: () => Promise<AppState>;
  getAccounts: () => Promise<LinkedAccount[]>;
  addEpicAccount: () => Promise<LinkedAccount>;
  setAccountEnabled: (accountId: string, enabled: boolean) => Promise<LinkedAccount[]>;
  removeAccount: (accountId: string) => Promise<LinkedAccount[]>;
  loginWithEpic: () => Promise<LinkedAccount>;
  loginWithCode: (authCode: string) => Promise<{ displayName: string; accountId: string }>;
  syncNow: () => Promise<{ state: AppState; accounts: LinkedAccount[] }>;
  validateBallchasingToken: (token: string) => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (filePath: string) => Promise<void>;
  selectReplayDir: () => Promise<AppConfig | null>;
  onStateUpdated: (callback: (state: AppState) => void) => () => void;
  onAccountsUpdated: (callback: (accounts: LinkedAccount[]) => void) => () => void;
  onConfigUpdated: (callback: (config: AppConfig) => void) => () => void;
  onSyncStarted: (callback: () => void) => () => void;
  onSyncCompleted: (callback: () => void) => () => void;
  onSyncError: (callback: (message: string) => void) => () => void;
}

const api: ElectronApi = {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (partial) => ipcRenderer.invoke("set-config", partial),
  getState: () => ipcRenderer.invoke("get-state"),
  getAccounts: () => ipcRenderer.invoke("get-accounts"),
  addEpicAccount: () => ipcRenderer.invoke("add-epic-account"),
  setAccountEnabled: (accountId, enabled) =>
    ipcRenderer.invoke("set-account-enabled", accountId, enabled),
  removeAccount: (accountId) => ipcRenderer.invoke("remove-account", accountId),
  loginWithEpic: () => ipcRenderer.invoke("login-with-epic"),
  loginWithCode: (authCode) => ipcRenderer.invoke("login-with-code", authCode),
  syncNow: () => ipcRenderer.invoke("sync-now"),
  validateBallchasingToken: (token) =>
    ipcRenderer.invoke("validate-ballchasing-token", token),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  showItemInFolder: (filePath) => ipcRenderer.invoke("show-item-in-folder", filePath),
  selectReplayDir: () => ipcRenderer.invoke("select-replay-dir"),
  onStateUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) =>
      callback(state);
    ipcRenderer.on("state-updated", listener);
    return () => ipcRenderer.removeListener("state-updated", listener);
  },
  onAccountsUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, nextAccounts: LinkedAccount[]) =>
      callback(nextAccounts);
    ipcRenderer.on("accounts-updated", listener);
    return () => ipcRenderer.removeListener("accounts-updated", listener);
  },
  onConfigUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, nextConfig: AppConfig) =>
      callback(nextConfig);
    ipcRenderer.on("config-updated", listener);
    return () => ipcRenderer.removeListener("config-updated", listener);
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
};

contextBridge.exposeInMainWorld("api", api);

declare global {
  interface Window {
    api: ElectronApi;
  }
}
