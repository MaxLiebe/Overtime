import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  shell,
  dialog,
  clipboard,
  Notification,
} from "electron";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, normalize, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import {
  DEFAULT_CONFIG,
  getDefaultPaths,
  loadAppState,
  loadConfig,
  resolveReplayDir,
  saveAppState,
  saveConfig,
  SyncService,
  loadAccounts,
  modifyAccounts,
  upsertAccountFromEos,
  removeAccount,
  updateAccount,
  migrateLegacyRefreshToken,
  validateBallchasingToken,
  uploadReplayToBallchasing,
  ballchasingFailureUpdates,
  buildReplayLibrary,
  invalidateMergedLibraryCache,
  invalidateReplayFileCache,
  invalidateReplayLibraryCache,
  clearReplayParseCaches,
  findReplayByMatchGuid,
  importReplayFiles,
  importReplayFromBallchasingUrl,
  importReplaysFromBallchasingGroup,
  parseBallchasingImportUrl,
  deleteReplayFile,
  renameReplayInFile,
  updateSavedReplay,
  removeSavedReplay,
  upsertSavedReplay,
  upsertImportedBallchasingLink,
  removeImportedBallchasingLink,
  upsertImportedReplayMeta,
  removeImportedReplayMeta,
  promoteReplayToCloudOnly,
  restoreReplayFromCloud,
  isCloudOnlyReplay,
  findNewSessionInvalidations,
  SESSION_EXPIRED_MESSAGE,
  getBallchasingReplayId,
  isBallchasingViewerAvailable,
  isInGameReplaySupported,
  isRocketLeagueRunning,
  RocketLeagueWatcher,
  usesProcessSync,
  createInactiveGameMonitorState,
  checkStatsApiStatus,
  fixStatsApiConfig,
  type TrackedMatch,
  playReplayInGame,
  resolveProPlayerProfile,
  sanitizeReplayFileName,
  sanitizeReplayExportFileName,
  buildBallchasingReplayTitle,
  buildReplayExportFileName,
  assertAllowedExternalUrl,
  assertPathInsideReplayDir,
  toPublicConfig,
  mergeConfigFromRenderer,
  toPublicAccount,
  toPublicAccounts,
  type AppConfig,
  type AppState,
  type GameMonitorState,
  type LinkedAccount,
  type SavedReplayRecord,
  type EosTokenResponse,
  type SyncProgressEvent,
} from "rlapi";
import { openEpicDeviceLogin, cancelEpicDeviceLogin, reopenEpicDeviceLogin } from "./epicDeviceAuth.js";
import {
  applyAutoUpdateSetting,
  checkForUpdatesNow,
  getUpdateStatus,
  initAutoUpdater,
  quitAndInstallUpdate,
} from "./autoUpdate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TRAY_ICON = nativeImage.createFromDataURL(
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAANUlEQVR42mP8z8BQz0AEYBxVUA+mYaiHqR4mDBhUgxkYGBj+MzAwMPwHAA8FAv1v1T9MAAAAABJRU5ErkJggg==",
);

function getAppIconPath(): string {
  return join(__dirname, "../../electron/assets/overtime-logo.png");
}

function loadAppIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(getAppIconPath());
  return icon.isEmpty() ? TRAY_ICON : icon;
}

