import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  dialog,
} from "electron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DEFAULT_CONFIG,
  getDefaultPaths,
  loadAppState,
  loadConfig,
  saveConfig,
  SyncService,
  loadAccounts,
  saveAccounts,
  upsertAccount,
  removeAccount,
  updateAccount,
  migrateLegacyRefreshToken,
  loginWithAuthCode,
  validateBallchasingToken,
  type AppConfig,
  type AppState,
  type LinkedAccount,
} from "rlapi";
import { openEpicLoginWindow } from "./epicAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TRAY_ICON = nativeImage.createFromDataURL(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANUlEQVR42mP8z8BQz0AEYBxVUA+mYaiHqR4mDBhUgxkYGBj+MzAwMPwHAA8FAv1v1T9MAAAAABJRU5ErkJggg==",
);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let config: AppConfig = { ...DEFAULT_CONFIG };
let paths = getDefaultPaths("");
let syncService: SyncService;
let accounts: LinkedAccount[] = [];

function getRendererPath(): string {
  return join(__dirname, "../../electron/renderer/index.html");
}

function broadcastState(state: AppState): void {
  mainWindow?.webContents.send("state-updated", state);
}

function broadcastAccounts(nextAccounts: LinkedAccount[]): void {
  accounts = nextAccounts;
  mainWindow?.webContents.send("accounts-updated", nextAccounts);
}

function broadcastConfig(nextConfig: AppConfig): void {
  mainWindow?.webContents.send("config-updated", nextConfig);
}

async function persistConfig(nextConfig: AppConfig): Promise<AppConfig> {
  config = { ...DEFAULT_CONFIG, ...nextConfig };
  await saveConfig(paths.configPath, config);
  applyLoginItemSettings();
  restartPollTimer();
  broadcastConfig(config);
  return config;
}

function applyLoginItemSettings(): void {
  app.setLoginItemSettings({
    openAtLogin: config.launchAtLogin,
    openAsHidden: config.startMinimized,
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: !config.startMinimized,
    title: "RL Replay Save",
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.loadFile(getRendererPath());

  window.on("close", (event) => {
    if (config.minimizeToTrayOnClose) {
      event.preventDefault();
      window.hide();
    }
  });

  return window;
}

function createTray(): Tray {
  const trayInstance = new Tray(TRAY_ICON);
  trayInstance.setToolTip("RL Replay Save");

  trayInstance.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Window",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "Sync Now",
        click: () => {
          void runSync();
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]),
  );

  trayInstance.on("click", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return trayInstance;
}

function restartPollTimer(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  const intervalMs = Math.max(1, config.pollIntervalMinutes) * 60_000;
  pollTimer = setInterval(() => {
    void runSync();
  }, intervalMs);
}

async function runSync(): Promise<void> {
  if (syncService.isRunning()) {
    return;
  }

  try {
    mainWindow?.webContents.send("sync-started");
    await syncService.run((state, nextAccounts) => {
      broadcastState(state);
      broadcastAccounts(nextAccounts);
    });
    mainWindow?.webContents.send("sync-completed");
  } catch (error) {
    mainWindow?.webContents.send(
      "sync-error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function addEpicAccount(forceAccountPicker = true): Promise<LinkedAccount> {
  let savedAuth: Awaited<ReturnType<typeof loginWithAuthCode>> | undefined;

  await openEpicLoginWindow(
    mainWindow,
    async (authCode) => {
      savedAuth = await loginWithAuthCode(authCode, paths.refreshTokenPath);
      accounts = upsertAccount(accounts, savedAuth);
      await saveAccounts(paths.accountsPath, accounts);
    },
    { forceAccountPicker },
  );

  if (!savedAuth) {
    throw new Error("Epic login did not return account details");
  }

  const linked = accounts.find((account) => account.accountId === savedAuth!.account_id);
  if (!linked) {
    throw new Error("Failed to save linked Epic account");
  }

  broadcastAccounts(accounts);
  return linked;
}

function registerIpcHandlers(): void {
  ipcMain.handle("get-config", async () => config);

  ipcMain.handle("set-config", async (_event, partial: Partial<AppConfig>) => {
    return persistConfig({ ...config, ...partial });
  });

  ipcMain.handle("get-state", async () => loadAppState(paths.statePath));

  ipcMain.handle("get-accounts", async () => accounts);

  ipcMain.handle("set-account-enabled", async (_event, accountId: string, enabled: boolean) => {
    accounts = updateAccount(accounts, accountId, { enabled });
    await saveAccounts(paths.accountsPath, accounts);
    broadcastAccounts(accounts);
    return accounts;
  });

  ipcMain.handle("remove-account", async (_event, accountId: string) => {
    accounts = removeAccount(accounts, accountId);
    await saveAccounts(paths.accountsPath, accounts);
    broadcastAccounts(accounts);
    return accounts;
  });

  ipcMain.handle("add-epic-account", async () => {
    app.dock?.show();
    try {
      return await addEpicAccount(true);
    } finally {
      if (!mainWindow?.isVisible()) {
        app.dock?.hide();
      }
    }
  });

  ipcMain.handle("login-with-epic", async () => addEpicAccount(true));

  ipcMain.handle("login-with-code", async (_event, authCode: string) => {
    const auth = await loginWithAuthCode(authCode, paths.refreshTokenPath);
    accounts = upsertAccount(accounts, auth);
    await saveAccounts(paths.accountsPath, accounts);
    broadcastAccounts(accounts);
    return { displayName: auth.displayName, accountId: auth.account_id };
  });

  ipcMain.handle("sync-now", async () => {
    await runSync();
    return {
      state: await loadAppState(paths.statePath),
      accounts,
    };
  });

  ipcMain.handle("validate-ballchasing-token", async (_event, token: string) => {
    if (!token.trim()) {
      return false;
    }
    return validateBallchasingToken(token.trim());
  });

  ipcMain.handle("open-external", async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("show-item-in-folder", async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("select-replay-dir", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      defaultPath: config.replayDir,
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return persistConfig({ ...config, replayDir: result.filePaths[0] });
  });
}

app.whenReady().then(async () => {
  paths = getDefaultPaths(app.getPath("userData"));
  config = await loadConfig(paths.configPath);

  const existingState = await loadAppState(paths.statePath);
  accounts = await migrateLegacyRefreshToken({
    accountsPath: paths.accountsPath,
    refreshTokenPath: paths.refreshTokenPath,
    fallbackDisplayName: existingState.savedReplays[0]?.accountDisplayName,
    fallbackAccountId: existingState.savedReplays[0]?.accountId,
  });

  syncService = new SyncService(
    {
      statePath: paths.statePath,
      accountsPath: paths.accountsPath,
    },
    () => config,
  );

  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  registerIpcHandlers();
  mainWindow = createMainWindow();
  mainWindow.on("show", () => app.dock?.show());
  mainWindow.on("hide", () => app.dock?.hide());
  tray = createTray();
  applyLoginItemSettings();
  restartPollTimer();

  if (accounts.some((account) => account.enabled)) {
    void runSync();
  }

  app.on("activate", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});