function getTrayIcon(): Electron.NativeImage {
  const icon = loadAppIcon();
  return icon.resize({ width: 16, height: 16 });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let config: AppConfig = { ...DEFAULT_CONFIG };
let paths = getDefaultPaths("");
let syncService: SyncService;
let gameWatcher: RocketLeagueWatcher | null = null;
let accounts: LinkedAccount[] = [];
const pendingFreshEos = new Map<string, EosTokenResponse>();
let syncPaused = false;
let taskbarDownloadTotal = 0;
let taskbarDownloadCompleted = 0;
let restoreSkipTaskbarAfterSync = false;

function beginTaskbarSyncProgress(): void {
  if (process.platform !== "win32" || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  taskbarDownloadTotal = 0;
  taskbarDownloadCompleted = 0;

  if (!mainWindow.isVisible() && config.minimizeToTrayOnClose) {
    restoreSkipTaskbarAfterSync = true;
    mainWindow.setSkipTaskbar(false);
  }

  mainWindow.setProgressBar(2, { mode: "indeterminate" });
}

function applyTaskbarSyncProgress(event: SyncProgressEvent): void {
  if (process.platform !== "win32" || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  switch (event.phase) {
    case "auth":
    case "fetching-history":
    case "checking-replays":
    case "uploading-ballchasing":
    case "saving-replay":
      mainWindow.setProgressBar(2, { mode: "indeterminate" });
      break;
    case "downloads-queued":
      taskbarDownloadTotal = event.items.length;
      taskbarDownloadCompleted = 0;
      if (taskbarDownloadTotal === 0) {
        mainWindow.setProgressBar(2, { mode: "indeterminate" });
      } else {
        mainWindow.setProgressBar(0);
      }
      break;
    case "download-start":
      mainWindow.setProgressBar(Math.max(0, (event.index - 1) / event.total));
      break;
    case "download-complete":
      taskbarDownloadCompleted += 1;
      mainWindow.setProgressBar(
        taskbarDownloadTotal > 0 ? taskbarDownloadCompleted / taskbarDownloadTotal : 1,
      );
      break;
    case "account-complete":
      mainWindow.setProgressBar(1);
      break;
    default:
      break;
  }
}

function endTaskbarSyncProgress(): void {
  if (process.platform !== "win32" || !mainWindow || mainWindow.isDestroyed()) {
    taskbarDownloadTotal = 0;
    taskbarDownloadCompleted = 0;
    restoreSkipTaskbarAfterSync = false;
    return;
  }

  mainWindow.setProgressBar(-1);
  taskbarDownloadTotal = 0;
  taskbarDownloadCompleted = 0;

  if (restoreSkipTaskbarAfterSync && !mainWindow.isVisible()) {
    mainWindow.setSkipTaskbar(true);
  }

  restoreSkipTaskbarAfterSync = false;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function getRendererPath(): string {
  return join(__dirname, "../../electron/renderer/index.html");
}

function broadcastState(state: AppState): void {
  invalidateMergedLibraryCache();
  mainWindow?.webContents.send("state-updated", state);
}

function broadcastStateAfterFilesystemChange(state: AppState): void {
  invalidateReplayLibraryCache();
  mainWindow?.webContents.send("state-updated", state);
}

async function persistImportedReplayMeta(records: SavedReplayRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  let state = await loadAppState(paths.statePath);
  let changed = false;

  for (const replay of records) {
    const filePath = replay.filePath?.trim();
    if (!filePath) {
      continue;
    }

    state = upsertImportedReplayMeta(state, filePath, {
      importedAt: replay.importedAt ?? new Date().toISOString(),
      matchGuid: replay.matchGuid,
    });
    changed = true;
  }

  if (changed) {
    await saveAppState(paths.statePath, state);
    broadcastState(state);
  }
}

let previousAccountsSnapshot: LinkedAccount[] = [];

function notifyUser(title: string, body: string): void {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    title,
    body,
    icon: getAppIconPath(),
  });
  notification.show();
}

function handleAccountSessionNotifications(nextAccounts: LinkedAccount[]): void {
  const invalidated = findNewSessionInvalidations(
    previousAccountsSnapshot,
    nextAccounts,
  );

  for (const account of invalidated) {
    const message = account.lastSyncError ?? SESSION_EXPIRED_MESSAGE;
    notifyUser("Sign-in required", `${account.displayName}: ${message}`);
    mainWindow?.webContents.send("session-invalidated", {
      accountId: account.accountId,
      displayName: account.displayName,
      message,
    });
  }

  previousAccountsSnapshot = nextAccounts.map((account) => ({ ...account }));
}

function broadcastAccounts(nextAccounts: LinkedAccount[]): void {
  handleAccountSessionNotifications(nextAccounts);
  accounts = nextAccounts;
  mainWindow?.webContents.send("accounts-updated", toPublicAccounts(nextAccounts));
}

function broadcastConfig(nextConfig: AppConfig): void {
  mainWindow?.webContents.send("config-updated", toPublicConfig(nextConfig));
}

async function persistConfig(nextConfig: AppConfig): Promise<ReturnType<typeof toPublicConfig>> {
  const previousAutoUpdate = config.autoUpdateEnabled;
  const replayLibraryChanged =
    nextConfig.replayDir !== config.replayDir ||
    nextConfig.replaySortBy !== config.replaySortBy;
  config = { ...DEFAULT_CONFIG, ...nextConfig };
  await saveConfig(paths.configPath, config);
  if (replayLibraryChanged) {
    invalidateReplayLibraryCache();
  }
  applyLoginItemSettings();
  restartPollTimer();
  startGameWatcher();
  if (config.autoUpdateEnabled !== previousAutoUpdate) {
    applyAutoUpdateSetting(config.autoUpdateEnabled);
  }
  broadcastConfig(config);
  return toPublicConfig(config);
}

function resolveSafeReplayPath(filePath: string): string {
  return assertPathInsideReplayDir(filePath, config.replayDir);
}

function applyLoginItemSettings(): void {
  app.setLoginItemSettings({
    openAtLogin: config.launchAtLogin,
    openAsHidden: config.startMinimized,
  });
}

function hideMainWindowToTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.hide();
  if (process.platform === "win32") {
    mainWindow.setSkipTaskbar(true);
  }
  if (process.platform === "darwin") {
    app.dock?.hide();
  }
}

function showMainWindowFromTray(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  if (process.platform === "win32") {
    mainWindow.setSkipTaskbar(false);
  }
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === "darwin") {
    app.dock?.show();
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: !config.startMinimized,
    title: "Overtime",
    icon: loadAppIcon(),
    backgroundColor: "#1a2433",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep false: this app uses an ESM preload under package.json "type": "module".
      // Sandbox mode can fail to load that preload, leaving window.api undefined
      // and the UI stuck on "Starting…".
      sandbox: false,
    },
  });

  window.setMenuBarVisibility(false);

  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void shell.openExternal(assertAllowedExternalUrl(url));
    } catch {
      // Block unknown protocols/hosts.
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    // Allow the initial/renderer file load; only block in-page navigations away from the app.
    if (url.startsWith("file:")) {
      return;
    }
    event.preventDefault();
    try {
      void shell.openExternal(assertAllowedExternalUrl(url));
    } catch {
      // Block unknown protocols/hosts.
    }
  });

  window.loadFile(getRendererPath());

  if (config.startMinimized && process.platform === "win32") {
    window.setSkipTaskbar(true);
  }

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    if (config.minimizeToTrayOnClose) {
      event.preventDefault();
      hideMainWindowToTray();
      return;
    }
    isQuitting = true;
  });

  window.on("minimize", () => {
    if (isQuitting || !config.minimizeToTrayOnClose) {
      return;
    }
    hideMainWindowToTray();
  });

  return window;
}

function createTray(): Tray {
  const trayInstance = new Tray(getTrayIcon());
  trayInstance.setToolTip("Overtime");

  trayInstance.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Window",
        click: () => {
          showMainWindowFromTray();
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
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  trayInstance.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    if (mainWindow.isVisible()) {
      hideMainWindowToTray();
    } else {
      showMainWindowFromTray();
    }
  });

  return trayInstance;
}

function broadcastGameMonitor(state: GameMonitorState): void {
  mainWindow?.webContents.send("game-monitor-updated", state);
}

function broadcastTrackedMatches(matches: TrackedMatch[]): void {
  mainWindow?.webContents.send("tracked-matches-updated", matches);
}

function getLinkedPlayerIdsForTracking(): string[] {
  const ids: string[] = [];
  for (const account of accounts) {
    if (account.platformPlayerId?.trim()) {
      ids.push(account.platformPlayerId.trim());
    }
    if (account.accountId?.trim()) {
      ids.push(account.accountId.trim());
    }
  }
  return ids;
}

async function pruneTrackedMatchesAgainstState(): Promise<void> {
  if (!gameWatcher) {
    return;
  }

  const state = await loadAppState(paths.statePath);
  const guids = state.savedReplays
    .filter((replay) => replay.filePath?.trim() || replay.cloudOnly || replay.ballchasingId)
    .map((replay) => replay.matchGuid);
  gameWatcher.pruneSyncedMatchGuids(guids);
}

function getGameMonitorState(): GameMonitorState {
  if (gameWatcher) {
    return gameWatcher.getState();
  }

  return createInactiveGameMonitorState(config);
}

function startGameWatcher(): void {
  gameWatcher?.stop();
  gameWatcher = null;

  gameWatcher = new RocketLeagueWatcher({
    getConfig: () => config,
    getLinkedPlayerIds: getLinkedPlayerIdsForTracking,
    onStateChange: (state) => {
      if (usesProcessSync(config)) {
        broadcastGameMonitor(state);
      } else {
        broadcastGameMonitor(createInactiveGameMonitorState(config));
      }
    },
    onTrackedMatchesChange: broadcastTrackedMatches,
    onGameClosed: () => {
      if (usesProcessSync(config)) {
        void runSync();
      }
    },
    onGamesThresholdReached: () => {
      void runSync({ allowWhileGameRunning: true });
    },
  });
  gameWatcher.start();
  broadcastGameMonitor(
    usesProcessSync(config)
      ? gameWatcher.getState()
      : createInactiveGameMonitorState(config),
  );
  broadcastTrackedMatches(gameWatcher.getTrackedMatches());
}

function restartPollTimer(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (config.syncMode !== "interval") {
    return;
  }

  const intervalMs = Math.max(1, config.pollIntervalMinutes) * 60_000;
  pollTimer = setInterval(() => {
    void runSync();
  }, intervalMs);
}

async function runSync(options?: {
  waitForRunning?: boolean;
  allowWhileGameRunning?: boolean;
}): Promise<void> {
  if (syncPaused) {
    return;
  }

  if (
    !options?.allowWhileGameRunning &&
    usesProcessSync(config) &&
    (await isRocketLeagueRunning())
  ) {
    if (options?.waitForRunning) {
      throw new Error(
        "Rocket League is running. Sync waits until you close the game with your current settings.",
      );
    }
    return;
  }

  if (syncService.isRunning()) {
    if (!options?.waitForRunning) {
      return;
    }

    while (syncService.isRunning()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (syncPaused || accounts.length === 0) {
    return;
  }

  const freshEosTokens = pendingFreshEos.size > 0 ? new Map(pendingFreshEos) : undefined;
  const onlyAccountIds = freshEosTokens ? [...freshEosTokens.keys()] : undefined;
  pendingFreshEos.clear();

  try {
    beginTaskbarSyncProgress();
    mainWindow?.webContents.send("sync-started");
    await syncService.run(
      (state, nextAccounts) => {
        broadcastState(state);
        broadcastAccounts(nextAccounts);
      },
      {
        ...(freshEosTokens ? { freshEosTokens } : {}),
        ...(onlyAccountIds ? { onlyAccountIds } : {}),
        onProgress: (event) => {
          applyTaskbarSyncProgress(event);
          mainWindow?.webContents.send("sync-progress", event);
        },
      },
    );
    await pruneTrackedMatchesAgainstState();
    mainWindow?.webContents.send("sync-completed");
  } catch (error) {
    mainWindow?.webContents.send(
      "sync-error",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    endTaskbarSyncProgress();
  }
}

async function addEpicAccount(_forceAccountPicker = true): Promise<LinkedAccount> {
  syncPaused = true;
  try {
    while (syncService.isRunning()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const { eosToken, session } = await openEpicDeviceLogin(mainWindow, (progress) => {
      mainWindow?.webContents.send("epic-device-auth-started", progress);
    });

    pendingFreshEos.set(session.accountId, eosToken);
    accounts = await modifyAccounts(paths.accountsPath, (current) =>
      upsertAccountFromEos(current, session),
    );

    const linked = accounts.find((account) => account.accountId === session.accountId);
    if (!linked) {
      throw new Error("Failed to save linked Epic account");
    }

    broadcastAccounts(accounts);
    clearReplayParseCaches();
    return linked;
  } finally {
    mainWindow?.webContents.send("epic-device-auth-finished");
    syncPaused = false;
  }
}

const execFileAsync = promisify(execFile);

function filePathToFileUri(filePath: string): string {
  const resolved = resolve(filePath);
  if (process.platform === "win32") {
    return `file:///${resolved.replace(/\\/g, "/")}`;
  }

  return `file://${resolved}`;
}

async function canRunCommand(command: string, args: string[] = ["--version"]): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

async function runCommandWithInput(
  command: string,
  args: string[],
  input: string,
  timeoutMs = 5000,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} timed out`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

async function writeLinuxClipboardFileDrop(
  filePaths: string[],
  text?: string,
): Promise<void> {
  const uriList = filePaths.map((filePath) => filePathToFileUri(filePath)).join("\n");

  if (await canRunCommand("wl-copy")) {
    await runCommandWithInput("wl-copy", ["--type", "text/uri-list"], uriList);
    if (text?.trim()) {
      await runCommandWithInput("wl-copy", ["--type", "text/plain", "--no-newline"], text.trim());
    }
    return;
  }

  if (await canRunCommand("xclip")) {
    await runCommandWithInput(
      "xclip",
      ["-selection", "clipboard", "-t", "text/uri-list"],
      uriList,
    );
    if (text?.trim()) {
      clipboard.writeText(text);
    }
    return;
  }

  if (text?.trim()) {
    clipboard.writeText(text);
  }
}

async function writeClipboardFileDrop(
  filePaths: string[],
  text?: string,
): Promise<void> {
  const existingPaths = filePaths
    .filter((filePath) => existsSync(filePath))
    .map((filePath) => resolve(filePath));

  if (existingPaths.length === 0) {
    if (text?.trim()) {
      clipboard.writeText(text);
    }
    return;
  }

  if (process.platform === "win32") {
    const jsonPath = join(tmpdir(), `overtime-clipboard-${randomUUID()}.json`);
    await writeFile(
      jsonPath,
      JSON.stringify({ text: text ?? "", filePaths: existingPaths }),
      "utf8",
    );

    const script = `
$payload = Get-Content -Raw -LiteralPath ${JSON.stringify(jsonPath)} | ConvertFrom-Json
Add-Type -AssemblyName System.Windows.Forms
$data = New-Object System.Windows.Forms.DataObject
$col = New-Object System.Collections.Specialized.StringCollection
foreach ($path in @($payload.filePaths)) {
  [void]$col.Add([string]$path)
}
$data.SetFileDropList($col)
if ($payload.text) {
  $data.SetText([string]$payload.text)
}
[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)
`.trim();

    try {
      await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", script]);
    } finally {
      await unlink(jsonPath).catch(() => undefined);
    }
    return;
  }

  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      `set the clipboard to (POSIX file ${JSON.stringify(existingPaths[0])})`,
    ]);
    return;
  }

  if (process.platform === "linux") {
    await writeLinuxClipboardFileDrop(existingPaths, text);
    return;
  }

  if (text?.trim()) {
    clipboard.writeText(text);
  }
}

function getReplayShareStagingDir(): string {
  return join(app.getPath("temp"), "overtime-clipboard", randomUUID());
}

async function copyReplayFileToClipboard(
  filePath: string,
  copyAsName?: string,
): Promise<void> {
  const safePath = resolveSafeReplayPath(filePath);
  if (!existsSync(safePath)) {
    throw new Error("Replay file not found.");
  }

  const sourceStat = await stat(safePath);
  if (sourceStat.size === 0) {
    throw new Error("Replay file is empty.");
  }

  let clipboardPath = safePath;
  const replayDir = normalize(resolve(config.replayDir));

  if (copyAsName) {
    const normalizedName = copyAsName.toLowerCase().endsWith(".replay")
      ? copyAsName
      : `${copyAsName}.replay`;
    const safeName = `${sanitizeReplayExportFileName(
      normalizedName.replace(/\.replay$/i, ""),
    )}.replay`;

    if (!safeName || safeName === ".replay") {
      throw new Error("Could not build a valid replay file name.");
    }

    const shareDir = getReplayShareStagingDir();
    await mkdir(shareDir, { recursive: true });

    const destination = join(shareDir, basename(safeName));
    const destinationDir = normalize(dirname(destination));
    if (destinationDir.startsWith(replayDir) || replayDir.startsWith(destinationDir)) {
      throw new Error("Refusing to copy replay into the replay library folder.");
    }

    await copyFile(safePath, destination);

    const destinationStat = await stat(destination);
    if (destinationStat.size !== sourceStat.size) {
      throw new Error("Failed to copy replay file.");
    }

    clipboardPath = destination;
  }

  await writeClipboardFileDrop([clipboardPath]);
}

function registerIpcHandlers(): void {
  ipcMain.handle("get-platform-info", async () => ({
    platform: process.platform,
    inGameReplaySupported: isInGameReplaySupported(),
  }));

  ipcMain.handle("get-config", async () => toPublicConfig(config));

  ipcMain.handle("get-game-monitor-state", async () => getGameMonitorState());

  ipcMain.handle("get-tracked-matches", async () => gameWatcher?.getTrackedMatches() ?? []);

  ipcMain.handle("set-config", async (_event, partial: Partial<AppConfig>) => {
    return persistConfig(mergeConfigFromRenderer(config, partial ?? {}));
  });

  ipcMain.handle("get-state", async () => loadAppState(paths.statePath));

  ipcMain.handle("get-accounts", async () => toPublicAccounts(accounts));

  ipcMain.handle("set-account-enabled", async (_event, accountId: string, enabled: boolean) => {
    accounts = await modifyAccounts(paths.accountsPath, (current) =>
      updateAccount(current, accountId, { enabled }),
    );
    broadcastAccounts(accounts);
    return toPublicAccounts(accounts);
  });

  ipcMain.handle("remove-account", async (_event, accountId: string) => {
    accounts = await modifyAccounts(paths.accountsPath, (current) =>
      removeAccount(current, accountId),
    );
    broadcastAccounts(accounts);
    return toPublicAccounts(accounts);
  });

  ipcMain.handle("add-epic-account", async () => {
    app.dock?.show();
    try {
      return toPublicAccount(await addEpicAccount(true));
    } finally {
      if (!mainWindow?.isVisible()) {
        app.dock?.hide();
      }
    }
  });

  ipcMain.handle("login-with-epic", async () => toPublicAccount(await addEpicAccount(true)));

  ipcMain.handle("cancel-epic-device-auth", () => {
    cancelEpicDeviceLogin();
  });

  ipcMain.handle("reopen-epic-device-auth", () => reopenEpicDeviceLogin());

  ipcMain.handle(
    "sync-now",
    async (_event, options?: { allowWhileGameRunning?: boolean }) => {
      await runSync({
        waitForRunning: !options?.allowWhileGameRunning,
        allowWhileGameRunning: options?.allowWhileGameRunning,
      });
      accounts = await loadAccounts(paths.accountsPath);
      return {
        state: await loadAppState(paths.statePath),
        accounts: toPublicAccounts(accounts),
      };
    },
  );

  ipcMain.handle("validate-ballchasing-token", async (_event, token: string) => {
    if (!token.trim()) {
      return false;
    }
    return validateBallchasingToken(token.trim());
  });

  ipcMain.handle("check-rl-stats-api", async () => {
    const gameRunning = await isRocketLeagueRunning();
    const result = await checkStatsApiStatus(config.replayDir);
    return { ...result, gameRunning };
  });

  ipcMain.handle("fix-rl-stats-api", async () => {
    if (await isRocketLeagueRunning()) {
      throw new Error("Close Rocket League before applying the Stats API fix.");
    }

    await fixStatsApiConfig(config.replayDir);
    const gameRunning = await isRocketLeagueRunning();
    const result = await checkStatsApiStatus(config.replayDir);
    return { ...result, gameRunning };
  });

  ipcMain.handle(
    "upload-replay-ballchasing",
    async (
      _event,
      payload: {
        matchGuid: string;
        filePath: string;
        uploadFileName?: string;
        title?: string;
      },
    ): Promise<{ replay: SavedReplayRecord; state: AppState }> => {
      const token = config.ballchasingToken.trim();
      if (!token) {
        throw new Error("Add a Ballchasing API token in Settings first.");
      }

      const rawPath = payload.filePath?.trim();
      if (!rawPath) {
        throw new Error("Replay file path is missing.");
      }
      const filePath = resolveSafeReplayPath(rawPath);

      const matchGuid = payload.matchGuid.toUpperCase();
      let state = await loadAppState(paths.statePath);
      const savedReplay = state.savedReplays.find(
        (replay) => replay.matchGuid.toUpperCase() === matchGuid,
      );

      const baseReplay: SavedReplayRecord = savedReplay ?? {
        matchGuid,
        accountId: "",
        accountDisplayName: "",
        filePath,
        fileName: filePath.split(/[/\\]/).pop() ?? "",
        downloadedAt: new Date().toISOString(),
        playlist: 0,
        playlistName: "Unknown",
        mapName: "Unknown",
        recordStartTimestamp: 0,
        team0Score: 0,
        team1Score: 0,
        secondsPlayed: 0,
        result: "Unknown",
        source: "imported",
      };

      try {
        const upload = await uploadReplayToBallchasing(
          filePath,
          token,
          config.ballchasingVisibility,
          {
            uploadFileName:
              payload.uploadFileName?.trim() ||
              buildReplayExportFileName(baseReplay),
            title:
              payload.title?.trim() || buildBallchasingReplayTitle(baseReplay),
          },
        );

        const uploadedAt = new Date().toISOString();
        const updates: Partial<SavedReplayRecord> = {
          ballchasingId: upload.id,
          ballchasingUrl: upload.url,
          ballchasingUploadedAt: uploadedAt,
          ballchasingError: undefined,
          ballchasingErrorKind: undefined,
        };

        let mergedReplay: SavedReplayRecord = {
          ...baseReplay,
          ...updates,
          matchGuid,
          filePath,
        };

        if (savedReplay) {
          state = updateSavedReplay(state, matchGuid, updates);
          mergedReplay = { ...savedReplay, ...updates, matchGuid };
        } else {
          // Keep imported replays out of savedReplays so the disk index stays valid
          // and the entry does not jump/disappear after upload.
          state = upsertImportedBallchasingLink(state, filePath, {
            ballchasingId: upload.id,
            ballchasingUrl: upload.url,
            ballchasingUploadedAt: uploadedAt,
          });
        }

        if (config.deleteLocalAfterBallchasingUpload && mergedReplay.filePath?.trim()) {
          if (!savedReplay) {
            state = upsertSavedReplay(state, mergedReplay);
          }
          const toPromote =
            state.savedReplays.find(
              (replay) => replay.matchGuid.toUpperCase() === matchGuid,
            ) ?? mergedReplay;
          state = await promoteReplayToCloudOnly(state, toPromote);
          mergedReplay =
            state.savedReplays.find(
              (replay) => replay.matchGuid.toUpperCase() === matchGuid,
            ) ?? { ...mergedReplay, cloudOnly: true, filePath: "" };
        }

        await saveAppState(paths.statePath, state);
        broadcastState(state);

        return {
          replay: mergedReplay,
          state,
        };
      } catch (error) {
        const updates: Partial<SavedReplayRecord> = ballchasingFailureUpdates(error);

        if (savedReplay) {
          state = updateSavedReplay(state, matchGuid, updates);
          await saveAppState(paths.statePath, state);
          broadcastState(state);
        }

        return {
          replay: { ...baseReplay, ...updates },
          state,
        };
      }
    },
  );

  ipcMain.handle(
    "restore-cloud-replay",
    async (
      _event,
      matchGuid: string,
    ): Promise<{ replay: SavedReplayRecord; state: AppState }> => {
      const token = config.ballchasingToken.trim();
      if (!token) {
        throw new Error("Add a Ballchasing API token in Settings first.");
      }

      let state = await loadAppState(paths.statePath);
      const replayDir = await resolveReplayDir(config.replayDir);
      const savedReplay = await findReplayByMatchGuid({
        matchGuid,
        replayDir,
        syncedReplays: state.savedReplays,
        accounts,
        importedBallchasingLinks: state.importedBallchasingLinks,
        importedReplayMeta: state.importedReplayMeta,
      });
      if (!savedReplay) {
        throw new Error("Replay not found.");
      }

      const result = await restoreReplayFromCloud(state, savedReplay, replayDir, token);
      await saveAppState(paths.statePath, result.state);
      if (result.replay.filePath?.trim()) {
        await persistImportedReplayMeta([result.replay]);
      }
      broadcastState(result.state);

      return result;
    },
  );

  ipcMain.handle(
    "remove-replay-local-file",
    async (
      _event,
      matchGuid: string,
    ): Promise<{ replay: SavedReplayRecord; state: AppState }> => {
      const requestedGuid = matchGuid.toUpperCase();
      let state = await loadAppState(paths.statePath);
      const replayDir = await resolveReplayDir(config.replayDir);
      const savedReplay = await findReplayByMatchGuid({
        matchGuid: requestedGuid,
        replayDir,
        syncedReplays: state.savedReplays,
        accounts,
        importedBallchasingLinks: state.importedBallchasingLinks,
        importedReplayMeta: state.importedReplayMeta,
      });
      if (!savedReplay) {
        throw new Error("Replay not found.");
      }

      if (!savedReplay.ballchasingId?.trim()) {
        throw new Error("Upload this replay to Ballchasing before removing the local file.");
      }

      if (isCloudOnlyReplay(savedReplay)) {
        throw new Error("This replay is already cloud-only.");
      }

      // Always keep the GUID the UI used so the row does not vanish/move identity.
      state = await promoteReplayToCloudOnly(state, {
        ...savedReplay,
        matchGuid: requestedGuid,
      });
      await saveAppState(paths.statePath, state);
      broadcastStateAfterFilesystemChange(state);

      const replay =
        state.savedReplays.find(
          (item) => item.matchGuid.toUpperCase() === requestedGuid,
        ) ?? { ...savedReplay, matchGuid: requestedGuid, cloudOnly: true, filePath: "" };

      return { replay, state };
    },
  );

  ipcMain.handle("open-external", async (_event, url: string) => {
    await shell.openExternal(assertAllowedExternalUrl(url));
  });

  ipcMain.handle("show-item-in-folder", async (_event, filePath: string) => {
    shell.showItemInFolder(resolveSafeReplayPath(filePath));
  });

  ipcMain.handle("write-clipboard-text", async (_event, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle(
    "copy-replay-file",
    async (_event, payload: { filePath: string; copyAsName?: string }) => {
      await copyReplayFileToClipboard(
        resolveSafeReplayPath(payload.filePath),
        payload.copyAsName,
      );
    },
  );

  ipcMain.handle("get-update-status", async () => getUpdateStatus());

  ipcMain.handle("check-for-updates", async () => checkForUpdatesNow());

  ipcMain.handle("quit-and-install-update", async () => {
    quitAndInstallUpdate();
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

  ipcMain.handle(
    "get-replay-library",
    async (
      _event,
      options: {
        page?: number;
        syncedOnly?: boolean;
        sortBy?: AppConfig["replaySortBy"];
      } = {},
    ) => {
      const state = await loadAppState(paths.statePath);
      return buildReplayLibrary({
        replayDir: config.replayDir,
        syncedReplays: state.savedReplays,
        accounts,
        page: options.page,
        syncedOnly: options.syncedOnly,
        importedBallchasingLinks: state.importedBallchasingLinks,
        importedReplayMeta: state.importedReplayMeta,
        sortBy: options.sortBy ?? config.replaySortBy ?? "match",
      });
    },
  );

  ipcMain.handle("pick-replay-files", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      defaultPath: config.replayDir,
      filters: [{ name: "Rocket League Replay", extensions: ["replay"] }],
    });

    if (result.canceled) {
      return [];
    }

    return result.filePaths;
  });

  ipcMain.handle("import-replay-files", async (_event, sourcePaths: string[]) => {
    const result = await importReplayFiles(sourcePaths, config.replayDir, accounts);
    await persistImportedReplayMeta(result.imported);
    return result;
  });

  ipcMain.handle("import-replay-from-ballchasing", async (_event, url: string) => {
    const target = parseBallchasingImportUrl(url);
    if (!target) {
      return { imported: [], errors: ["Invalid Ballchasing replay or group URL."] };
    }

    const applyImportLinks = async (
      imported: SavedReplayRecord[],
    ): Promise<void> => {
      if (imported.length === 0) {
        return;
      }

      let state = await loadAppState(paths.statePath);

      for (const replay of imported) {
        if (replay.filePath?.trim()) {
          state = upsertImportedReplayMeta(state, replay.filePath, {
            importedAt: replay.importedAt ?? new Date().toISOString(),
            matchGuid: replay.matchGuid,
          });
        }

        if (
          replay.ballchasingId &&
          replay.ballchasingUrl &&
          replay.ballchasingUploadedAt &&
          replay.filePath
        ) {
          state = upsertImportedBallchasingLink(state, replay.filePath, {
            ballchasingId: replay.ballchasingId,
            ballchasingUrl: replay.ballchasingUrl,
            ballchasingUploadedAt: replay.ballchasingUploadedAt,
          });
        }
      }

      await saveAppState(paths.statePath, state);
      broadcastState(state);
    };

    if (target.kind === "group") {
      const result = await importReplaysFromBallchasingGroup(
        url,
        config.replayDir,
        accounts,
        config.ballchasingToken,
        (progress) => {
          mainWindow?.webContents.send("ballchasing-import-progress", progress);
        },
      );
      await applyImportLinks(result.imported);
      return result;
    }

    const result = await importReplayFromBallchasingUrl(
      url,
      config.replayDir,
      accounts,
      config.ballchasingToken,
    );
    await applyImportLinks(result.imported);
    return result;
  });

  async function deleteReplays(
    payloads: { matchGuid: string; filePath: string }[],
  ): Promise<{ state: AppState; deletedCount: number; errors: string[] }> {
    let state = await loadAppState(paths.statePath);
    let filesystemChanged = false;
    let deletedCount = 0;
    const errors: string[] = [];

    for (const payload of payloads) {
      try {
        const matchGuid = payload.matchGuid.toUpperCase();
        const savedReplay = state.savedReplays.find(
          (replay) => replay.matchGuid.toUpperCase() === matchGuid,
        );

        if (savedReplay && isCloudOnlyReplay(savedReplay)) {
          state = removeSavedReplay(state, matchGuid);
          deletedCount += 1;
          continue;
        }

        if (payload.filePath?.trim()) {
          const safePath = resolveSafeReplayPath(payload.filePath);
          await deleteReplayFile(safePath);
          state = removeImportedBallchasingLink(state, safePath);
          state = removeImportedReplayMeta(state, safePath);
          filesystemChanged = true;
        }

        if (savedReplay) {
          state = removeSavedReplay(state, matchGuid);
        }

        deletedCount += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (deletedCount > 0 || errors.length === 0) {
      await saveAppState(paths.statePath, state);
      if (filesystemChanged) {
        broadcastStateAfterFilesystemChange(state);
      } else if (deletedCount > 0) {
        broadcastState(state);
      }
    }

    return { state, deletedCount, errors };
  }

  ipcMain.handle(
    "delete-replay",
    async (_event, payload: { matchGuid: string; filePath: string }) => {
      const result = await deleteReplays([payload]);
      if (result.errors.length > 0 && result.deletedCount === 0) {
        throw new Error(result.errors[0]);
      }
      return { state: result.state };
    },
  );

  ipcMain.handle(
    "delete-replays",
    async (_event, payloads: { matchGuid: string; filePath: string }[]) => {
      return deleteReplays(payloads);
    },
  );

  ipcMain.handle(
    "rename-replay",
    async (
      _event,
      payload: { matchGuid: string; filePath: string; replayName: string },
    ) => {
      const safePath = resolveSafeReplayPath(payload.filePath);
      const replayName = await renameReplayInFile(safePath, payload.replayName);
      const matchGuid = payload.matchGuid.toUpperCase();

      let state = await loadAppState(paths.statePath);
      const savedReplay = state.savedReplays.find(
        (replay) => replay.matchGuid.toUpperCase() === matchGuid,
      );

      if (savedReplay) {
        state = updateSavedReplay(state, matchGuid, { replayName });
        await saveAppState(paths.statePath, state);
        broadcastState(state);
      } else {
        // Imported-only: name lives in the .replay file. Refresh parse caches
        // so the next library load picks it up without moving the replay into savedReplays.
        invalidateReplayFileCache(safePath);
      }

      return { replayName, state };
    },
  );

  ipcMain.handle("check-ballchasing-viewer", async () => isBallchasingViewerAvailable());

  ipcMain.handle(
    "get-pro-player-profile",
    async (_event, payload: { playerId: string; playerName: string }) => {
      return resolveProPlayerProfile(payload.playerId, payload.playerName);
    },
  );

  ipcMain.handle(
    "play-replay-in-game",
    async (
      _event,
      payload: {
        ballchasingId?: string;
        ballchasingUrl?: string;
        filePath?: string;
        matchGuid?: string;
      },
    ) => {
      const filePath = payload.filePath?.trim()
        ? resolveSafeReplayPath(payload.filePath)
        : undefined;
      return playReplayInGame({
        ballchasingId: payload.ballchasingId,
        ballchasingUrl: payload.ballchasingUrl,
        filePath,
        matchGuid: payload.matchGuid,
        token: config.ballchasingToken,
      });
    },
  );
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) {
    return;
  }

  app.on("second-instance", () => {
    showMainWindowFromTray();
  });

  if (process.platform === "win32") {
    app.setAppUserModelId("gg.overtime.app");
  }
  app.setName("Overtime");

  paths = getDefaultPaths(app.getPath("userData"));
  config = await loadConfig(paths.configPath);
  const resolvedReplayDir = await resolveReplayDir(config.replayDir);
  if (resolvedReplayDir !== config.replayDir) {
    config = { ...config, replayDir: resolvedReplayDir };
    await saveConfig(paths.configPath, config);
  }

  const existingState = await loadAppState(paths.statePath);
  accounts = await migrateLegacyRefreshToken({
    accountsPath: paths.accountsPath,
    refreshTokenPath: paths.refreshTokenPath,
    fallbackDisplayName: existingState.savedReplays[0]?.accountDisplayName,
    fallbackAccountId: existingState.savedReplays[0]?.accountId,
  });
  previousAccountsSnapshot = accounts.map((account) => ({ ...account }));

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

  Menu.setApplicationMenu(null);

  registerIpcHandlers();
  mainWindow = createMainWindow();
  tray = createTray();
  initAutoUpdater({
    getMainWindow: () => mainWindow,
    getConfig: () => config,
  });
  applyLoginItemSettings();
  restartPollTimer();
  startGameWatcher();

  if (
    accounts.some((account) => account.enabled) &&
    config.syncMode !== "manual"
  ) {
    const existingState = await loadAppState(paths.statePath);
    if (existingState.lastSyncError) {
      await saveAppState(paths.statePath, {
        ...existingState,
        lastSyncError: undefined,
      });
    }
    void runSync();
  }

  app.on("activate", () => {
    showMainWindowFromTray();
  });
});

app.on("window-all-closed", () => {
  if (isQuitting) {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  endTaskbarSyncProgress();
  gameWatcher?.stop();
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});
