/** @typedef {import('../../dist/store.js').AppConfig} AppConfig */
/** @typedef {import('../../dist/store.js').PublicAppConfig} PublicAppConfig */
/** @typedef {import('../../dist/store.js').AppState} AppState */
/** @typedef {import('../../dist/store.js').SavedReplayRecord} SavedReplayRecord */
/** @typedef {import('../../dist/accounts.js').PublicLinkedAccount} LinkedAccount */

const api = window.api;

/** @type {PublicAppConfig | null} */
let config = null;

/** @type {AppState | null} */
let state = null;

/** @type {LinkedAccount[]} */
let accounts = [];

const elements = {
  statusLine: document.getElementById("status-line"),
  syncBanner: document.getElementById("sync-banner"),
  syncProgressPanel: document.getElementById("sync-progress-panel"),
  syncProgressStatus: document.getElementById("sync-progress-status"),
  syncProgressOverallFill: document.getElementById("sync-progress-overall-fill"),
  syncDownloadList: document.getElementById("sync-download-list"),
  syncNow: document.getElementById("sync-now"),
  importReplay: document.getElementById("import-replay"),
  importReplaySplit: document.getElementById("import-replay-split"),
  importReplayButton: document.querySelector(".import-split-button"),
  importReplayMenu: document.getElementById("import-replay-menu"),
  importReplayDropdown: document.getElementById("import-replay-dropdown"),
  importReplayBallchasing: document.getElementById("import-replay-ballchasing"),
  ballchasingImportDialog: document.getElementById("ballchasing-import-dialog"),
  ballchasingImportForm: document.getElementById("ballchasing-import-form"),
  ballchasingImportUrl: document.getElementById("ballchasing-import-url"),
  ballchasingImportCancel: document.getElementById("ballchasing-import-cancel"),
  ballchasingImportSubmit: document.getElementById("ballchasing-import-submit"),
  ballchasingImportProgress: document.getElementById("ballchasing-import-progress"),
  replaySearch: document.getElementById("replay-search"),
  replaySelectionBar: document.getElementById("replay-selection-bar"),
  replaySelectAll: document.getElementById("replay-select-all"),
  replaySelectionCount: document.getElementById("replay-selection-count"),
  clearReplaySelection: document.getElementById("clear-replay-selection"),
  deleteSelectedReplays: document.getElementById("delete-selected-replays"),
  toggleReplaySelection: document.getElementById("toggle-replay-selection"),
  syncedOnly: document.getElementById("synced-only"),
  replaySortBy: document.getElementById("replay-sort-by"),
  replayCount: document.getElementById("replay-count"),
  replayPagination: document.getElementById("replay-pagination"),
  replayPrev: document.getElementById("replay-prev"),
  replayNext: document.getElementById("replay-next"),
  replayPageInfo: document.getElementById("replay-page-info"),
  replayList: document.getElementById("replay-list"),
  replayLibraryLoading: document.getElementById("replay-library-loading"),
  replayMenuPortal: document.getElementById("replay-menu-portal"),
  shareMenuPortal: document.getElementById("share-menu-portal"),
  proPlayerTooltipPortal: document.getElementById("pro-player-tooltip-portal"),
  replayEmpty: document.getElementById("replay-empty"),
  replayDropOverlay: document.getElementById("replay-drop-overlay"),
  replaysPanel: document.getElementById("replays-panel"),
  settingsForm: document.getElementById("settings-form"),
  pollInterval: document.getElementById("poll-interval"),
  syncModeProcess: document.getElementById("sync-mode-process"),
  syncModeInterval: document.getElementById("sync-mode-interval"),
  syncModeManual: document.getElementById("sync-mode-manual"),
  syncProcessSettings: document.getElementById("sync-process-settings"),
  syncIntervalSettings: document.getElementById("sync-interval-settings"),
  processSyncOnCloseOnly: document.getElementById("process-sync-on-close-only"),
  processSyncAfterGames: document.getElementById("process-sync-after-games"),
  syncAfterGames: document.getElementById("sync-after-games"),
  statsApiCheckRow: document.getElementById("stats-api-check-row"),
  fixStatsApiWrap: document.getElementById("fix-stats-api-wrap"),
  fixStatsApi: document.getElementById("fix-stats-api"),
  fixStatsApiTooltipText: document.getElementById("fix-stats-api-tooltip-text"),
  statsApiLearnMore: document.getElementById("stats-api-learn-more"),
  statsApiStatus: document.getElementById("stats-api-status"),
  gameMonitorBar: document.getElementById("game-monitor-bar"),
  monitorRl: document.getElementById("monitor-rl"),
  monitorRlLabel: document.getElementById("monitor-rl-label"),
  monitorStats: document.getElementById("monitor-stats"),
  monitorStatsLabel: document.getElementById("monitor-stats-label"),
  monitorGames: document.getElementById("monitor-games"),
  monitorGamesLabel: document.getElementById("monitor-games-label"),
  startMinimized: document.getElementById("start-minimized"),
  minimizeOnClose: document.getElementById("minimize-on-close"),
  launchAtLogin: document.getElementById("launch-at-login"),
  autoUpdate: document.getElementById("auto-update"),
  checkForUpdates: document.getElementById("check-for-updates"),
  updateStatus: document.getElementById("update-status"),
  replayDir: document.getElementById("replay-dir"),
  browseReplayDir: document.getElementById("browse-replay-dir"),
  autoUploadBallchasing: document.getElementById("auto-upload-ballchasing"),
  deleteLocalAfterUpload: document.getElementById("delete-local-after-upload"),
  ballchasingToken: document.getElementById("ballchasing-token"),
  ballchasingVisibility: document.getElementById("ballchasing-visibility"),
  validateToken: document.getElementById("validate-token"),
  tokenStatus: document.getElementById("token-status"),
  ballchasingTokenLink: document.getElementById("ballchasing-token-link"),
  authStatus: document.getElementById("auth-status"),
  accountsList: document.getElementById("accounts-list"),
  authBanner: document.getElementById("auth-banner"),
  authBannerLogin: document.getElementById("auth-banner-login"),
  addEpicAccount: document.getElementById("add-epic-account"),
  epicDeviceAuthDialog: document.getElementById("epic-device-auth-dialog"),
  epicDeviceAuthCode: document.getElementById("epic-device-auth-code"),
  epicDeviceAuthReopen: document.getElementById("epic-device-auth-reopen"),
  epicDeviceAuthCancel: document.getElementById("epic-device-auth-cancel"),
  renameReplayDialog: document.getElementById("rename-replay-dialog"),
  renameReplayForm: document.getElementById("rename-replay-form"),
  renameReplayInput: document.getElementById("rename-replay-input"),
  renameReplayCancel: document.getElementById("rename-replay-cancel"),
  renameReplaySubmit: document.getElementById("rename-replay-submit"),
  deleteReplayDialog: document.getElementById("delete-replay-dialog"),
  deleteReplayMessage: document.getElementById("delete-replay-message"),
  deleteReplayCancel: document.getElementById("delete-replay-cancel"),
  deleteReplayConfirm: document.getElementById("delete-replay-confirm"),
  removeLocalFileDialog: document.getElementById("remove-local-file-dialog"),
  removeLocalFileMessage: document.getElementById("remove-local-file-message"),
  removeLocalFileCancel: document.getElementById("remove-local-file-cancel"),
  removeLocalFileConfirm: document.getElementById("remove-local-file-confirm"),
  onboardingDialog: document.getElementById("onboarding-dialog"),
  onboardingProgress: document.getElementById("onboarding-progress"),
  onboardingStepWelcome: document.getElementById("onboarding-step-welcome"),
  onboardingStepAccount: document.getElementById("onboarding-step-account"),
  onboardingStepSkipConfirm: document.getElementById("onboarding-step-skip-confirm"),
  onboardingStepSync: document.getElementById("onboarding-step-sync"),
  onboardingStepProcess: document.getElementById("onboarding-step-process"),
  onboardingStepBallchasing: document.getElementById("onboarding-step-ballchasing"),
  onboardingStepPreferences: document.getElementById("onboarding-step-preferences"),
  onboardingNext: document.getElementById("onboarding-next"),
  onboardingBackAccount: document.getElementById("onboarding-back-account"),
  onboardingSkipAccount: document.getElementById("onboarding-skip-account"),
  onboardingAddAccount: document.getElementById("onboarding-add-account"),
  onboardingCancelSkip: document.getElementById("onboarding-cancel-skip"),
  onboardingConfirmSkip: document.getElementById("onboarding-confirm-skip"),
  onboardingBackSync: document.getElementById("onboarding-back-sync"),
  onboardingNextSync: document.getElementById("onboarding-next-sync"),
  onboardingSyncProcess: document.getElementById("onboarding-sync-process"),
  onboardingSyncInterval: document.getElementById("onboarding-sync-interval"),
  onboardingSyncManual: document.getElementById("onboarding-sync-manual"),
  onboardingBackProcess: document.getElementById("onboarding-back-process"),
  onboardingNextProcess: document.getElementById("onboarding-next-process"),
  onboardingProcessOnClose: document.getElementById("onboarding-process-on-close"),
  onboardingProcessAfterGames: document.getElementById("onboarding-process-after-games"),
  onboardingSyncAfterGames: document.getElementById("onboarding-sync-after-games"),
  onboardingStatsApiRow: document.getElementById("onboarding-stats-api-row"),
  onboardingStatsApiStatus: document.getElementById("onboarding-stats-api-status"),
  onboardingFixStatsApiWrap: document.getElementById("onboarding-fix-stats-api-wrap"),
  onboardingFixStatsApi: document.getElementById("onboarding-fix-stats-api"),
  onboardingFixStatsApiTooltipText: document.getElementById("onboarding-fix-stats-api-tooltip-text"),
  onboardingStatsApiLearnMore: document.getElementById("onboarding-stats-api-learn-more"),
  onboardingBackBallchasing: document.getElementById("onboarding-back-ballchasing"),
  onboardingSkipBallchasing: document.getElementById("onboarding-skip-ballchasing"),
  onboardingNextBallchasing: document.getElementById("onboarding-next-ballchasing"),
  onboardingBackPreferences: document.getElementById("onboarding-back-preferences"),
  onboardingFinish: document.getElementById("onboarding-finish"),
  onboardingBallchasingToken: document.getElementById("onboarding-ballchasing-token"),
  onboardingValidateBallchasingToken: document.getElementById("onboarding-validate-ballchasing-token"),
  onboardingBallchasingTokenStatus: document.getElementById("onboarding-ballchasing-token-status"),
  onboardingBallchasingUploadLink: document.getElementById("onboarding-ballchasing-upload-link"),
  onboardingAutoUpload: document.getElementById("onboarding-auto-upload"),
  onboardingStartMinimized: document.getElementById("onboarding-start-minimized"),
  onboardingMinimizeOnClose: document.getElementById("onboarding-minimize-on-close"),
  onboardingLaunchAtLogin: document.getElementById("onboarding-launch-at-login"),
  onboardingAutoUpdate: document.getElementById("onboarding-auto-update"),
};

/** @type {SavedReplayRecord | null} */
let pendingRenameReplay = null;

/** @type {SavedReplayRecord[]} */
let pendingDeleteReplays = [];

/** @type {SavedReplayRecord | null} */
let pendingRemoveLocalReplay = null;

/** @type {Set<string>} */
const selectedReplayGuids = new Set();

/** @type {boolean} */
let replaySelectionMode = false;

function formatRelativeDate(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const TRN_LOGO_HTML =
  '<img class="trn-logo" src="trn-logo.jfif" width="14" height="14" alt="" aria-hidden="true" decoding="async">';

const PLATFORM_LOGO_SRC = {
  steam: "platform-logos/steam.svg",
  epic: "platform-logos/epicgames.svg",
  ps4: "platform-logos/playstation.svg",
  xboxone: "platform-logos/xbox.svg",
  switch: "platform-logos/nintendoswitch.svg",
};

const PLATFORM_LABELS = {
  steam: "Steam",
  epic: "Epic Games",
  ps4: "PlayStation",
  xboxone: "Xbox",
  switch: "Nintendo Switch",
  unknown: "Unknown platform",
};

/** @param {import('../../dist/format.js').ReplayPlayerPlatform} platform */
function renderPlatformLogoHtml(platform) {
  const src = PLATFORM_LOGO_SRC[platform];
  if (!src) {
    return "";
  }

  return `<img class="replay-platform-logo" src="${src}" width="14" height="14" alt="" aria-hidden="true" decoding="async">`;
}

/** @param {string} playerId */
function renderPlayerPlatformIcon(playerId) {
  const { platform, platformId } = parseReplayPlayerPlatform(playerId);
  const logo = renderPlatformLogoHtml(platform);
  if (!logo) {
    return "";
  }

  const label = PLATFORM_LABELS[platform] ?? platform;

  if (platform === "steam") {
    const steamUrl = getSteamCommunityProfileUrl(platformId);
    if (steamUrl) {
      return `<button class="replay-platform-icon replay-platform-icon--steam" type="button" data-action="open-url" data-url="${escapeHtml(steamUrl)}" title="View Steam profile" aria-label="View Steam profile">${logo}</button>`;
    }
    return `<span class="replay-platform-icon replay-platform-icon--steam" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${logo}</span>`;
  }

  return `<span class="replay-platform-icon replay-platform-icon--${platform}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${logo}</span>`;
}

/** @param {import('../../dist/store.js').SavedReplayRecord} replay */
function formatReplayDuration(replay) {
  const total = formatDuration(replay.secondsPlayed);
  const otSeconds = replay.overtimeSecondsPlayed ?? 0;

  if (otSeconds > 0) {
    return `${total} (+${formatDuration(otSeconds)} OT)`;
  }

  if (replay.wentToOvertime) {
    return `${total} (OT)`;
  }

  return total;
}

/** @typedef {import('../../dist/store.js').SavedReplayPlayer} SavedReplayPlayer */

import { getMapDisplayName } from "../../dist/maps.js";
import {
  discoverPlatformPlayerIdFromReplays,
  getPlaylistDisplayName,
  getReplayDisplayName,
  buildBallchasingReplayTitle,
  buildReplayExportFileName,
  getSteamCommunityProfileUrl,
  parseReplayPlayerPlatform,
  playerMatchesAccount,
  playerMatchesLinkedAccount,
  replayMatchesSearchQuery,
  isCloudOnlyReplay,
  getReplayDisplayTimestamp,
  getReplayDisplayTimestampTitle,
} from "../../dist/format.js";
import { getCountryFlagImageUrl } from "../../dist/countryFlags.js";
import {
  getProPlayerProfile,
  getProPlayerLiquipediaUrl,
  getProPlayerTooltipProfile,
  isProPlayer,
} from "../../dist/proPlayers.js";
import { getRankIconUrl, getRankTitle } from "../../dist/ranks.js";

/** @type {Set<string>} */
const expandedReplays = new Set();

/** @type {Map<string, string>} */
const platformPlayerIds = new Map();

/** @type {import('../../dist/replayImport.js').ReplayLibraryResult | null} */
let replayLibrary = null;

/** @type {number} */
let replayPage = 1;

/** @type {Map<string, import('../../dist/replayImport.js').ReplayLibraryResult>} */
const replayPageCache = new Map();

/** @type {SavedReplayRecord[]} */
let visibleReplays = [];

/** @type {ReturnType<typeof setTimeout> | undefined} */
let replaySearchTimer;

/** @type {Map<string, Partial<import('../../dist/store.js').SavedReplayRecord>>} */
const ballchasingOverrides = new Map();

/** @type {Set<string>} */
const ballchasingUploading = new Set();

/** @type {boolean | null} */
let ballchasingViewerAvailable = null;

/** @type {{ platform: string; inGameReplaySupported: boolean }} */
let platformInfo = { platform: "win32", inGameReplaySupported: true };

/** @type {import('../../dist/gameMonitorState.js').GameMonitorState | null} */
let gameMonitorState = null;

function renderGameMonitor(monitor) {
  gameMonitorState = monitor;

  if (lastStatsApiCheckResult?.canAutoFix) {
    applyStatsApiFixUi(lastStatsApiCheckResult);
    if (elements.statsApiStatus instanceof HTMLElement && lastStatsApiCheckResult) {
      const parts = [lastStatsApiCheckResult.message];
      if (lastStatsApiCheckResult.detail) {
        parts.push(lastStatsApiCheckResult.detail);
      }
      if (isRocketLeagueRunningForStatsApiFix()) {
        parts.push("Close Rocket League to apply the fix.");
      }
      elements.statsApiStatus.textContent = parts.join(" ");
    }
  }

  if (
    currentOnboardingStep === "process" &&
    lastOnboardingStatsApiResult?.canAutoFix
  ) {
    applyOnboardingStatsApiFixUi(lastOnboardingStatsApiResult);
    if (elements.onboardingStatsApiStatus instanceof HTMLElement) {
      const parts = [lastOnboardingStatsApiResult.message];
      if (lastOnboardingStatsApiResult.detail) {
        parts.push(lastOnboardingStatsApiResult.detail);
      }
      if (isRocketLeagueRunningForStatsApiFix()) {
        parts.push("Close Rocket League to apply the fix.");
      }
      elements.onboardingStatsApiStatus.textContent = parts.join(" ");
    }
    updateOnboardingGameMonitorFastPoll();
  }

  if (!(elements.gameMonitorBar instanceof HTMLElement)) {
    return;
  }

  elements.gameMonitorBar.classList.toggle("hidden", !monitor.active);
  if (!monitor.active) {
    return;
  }

  if (elements.monitorRl instanceof HTMLElement && elements.monitorRlLabel instanceof HTMLElement) {
    elements.monitorRl.classList.toggle("monitor-pill--active", monitor.rocketLeagueRunning);
    elements.monitorRl.classList.toggle("monitor-pill--inactive", !monitor.rocketLeagueRunning);
    elements.monitorRl.classList.remove("monitor-pill--waiting");
    elements.monitorRlLabel.textContent = monitor.rocketLeagueRunning
      ? "Rocket League running"
      : "Rocket League not running";
  }

  if (elements.monitorStats instanceof HTMLElement && elements.monitorStatsLabel instanceof HTMLElement) {
    elements.monitorStats.classList.toggle("hidden", !monitor.statsApiEnabled);
    if (monitor.statsApiEnabled) {
      elements.monitorStats.classList.toggle("monitor-pill--active", monitor.statsApiConnected);
      elements.monitorStats.classList.toggle(
        "monitor-pill--waiting",
        monitor.rocketLeagueRunning && !monitor.statsApiConnected,
      );
      elements.monitorStats.classList.toggle(
        "monitor-pill--inactive",
        !monitor.rocketLeagueRunning && !monitor.statsApiConnected,
      );
      elements.monitorStatsLabel.textContent = monitor.statsApiConnected
        ? "Stats API connected"
        : monitor.rocketLeagueRunning
          ? "Stats API waiting for match"
          : "Stats API disconnected";
    }
  }

  if (elements.monitorGames instanceof HTMLElement && elements.monitorGamesLabel instanceof HTMLElement) {
    const showGames = monitor.statsApiEnabled && monitor.rocketLeagueRunning;
    elements.monitorGames.classList.toggle("hidden", !showGames);
    if (showGames) {
      const remaining = monitor.gamesUntilSync;
      elements.monitorGamesLabel.textContent =
        remaining === 1 ? "Sync after 1 more game" : `Sync after ${remaining} more games`;
    }
  }
}

/** @type {Set<string>} */
const replayPlayInGameLoading = new Set();

/** @type {Map<string, { fileName: string, bytesReceived: number, bytesTotal?: number, status: 'queued' | 'downloading' | 'complete' | 'failed', error?: string }>} */
const syncDownloadItems = new Map();

/** @type {{ statusText: string, overallProgress?: number, indeterminate?: boolean } | null} */
let syncProgressState = null;

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setSyncProgressBarFill(element, progress, indeterminate = false) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.classList.toggle("indeterminate", indeterminate);
  if (indeterminate) {
    element.style.width = "";
    return;
  }

  const clamped = Math.max(0, Math.min(100, progress ?? 0));
  element.style.width = `${clamped}%`;
}

function renderSyncProgressPanel() {
  const syncing = Boolean(state?.isSyncing);
  elements.syncProgressPanel.classList.toggle("hidden", !syncing);

  if (!syncing) {
    elements.syncDownloadList.innerHTML = "";
    syncDownloadItems.clear();
    syncProgressState = null;
    setSyncProgressBarFill(elements.syncProgressOverallFill, 0, false);
    return;
  }

  elements.syncProgressStatus.textContent =
    syncProgressState?.statusText ?? "Syncing…";

  if (syncProgressState?.indeterminate) {
    setSyncProgressBarFill(elements.syncProgressOverallFill, 0, true);
  } else {
    setSyncProgressBarFill(
      elements.syncProgressOverallFill,
      syncProgressState?.overallProgress ?? 0,
      false,
    );
  }

  elements.syncDownloadList.innerHTML = "";

  for (const [matchGuid, item] of syncDownloadItems) {
    const li = document.createElement("li");
    li.className = `sync-download-item is-${item.status}`;
    li.dataset.matchGuid = matchGuid;

    let stateLabel = "Queued";
    if (item.status === "downloading") {
      if (item.bytesTotal && item.bytesTotal > 0) {
        stateLabel = `${Math.round((item.bytesReceived / item.bytesTotal) * 100)}%`;
      } else if (item.bytesReceived > 0) {
        stateLabel = formatBytes(item.bytesReceived);
      } else {
        stateLabel = "Downloading…";
      }
    } else if (item.status === "complete") {
      stateLabel = "Done";
    } else if (item.status === "failed") {
      stateLabel = "Failed";
    }

    const progress =
      item.bytesTotal && item.bytesTotal > 0
        ? (item.bytesReceived / item.bytesTotal) * 100
        : item.status === "complete"
          ? 100
          : 0;
    const indeterminate =
      item.status === "downloading" && !(item.bytesTotal && item.bytesTotal > 0);

    li.innerHTML = `
      <div class="sync-download-item-header">
        <span class="sync-download-name" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</span>
        <span class="sync-download-state">${escapeHtml(stateLabel)}</span>
      </div>
      <div class="sync-progress-bar sync-download-bar" aria-hidden="true">
        <div class="sync-progress-bar-fill sync-download-bar-fill"></div>
      </div>
    `;

    const fill = li.querySelector(".sync-download-bar-fill");
    setSyncProgressBarFill(fill, progress, indeterminate);
    if (item.status === "failed" && item.error) {
      li.title = item.error;
    }

    elements.syncDownloadList.appendChild(li);
  }
}

/** @param {import('../../dist/syncProgress.js').SyncProgressEvent} event */
function handleSyncProgress(event) {
  switch (event.phase) {
    case "auth":
      syncDownloadItems.clear();
      syncProgressState = {
        statusText: `Signing in to ${event.accountDisplayName} (${event.accountIndex}/${event.accountTotal})…`,
        indeterminate: true,
      };
      break;
    case "fetching-history":
      syncProgressState = {
        statusText: `Fetching match history for ${event.accountDisplayName}…`,
        indeterminate: true,
      };
      break;
    case "checking-replays":
      syncProgressState = {
        statusText:
          event.pendingDownloads > 0
            ? `Found ${event.pendingDownloads} new replay${event.pendingDownloads === 1 ? "" : "s"} for ${event.accountDisplayName}`
            : `Checking replays for ${event.accountDisplayName}…`,
        indeterminate: event.pendingDownloads === 0,
        overallProgress: 0,
      };
      break;
    case "downloads-queued":
      syncDownloadItems.clear();
      for (const item of event.items) {
        syncDownloadItems.set(item.matchGuid, {
          fileName: item.fileName,
          bytesReceived: 0,
          status: "queued",
        });
      }
      syncProgressState = {
        statusText: `Downloading ${event.items.length} replay${event.items.length === 1 ? "" : "s"} for ${event.accountDisplayName}…`,
        overallProgress: 0,
        indeterminate: event.items.length === 0,
      };
      break;
    case "download-start":
      syncDownloadItems.set(event.matchGuid, {
        fileName: event.fileName,
        bytesReceived: 0,
        status: "downloading",
      });
      syncProgressState = {
        statusText: `Downloading ${event.index}/${event.total} for ${event.accountDisplayName}…`,
        overallProgress: ((event.index - 1) / event.total) * 100,
        indeterminate: false,
      };
      break;
    case "download-progress": {
      const item = syncDownloadItems.get(event.matchGuid);
      if (item) {
        item.bytesReceived = event.bytesReceived;
        item.bytesTotal = event.bytesTotal;
        item.status = "downloading";
      }
      break;
    }
    case "download-complete": {
      const item = syncDownloadItems.get(event.matchGuid);
      if (item) {
        item.status = "complete";
        item.bytesReceived = item.bytesTotal ?? item.bytesReceived;
      }
      const completed = [...syncDownloadItems.values()].filter(
        (entry) => entry.status === "complete" || entry.status === "failed",
      ).length;
      const total = syncDownloadItems.size;
      syncProgressState = {
        statusText: `Downloaded ${event.fileName}`,
        overallProgress: total > 0 ? (completed / total) * 100 : 100,
        indeterminate: false,
      };
      break;
    }
    case "download-failed": {
      const item = syncDownloadItems.get(event.matchGuid);
      if (item) {
        item.status = "failed";
        item.error = event.error;
      }
      break;
    }
    case "uploading-ballchasing":
      syncProgressState = {
        statusText: `Uploading ${event.fileName} to Ballchasing…`,
        indeterminate: true,
      };
      break;
    case "saving-replay":
      syncProgressState = {
        statusText: `Saving replay ${event.index}/${event.total}…`,
        indeterminate: true,
      };
      break;
    case "account-complete":
      syncProgressState = {
        statusText: event.message,
        indeterminate: false,
        overallProgress: 100,
      };
      break;
    default:
      break;
  }

  renderSyncProgressPanel();
  if (syncProgressState?.statusText) {
    elements.statusLine.textContent = syncProgressState.statusText;
  }
}

function resetSyncProgress() {
  syncDownloadItems.clear();
  syncProgressState = null;
  renderSyncProgressPanel();
}

function refreshPlatformPlayerIds(replays) {
  platformPlayerIds.clear();

  for (const account of accounts) {
    if (account.platformPlayerId) {
      platformPlayerIds.set(account.accountId, account.platformPlayerId);
    }
  }

  const replaysByAccount = new Map();
  for (const replay of replays) {
    if (!replay.players?.length) {
      continue;
    }
    const bucket = replaysByAccount.get(replay.accountId) ?? [];
    bucket.push(replay);
    replaysByAccount.set(replay.accountId, bucket);
  }

  for (const [accountId, accountReplays] of replaysByAccount) {
    if (platformPlayerIds.has(accountId)) {
      continue;
    }
    const discovered = discoverPlatformPlayerIdFromReplays(accountReplays);
    if (discovered) {
      platformPlayerIds.set(accountId, discovered);
    }
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {SavedReplayRecord} replay */
function formatArenaName(replay) {
  return getMapDisplayName(replay.mapName);
}

/** @param {SavedReplayRecord} replay */
function findReplayPlayer(replay) {
  if (!replay.players?.length) {
    return null;
  }

  if (replay.localPlayerId) {
    const byStored = replay.players.find((player) => player.playerId === replay.localPlayerId);
    if (byStored) {
      return byStored;
    }
  }

  const platformPlayerId = platformPlayerIds.get(replay.accountId);
  if (platformPlayerId) {
    const byPlatform = replay.players.find((player) => player.playerId === platformPlayerId);
    if (byPlatform) {
      return byPlatform;
    }
  }

  if (replay.accountId) {
    const byAccount = replay.players.find((player) =>
      playerMatchesAccount(player.playerId, replay.accountId),
    );
    if (byAccount) {
      return byAccount;
    }
  }

  for (const account of accounts) {
    const byLinkedAccount = replay.players.find((player) =>
      playerMatchesLinkedAccount(player, account),
    );
    if (byLinkedAccount) {
      return byLinkedAccount;
    }
  }

  return null;
}

function resultClass(result) {
  const normalized = String(result ?? "").trim().toLowerCase();
  if (normalized === "win") {
    return "win";
  }
  if (normalized === "loss") {
    return "loss";
  }
  return "neutral";
}

/** @param {SavedReplayRecord} replay */
function getReplayOutcome(replay) {
  if (!replayIncludesLinkedAccount(replay)) {
    return "neutral";
  }

  const fromResult = resultClass(replay.result);
  if (fromResult !== "neutral") {
    return fromResult;
  }

  const localPlayer = findReplayPlayer(replay);
  if (localPlayer) {
    const winningTeam = Number(replay.winningTeam);
    if (Number.isInteger(winningTeam) && winningTeam >= 0) {
      return localPlayer.team === winningTeam ? "win" : "loss";
    }

    const myScore =
      localPlayer.team === 0 ? replay.team0Score : replay.team1Score;
    const theirScore =
      localPlayer.team === 0 ? replay.team1Score : replay.team0Score;
    if (myScore > theirScore) {
      return "win";
    }
    if (myScore < theirScore) {
      return "loss";
    }
    return "neutral";
  }

  const localTeam = Number(replay.localPlayerTeam);
  if (Number.isInteger(localTeam)) {
    const myScore = localTeam === 0 ? replay.team0Score : replay.team1Score;
    const theirScore = localTeam === 0 ? replay.team1Score : replay.team0Score;
    if (myScore > theirScore) {
      return "win";
    }
    if (myScore < theirScore) {
      return "loss";
    }
  }

  return "neutral";
}

/** @param {number} team @param {SavedReplayPlayer[]} players */
function teamLabel(team, players) {
  const sample = players.find((player) => player.team === team);
  const color = sample?.teamColor?.trim();
  return color ? color : `Team ${team + 1}`;
}

/** @param {number} team @param {SavedReplayPlayer[]} players */
function teamColorClass(team, players) {
  const sample = players.find((player) => player.team === team);
  const color = (sample?.teamColor ?? "").toLowerCase();
  if (color.includes("blue")) {
    return "team-blue";
  }
  if (color.includes("orange")) {
    return "team-orange";
  }
  return "team-neutral";
}

/** @param {string} playerId @param {string} playerName */
function getTrackerProfileUrl(playerId, playerName) {
  const parts = playerId.split("|");
  const platform = parts.length === 3 ? parts[0].toLowerCase() : "epic";
  const platformId = parts.length === 3 ? parts[1] : playerId;
  const encodedName = encodeURIComponent(playerName);

  switch (platform) {
    case "steam":
      return `https://tracker.gg/rocket-league/profile/steam/${platformId}/overview`;
    case "ps4":
      return `https://tracker.gg/rocket-league/profile/psn/${encodedName}/overview`;
    case "xboxone":
      return `https://tracker.gg/rocket-league/profile/xbl/${encodedName}/overview`;
    case "epic":
    default:
      return `https://tracker.gg/rocket-league/profile/epic/${encodedName}/overview`;
  }
}

/** @param {string} full @param {string} short */
function statHeader(full, short) {
  return `<th title="${full}"><span class="stat-label-full">${full}</span><span class="stat-label-short">${short}</span></th>`;
}

/** @param {import('../../dist/proPlayers.js').ProPlayerProfile} profile */
function renderProPlayerTooltip(profile) {
  const image = profile.imageUrl
    ? `<img class="pro-player-tooltip-image" src="${escapeHtml(profile.imageUrl)}" alt="" loading="lazy" />`
    : `<div class="pro-player-tooltip-image pro-player-tooltip-image--placeholder" aria-hidden="true"></div>`;

  const flagUrl = getCountryFlagImageUrl(profile.country);
  const flagHtml = flagUrl
    ? `<img class="pro-player-tooltip-flag" src="${escapeHtml(flagUrl)}" width="22" height="16" alt="" title="${escapeHtml(profile.country)}" loading="lazy" decoding="async" />`
    : "";

  const winnings = profile.winnings
    ? `<div class="pro-player-tooltip-winnings">${escapeHtml(profile.winnings)} total winnings</div>`
    : "";

  return `
    <div class="pro-player-tooltip">
      ${image}
      <div class="pro-player-tooltip-body">
        <div class="pro-player-tooltip-name">${flagHtml}<span>${escapeHtml(profile.displayName)}</span></div>
        ${winnings}
      </div>
    </div>
  `;
}

function hideProPlayerTooltip() {
  const portal = elements.proPlayerTooltipPortal;
  portal.classList.add("hidden");
  portal.setAttribute("aria-hidden", "true");
  portal.innerHTML = "";
}

/** @param {HTMLElement} anchor @param {import('../../dist/proPlayers.js').ProPlayerProfile} profile */
function showProPlayerTooltip(anchor, profile) {
  const portal = elements.proPlayerTooltipPortal;
  portal.innerHTML = renderProPlayerTooltip(profile);
  portal.classList.remove("hidden");
  portal.setAttribute("aria-hidden", "false");

  const rect = anchor.getBoundingClientRect();
  const width = portal.offsetWidth || 220;
  const left = Math.min(
    window.innerWidth - width - 8,
    Math.max(8, rect.left + rect.width / 2 - width / 2),
  );
  let top = rect.bottom + 8;
  const height = portal.offsetHeight || 120;

  if (top + height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - height - 8);
  }

  portal.style.left = `${left}px`;
  portal.style.top = `${top}px`;
}

/** @param {SavedReplayPlayer} player */
function renderPlayerRankIcon(player) {
  if (player.rankTier == null || player.rankTier <= 0) {
    return "";
  }

  const iconUrl = getRankIconUrl(player.rankTier);
  if (!iconUrl) {
    return "";
  }

  const title = getRankTitle(player.rankTier, player.rankDivision ?? 0);
  return `<img class="replay-rank-icon" src="${escapeHtml(iconUrl)}" width="18" height="18" alt="" title="${escapeHtml(title)}" loading="lazy" decoding="async" />`;
}

/** @param {SavedReplayPlayer} player @param {SavedReplayRecord} replay */
function renderPlayerStatsTable(players, replay) {
  const rows = players
    .map((player) => {
      const isLocal =
        playerMatchesAccount(player.playerId, replay.accountId) ||
        accounts.some((account) => playerMatchesLinkedAccount(player, account));
      const trackerUrl = getTrackerProfileUrl(player.playerId, player.playerName);
      const proProfile = getProPlayerProfile(player.playerId, player.playerName);
      const tooltipProfile = getProPlayerTooltipProfile(player.playerId, player.playerName);
      const showPro = Boolean(proProfile || player.isPro);
      const badges = [];

      if (showPro) {
        const liquipediaUrl = getProPlayerLiquipediaUrl(player.playerId, player.playerName);
        badges.push(
          `<button class="replay-pro-tag${tooltipProfile ? " has-tooltip" : ""}" type="button" data-action="open-url" data-url="${escapeHtml(liquipediaUrl ?? "")}" data-player-id="${escapeHtml(player.playerId)}" data-player-name="${escapeHtml(player.playerName)}" title="View on Liquipedia"${liquipediaUrl ? "" : " disabled"}>PRO</button>`,
        );
      }
      if (player.isMvp) {
        badges.push('<span class="replay-mvp">MVP</span>');
      }

      return `
        <tr class="${isLocal ? "is-local" : ""}">
          <td class="replay-stats-player">
            <div class="replay-stats-player-inner">
              ${renderPlayerRankIcon(player)}
              ${renderPlayerPlatformIcon(player.playerId)}
              <button
                class="replay-player-link"
                type="button"
                data-action="open-url"
                data-url="${escapeHtml(trackerUrl)}"
                title="View on RL Tracker"
              >${TRN_LOGO_HTML}<span class="replay-player-link-name">${escapeHtml(player.playerName)}</span></button>${badges.length ? `<span class="replay-stats-player-badges">${badges.join("")}</span>` : ""}
            </div>
          </td>
          <td class="replay-stats-score">${player.score}</td>
          <td>${player.goals}</td>
          <td>${player.assists}</td>
          <td>${player.saves}</td>
          <td>${player.shots}</td>
          <td>${player.demolishes ?? 0}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="replay-stats-table">
      <thead>
        <tr>
          ${statHeader("Player", "Player")}
          ${statHeader("Score", "S")}
          ${statHeader("Goals", "G")}
          ${statHeader("Assists", "A")}
          ${statHeader("Saves", "Sv")}
          ${statHeader("Shots", "Sh")}
          ${statHeader("Demos", "D")}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

/** @param {import('../../dist/store.js').SavedReplayRecord} replay */
function renderBallchasingStatus(replay) {
  const merged = withBallchasingOverrides(replay);

  if (merged.ballchasingUrl) {
    return `<div class="replay-ballchasing-status">
      <button class="btn btn-small" type="button" data-action="open-url" data-url="${escapeHtml(merged.ballchasingUrl)}" title="Open on Ballchasing">Ballchasing ↗</button>
    </div>`;
  }

  if (merged.ballchasingError) {
    const quota = isBallchasingQuotaError(merged);
    return `<div class="replay-ballchasing-status">
      ${quota ? `<span class="ballchasing-quota-warning" title="${escapeHtml(merged.ballchasingError)}">Daily quota reached</span>` : `<span class="badge failed" title="${escapeHtml(merged.ballchasingError)}">Ballchasing upload failed</span>`}
    </div>`;
  }

  return "";
}

/** @param {SavedReplayRecord} replay */
function renderReplayDetails(replay) {
  const ballchasingStatus = renderBallchasingStatus(replay);

  if (!replay.players?.length) {
    const hint = isImportedReplay(replay)
      ? "Could not read player stats from this replay file."
      : "Detailed player stats are available for newly synced replays.";
    return `
      <div class="replay-details-panel">
        ${ballchasingStatus}
        <p class="hint">${hint}</p>
      </div>
    `;
  }

  const teams = [...new Set(replay.players.map((player) => player.team))].sort((a, b) => a - b);

  const teamSections = teams
    .map((team) => {
      const teamPlayers = replay.players.filter((player) => player.team === team);
      const teamScore = team === 0 ? replay.team0Score : replay.team1Score;
      const won =
        replay.winningTeam !== undefined &&
        replay.winningTeam >= 0 &&
        replay.winningTeam === team;

      return `
        <div class="replay-team ${teamColorClass(team, replay.players)}${won ? " won-team" : ""}">
          <div class="replay-team-header">
            <span>${escapeHtml(teamLabel(team, replay.players))}</span>
            <span class="replay-team-score">${teamScore}</span>
          </div>
          ${renderPlayerStatsTable(teamPlayers, replay)}
        </div>
      `;
    })
    .join("");

  return `
    <div class="replay-details-panel">
      ${ballchasingStatus}
      <div class="replay-teams">
        ${teamSections}
      </div>
    </div>
  `;
}

function getBallchasingReplayId(replay) {
  const id = replay.ballchasingId?.trim();
  if (id) {
    return id;
  }

  const url = replay.ballchasingUrl?.trim();
  if (!url) {
    return null;
  }

  const match = url.match(/\/replay\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

async function refreshBallchasingViewerAvailability() {
  if (!platformInfo.inGameReplaySupported) {
    ballchasingViewerAvailable = false;
    if (replayLibrary || visibleReplays.length > 0) {
      renderReplaysFromLibrary();
    }
    return;
  }

  try {
    ballchasingViewerAvailable = await api.checkBallchasingViewer();
  } catch {
    ballchasingViewerAvailable = false;
  }

  if (replayLibrary || visibleReplays.length > 0) {
    renderReplaysFromLibrary();
  }
}

const PLAY_UNAVAILABLE_TITLE =
  "Play this replay in Rocket League. Requires Rocket League running without anti-cheat, BakkesMod enabled, and the Ballchasing Replay Viewer plugin installed.";

/** @type {string | null} */
let openReplayMenuGuid = null;

/** @type {string | null} */
let openShareMenuGuid = null;

function menuIconSvg(pathD) {
  return `<span class="replay-menu-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="${pathD}"/></svg></span>`;
}

const MENU_ICON_FOLDER_PATH =
  "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";
const MENU_ICON_RENAME_PATH =
  "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const MENU_ICON_DELETE_PATH =
  "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const MENU_ICON_LINK_PATH =
  "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-5h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z";
const MENU_ICON_FILE_PATH =
  "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z";
const MENU_ICON_DOWNLOAD_PATH =
  "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z";

function showReplayToast(message, isError = false) {
  elements.syncBanner.textContent = message;
  elements.syncBanner.classList.remove("hidden");
  elements.syncBanner.classList.toggle("error", isError);
}

/** @param {SavedReplayRecord} replay */
function getBallchasingShareUrl(replay) {
  const merged = withBallchasingOverrides(replay);
  return merged.ballchasingUrl?.trim() || "";
}

/** @param {SavedReplayRecord} replay */
async function copyBallchasingShareUrl(replay) {
  const url = getBallchasingShareUrl(replay);
  if (!url) {
    return;
  }

  await api.writeClipboardText(url);
  showReplayToast("Ballchasing link copied.");
}

/** @param {SavedReplayRecord} replay */
async function copyReplayFile(replay) {
  if (!replay.filePath) {
    return;
  }

  try {
    await api.copyReplayFile({
      filePath: replay.filePath,
      copyAsName: buildReplayExportFileName(replay),
    });
    showReplayToast("Replay file copied.");
  } catch (error) {
    showReplayToast(
      error instanceof Error ? error.message : "Failed to copy replay file.",
      true,
    );
  }
}

/** @param {SavedReplayRecord} replay */
function renderReplayShareButton(replay) {
  const isOpen = openShareMenuGuid === replay.matchGuid;

  return `
    <button
      class="btn btn-replay-action btn-replay-share"
      type="button"
      data-action="toggle-share-menu"
      data-match-guid="${escapeHtml(replay.matchGuid)}"
      title="Share replay"
      aria-label="Share replay"
      aria-haspopup="menu"
      aria-expanded="${isOpen ? "true" : "false"}"
    >⤴</button>
  `;
}

/** @param {SavedReplayRecord} replay */
function renderShareMenuPortalContent(replay) {
  const ballchasingUrl = getBallchasingShareUrl(replay);
  const cloudOnly = isCloudOnlyReplay(replay);

  return `
    <button
      class="replay-menu-item"
      type="button"
      role="menuitem"
      data-action="copy-ballchasing-url"
      data-match-guid="${escapeHtml(replay.matchGuid)}"
      ${ballchasingUrl ? "" : "disabled"}
      title="${ballchasingUrl ? "Copy Ballchasing link" : "Upload to Ballchasing first"}"
    >
      ${menuIconSvg(MENU_ICON_LINK_PATH)}
      <span>Copy Ballchasing link</span>
    </button>
    ${
      cloudOnly
        ? ""
        : `<button
      class="replay-menu-item"
      type="button"
      role="menuitem"
      data-action="copy-replay-file"
      data-match-guid="${escapeHtml(replay.matchGuid)}"
    >
      ${menuIconSvg(MENU_ICON_FILE_PATH)}
      <span>Copy replay file</span>
    </button>
    <button
      class="replay-menu-item"
      type="button"
      role="menuitem"
      data-action="show"
      data-path="${escapeHtml(replay.filePath)}"
    >
      ${menuIconSvg(MENU_ICON_FOLDER_PATH)}
      <span>Show in folder</span>
    </button>`
    }
  `;
}

function positionShareMenuPortal() {
  if (!openShareMenuGuid) {
    return;
  }

  const anchor = elements.replayList.querySelector(
    `button[data-action="toggle-share-menu"][data-match-guid="${openShareMenuGuid}"]`,
  );
  if (!(anchor instanceof HTMLButtonElement)) {
    closeShareMenu();
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const portal = elements.shareMenuPortal;
  portal.classList.remove("hidden");
  portal.setAttribute("aria-hidden", "false");

  const width = portal.offsetWidth || 220;
  const left = Math.min(
    window.innerWidth - width - 8,
    Math.max(8, rect.right - width),
  );

  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.left = `${left}px`;
}

function syncShareMenuPortal() {
  if (!openShareMenuGuid || !replayLibrary) {
    elements.shareMenuPortal.classList.add("hidden");
    elements.shareMenuPortal.setAttribute("aria-hidden", "true");
    return;
  }

  const replay = findReplayByGuid(openShareMenuGuid);
  if (!replay) {
    closeShareMenu();
    return;
  }

  elements.shareMenuPortal.innerHTML = renderShareMenuPortalContent(replay);
  positionShareMenuPortal();
}

function closeShareMenu() {
  if (!openShareMenuGuid) {
    elements.shareMenuPortal.classList.add("hidden");
    elements.shareMenuPortal.setAttribute("aria-hidden", "true");
    return;
  }

  openShareMenuGuid = null;
  elements.shareMenuPortal.classList.add("hidden");
  elements.shareMenuPortal.setAttribute("aria-hidden", "true");

  for (const button of elements.replayList.querySelectorAll(
    '[data-action="toggle-share-menu"]',
  )) {
    button.setAttribute("aria-expanded", "false");
  }
}

function setShareMenuOpen(matchGuid) {
  closeReplayMenu();
  openShareMenuGuid = openShareMenuGuid === matchGuid ? null : matchGuid;

  if (!openShareMenuGuid) {
    closeShareMenu();
    return;
  }

  for (const button of elements.replayList.querySelectorAll(
    '[data-action="toggle-share-menu"]',
  )) {
    button.setAttribute(
      "aria-expanded",
      button.dataset.matchGuid === matchGuid ? "true" : "false",
    );
  }

  syncShareMenuPortal();
}

/** @param {SavedReplayRecord} replay */
function renderReplayMenuButton(replay) {
  const isOpen = openReplayMenuGuid === replay.matchGuid;

  return `
    <button
      class="btn btn-replay-action btn-replay-menu"
      type="button"
      data-action="toggle-replay-menu"
      data-match-guid="${escapeHtml(replay.matchGuid)}"
      title="Replay options"
      aria-label="Replay options"
      aria-haspopup="menu"
      aria-expanded="${isOpen ? "true" : "false"}"
    >☰</button>
  `;
}

/** @param {SavedReplayRecord} replay */
function renderReplayMenuPortalContent(replay) {
  const cloudOnly = isCloudOnlyReplay(replay);
  const hasBallchasing = Boolean(replay.ballchasingId?.trim());

  if (cloudOnly) {
    return `
      <button
        class="replay-menu-item"
        type="button"
        role="menuitem"
        data-action="restore-cloud-replay"
        data-match-guid="${escapeHtml(replay.matchGuid)}"
        ${hasBallchasing ? "" : "disabled"}
        title="${hasBallchasing ? "Download replay file from Ballchasing" : "No Ballchasing link available"}"
      >
        ${menuIconSvg(MENU_ICON_DOWNLOAD_PATH)}
        <span>Download local file</span>
      </button>
      <button
        class="replay-menu-item replay-menu-item--danger"
        type="button"
        role="menuitem"
        data-action="delete-replay"
        data-match-guid="${escapeHtml(replay.matchGuid)}"
      >
        ${menuIconSvg(MENU_ICON_DELETE_PATH)}
        <span>Remove from list</span>
      </button>
    `;
  }

  const removeLocalItem =
    hasBallchasing && replay.filePath?.trim()
      ? `<button
      class="replay-menu-item"
      type="button"
      role="menuitem"
      data-action="remove-replay-local-file"
      data-match-guid="${escapeHtml(replay.matchGuid)}"
      title="Delete the local file and keep this replay as cloud-only"
    >
      ${menuIconSvg(MENU_ICON_FILE_PATH)}
      <span>Remove local file</span>
    </button>`
      : "";

  return `
    <button
      class="replay-menu-item"
      type="button"
      role="menuitem"
      data-action="show"
      data-path="${escapeHtml(replay.filePath)}"
    >
      ${menuIconSvg(MENU_ICON_FOLDER_PATH)}
      <span>Show in folder</span>
    </button>
    <button
      class="replay-menu-item"
      type="button"
      role="menuitem"
      data-action="rename-replay"
      data-match-guid="${escapeHtml(replay.matchGuid)}"
    >
      ${menuIconSvg(MENU_ICON_RENAME_PATH)}
      <span>Rename replay</span>
    </button>
    ${removeLocalItem}
    <button
      class="replay-menu-item replay-menu-item--danger"
      type="button"
      role="menuitem"
      data-action="delete-replay"
      data-match-guid="${escapeHtml(replay.matchGuid)}"
    >
      ${menuIconSvg(MENU_ICON_DELETE_PATH)}
      <span>Delete replay</span>
    </button>
  `;
}

function positionReplayMenuPortal() {
  if (!openReplayMenuGuid) {
    return;
  }

  const anchor = elements.replayList.querySelector(
    `button[data-action="toggle-replay-menu"][data-match-guid="${openReplayMenuGuid}"]`,
  );
  if (!(anchor instanceof HTMLButtonElement)) {
    closeReplayMenu();
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const portal = elements.replayMenuPortal;
  portal.classList.remove("hidden");
  portal.setAttribute("aria-hidden", "false");

  const width = portal.offsetWidth || 188;
  const left = Math.min(
    window.innerWidth - width - 8,
    Math.max(8, rect.right - width),
  );

  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.left = `${left}px`;
}

function syncReplayMenuPortal() {
  if (!openReplayMenuGuid || !replayLibrary) {
    elements.replayMenuPortal.classList.add("hidden");
    elements.replayMenuPortal.setAttribute("aria-hidden", "true");
    return;
  }

  const replay = replayLibrary.replays.find(
    (item) => item.matchGuid === openReplayMenuGuid,
  );
  if (!replay) {
    closeReplayMenu();
    return;
  }

  elements.replayMenuPortal.innerHTML = renderReplayMenuPortalContent(replay);
  positionReplayMenuPortal();
}

function closeReplayMenu() {
  if (!openReplayMenuGuid) {
    elements.replayMenuPortal.classList.add("hidden");
    elements.replayMenuPortal.setAttribute("aria-hidden", "true");
    return;
  }

  openReplayMenuGuid = null;
  elements.replayMenuPortal.classList.add("hidden");
  elements.replayMenuPortal.setAttribute("aria-hidden", "true");

  for (const button of elements.replayList.querySelectorAll(
    '[data-action="toggle-replay-menu"]',
  )) {
    button.setAttribute("aria-expanded", "false");
  }
}

function setReplayMenuOpen(matchGuid) {
  closeShareMenu();
  openReplayMenuGuid = openReplayMenuGuid === matchGuid ? null : matchGuid;

  if (!openReplayMenuGuid) {
    closeReplayMenu();
    return;
  }

  for (const button of elements.replayList.querySelectorAll(
    '[data-action="toggle-replay-menu"]',
  )) {
    button.setAttribute(
      "aria-expanded",
      button.dataset.matchGuid === matchGuid ? "true" : "false",
    );
  }

  syncReplayMenuPortal();
}

/** @param {string} matchGuid */
function findReplayByGuid(matchGuid) {
  return (
    visibleReplays.find((item) => item.matchGuid === matchGuid) ??
    replayLibrary?.replays.find((item) => item.matchGuid === matchGuid)
  );
}

/** @param {SavedReplayRecord} replay */
function replayHasProPlayer(replay) {
  return (
    replay.players?.some(
      (player) => player.isPro || isProPlayer(player.playerId, player.playerName),
    ) ?? false
  );
}

/** @param {SavedReplayRecord} replay @param {string} query */
function replayMatchesLocalSearch(replay, query) {
  const trimmed = query.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.toLowerCase() === "pro") {
    return replayHasProPlayer(replay);
  }

  return replayMatchesSearchQuery(replay, query, getMapDisplayName);
}

/** @param {SavedReplayRecord[]} replays */
function filterPageReplays(replays) {
  const query = elements.replaySearch.value.trim();
  if (!query) {
    return replays;
  }

  return replays.filter((replay) => replayMatchesLocalSearch(replay, query));
}

function updateReplaySelectionUi(visibleGuids = visibleReplays.map((replay) => replay.matchGuid)) {
  const visibleSelected = visibleGuids.filter((guid) => selectedReplayGuids.has(guid));

  elements.replaySelectionBar.classList.toggle("hidden", !replaySelectionMode);
  elements.replaySelectionCount.textContent =
    `${selectedReplayGuids.size} selected`;

  if (elements.toggleReplaySelection instanceof HTMLButtonElement) {
    elements.toggleReplaySelection.textContent = replaySelectionMode ? "Done" : "Select";
    elements.toggleReplaySelection.setAttribute(
      "aria-pressed",
      replaySelectionMode ? "true" : "false",
    );
  }

  document.body.classList.toggle("replay-selection-mode", replaySelectionMode);

  if (elements.replaySelectAll instanceof HTMLInputElement) {
    const allVisibleSelected =
      visibleGuids.length > 0 && visibleSelected.length === visibleGuids.length;
    elements.replaySelectAll.checked = allVisibleSelected;
    elements.replaySelectAll.indeterminate =
      visibleSelected.length > 0 && !allVisibleSelected;
  }

  for (const card of elements.replayList.querySelectorAll(".replay-card")) {
    if (!(card instanceof HTMLElement) || !card.dataset.matchGuid) {
      continue;
    }
    const isSelected = selectedReplayGuids.has(card.dataset.matchGuid);
    card.classList.toggle("is-selected", isSelected);

    const checkbox = card.querySelector(".replay-select-input");
    if (checkbox instanceof HTMLInputElement) {
      checkbox.checked = isSelected;
    }
  }
}

function clearReplaySelection() {
  selectedReplayGuids.clear();
  updateReplaySelectionUi();
}

function setReplaySelectionMode(enabled) {
  replaySelectionMode = enabled;
  if (!enabled) {
    selectedReplayGuids.clear();
  }
  updateReplaySelectionUi();
  renderReplaysFromLibrary();
}

/** @param {SavedReplayRecord[]} replays */
function openDeleteReplayDialog(replays) {
  pendingDeleteReplays = replays;
  if (replays.length === 1 && isCloudOnlyReplay(replays[0])) {
    elements.deleteReplayMessage.textContent =
      `Remove "${getReplayDisplayName(replays[0])}" from your library? The replay stays on Ballchasing.`;
  } else if (replays.length === 1) {
    elements.deleteReplayMessage.textContent =
      `Delete "${getReplayDisplayName(replays[0])}" from your replay folder? This cannot be undone.`;
  } else {
    elements.deleteReplayMessage.textContent =
      `Delete ${replays.length} replays from your replay folder? This cannot be undone.`;
  }
  elements.deleteReplayDialog.classList.remove("hidden");
  elements.deleteReplayDialog.setAttribute("aria-hidden", "false");
  elements.deleteReplayConfirm.focus();
}

function renderReplaysFromLibrary() {
  if (!replayLibrary) {
    renderReplays([]);
    return;
  }

  renderReplays(filterPageReplays(replayLibrary.replays));
}

/** @param {SavedReplayRecord} replay */
function renderPlayInGameButton(replay) {
  if (!platformInfo.inGameReplaySupported) {
    return "";
  }

  const merged = withBallchasingOverrides(replay);
  const canPlayLocal = Boolean(replay.filePath?.trim());
  const canPlayCloud = Boolean(merged.ballchasingId?.trim());
  if (!canPlayLocal && !canPlayCloud) {
    return "";
  }

  const loading = replayPlayInGameLoading.has(replay.matchGuid);
  const available = ballchasingViewerAvailable === true;
  const enabled = available && !loading;
  const title = loading
    ? "Starting replay in Rocket League…"
    : available
      ? "Play in Rocket League"
      : PLAY_UNAVAILABLE_TITLE;
  const tooltipTarget = enabled ? "button" : "wrap";

  return `<span class="replay-play-wrap"${tooltipTarget === "wrap" ? ` title="${escapeHtml(PLAY_UNAVAILABLE_TITLE)}"` : ""}><button class="btn btn-replay-action btn-replay-play${available ? "" : " is-unavailable"}" type="button" data-action="play-in-game" data-match-guid="${escapeHtml(replay.matchGuid)}"${tooltipTarget === "button" ? ` title="${escapeHtml(title)}"` : ""} aria-label="${escapeHtml(title)}"${enabled ? "" : " disabled"}>${loading ? "…" : "▶"}</button></span>`;
}

/** @param {SavedReplayRecord} replay */
async function playReplayInGame(replay) {
  const merged = withBallchasingOverrides(replay);
  replayPlayInGameLoading.add(replay.matchGuid);
  renderReplaysFromLibrary();

  try {
    await api.playReplayInGame({
      ballchasingId: merged.ballchasingId,
      ballchasingUrl: merged.ballchasingUrl,
      filePath: merged.filePath,
      matchGuid: merged.matchGuid,
    });
  } catch (error) {
    elements.syncBanner.textContent =
      error instanceof Error ? error.message : String(error);
    elements.syncBanner.classList.remove("hidden");
    elements.syncBanner.classList.add("error");
  } finally {
    replayPlayInGameLoading.delete(replay.matchGuid);
    renderReplaysFromLibrary();
  }
}

function hasMultipleAccounts() {
  return accounts.length > 1;
}

function shouldShowAccountLabel(replay) {
  if (!hasMultipleAccounts()) {
    return false;
  }

  const name = replay.accountDisplayName?.trim();
  if (!name) {
    return false;
  }

  if (isImportedReplay(replay) && replay.hasAccountMatch !== true) {
    return false;
  }

  return true;
}

function canSync() {
  return accounts.length > 0 && !state?.isSyncing;
}

function enabledAccountsCount() {
  return accounts.filter((account) => account.enabled).length;
}

function updateSyncBanner() {
  if (!state) {
    elements.syncBanner.classList.add("hidden");
    return;
  }

  if (state.isSyncing) {
    elements.syncBanner.classList.add("hidden");
    elements.syncBanner.classList.remove("error");
    return;
  }

  if (state.lastSyncError) {
    elements.syncBanner.textContent = state.lastSyncError;
    elements.syncBanner.classList.remove("hidden");
    elements.syncBanner.classList.add("error");
    return;
  }

  if (state.lastSyncMessage) {
    elements.syncBanner.textContent = state.lastSyncMessage;
    elements.syncBanner.classList.remove("hidden", "error");
    return;
  }

  elements.syncBanner.classList.add("hidden");
  elements.syncBanner.classList.remove("error");
}

function updateSyncButton() {
  elements.syncNow.disabled = !canSync();
  elements.syncNow.title = accounts.length === 0
    ? "Sign in with an Epic account first"
    : "";
}

function isImportedReplay(replay) {
  return replay.source === "imported";
}

function wrapReplayResultIcon(content) {
  return `<svg class="replay-result-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">${content}</svg>`;
}

/** @param {number} playlistId */
function getPlaylistGamemodeKey(playlistId) {
  switch (playlistId) {
    case 1:
    case 10:
      return "1v1";
    case 2:
    case 11:
      return "2v2";
    case 3:
    case 13:
      return "3v3";
    case 27:
    case 61:
      return "hoops";
    case 28:
    case 62:
      return "rumble";
    case 29:
    case 63:
      return "dropshot";
    case 30:
    case 64:
      return "snowday";
    case 34:
      return "tournament";
    case 0:
      return "exhibition";
    default:
      return "unknown";
  }
}

/** @param {number} playlistId */
function renderGamemodeReplayIcon(playlistId) {
  const mode = getPlaylistGamemodeKey(playlistId);

  switch (mode) {
    case "1v1":
      return wrapReplayResultIcon('<circle cx="12" cy="12" r="3.2" fill="currentColor"/>');
    case "2v2":
      return wrapReplayResultIcon(
        '<circle cx="9" cy="12" r="2.8" fill="currentColor"/><circle cx="15" cy="12" r="2.8" fill="currentColor"/>',
      );
    case "3v3":
      return wrapReplayResultIcon(
        '<circle cx="12" cy="8.5" r="2.5" fill="currentColor"/><circle cx="8" cy="15" r="2.5" fill="currentColor"/><circle cx="16" cy="15" r="2.5" fill="currentColor"/>',
      );
    case "hoops":
      return wrapReplayResultIcon(
        '<path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M7.5 9.5a4.5 4.5 0 0 1 9 0"/>' +
          '<circle cx="12" cy="14.5" r="2.6" fill="currentColor"/>',
      );
    case "rumble":
      return wrapReplayResultIcon(
        '<path fill="currentColor" d="M13.2 3.5 9.5 12h3.4l-1.2 8.5L17 11h-3.5l-.3-7.5z"/>',
      );
    case "dropshot":
      return wrapReplayResultIcon(
        '<path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 4.5v11"/>' +
          '<path fill="currentColor" d="M8.5 15.5h7l-1.8 4H10.3z"/>' +
          '<path fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" d="M9 18.5h6"/>',
      );
    case "snowday":
      return wrapReplayResultIcon(
        '<ellipse cx="12" cy="12" rx="6.5" ry="3.2" fill="currentColor"/>' +
          '<path fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55" d="M6.5 12h13"/>',
      );
    case "tournament":
      return wrapReplayResultIcon(
        '<path fill="none" stroke="currentColor" stroke-width="1.4" d="M8 8h8v3.5c0 2.2-1.8 4-4 4s-4-1.8-4-4V8z"/>' +
          '<path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" d="M12 15.5v3M9.5 18.5h5"/>',
      );
    case "exhibition":
      return wrapReplayResultIcon(
        '<circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
          '<path fill="currentColor" d="M12 8.2l1.2.87.45 1.42-1.1 1.04h-1.14l-1.1-1.04.45-1.42z"/>',
      );
    default:
      return wrapReplayResultIcon(
        '<circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
          '<path fill="none" stroke="currentColor" stroke-width="1.3" d="M12 6.5v11M6.5 12h11"/>',
      );
  }
}

/** @param {SavedReplayRecord} replay */
function replayIncludesLinkedAccount(replay) {
  if (isImportedReplay(replay)) {
    if (replay.hasAccountMatch === false) {
      return false;
    }

    if (!replay.players?.length) {
      return replay.hasAccountMatch === true;
    }

    return findReplayPlayer(replay) !== null;
  }

  return true;
}

/** @param {SavedReplayRecord} replay */
function withBallchasingOverrides(replay) {
  const override = ballchasingOverrides.get(replay.matchGuid);
  return override ? { ...replay, ...override } : replay;
}

/** @param {SavedReplayRecord} replay */
function isBallchasingUploaded(replay) {
  return Boolean(replay.ballchasingUrl || replay.ballchasingUploadedAt);
}

/** @param {SavedReplayRecord} replay */
function renderBallchasingLogoMarkup(status, title, options = {}) {
  const img =
    '<img class="ballchasing-logo" src="ballchasing-logo.png" width="22" height="22" alt="" aria-hidden="true" decoding="async">';
  const className = `ballchasing-status ballchasing-status--${status}`;

  if (options.clickable && options.url) {
    return `<button class="${className}" type="button" data-action="open-url" data-url="${escapeHtml(options.url)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${img}</button>`;
  }

  return `<span class="${className}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${img}</span>`;
}

function isBallchasingQuotaError(replay) {
  return replay.ballchasingErrorKind === "quota";
}

/** @param {SavedReplayRecord} replay */
function renderBallchasingControls(replay) {
  const merged = withBallchasingOverrides(replay);
  const uploading = ballchasingUploading.has(replay.matchGuid);
  const uploaded = isBallchasingUploaded(merged);
  const failed = Boolean(merged.ballchasingError) && !uploaded;
  const quotaReached = failed && isBallchasingQuotaError(merged);
  const hasToken = Boolean(config?.hasBallchasingToken);
  const cloudOnly = isCloudOnlyReplay(replay);
  const showUploadButton =
    hasToken &&
    !config?.autoUploadBallchasing &&
    !uploaded &&
    !uploading &&
    !cloudOnly &&
    Boolean(replay.filePath?.trim());

  let status = "pending";
  let title = "Not uploaded to Ballchasing";

  if (uploading) {
    status = "uploading";
    title = "Uploading to Ballchasing…";
  } else if (uploaded) {
    status = "uploaded";
    title = "View on Ballchasing — click to open";
  } else if (quotaReached) {
    status = "quota";
    title =
      merged.ballchasingError ??
      "Ballchasing daily quota reached. Try again later or check ballchasing.com/upload.";
  } else if (failed) {
    status = "failed";
    title = merged.ballchasingError ?? "Ballchasing upload failed";
  }

  const iconMarkup = renderBallchasingLogoMarkup(status, title, {
    clickable: uploaded,
    url: merged.ballchasingUrl ?? "",
  });

  const quotaWarning = quotaReached
    ? `<span class="ballchasing-quota-warning" title="${escapeHtml(title)}">Quota</span>`
    : "";

  const uploadButton = showUploadButton
    ? `<button class="btn btn-replay-action" type="button" data-action="upload-ballchasing" data-match-guid="${escapeHtml(replay.matchGuid)}" data-path="${escapeHtml(replay.filePath)}" title="Upload to Ballchasing">Upload</button>`
    : "";

  return `<div class="replay-ballchasing-controls">${iconMarkup}${quotaWarning}${uploadButton}</div>`;
}

/** @param {SavedReplayRecord} replay */
async function uploadReplayBallchasing(replay) {
  ballchasingUploading.add(replay.matchGuid);
  renderReplaysFromLibrary();

  try {
    const result = await api.uploadReplayBallchasing({
      matchGuid: replay.matchGuid,
      filePath: replay.filePath,
      uploadFileName: buildReplayExportFileName(replay),
      title: buildBallchasingReplayTitle(replay),
    });

    state = result.state;
    ballchasingOverrides.delete(replay.matchGuid);
    patchReplayInLibrary(replay.matchGuid, {
      ballchasingId: result.replay.ballchasingId,
      ballchasingUrl: result.replay.ballchasingUrl,
      ballchasingUploadedAt: result.replay.ballchasingUploadedAt,
      ballchasingError: undefined,
      ballchasingErrorKind: undefined,
      cloudOnly: result.replay.cloudOnly,
      filePath: result.replay.filePath,
    });
  } catch (error) {
    ballchasingOverrides.set(replay.matchGuid, {
      ballchasingError: error instanceof Error ? error.message : String(error),
      ballchasingErrorKind:
        error instanceof Error && /429|quota|upload limit|rate limit/i.test(error.message)
          ? "quota"
          : "unknown",
    });
    renderReplaysFromLibrary();
  } finally {
    ballchasingUploading.delete(replay.matchGuid);
    renderReplaysFromLibrary();
  }
}

/** @param {SavedReplayRecord} replay */
async function restoreCloudReplay(replay) {
  if (!replay.ballchasingId?.trim()) {
    showReplayToast("This replay has no Ballchasing link.", true);
    return;
  }

  elements.syncBanner.textContent = "Downloading replay from Ballchasing…";
  elements.syncBanner.classList.remove("hidden", "error");

  try {
    const result = await api.restoreCloudReplay(replay.matchGuid);
    state = result.state;
    showReplayToast("Local replay file restored.");
    await loadReplayLibrary({ page: replayPage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    elements.syncBanner.textContent = message;
    elements.syncBanner.classList.remove("hidden");
    elements.syncBanner.classList.add("error");
  }
}

/** @param {SavedReplayRecord} replay */
function openRemoveLocalFileDialog(replay) {
  if (!replay.ballchasingId?.trim()) {
    showReplayToast("Upload this replay to Ballchasing first.", true);
    return;
  }

  pendingRemoveLocalReplay = replay;
  elements.removeLocalFileMessage.textContent =
    `Remove the local file for "${getReplayDisplayName(replay)}"? The replay will stay in your library as cloud-only.`;
  elements.removeLocalFileDialog.classList.remove("hidden");
  elements.removeLocalFileDialog.setAttribute("aria-hidden", "false");
  elements.removeLocalFileConfirm.focus();
}

function closeRemoveLocalFileDialog() {
  pendingRemoveLocalReplay = null;
  elements.removeLocalFileDialog.classList.add("hidden");
  elements.removeLocalFileDialog.setAttribute("aria-hidden", "true");
}

async function confirmRemoveLocalFile() {
  if (!pendingRemoveLocalReplay) {
    return;
  }

  const replay = pendingRemoveLocalReplay;
  elements.removeLocalFileConfirm.disabled = true;

  try {
    const result = await api.removeReplayLocalFile(replay.matchGuid);
    state = result.state;
    closeRemoveLocalFileDialog();
    showReplayToast("Local file removed. Replay is now cloud-only.");
    patchReplayInLibrary(replay.matchGuid, {
      cloudOnly: true,
      filePath: "",
      ballchasingId: result.replay.ballchasingId,
      ballchasingUrl: result.replay.ballchasingUrl,
      ballchasingUploadedAt: result.replay.ballchasingUploadedAt,
      source: result.replay.source ?? replay.source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showReplayToast(message, true);
  } finally {
    elements.removeLocalFileConfirm.disabled = false;
  }
}

/** @param {SavedReplayRecord[]} replays */
function renderReplays(replays) {
  hideProPlayerTooltip();
  visibleReplays = replays;
  refreshPlatformPlayerIds(replays);

  const query = elements.replaySearch.value.trim();
  const total = replayLibrary?.total ?? replays.length;
  const pageCount = replayLibrary?.replays.length ?? replays.length;

  if (query && replayLibrary) {
    elements.replayCount.textContent =
      replays.length === pageCount
        ? `${replays.length} on this page`
        : `${replays.length} of ${pageCount} on this page`;
  } else {
    elements.replayCount.textContent = `${total} replay${total === 1 ? "" : "s"}`;
  }

  const hasAnyReplays = (replayLibrary?.total ?? replays.length) > 0;
  elements.replayEmpty.classList.toggle("hidden", hasAnyReplays);
  elements.replayList.innerHTML = "";

  if (replays.length === 0 && hasAnyReplays && query) {
    elements.replayList.innerHTML =
      `<p class="hint replay-no-matches">No matches on this page.</p>`;
  }

  if (replayLibrary && replayLibrary.totalPages > 1) {
    elements.replayPagination.classList.remove("hidden");
    elements.replayPageInfo.textContent = `Page ${replayLibrary.page} of ${replayLibrary.totalPages}`;
    elements.replayPrev.disabled = replayLibrary.page <= 1;
    elements.replayNext.disabled = replayLibrary.page >= replayLibrary.totalPages;
  } else {
    elements.replayPagination.classList.add("hidden");
  }

  const fragment = document.createDocumentFragment();

  for (const [index, replay] of replays.entries()) {
    const outcome = getReplayOutcome(replay);
    const isExpanded = expandedReplays.has(replay.matchGuid);
    const stripe = index % 2 === 0 ? "odd" : "even";
    const imported = isImportedReplay(replay);
    const isSelected = selectedReplayGuids.has(replay.matchGuid);
    const card = document.createElement("article");
    card.className = `replay-card replay-card--${outcome} replay-card--${stripe}${imported ? " replay-card--imported" : ""}${isExpanded ? " expanded" : ""}${isSelected ? " is-selected" : ""}`;
    card.dataset.matchGuid = replay.matchGuid;
    card.dataset.outcome = outcome;

    const accountLabel = shouldShowAccountLabel(replay)
      ? `<span class="replay-account">${escapeHtml(replay.accountDisplayName)}</span>`
      : "";

    const importedBadge = imported
      ? `<span class="badge imported" title="Found in replay folder">Imported</span>`
      : "";

    const cloudBadge = isCloudOnlyReplay(replay)
      ? `<span class="badge cloud" title="Stored on Ballchasing only">Cloud</span>`
      : "";

    const includesAccount = replayIncludesLinkedAccount(replay);
    const gamemodeLabel = getPlaylistDisplayName(replay.playlist);

    const resultLabel = !includesAccount
      ? renderGamemodeReplayIcon(replay.playlist)
      : outcome === "win"
        ? "W"
        : outcome === "loss"
          ? "L"
          : replay.result.charAt(0).toUpperCase();

    const noAccountTitle = `Spectator replay · ${gamemodeLabel}`;
    const noAccountAria = `Spectator replay, ${gamemodeLabel}`;

    const replayName = replay.replayName?.trim();
    const replayNameLabel = replayName
      ? `<span class="replay-name">${escapeHtml(replayName)}</span>`
      : "";

    const selectMarkup = replaySelectionMode
      ? `<label class="replay-select checkbox" title="Select replay">
          <input
            class="replay-select-input"
            type="checkbox"
            data-match-guid="${escapeHtml(replay.matchGuid)}"
            ${isSelected ? "checked" : ""}
          />
        </label>`
      : "";

    const sortBy = config?.replaySortBy ?? "match";
    const displayTimestamp = getReplayDisplayTimestamp(replay, sortBy);
    const displayTimestampTitle = getReplayDisplayTimestampTitle(replay, sortBy);

    card.innerHTML = `
      <div class="replay-row replay-row--${outcome}">
        ${selectMarkup}
        <div class="replay-result replay-result--${outcome}${includesAccount ? "" : " replay-result--no-account"}"${includesAccount ? "" : ` title="${escapeHtml(noAccountTitle)}"`} aria-label="${includesAccount ? (outcome === "win" ? "Win" : outcome === "loss" ? "Loss" : "Unknown result") : escapeHtml(noAccountAria)}">${resultLabel}</div>
        <div class="replay-body">
          <div class="replay-primary">
            <h3>${escapeHtml(getPlaylistDisplayName(replay.playlist))}</h3>
            <span class="replay-score">${replay.team0Score} – ${replay.team1Score}</span>
            ${replayNameLabel}
          </div>
          <div class="replay-secondary">
            <span${displayTimestampTitle ? ` title="${escapeHtml(displayTimestampTitle)}"` : ""}>${formatRelativeDate(displayTimestamp)}</span>
            <span class="replay-dot">·</span>
            <span>${escapeHtml(formatArenaName(replay))}</span>
            <span class="replay-dot">·</span>
            <span>${formatReplayDuration(replay)}</span>
            ${importedBadge ? `<span class="replay-dot">·</span>${importedBadge}` : ""}
            ${cloudBadge ? `<span class="replay-dot">·</span>${cloudBadge}` : ""}
            ${accountLabel}
          </div>
        </div>
        <div class="replay-actions">
          ${renderBallchasingControls(replay)}
          ${renderReplayShareButton(replay)}
          ${renderReplayMenuButton(replay)}
          <span class="replay-chevron${isExpanded ? " open" : ""}">▾</span>
          ${renderPlayInGameButton(replay)}
        </div>
      </div>
      ${isExpanded ? renderReplayDetails(replay) : ""}
    `;
    fragment.appendChild(card);
  }

  elements.replayList.appendChild(fragment);

  syncReplayMenuPortal();
  syncShareMenuPortal();
  updateReplaySelectionUi(replays.map((replay) => replay.matchGuid));
}

function getReplayLibrarySessionKey() {
  return [
    elements.syncedOnly.checked ? "1" : "0",
    config?.replaySortBy ?? "match",
    state?.savedReplays?.length ?? 0,
  ].join("|");
}

function getReplayPageCacheKey(page) {
  return `${getReplayLibrarySessionKey()}:${page}`;
}

function clearReplayPageCache() {
  replayPageCache.clear();
}

/** @param {string} matchGuid @param {Partial<import('../../dist/store.js').SavedReplayRecord>} updates */
function patchReplayInLibrary(matchGuid, updates) {
  const upper = matchGuid.toUpperCase();
  const updateUpper = updates.matchGuid?.toUpperCase();
  /** @param {import('../../dist/store.js').SavedReplayRecord} replay */
  const patchReplay = (replay) => {
    const replayUpper = replay.matchGuid.toUpperCase();
    if (replayUpper === upper || (updateUpper && replayUpper === updateUpper)) {
      return { ...replay, ...updates };
    }
    return replay;
  };

  if (replayLibrary?.replays) {
    replayLibrary = {
      ...replayLibrary,
      replays: replayLibrary.replays.map(patchReplay),
    };
  }

  for (const [key, cached] of replayPageCache.entries()) {
    replayPageCache.set(key, {
      ...cached,
      replays: cached.replays.map(patchReplay),
    });
  }

  renderReplaysFromLibrary();
}

/** @param {string[]} matchGuids */
function removeReplaysFromLibrary(matchGuids) {
  const removed = new Set(matchGuids.map((guid) => guid.toUpperCase()));
  /** @param {import('../../dist/store.js').SavedReplayRecord} replay */
  const keepReplay = (replay) => !removed.has(replay.matchGuid.toUpperCase());

  if (replayLibrary?.replays) {
    const nextReplays = replayLibrary.replays.filter(keepReplay);
    const removedCount = replayLibrary.replays.length - nextReplays.length;
    replayLibrary = {
      ...replayLibrary,
      replays: nextReplays,
      total: Math.max(0, (replayLibrary.total ?? nextReplays.length) - removedCount),
    };
  }

  for (const [key, cached] of replayPageCache.entries()) {
    const nextReplays = cached.replays.filter(keepReplay);
    const removedCount = cached.replays.length - nextReplays.length;
    replayPageCache.set(key, {
      ...cached,
      replays: nextReplays,
      total: Math.max(0, (cached.total ?? nextReplays.length) - removedCount),
    });
  }

  renderReplaysFromLibrary();
}

let replayLibraryLoadCount = 0;

function setReplayLibraryLoading(loading) {
  elements.replayLibraryLoading?.classList.toggle("hidden", !loading);
  elements.replayList?.classList.toggle("replay-list--loading", loading);
}

async function loadReplayLibrary(options = {}) {
  if (typeof options.page === "number") {
    replayPage = options.page;
  }

  const forceRefresh = options.forceRefresh === true;
  const quiet = options.quiet === true;
  const pageCacheKey = getReplayPageCacheKey(replayPage);

  if (!forceRefresh && replayPageCache.has(pageCacheKey)) {
    replayLibrary = replayPageCache.get(pageCacheKey);
    closeReplayMenu();
    closeShareMenu();
    hideProPlayerTooltip();
    renderReplaysFromLibrary();
    return;
  }

  closeReplayMenu();
  closeShareMenu();
  hideProPlayerTooltip();

  replayLibraryLoadCount += 1;
  if (!quiet) {
    setReplayLibraryLoading(true);
  }

  try {
    replayLibrary = await api.getReplayLibrary({
      page: replayPage,
      syncedOnly: elements.syncedOnly.checked,
      sortBy: config?.replaySortBy ?? "match",
    });

    replayPageCache.set(pageCacheKey, replayLibrary);

    if (replayLibrary.page !== replayPage) {
      replayPage = replayLibrary.page;
    }

    renderReplaysFromLibrary();
  } finally {
    replayLibraryLoadCount = Math.max(0, replayLibraryLoadCount - 1);
    if (replayLibraryLoadCount === 0) {
      setReplayLibraryLoading(false);
    }
  }
}

function scheduleReplayLibraryReload(resetPage = false) {
  clearTimeout(replaySearchTimer);
  replaySearchTimer = setTimeout(() => {
    if (resetPage) {
      clearReplayPageCache();
      void loadReplayLibrary({ page: 1, forceRefresh: true });
      return;
    }

    renderReplaysFromLibrary();
  }, resetPage ? 0 : 150);
}

function renderAccounts() {
  elements.accountsList.innerHTML = "";

  if (accounts.length === 0) {
    elements.accountsList.innerHTML =
      `<p class="hint">No accounts linked yet. Add an Epic account to start syncing replays.</p>`;
    return;
  }

  for (const [index, account] of accounts.entries()) {
    const stripe = index % 2 === 0 ? "odd" : "even";
    const card = document.createElement("div");
    card.className = `account-card account-card--${stripe}`;

    const statusHint = account.lastSyncError
      ? `<span class="hint account-error">${account.lastSyncError}</span>`
      : account.lastSyncMessage
        ? `<span class="hint">${account.lastSyncMessage}</span>`
        : "";

    card.innerHTML = `
      <div class="account-card-main">
        <strong>${account.displayName}</strong>
        ${statusHint}
      </div>
      <div class="account-card-actions">
        <label class="checkbox">
          <input type="checkbox" data-account-id="${account.accountId}" ${account.enabled ? "checked" : ""} />
          Sync
        </label>
        <button class="btn btn-danger" data-remove-account="${account.accountId}">Remove</button>
      </div>
    `;
    elements.accountsList.appendChild(card);
  }
}

function updateStatusLine() {
  if (!state) {
    elements.statusLine.textContent = "Loading…";
    return;
  }

  const parts = [];

  if (state.isSyncing) {
    parts.push(syncProgressState?.statusText ?? "Syncing…");
  } else if (accounts.length === 0) {
    parts.push("Sign in to get started");
  } else if (state.lastSyncAt) {
    const lastSync = new Date(state.lastSyncAt);
    const diffMin = Math.floor((Date.now() - lastSync.getTime()) / 60_000);
    if (diffMin < 1) {
      parts.push("Synced just now");
    } else if (diffMin < 60) {
      parts.push(`Synced ${diffMin}m ago`);
    } else {
      parts.push(`Synced ${lastSync.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`);
    }
  } else {
    parts.push("Ready to sync");
  }

  elements.statusLine.textContent = parts.join(" · ");
  elements.statusLine.classList.toggle("syncing", Boolean(state.isSyncing));
  document.body.classList.toggle("syncing", Boolean(state.isSyncing));
  updateSyncButton();
  updateSyncBanner();
  renderSyncProgressPanel();
}

function refreshAuthStatus() {
  const enabledCount = enabledAccountsCount();

  if (accounts.length === 0) {
    elements.authStatus.textContent =
      "Add an Epic account to download replays automatically.";
    elements.authBanner.classList.remove("hidden");
  } else {
    elements.authStatus.textContent =
      `${accounts.length} account${accounts.length === 1 ? "" : "s"} linked` +
      (enabledCount > 0 ? "" : " — none enabled for sync");
    elements.authBanner.classList.toggle("hidden", enabledCount > 0);
  }

  renderAccounts();
  updateSyncButton();
}

/** @param {PublicAppConfig} nextConfig */
function fillSettingsForm(nextConfig) {
  const syncMode =
    nextConfig.syncMode === "interval"
      ? "interval"
      : nextConfig.syncMode === "manual"
        ? "manual"
        : "process";
  if (elements.syncModeProcess instanceof HTMLInputElement) {
    elements.syncModeProcess.checked = syncMode === "process";
  }
  if (elements.syncModeInterval instanceof HTMLInputElement) {
    elements.syncModeInterval.checked = syncMode === "interval";
  }
  if (elements.syncModeManual instanceof HTMLInputElement) {
    elements.syncModeManual.checked = syncMode === "manual";
  }

  const whilePlaying =
    nextConfig.processSyncWhilePlaying === "after-games" ? "after-games" : "on-close-only";
  if (elements.processSyncOnCloseOnly instanceof HTMLInputElement) {
    elements.processSyncOnCloseOnly.checked = whilePlaying === "on-close-only";
  }
  if (elements.processSyncAfterGames instanceof HTMLInputElement) {
    elements.processSyncAfterGames.checked = whilePlaying === "after-games";
  }

  elements.pollInterval.value = String(nextConfig.pollIntervalMinutes);
  if (elements.syncAfterGames instanceof HTMLInputElement) {
    elements.syncAfterGames.value = String(nextConfig.syncAfterGames ?? 20);
  }

  elements.startMinimized.checked = nextConfig.startMinimized;
  elements.minimizeOnClose.checked = nextConfig.minimizeToTrayOnClose;
  elements.launchAtLogin.checked = nextConfig.launchAtLogin;
  if (elements.autoUpdate instanceof HTMLInputElement) {
    elements.autoUpdate.checked = nextConfig.autoUpdateEnabled !== false;
  }
  elements.replayDir.value = nextConfig.replayDir;
  elements.autoUploadBallchasing.checked = nextConfig.autoUploadBallchasing;
  if (elements.deleteLocalAfterUpload) {
    elements.deleteLocalAfterUpload.checked = Boolean(
      nextConfig.deleteLocalAfterBallchasingUpload,
    );
  }
  if (elements.ballchasingToken instanceof HTMLInputElement) {
    // Token is never sent to the renderer. Leave the field alone while typing.
    elements.ballchasingToken.placeholder = nextConfig.hasBallchasingToken
      ? "Token saved — enter a new one to replace it"
      : "Paste your Ballchasing API token";
    if (document.activeElement !== elements.ballchasingToken) {
      elements.ballchasingToken.value = "";
    }
  }
  elements.ballchasingVisibility.value = nextConfig.ballchasingVisibility;
  if (elements.replaySortBy instanceof HTMLSelectElement) {
    elements.replaySortBy.value = nextConfig.replaySortBy === "import" ? "import" : "match";
  }

  updateSyncSettingsVisibility();
}

/** @param {{ state: string; version?: string; percent?: number; message?: string }} status */
function renderUpdateStatus(status) {
  if (!(elements.updateStatus instanceof HTMLElement)) {
    return;
  }

  switch (status.state) {
    case "checking":
      elements.updateStatus.textContent = "Checking for updates…";
      break;
    case "available":
      elements.updateStatus.textContent = `Update ${status.version ?? ""} available. Downloading…`;
      break;
    case "downloading":
      elements.updateStatus.textContent = `Downloading update… ${Math.round(status.percent ?? 0)}%`;
      break;
    case "downloaded":
      elements.updateStatus.textContent = `Update ${status.version ?? ""} ready. It installs when you quit Overtime.`;
      break;
    case "not-available":
      elements.updateStatus.textContent = "You're on the latest version.";
      break;
    case "disabled":
      elements.updateStatus.textContent =
        "Auto-update is off, or updates are unavailable in this build.";
      break;
    case "error":
      elements.updateStatus.textContent = status.message
        ? `Update check failed: ${status.message}`
        : "Update check failed.";
      break;
    default:
      elements.updateStatus.textContent = "";
      break;
  }
}

function updateSyncSettingsVisibility() {
  const syncMode =
    elements.syncModeManual instanceof HTMLInputElement && elements.syncModeManual.checked
      ? "manual"
      : elements.syncModeInterval instanceof HTMLInputElement && elements.syncModeInterval.checked
        ? "interval"
        : "process";

  elements.syncProcessSettings?.classList.toggle("hidden", syncMode !== "process");
  elements.syncIntervalSettings?.classList.toggle("hidden", syncMode !== "interval");

  const afterGamesSelected =
    syncMode === "process" &&
    elements.processSyncAfterGames instanceof HTMLInputElement &&
    elements.processSyncAfterGames.checked;

  if (elements.syncAfterGames instanceof HTMLInputElement) {
    elements.syncAfterGames.disabled = !afterGamesSelected;
  }

  if (!afterGamesSelected) {
    renderStatsApiStatus(null);
    return;
  }

  void refreshStatsApiStatus();
}

let statsApiCheckVersion = 0;

/** @type {import('../../dist/rocketLeagueStatsConfig.js').StatsApiCheckResult | null} */
let lastStatsApiCheckResult = null;

const STATS_API_FIX_TOOLTIP_READY =
  "Enables Rocket League to broadcast match events on your PC so Overtime can count finished online games. Restart Rocket League after applying.";
const STATS_API_FIX_TOOLTIP_GAME_RUNNING =
  "Close Rocket League before applying this fix. Rocket League reads its Stats API settings on startup, so the change only takes effect after a restart anyway.";

function isRocketLeagueRunningForStatsApiFix() {
  return Boolean(gameMonitorState?.rocketLeagueRunning ?? lastStatsApiCheckResult?.gameRunning);
}

/** @param {HTMLElement | null | undefined} panel @param {import('../../dist/rocketLeagueStatsConfig.js').StatsApiCheckResult | null} result */
function applyStatsApiPanelState(panel, result) {
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  panel.classList.remove("stats-api-panel--ready", "stats-api-panel--needs-fix");

  if (!result) {
    return;
  }

  if (result.status === "ready") {
    panel.classList.add("stats-api-panel--ready");
  } else if (result.status === "needs_fix") {
    panel.classList.add("stats-api-panel--needs-fix");
  }
}

function applyStatsApiFixUi(result) {
  const gameRunning = isRocketLeagueRunningForStatsApiFix();
  const showFix = Boolean(result?.canAutoFix);

  elements.fixStatsApiWrap?.classList.toggle("hidden", !showFix);
  elements.fixStatsApiWrap?.classList.toggle("hover-tooltip-wrap--blocked", showFix && gameRunning);

  if (elements.fixStatsApi instanceof HTMLButtonElement) {
    elements.fixStatsApi.disabled = gameRunning;
  }

  if (elements.fixStatsApiTooltipText instanceof HTMLElement) {
    elements.fixStatsApiTooltipText.textContent = gameRunning
      ? STATS_API_FIX_TOOLTIP_GAME_RUNNING
      : STATS_API_FIX_TOOLTIP_READY;
  }
}

async function refreshStatsApiStatus() {
  const version = ++statsApiCheckVersion;

  if (elements.statsApiStatus instanceof HTMLElement) {
    elements.statsApiStatus.textContent = "Checking Stats API configuration…";
    elements.statsApiStatus.className = "hint stats-api-status";
  }
  elements.fixStatsApiWrap?.classList.add("hidden");

  try {
    const result = await api.checkRlStatsApi();
    if (version !== statsApiCheckVersion) {
      return;
    }
    renderStatsApiStatus(result);
  } catch (error) {
    if (version !== statsApiCheckVersion) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    renderStatsApiStatus({
      status: "needs_fix",
      message: "Could not check Stats API configuration.",
      detail: message,
      configPath: "",
      canAutoFix: true,
      gameRunning: isRocketLeagueRunningForStatsApiFix(),
    });
  }
}

/** @param {import('../../dist/rocketLeagueStatsConfig.js').StatsApiCheckResult | null} result */
function renderStatsApiStatus(result) {
  lastStatsApiCheckResult = result;

  if (!(elements.statsApiStatus instanceof HTMLElement)) {
    return;
  }

  if (!result) {
    elements.statsApiStatus.textContent = "";
    elements.statsApiStatus.className = "hint stats-api-status";
    elements.fixStatsApiWrap?.classList.add("hidden");
    applyStatsApiPanelState(elements.statsApiCheckRow, null);
    return;
  }

  const parts = [result.message];
  if (result.detail) {
    parts.push(result.detail);
  }
  if (result.canAutoFix && isRocketLeagueRunningForStatsApiFix()) {
    parts.push("Close Rocket League to apply the fix.");
  }

  elements.statsApiStatus.textContent = parts.join(" ");
  elements.statsApiStatus.className = `hint stats-api-status stats-api-status--${result.status}`;
  applyStatsApiPanelState(elements.statsApiCheckRow, result);
  applyStatsApiFixUi(result);
}

async function runStatsApiFix() {
  if (!(elements.fixStatsApi instanceof HTMLButtonElement)) {
    return;
  }

  if (isRocketLeagueRunningForStatsApiFix()) {
    return;
  }

  const button = elements.fixStatsApi;
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Fixing…";

  try {
    const result = await api.fixRlStatsApi();
    renderStatsApiStatus(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderStatsApiStatus({
      status: "needs_fix",
      message: "Could not enable the Stats API.",
      detail: message,
      configPath: "",
      canAutoFix: false,
      gameRunning: isRocketLeagueRunningForStatsApiFix(),
    });
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

/** @returns {Partial<AppConfig>} */
function readSettingsForm() {
  const syncMode =
    elements.syncModeManual instanceof HTMLInputElement && elements.syncModeManual.checked
      ? "manual"
      : elements.syncModeInterval instanceof HTMLInputElement && elements.syncModeInterval.checked
        ? "interval"
        : "process";
  const processSyncWhilePlaying =
    elements.processSyncAfterGames instanceof HTMLInputElement &&
    elements.processSyncAfterGames.checked
      ? "after-games"
      : "on-close-only";

  return {
    syncMode,
    pollIntervalMinutes: Math.max(
      1,
      Number.parseInt(elements.pollInterval.value, 10) || 150,
    ),
    processSyncWhilePlaying,
    syncAfterGames: Math.max(
      1,
      Number.parseInt(
        elements.syncAfterGames instanceof HTMLInputElement
          ? elements.syncAfterGames.value
          : "20",
        10,
      ) || 20,
    ),
    startMinimized: elements.startMinimized.checked,
    minimizeToTrayOnClose: elements.minimizeOnClose.checked,
    launchAtLogin: elements.launchAtLogin.checked,
    autoUpdateEnabled:
      elements.autoUpdate instanceof HTMLInputElement
        ? elements.autoUpdate.checked
        : true,
    autoUploadBallchasing: elements.autoUploadBallchasing.checked,
    deleteLocalAfterBallchasingUpload: elements.deleteLocalAfterUpload?.checked ?? false,
    ballchasingToken: elements.ballchasingToken.value.trim(),
    ballchasingVisibility: /** @type {AppConfig["ballchasingVisibility"]} */ (
      elements.ballchasingVisibility.value
    ),
  };
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let saveSettingsTimer;

async function saveSettings() {
  const form = readSettingsForm();
  const submittedToken = Boolean(form.ballchasingToken?.trim());
  config = await api.setConfig(form);
  fillSettingsForm(config);
  if (
    submittedToken &&
    elements.ballchasingToken instanceof HTMLInputElement &&
    document.activeElement !== elements.ballchasingToken
  ) {
    elements.ballchasingToken.value = "";
  }
}

function scheduleSaveSettings() {
  clearTimeout(saveSettingsTimer);
  saveSettingsTimer = setTimeout(() => {
    void saveSettings();
  }, 400);
}

async function afterAccountAdded() {
  accounts = await api.getAccounts();
  refreshAuthStatus();
  updateStatusLine();
  clearReplayPageCache();
  await loadReplayLibrary({ page: 1, forceRefresh: true });
}

async function addEpicAccount(button) {
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Waiting for Epic sign-in…";
  elements.authStatus.textContent =
    "Your browser will open to Epic. Enter the code shown in the dialog when prompted.";

  try {
    await api.addEpicAccount();
    await afterAccountAdded();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("cancelled")) {
      elements.authStatus.textContent = message;
    } else {
      refreshAuthStatus();
    }
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function bootstrap() {
  try {
    platformInfo = await api.getPlatformInfo();
    config = await api.getConfig();
    state = await api.getState();
    accounts = await api.getAccounts();
    fillSettingsForm(config);
    renderGameMonitor(await api.getGameMonitorState());
    void api.getUpdateStatus().then(renderUpdateStatus);
    void loadReplayLibrary({ page: 1 });
    void refreshBallchasingViewerAvailability();
    if (platformInfo.inGameReplaySupported) {
      setInterval(() => {
        void refreshBallchasingViewerAvailability();
      }, 30000);
    }
    updateStatusLine();
    refreshAuthStatus();
    if (!config.onboardingCompleted) {
      showOnboardingStep("welcome");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    elements.statusLine.textContent = `Failed to start: ${message}`;
    elements.syncBanner.textContent = message;
    elements.syncBanner.classList.remove("hidden");
    elements.syncBanner.classList.add("error");
    console.error(error);
  }
}

/** @typedef {"welcome" | "account" | "skip-confirm" | "sync" | "process" | "ballchasing" | "preferences"} OnboardingStep */

/** @type {OnboardingStep | null} */
let onboardingStepBeforeEpicAuth = null;

function isOnboardingVisible() {
  return (
    elements.onboardingDialog instanceof HTMLElement &&
    !elements.onboardingDialog.classList.contains("hidden")
  );
}

function hideOnboardingForEpicAuth() {
  if (!isOnboardingVisible()) {
    onboardingStepBeforeEpicAuth = null;
    return;
  }

  onboardingStepBeforeEpicAuth = currentOnboardingStep;
  elements.onboardingDialog?.classList.add("hidden");
  elements.onboardingDialog?.setAttribute("aria-hidden", "true");
}

function restoreOnboardingAfterEpicAuth() {
  if (!onboardingStepBeforeEpicAuth) {
    return;
  }

  showOnboardingStep(onboardingStepBeforeEpicAuth);
  onboardingStepBeforeEpicAuth = null;
}

/** @type {OnboardingStep} */
let currentOnboardingStep = "welcome";

let onboardingAccountSkipped = false;

/** @type {import('../../dist/rocketLeagueStatsConfig.js').StatsApiCheckResult | null} */
let lastOnboardingStatsApiResult = null;

let onboardingStatsApiCheckVersion = 0;

/** @type {ReturnType<typeof setInterval> | null} */
let onboardingGameMonitorFastPollTimer = null;

const ONBOARDING_GAME_MONITOR_FAST_POLL_MS = 1000;

/** @type {string | null} */
let onboardingBallchasingValidatedToken = null;

function stopOnboardingGameMonitorFastPoll() {
  if (onboardingGameMonitorFastPollTimer) {
    clearInterval(onboardingGameMonitorFastPollTimer);
    onboardingGameMonitorFastPollTimer = null;
  }
}

function updateOnboardingGameMonitorFastPoll() {
  const shouldPollFast =
    currentOnboardingStep === "process" &&
    isRocketLeagueRunningForStatsApiFix() &&
    Boolean(lastOnboardingStatsApiResult?.canAutoFix);

  if (!shouldPollFast) {
    stopOnboardingGameMonitorFastPoll();
    return;
  }

  if (onboardingGameMonitorFastPollTimer) {
    return;
  }

  onboardingGameMonitorFastPollTimer = setInterval(() => {
    if (currentOnboardingStep !== "process") {
      stopOnboardingGameMonitorFastPoll();
      return;
    }

    void api.getGameMonitorState().then(renderGameMonitor);
  }, ONBOARDING_GAME_MONITOR_FAST_POLL_MS);
}

function isOnboardingAfterGamesSelected() {
  return (
    elements.onboardingProcessAfterGames instanceof HTMLInputElement &&
    elements.onboardingProcessAfterGames.checked
  );
}

function isOnboardingProcessContinueBlocked() {
  if (!isOnboardingAfterGamesSelected()) {
    return false;
  }

  return !lastOnboardingStatsApiResult || lastOnboardingStatsApiResult.status !== "ready";
}

function updateOnboardingProcessContinueButton() {
  if (!(elements.onboardingNextProcess instanceof HTMLButtonElement)) {
    return;
  }

  const blocked = isOnboardingProcessContinueBlocked();
  elements.onboardingNextProcess.disabled = blocked;
  elements.onboardingNextProcess.title = blocked
    ? "Fix the Stats API configuration before continuing with sync after games."
    : "";
}

function resetOnboardingBallchasingTokenValidation() {
  onboardingBallchasingValidatedToken = null;
  if (elements.onboardingBallchasingTokenStatus instanceof HTMLElement) {
    elements.onboardingBallchasingTokenStatus.textContent = "";
  }
  updateOnboardingBallchasingContinueButton();
}

function updateOnboardingBallchasingContinueButton() {
  if (!(elements.onboardingNextBallchasing instanceof HTMLButtonElement)) {
    return;
  }

  const token = elements.onboardingBallchasingToken?.value.trim() ?? "";
  const autoUpload = Boolean(elements.onboardingAutoUpload?.checked);
  const validated = Boolean(token) && token === onboardingBallchasingValidatedToken;
  const blocked = (Boolean(token) && !validated) || (autoUpload && !token);

  elements.onboardingNextBallchasing.disabled = blocked;
  elements.onboardingNextBallchasing.title = autoUpload && !token
    ? "Add and validate a Ballchasing token to enable automatic uploads."
    : blocked
      ? "Validate your Ballchasing token before continuing."
      : "";
}

async function validateOnboardingBallchasingToken() {
  const token = elements.onboardingBallchasingToken?.value.trim() ?? "";
  if (!token) {
    resetOnboardingBallchasingTokenValidation();
    if (elements.onboardingBallchasingTokenStatus instanceof HTMLElement) {
      elements.onboardingBallchasingTokenStatus.textContent = "Enter a token first.";
    }
    return false;
  }

  if (!(elements.onboardingValidateBallchasingToken instanceof HTMLButtonElement)) {
    return false;
  }

  const button = elements.onboardingValidateBallchasingToken;
  button.disabled = true;
  if (elements.onboardingBallchasingTokenStatus instanceof HTMLElement) {
    elements.onboardingBallchasingTokenStatus.textContent = "Validating…";
  }

  try {
    const valid = await api.validateBallchasingToken(token);
    if (valid) {
      onboardingBallchasingValidatedToken = token;
      if (elements.onboardingBallchasingTokenStatus instanceof HTMLElement) {
        elements.onboardingBallchasingTokenStatus.textContent = "Token looks valid.";
      }
    } else {
      onboardingBallchasingValidatedToken = null;
      if (elements.onboardingBallchasingTokenStatus instanceof HTMLElement) {
        elements.onboardingBallchasingTokenStatus.textContent =
          "That token did not work. Check that you copied it from ballchasing.com/upload.";
      }
    }
    updateOnboardingBallchasingContinueButton();
    return valid;
  } catch (error) {
    onboardingBallchasingValidatedToken = null;
    const message = error instanceof Error ? error.message : String(error);
    if (elements.onboardingBallchasingTokenStatus instanceof HTMLElement) {
      elements.onboardingBallchasingTokenStatus.textContent = message;
    }
    updateOnboardingBallchasingContinueButton();
    return false;
  } finally {
    button.disabled = false;
  }
}

const ONBOARDING_STEP_ELEMENTS = {
  welcome: () => elements.onboardingStepWelcome,
  account: () => elements.onboardingStepAccount,
  "skip-confirm": () => elements.onboardingStepSkipConfirm,
  sync: () => elements.onboardingStepSync,
  process: () => elements.onboardingStepProcess,
  ballchasing: () => elements.onboardingStepBallchasing,
  preferences: () => elements.onboardingStepPreferences,
};

function readOnboardingSyncMode() {
  if (elements.onboardingSyncManual instanceof HTMLInputElement && elements.onboardingSyncManual.checked) {
    return "manual";
  }
  if (elements.onboardingSyncInterval instanceof HTMLInputElement && elements.onboardingSyncInterval.checked) {
    return "interval";
  }
  return "process";
}

function readOnboardingProcessSyncWhilePlaying() {
  return elements.onboardingProcessAfterGames instanceof HTMLInputElement &&
    elements.onboardingProcessAfterGames.checked
    ? "after-games"
    : "on-close-only";
}

function readOnboardingSyncAfterGames() {
  return Math.max(
    1,
    Number.parseInt(
      elements.onboardingSyncAfterGames instanceof HTMLInputElement
        ? elements.onboardingSyncAfterGames.value
        : "20",
      10,
    ) || 20,
  );
}

/** @returns {OnboardingStep[]} */
function getOnboardingStepOrder() {
  if (onboardingAccountSkipped) {
    return ["welcome", "account", "ballchasing", "preferences"];
  }

  const order = /** @type {OnboardingStep[]} */ (["welcome", "account", "sync"]);
  if (readOnboardingSyncMode() === "process") {
    order.push("process");
  }
  order.push("ballchasing", "preferences");
  return order;
}

/** @param {OnboardingStep} step */
function updateOnboardingProgress(step) {
  if (!(elements.onboardingProgress instanceof HTMLElement)) {
    return;
  }

  if (step === "skip-confirm") {
    elements.onboardingProgress.classList.add("hidden");
    elements.onboardingProgress.setAttribute("aria-hidden", "true");
    return;
  }

  const order = getOnboardingStepOrder();
  const index = order.indexOf(step);
  if (index < 0) {
    elements.onboardingProgress.classList.add("hidden");
    return;
  }

  elements.onboardingProgress.textContent = `Step ${index + 1} of ${order.length}`;
  elements.onboardingProgress.classList.remove("hidden");
  elements.onboardingProgress.setAttribute("aria-hidden", "false");
}

function updateOnboardingProcessVisibility() {
  const afterGamesSelected =
    elements.onboardingProcessAfterGames instanceof HTMLInputElement &&
    elements.onboardingProcessAfterGames.checked;

  elements.onboardingStatsApiRow?.classList.toggle("hidden", !afterGamesSelected);

  if (elements.onboardingSyncAfterGames instanceof HTMLInputElement) {
    elements.onboardingSyncAfterGames.disabled = !afterGamesSelected;
  }

  if (afterGamesSelected) {
    void refreshOnboardingStatsApiStatus();
  } else {
    renderOnboardingStatsApiStatus(null);
  }

  updateOnboardingProcessContinueButton();
}

function applyOnboardingStatsApiFixUi(result) {
  const gameRunning = isRocketLeagueRunningForStatsApiFix();
  const showFix = Boolean(result?.canAutoFix);

  elements.onboardingFixStatsApiWrap?.classList.toggle("hidden", !showFix);
  elements.onboardingFixStatsApiWrap?.classList.toggle(
    "hover-tooltip-wrap--blocked",
    showFix && gameRunning,
  );

  if (elements.onboardingFixStatsApi instanceof HTMLButtonElement) {
    elements.onboardingFixStatsApi.disabled = gameRunning;
  }

  if (elements.onboardingFixStatsApiTooltipText instanceof HTMLElement) {
    elements.onboardingFixStatsApiTooltipText.textContent = gameRunning
      ? STATS_API_FIX_TOOLTIP_GAME_RUNNING
      : STATS_API_FIX_TOOLTIP_READY;
  }
}

/** @param {import('../../dist/rocketLeagueStatsConfig.js').StatsApiCheckResult | null} result */
function renderOnboardingStatsApiStatus(result) {
  lastOnboardingStatsApiResult = result;

  if (!(elements.onboardingStatsApiStatus instanceof HTMLElement)) {
    return;
  }

  if (!result) {
    elements.onboardingStatsApiStatus.textContent = "";
    elements.onboardingStatsApiStatus.className = "hint stats-api-status";
    elements.onboardingFixStatsApiWrap?.classList.add("hidden");
    applyStatsApiPanelState(elements.onboardingStatsApiRow, null);
    stopOnboardingGameMonitorFastPoll();
    updateOnboardingProcessContinueButton();
    return;
  }

  const parts = [result.message];
  if (result.detail) {
    parts.push(result.detail);
  }
  if (result.canAutoFix && isRocketLeagueRunningForStatsApiFix()) {
    parts.push("Close Rocket League to apply the fix.");
  }

  elements.onboardingStatsApiStatus.textContent = parts.join(" ");
  elements.onboardingStatsApiStatus.className = `hint stats-api-status stats-api-status--${result.status}`;
  applyStatsApiPanelState(elements.onboardingStatsApiRow, result);
  applyOnboardingStatsApiFixUi(result);
  updateOnboardingGameMonitorFastPoll();
  updateOnboardingProcessContinueButton();
}

async function refreshOnboardingStatsApiStatus() {
  const version = ++onboardingStatsApiCheckVersion;

  if (elements.onboardingStatsApiStatus instanceof HTMLElement) {
    elements.onboardingStatsApiStatus.textContent = "Checking Stats API configuration…";
    elements.onboardingStatsApiStatus.className = "hint stats-api-status";
  }
  elements.onboardingFixStatsApiWrap?.classList.add("hidden");
  updateOnboardingProcessContinueButton();

  try {
    const result = await api.checkRlStatsApi();
    if (version !== onboardingStatsApiCheckVersion) {
      return;
    }
    renderOnboardingStatsApiStatus(result);
  } catch (error) {
    if (version !== onboardingStatsApiCheckVersion) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    renderOnboardingStatsApiStatus({
      status: "needs_fix",
      message: "Could not check Stats API configuration.",
      detail: message,
      configPath: "",
      canAutoFix: true,
      gameRunning: isRocketLeagueRunningForStatsApiFix(),
    });
  }
}

async function runOnboardingStatsApiFix() {
  if (!(elements.onboardingFixStatsApi instanceof HTMLButtonElement)) {
    return;
  }

  if (isRocketLeagueRunningForStatsApiFix()) {
    return;
  }

  const button = elements.onboardingFixStatsApi;
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "Fixing…";

  try {
    const result = await api.fixRlStatsApi();
    renderOnboardingStatsApiStatus(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    renderOnboardingStatsApiStatus({
      status: "needs_fix",
      message: "Could not enable the Stats API.",
      detail: message,
      configPath: "",
      canAutoFix: false,
      gameRunning: isRocketLeagueRunningForStatsApiFix(),
    });
  } finally {
    button.disabled = isRocketLeagueRunningForStatsApiFix();
    button.textContent = previousText;
  }
}

/** @param {OnboardingStep} step */
function showOnboardingStep(step) {
  if (!elements.onboardingDialog) {
    return;
  }

  currentOnboardingStep = step;

  for (const [key, getElement] of Object.entries(ONBOARDING_STEP_ELEMENTS)) {
    const element = getElement();
    element?.classList.toggle("hidden", key !== step);
  }

  updateOnboardingProgress(step);
  elements.onboardingDialog.classList.remove("hidden");
  elements.onboardingDialog.setAttribute("aria-hidden", "false");

  if (step === "process") {
    updateOnboardingProcessVisibility();
    updateOnboardingGameMonitorFastPoll();
  } else {
    stopOnboardingGameMonitorFastPoll();
  }

  if (step === "ballchasing") {
    updateOnboardingBallchasingContinueButton();
  }

  if (step === "preferences" && lastOnboardingStatsApiResult?.canAutoFix) {
    applyOnboardingStatsApiFixUi(lastOnboardingStatsApiResult);
  }
}

function hideOnboarding() {
  stopOnboardingGameMonitorFastPoll();
  elements.onboardingDialog?.classList.add("hidden");
  elements.onboardingDialog?.setAttribute("aria-hidden", "true");
}

/** @returns {Partial<AppConfig>} */
function readOnboardingConfig() {
  /** @type {Partial<AppConfig>} */
  const partial = {
    onboardingCompleted: true,
    ballchasingToken: elements.onboardingBallchasingToken?.value.trim() ?? "",
    autoUploadBallchasing: Boolean(elements.onboardingAutoUpload?.checked),
    startMinimized: Boolean(elements.onboardingStartMinimized?.checked),
    minimizeToTrayOnClose: Boolean(elements.onboardingMinimizeOnClose?.checked),
    launchAtLogin: Boolean(elements.onboardingLaunchAtLogin?.checked),
    autoUpdateEnabled: elements.onboardingAutoUpdate
      ? Boolean(elements.onboardingAutoUpdate.checked)
      : true,
  };

  if (onboardingAccountSkipped) {
    partial.syncMode = "manual";
    return partial;
  }

  partial.syncMode = readOnboardingSyncMode();

  if (partial.syncMode === "process") {
    partial.processSyncWhilePlaying = readOnboardingProcessSyncWhilePlaying();
    partial.syncAfterGames = readOnboardingSyncAfterGames();
  }

  return partial;
}

async function finishOnboarding() {
  const shouldSyncAfterSetup = !onboardingAccountSkipped && accounts.length > 0;

  config = await api.setConfig(readOnboardingConfig());
  fillSettingsForm(config);
  hideOnboarding();
  refreshAuthStatus();
  renderGameMonitor(await api.getGameMonitorState());
  clearReplayPageCache();
  void loadReplayLibrary({ page: 1, forceRefresh: true });

  if (shouldSyncAfterSetup) {
    void api.syncNow({ allowWhileGameRunning: true });
  }
}

/** @param {OnboardingStep} step */
function goToNextOnboardingStep(step) {
  switch (step) {
    case "welcome":
      showOnboardingStep("account");
      break;
    case "sync":
      showOnboardingStep(readOnboardingSyncMode() === "process" ? "process" : "ballchasing");
      break;
    case "process":
      if (isOnboardingProcessContinueBlocked()) {
        return;
      }
      showOnboardingStep("ballchasing");
      break;
    case "ballchasing":
      showOnboardingStep("preferences");
      break;
    default:
      break;
  }
}

/** @param {OnboardingStep} step */
function goToPreviousOnboardingStep(step) {
  switch (step) {
    case "account":
      showOnboardingStep("welcome");
      break;
    case "skip-confirm":
      showOnboardingStep("account");
      break;
    case "sync":
      showOnboardingStep("account");
      break;
    case "process":
      showOnboardingStep("sync");
      break;
    case "ballchasing":
      if (onboardingAccountSkipped) {
        onboardingAccountSkipped = false;
        showOnboardingStep("account");
      } else if (readOnboardingSyncMode() === "process") {
        showOnboardingStep("process");
      } else {
        showOnboardingStep("sync");
      }
      break;
    case "preferences":
      showOnboardingStep("ballchasing");
      break;
    default:
      break;
  }
}

window.addEventListener("focus", () => {
  if (platformInfo.inGameReplaySupported) {
    void refreshBallchasingViewerAvailability();
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("active", button === tab);
    });

    const target = tab.dataset.tab;
    document.getElementById("replays-panel").classList.toggle(
      "active",
      target === "replays",
    );
    document.getElementById("settings-panel").classList.toggle(
      "active",
      target === "settings",
    );
  });
});

elements.replaySearch.addEventListener("input", () => {
  closeReplayMenu();
  closeShareMenu();
  scheduleReplayLibraryReload(false);
});

elements.syncedOnly.addEventListener("change", () => {
  clearReplayPageCache();
  void loadReplayLibrary({ page: 1, forceRefresh: true });
});

elements.replaySortBy?.addEventListener("change", async () => {
  if (!(elements.replaySortBy instanceof HTMLSelectElement)) {
    return;
  }

  config = await api.setConfig({
    replaySortBy:
      elements.replaySortBy.value === "import" ? "import" : "match",
  });
  fillSettingsForm(config);
  clearReplayPageCache();
  void loadReplayLibrary({ page: 1, forceRefresh: true });
});

elements.replayPrev.addEventListener("click", () => {
  if (replayLibrary && replayLibrary.page > 1) {
    void loadReplayLibrary({ page: replayLibrary.page - 1 });
  }
});

elements.replayNext.addEventListener("click", () => {
  if (replayLibrary && replayLibrary.page < replayLibrary.totalPages) {
    void loadReplayLibrary({ page: replayLibrary.page + 1 });
  }
});

elements.replayList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const actionButton = target.closest("button[data-action]");
  if (actionButton instanceof HTMLButtonElement) {
    event.stopPropagation();
    const action = actionButton.dataset.action;
    if (action === "toggle-replay-menu" && actionButton.dataset.matchGuid) {
      setReplayMenuOpen(actionButton.dataset.matchGuid);
      return;
    }
    if (action === "toggle-share-menu" && actionButton.dataset.matchGuid) {
      setShareMenuOpen(actionButton.dataset.matchGuid);
      return;
    }
    if (action === "show" && actionButton.dataset.path) {
      closeReplayMenu();
      closeShareMenu();
      await api.showItemInFolder(actionButton.dataset.path);
      return;
    }
    if (action === "open-url" && actionButton.dataset.url) {
      await api.openExternal(actionButton.dataset.url);
      return;
    }
    if (action === "upload-ballchasing" && actionButton.dataset.matchGuid) {
      const replay = visibleReplays.find(
        (item) => item.matchGuid === actionButton.dataset.matchGuid,
      );
      if (replay) {
        await uploadReplayBallchasing(replay);
      }
      return;
    }
    if (action === "play-in-game" && actionButton.dataset.matchGuid) {
      const replay = visibleReplays.find(
        (item) => item.matchGuid === actionButton.dataset.matchGuid,
      );
      if (replay) {
        await playReplayInGame(replay);
      }
      return;
    }
    if (action === "rename-replay" && actionButton.dataset.matchGuid) {
      closeReplayMenu();
      const replay = findReplayByGuid(actionButton.dataset.matchGuid);
      if (replay) {
        openRenameReplayDialog(replay);
      }
      return;
    }
    if (action === "delete-replay" && actionButton.dataset.matchGuid) {
      closeReplayMenu();
      const replay = findReplayByGuid(actionButton.dataset.matchGuid);
      if (replay) {
        openDeleteReplayDialog([replay]);
      }
      return;
    }
    return;
  }

  const card = target.closest(".replay-card");
  if (!(card instanceof HTMLElement) || !card.dataset.matchGuid) {
    return;
  }

  if (target.closest(".replay-select")) {
    return;
  }

  closeReplayMenu();
  closeShareMenu();

  const matchGuid = card.dataset.matchGuid;

  if (replaySelectionMode) {
    if (selectedReplayGuids.has(matchGuid)) {
      selectedReplayGuids.delete(matchGuid);
    } else {
      selectedReplayGuids.add(matchGuid);
    }

    updateReplaySelectionUi();
    return;
  }

  if (expandedReplays.has(matchGuid)) {
    expandedReplays.delete(matchGuid);
  } else {
    expandedReplays.add(matchGuid);
  }

  renderReplaysFromLibrary();
});

elements.replayList.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.classList.contains("replay-select-input")) {
    return;
  }

  event.stopPropagation();
  const matchGuid = target.dataset.matchGuid;
  if (!matchGuid) {
    return;
  }

  if (target.checked) {
    selectedReplayGuids.add(matchGuid);
  } else {
    selectedReplayGuids.delete(matchGuid);
  }

  updateReplaySelectionUi();
});

elements.replaySelectAll?.addEventListener("change", () => {
  if (!(elements.replaySelectAll instanceof HTMLInputElement)) {
    return;
  }

  for (const replay of visibleReplays) {
    if (elements.replaySelectAll.checked) {
      selectedReplayGuids.add(replay.matchGuid);
    } else {
      selectedReplayGuids.delete(replay.matchGuid);
    }
  }

  renderReplaysFromLibrary();
});

elements.clearReplaySelection?.addEventListener("click", () => {
  clearReplaySelection();
  renderReplaysFromLibrary();
});

elements.toggleReplaySelection?.addEventListener("click", () => {
  setReplaySelectionMode(!replaySelectionMode);
});

elements.deleteSelectedReplays?.addEventListener("click", () => {
  const replaysToDelete = (state?.savedReplays ?? []).filter((replay) =>
    selectedReplayGuids.has(replay.matchGuid),
  );

  if (replaysToDelete.length === 0) {
    return;
  }

  openDeleteReplayDialog(replaysToDelete);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (openReplayMenuGuid) {
    if (elements.replayMenuPortal.contains(target)) {
      return;
    }

    if (target instanceof Element && target.closest('[data-action="toggle-replay-menu"]')) {
      return;
    }

    closeReplayMenu();
  }

  if (openShareMenuGuid) {
    if (elements.shareMenuPortal.contains(target)) {
      return;
    }

    if (target instanceof Element && target.closest('[data-action="toggle-share-menu"]')) {
      return;
    }

    closeShareMenu();
  }
});

elements.replayMenuPortal.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const actionButton = target.closest("button[data-action]");
  if (!(actionButton instanceof HTMLButtonElement) || actionButton.disabled) {
    return;
  }

  event.stopPropagation();
  const action = actionButton.dataset.action;

  if (action === "show" && actionButton.dataset.path) {
    closeReplayMenu();
    await api.showItemInFolder(actionButton.dataset.path);
    return;
  }

  if (action === "rename-replay" && actionButton.dataset.matchGuid) {
    closeReplayMenu();
    const replay = findReplayByGuid(actionButton.dataset.matchGuid);
    if (replay) {
      openRenameReplayDialog(replay);
    }
    return;
  }

  if (action === "delete-replay" && actionButton.dataset.matchGuid) {
    closeReplayMenu();
    const replay = findReplayByGuid(actionButton.dataset.matchGuid);
    if (replay) {
      openDeleteReplayDialog([replay]);
    }
    return;
  }

  if (action === "restore-cloud-replay" && actionButton.dataset.matchGuid) {
    closeReplayMenu();
    const replay = findReplayByGuid(actionButton.dataset.matchGuid);
    if (replay) {
      await restoreCloudReplay(replay);
    }
    return;
  }

  if (action === "remove-replay-local-file" && actionButton.dataset.matchGuid) {
    closeReplayMenu();
    const replay = findReplayByGuid(actionButton.dataset.matchGuid);
    if (replay) {
      openRemoveLocalFileDialog(replay);
    }
  }
});

elements.shareMenuPortal.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const actionButton = target.closest("button[data-action]");
  if (!(actionButton instanceof HTMLButtonElement) || actionButton.disabled) {
    return;
  }

  event.stopPropagation();
  const action = actionButton.dataset.action;

  if (action === "copy-ballchasing-url" && actionButton.dataset.matchGuid) {
    closeShareMenu();
    const replay = findReplayByGuid(actionButton.dataset.matchGuid);
    if (replay) {
      await copyBallchasingShareUrl(replay);
    }
    return;
  }

  if (action === "copy-replay-file" && actionButton.dataset.matchGuid) {
    closeShareMenu();
    const replay = findReplayByGuid(actionButton.dataset.matchGuid);
    if (replay) {
      await copyReplayFile(replay);
    }
    return;
  }

  if (action === "show" && actionButton.dataset.path) {
    closeShareMenu();
    await api.showItemInFolder(actionButton.dataset.path);
  }
});

elements.replayList.addEventListener("mouseover", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const proTag = target.closest(".replay-pro-tag");
  if (!(proTag instanceof HTMLElement)) {
    return;
  }

  const playerId = proTag.dataset.playerId ?? "";
  const playerName = proTag.dataset.playerName ?? "";
  const tooltipProfile = getProPlayerTooltipProfile(playerId, playerName);
  if (!tooltipProfile) {
    return;
  }

  showProPlayerTooltip(proTag, tooltipProfile);
});

elements.replayList.addEventListener("mouseout", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const proTag = target.closest(".replay-pro-tag");
  if (!(proTag instanceof HTMLElement)) {
    return;
  }

  const related = event.relatedTarget;
  if (
    related instanceof Node &&
    (proTag.contains(related) || elements.proPlayerTooltipPortal.contains(related))
  ) {
    return;
  }

  hideProPlayerTooltip();
});

window.addEventListener(
  "scroll",
  () => {
    hideProPlayerTooltip();
    if (openReplayMenuGuid) {
      positionReplayMenuPortal();
    }
    if (openShareMenuGuid) {
      positionShareMenuPortal();
    }
  },
  true,
);

window.addEventListener("resize", () => {
  hideProPlayerTooltip();
  if (openReplayMenuGuid) {
    positionReplayMenuPortal();
  }
  if (openShareMenuGuid) {
    positionShareMenuPortal();
  }
});

elements.accountsList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const accountId = target.dataset.removeAccount;
  if (!accountId) {
    return;
  }

  accounts = await api.removeAccount(accountId);
  refreshAuthStatus();
  updateStatusLine();
});

elements.accountsList.addEventListener("change", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const accountId = target.dataset.accountId;
  if (!accountId) {
    return;
  }

  accounts = await api.setAccountEnabled(accountId, target.checked);
  refreshAuthStatus();
  updateStatusLine();
});

elements.syncNow.addEventListener("click", async () => {
  if (!canSync()) {
    return;
  }

  try {
    const result = await api.syncNow();
    state = result.state;
    accounts = result.accounts;
    await loadReplayLibrary({ page: replayPage });
    updateStatusLine();
    refreshAuthStatus();
  } catch (error) {
    if (state) {
      state.lastSyncError = error instanceof Error ? error.message : String(error);
      updateStatusLine();
    }
  }
});

elements.settingsForm.addEventListener("change", () => {
  void saveSettings();
});

elements.checkForUpdates?.addEventListener("click", async () => {
  if (!(elements.checkForUpdates instanceof HTMLButtonElement)) {
    return;
  }
  elements.checkForUpdates.disabled = true;
  try {
    const status = await api.checkForUpdates();
    renderUpdateStatus(status);
  } catch (error) {
    renderUpdateStatus({
      state: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    elements.checkForUpdates.disabled = false;
  }
});

elements.pollInterval.addEventListener("input", scheduleSaveSettings);
elements.syncModeProcess?.addEventListener("change", () => {
  updateSyncSettingsVisibility();
  scheduleSaveSettings();
});
elements.syncModeInterval?.addEventListener("change", () => {
  updateSyncSettingsVisibility();
  scheduleSaveSettings();
});
elements.syncModeManual?.addEventListener("change", () => {
  updateSyncSettingsVisibility();
  scheduleSaveSettings();
});
elements.processSyncOnCloseOnly?.addEventListener("change", () => {
  updateSyncSettingsVisibility();
  scheduleSaveSettings();
});
elements.processSyncAfterGames?.addEventListener("change", () => {
  updateSyncSettingsVisibility();
  scheduleSaveSettings();
});
elements.syncAfterGames?.addEventListener("input", scheduleSaveSettings);
elements.syncAfterGames?.addEventListener("click", (event) => {
  event.stopPropagation();
});
elements.syncAfterGames?.addEventListener("focus", () => {
  if (elements.processSyncAfterGames instanceof HTMLInputElement) {
    elements.processSyncAfterGames.checked = true;
    updateSyncSettingsVisibility();
  }
});
elements.fixStatsApi?.addEventListener("click", (event) => {
  event.stopPropagation();
  event.preventDefault();
  void runStatsApiFix();
});
elements.statsApiLearnMore?.addEventListener("click", (event) => {
  event.stopPropagation();
  event.preventDefault();
  void api.openExternal("https://www.rocketleague.com/en/developer/stats-api");
});
elements.statsApiCheckRow?.addEventListener("click", (event) => {
  event.stopPropagation();
});
elements.ballchasingToken.addEventListener("input", scheduleSaveSettings);

elements.browseReplayDir.addEventListener("click", async () => {
  const nextConfig = await api.selectReplayDir();
  if (nextConfig) {
    config = nextConfig;
    fillSettingsForm(config);
    await loadReplayLibrary({ page: 1 });
  }
});

async function importReplayPaths(sourcePaths) {
  if (!sourcePaths.length) {
    return;
  }

  setImportBusy(true, "Importing…");

  try {
    const result = await api.importReplayFiles(sourcePaths);
    showImportResult(result);
    await loadReplayLibrary({ page: 1 });
  } finally {
    setImportBusy(false);
  }
}

/** @param {{ imported: SavedReplayRecord[]; errors: string[] }} result */
function showImportResult(result) {
  if (result.errors.length > 0 && result.imported.length === 0) {
    elements.syncBanner.textContent = result.errors.join(" · ");
    elements.syncBanner.classList.remove("hidden");
    elements.syncBanner.classList.add("error");
    return;
  }

  if (result.errors.length > 0) {
    elements.syncBanner.textContent = `Imported ${result.imported.length} replay${result.imported.length === 1 ? "" : "s"} with ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}.`;
    elements.syncBanner.classList.remove("hidden", "error");
    return;
  }

  if (result.imported.length > 0) {
    elements.syncBanner.textContent = `Imported ${result.imported.length} replay${result.imported.length === 1 ? "" : "s"}.`;
    elements.syncBanner.classList.remove("hidden", "error");
  }
}

function setImportBusy(busy, label = "Import Replay") {
  elements.importReplay.disabled = busy;
  elements.importReplayMenu.disabled = busy;
  elements.importReplayBallchasing.disabled = busy;
  elements.importReplay.textContent = busy ? label : "Import Replay";
  elements.importReplayButton.classList.toggle("is-disabled", busy);
}

function setImportDropdownOpen(open) {
  elements.importReplayDropdown.classList.toggle("hidden", !open);
  elements.importReplayMenu.setAttribute("aria-expanded", open ? "true" : "false");
}

function openBallchasingImportDialog() {
  setImportDropdownOpen(false);
  elements.ballchasingImportUrl.value = "";
  elements.ballchasingImportDialog.classList.remove("hidden");
  elements.ballchasingImportDialog.setAttribute("aria-hidden", "false");
  elements.ballchasingImportUrl.focus();
}

function closeBallchasingImportDialog() {
  elements.ballchasingImportDialog.classList.add("hidden");
  elements.ballchasingImportDialog.setAttribute("aria-hidden", "true");
}

async function importReplayFromBallchasingUrl(url) {
  setImportBusy(true, "Importing…");
  closeBallchasingImportDialog();
  elements.ballchasingImportProgress.classList.add("hidden");
  elements.ballchasingImportProgress.textContent = "";

  try {
    const result = await api.importReplayFromBallchasing(url);
    showImportResult(result);
    await loadReplayLibrary({ page: 1 });
  } finally {
    setImportBusy(false);
    elements.ballchasingImportProgress.classList.add("hidden");
  }
}

elements.importReplay.addEventListener("click", async () => {
  setImportDropdownOpen(false);
  const paths = await api.pickReplayFiles();
  await importReplayPaths(paths);
});

elements.importReplayMenu.addEventListener("click", (event) => {
  event.stopPropagation();
  setImportDropdownOpen(elements.importReplayDropdown.classList.contains("hidden"));
});

elements.importReplayBallchasing.addEventListener("click", () => {
  openBallchasingImportDialog();
});

elements.ballchasingImportCancel.addEventListener("click", () => {
  closeBallchasingImportDialog();
});

elements.ballchasingImportDialog.addEventListener("click", (event) => {
  if (event.target === elements.ballchasingImportDialog) {
    closeBallchasingImportDialog();
  }
});

elements.ballchasingImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = elements.ballchasingImportUrl.value.trim();
  if (!url) {
    return;
  }

  elements.ballchasingImportSubmit.disabled = true;
  try {
    await importReplayFromBallchasingUrl(url);
  } finally {
    elements.ballchasingImportSubmit.disabled = false;
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (!elements.importReplaySplit.contains(target)) {
    setImportDropdownOpen(false);
  }
});

function openRenameReplayDialog(replay) {
  pendingRenameReplay = replay;
  elements.renameReplayInput.value = getReplayDisplayName(replay);
  elements.renameReplayDialog.classList.remove("hidden");
  elements.renameReplayDialog.setAttribute("aria-hidden", "false");
  elements.renameReplayInput.focus();
  elements.renameReplayInput.select();
}

function closeRenameReplayDialog() {
  pendingRenameReplay = null;
  elements.renameReplayDialog.classList.add("hidden");
  elements.renameReplayDialog.setAttribute("aria-hidden", "true");
}

function closeDeleteReplayDialog() {
  pendingDeleteReplays = [];
  elements.deleteReplayDialog.classList.add("hidden");
  elements.deleteReplayDialog.setAttribute("aria-hidden", "true");
}

async function submitRenameReplay() {
  if (!pendingRenameReplay) {
    return;
  }

  const replayName = elements.renameReplayInput.value.trim();
  if (!replayName) {
    return;
  }

  elements.renameReplaySubmit.disabled = true;
  try {
    const result = await api.renameReplay({
      matchGuid: pendingRenameReplay.matchGuid,
      filePath: pendingRenameReplay.filePath,
      replayName,
    });
    state = result.state;
    patchReplayInLibrary(pendingRenameReplay.matchGuid, {
      replayName: result.replayName,
    });
    closeRenameReplayDialog();
    elements.syncBanner.textContent = "Replay renamed.";
    elements.syncBanner.classList.remove("hidden", "error");
  } catch (error) {
    elements.syncBanner.textContent =
      error instanceof Error ? error.message : String(error);
    elements.syncBanner.classList.remove("hidden");
    elements.syncBanner.classList.add("error");
  } finally {
    elements.renameReplaySubmit.disabled = false;
  }
}

async function confirmDeleteReplay() {
  if (pendingDeleteReplays.length === 0) {
    return;
  }

  const toDelete = [...pendingDeleteReplays];
  closeDeleteReplayDialog();

  for (const replay of toDelete) {
    expandedReplays.delete(replay.matchGuid);
    selectedReplayGuids.delete(replay.matchGuid);
  }

  // Drop rows immediately so the list stays interactive while disk work finishes.
  removeReplaysFromLibrary(toDelete.map((replay) => replay.matchGuid));
  updateReplaySelectionUi();
  clearReplayPageCache();

  elements.syncBanner.textContent =
    toDelete.length === 1 ? "Replay deleted." : `${toDelete.length} replays deleted.`;
  elements.syncBanner.classList.remove("hidden", "error");

  try {
    // One batched state update avoids parallel save races that kept ghost rows.
    const result = await api.deleteReplays(
      toDelete.map((replay) => ({
        matchGuid: replay.matchGuid,
        filePath: replay.filePath,
      })),
    );
    state = result.state;

    if (result.errors.length > 0) {
      elements.syncBanner.textContent =
        result.deletedCount > 0
          ? `Deleted ${result.deletedCount}, but some replays failed: ${result.errors[0]}`
          : result.errors[0];
      elements.syncBanner.classList.remove("hidden");
      elements.syncBanner.classList.add("error");
    }
  } catch (error) {
    elements.syncBanner.textContent =
      error instanceof Error ? error.message : String(error);
    elements.syncBanner.classList.remove("hidden");
    elements.syncBanner.classList.add("error");
  }

  // Reconcile totals/pages in the background without locking the list.
  void loadReplayLibrary({ page: replayPage, forceRefresh: true, quiet: true });
}

elements.renameReplayCancel.addEventListener("click", () => {
  closeRenameReplayDialog();
});

elements.renameReplayDialog.addEventListener("click", (event) => {
  if (event.target === elements.renameReplayDialog) {
    closeRenameReplayDialog();
  }
});

elements.renameReplayForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitRenameReplay();
});

elements.deleteReplayCancel.addEventListener("click", () => {
  closeDeleteReplayDialog();
});

elements.deleteReplayDialog.addEventListener("click", (event) => {
  if (event.target === elements.deleteReplayDialog) {
    closeDeleteReplayDialog();
  }
});

elements.deleteReplayConfirm.addEventListener("click", () => {
  void confirmDeleteReplay();
});

elements.removeLocalFileCancel.addEventListener("click", () => {
  closeRemoveLocalFileDialog();
});

elements.removeLocalFileDialog.addEventListener("click", (event) => {
  if (event.target === elements.removeLocalFileDialog) {
    closeRemoveLocalFileDialog();
  }
});

elements.removeLocalFileConfirm.addEventListener("click", () => {
  void confirmRemoveLocalFile();
});

let dragDepth = 0;

function setDropOverlayVisible(visible) {
  elements.replayDropOverlay.classList.toggle("hidden", !visible);
  elements.replayDropOverlay.setAttribute("aria-hidden", visible ? "false" : "true");
}

for (const dropTarget of [document.body, elements.replaysPanel]) {
  dropTarget.addEventListener("dragenter", (event) => {
    event.preventDefault();
    dragDepth += 1;
    setDropOverlayVisible(true);
  });

  dropTarget.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  dropTarget.addEventListener("dragleave", (event) => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      setDropOverlayVisible(false);
    }
  });

  dropTarget.addEventListener("drop", async (event) => {
    event.preventDefault();
    dragDepth = 0;
    setDropOverlayVisible(false);

    const files = [...(event.dataTransfer?.files ?? [])];
    const paths = files
      .filter((file) => file.name.toLowerCase().endsWith(".replay"))
      .map((file) => api.getPathForFile(file));

    await importReplayPaths(paths);
  });
}

document.querySelectorAll(".sync-option-info").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
});

elements.validateToken.addEventListener("click", async () => {
  const token = elements.ballchasingToken.value.trim();
  if (!token) {
    elements.tokenStatus.textContent = "Enter a token first.";
    return;
  }

  elements.validateToken.disabled = true;
  elements.tokenStatus.textContent = "Validating…";
  try {
    const valid = await api.validateBallchasingToken(token);
    elements.tokenStatus.textContent = valid
      ? "Token looks valid."
      : "Token validation failed.";
  } finally {
    elements.validateToken.disabled = false;
  }
});

elements.addEpicAccount.addEventListener("click", () => {
  void addEpicAccount(elements.addEpicAccount);
});

elements.authBannerLogin.addEventListener("click", () => {
  void addEpicAccount(elements.authBannerLogin);
});

elements.ballchasingTokenLink.addEventListener("click", async (event) => {
  event.preventDefault();
  await api.openExternal("https://ballchasing.com/upload");
});

for (const link of document.querySelectorAll(".garage-footer-credit, .garage-footer-social-link, .garage-footer-support")) {
  link.addEventListener("click", async () => {
    const url = link.dataset.url;
    if (url) {
      await api.openExternal(url);
    }
  });
}

api.onStateUpdated((nextState) => {
  // Keep app state in sync, but do not rebuild the replay library here.
  // Upload/rename patch the visible list; sync/import/delete reload explicitly.
  state = nextState;
  updateStatusLine();
});

api.onAccountsUpdated((nextAccounts) => {
  accounts = nextAccounts;
  refreshAuthStatus();
  updateStatusLine();
  clearReplayPageCache();
  void loadReplayLibrary({ page: replayPage, forceRefresh: true });
});

api.onConfigUpdated((nextConfig) => {
  config = nextConfig;
  fillSettingsForm(config);
  void api.getGameMonitorState().then(renderGameMonitor);
});

api.onUpdateStatus((status) => {
  renderUpdateStatus(status);
});

api.onGameMonitorUpdated((monitor) => {
  renderGameMonitor(monitor);
});

function formatEpicDeviceCode(code) {
  const normalized = String(code).replace(/\s+/g, "").toUpperCase();
  if (normalized.length <= 4) {
    return normalized;
  }
  return `${normalized.slice(0, 4)} ${normalized.slice(4)}`;
}

api.onEpicDeviceAuthStarted(({ userCode }) => {
  hideOnboardingForEpicAuth();
  if (elements.epicDeviceAuthCode) {
    elements.epicDeviceAuthCode.textContent = formatEpicDeviceCode(userCode);
  }
  elements.epicDeviceAuthDialog?.classList.remove("hidden");
  elements.epicDeviceAuthDialog?.setAttribute("aria-hidden", "false");
});

api.onEpicDeviceAuthFinished(() => {
  elements.epicDeviceAuthDialog?.classList.add("hidden");
  elements.epicDeviceAuthDialog?.setAttribute("aria-hidden", "true");
  restoreOnboardingAfterEpicAuth();
});

elements.epicDeviceAuthReopen?.addEventListener("click", () => {
  void api.reopenEpicDeviceAuth();
});

elements.epicDeviceAuthCancel?.addEventListener("click", () => {
  void api.cancelEpicDeviceAuth();
});

api.onSyncStarted(() => {
  resetSyncProgress();
  if (state) {
    state = { ...state, isSyncing: true, lastSyncError: undefined };
    syncProgressState = { statusText: "Starting sync…", indeterminate: true };
    updateStatusLine();
    renderSyncProgressPanel();
  }
});

api.onSyncCompleted(async () => {
  resetSyncProgress();
  state = await api.getState();
  accounts = await api.getAccounts();
  clearReplayPageCache();
  await loadReplayLibrary({ page: replayPage, forceRefresh: true });
  updateStatusLine();
  refreshAuthStatus();
});

api.onSyncError((message) => {
  resetSyncProgress();
  if (state) {
    state = { ...state, lastSyncError: message };
    updateStatusLine();
  }
});

api.onSyncProgress(handleSyncProgress);

api.onBallchasingImportProgress((progress) => {
  if (progress.phase === "listing") {
    elements.syncBanner.textContent = "Fetching Ballchasing group replays…";
  } else {
    elements.syncBanner.textContent = `Importing replay ${progress.current} of ${progress.total}…`;
  }
  elements.syncBanner.classList.remove("hidden", "error");
});

api.onSessionInvalidated(({ displayName, message }) => {
  elements.syncBanner.textContent = `${displayName}: ${message}`;
  elements.syncBanner.classList.remove("hidden");
  elements.syncBanner.classList.add("error");
});

elements.onboardingNext?.addEventListener("click", () => {
  goToNextOnboardingStep("welcome");
});

elements.onboardingBackAccount?.addEventListener("click", () => {
  goToPreviousOnboardingStep("account");
});

elements.onboardingSkipAccount?.addEventListener("click", () => {
  showOnboardingStep("skip-confirm");
});

elements.onboardingCancelSkip?.addEventListener("click", () => {
  showOnboardingStep("account");
});

elements.onboardingConfirmSkip?.addEventListener("click", () => {
  onboardingAccountSkipped = true;
  showOnboardingStep("ballchasing");
});

elements.onboardingAddAccount?.addEventListener("click", async () => {
  const button = elements.onboardingAddAccount;
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Waiting for Epic sign-in…";

  try {
    await api.addEpicAccount();
    onboardingAccountSkipped = false;
    await afterAccountAdded();
    showOnboardingStep("sync");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("cancel")) {
      elements.syncBanner.textContent = message;
      elements.syncBanner.classList.remove("hidden");
      elements.syncBanner.classList.add("error");
    }
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
});

elements.onboardingBackSync?.addEventListener("click", () => {
  goToPreviousOnboardingStep("sync");
});

elements.onboardingNextSync?.addEventListener("click", () => {
  goToNextOnboardingStep("sync");
});

elements.onboardingBackProcess?.addEventListener("click", () => {
  goToPreviousOnboardingStep("process");
});

elements.onboardingNextProcess?.addEventListener("click", () => {
  if (isOnboardingProcessContinueBlocked()) {
    return;
  }
  goToNextOnboardingStep("process");
});

elements.onboardingProcessOnClose?.addEventListener("change", () => {
  updateOnboardingProcessVisibility();
});

elements.onboardingProcessAfterGames?.addEventListener("change", () => {
  updateOnboardingProcessVisibility();
});

elements.onboardingSyncAfterGames?.addEventListener("input", () => {
  if (elements.onboardingProcessAfterGames instanceof HTMLInputElement) {
    elements.onboardingProcessAfterGames.checked = true;
    updateOnboardingProcessVisibility();
  }
});

elements.onboardingSyncAfterGames?.addEventListener("click", (event) => {
  event.stopPropagation();
});

elements.onboardingSyncAfterGames?.addEventListener("focus", () => {
  if (elements.onboardingProcessAfterGames instanceof HTMLInputElement) {
    elements.onboardingProcessAfterGames.checked = true;
    updateOnboardingProcessVisibility();
  }
});

elements.onboardingFixStatsApi?.addEventListener("click", (event) => {
  event.stopPropagation();
  event.preventDefault();
  void runOnboardingStatsApiFix();
});

elements.onboardingStatsApiLearnMore?.addEventListener("click", (event) => {
  event.stopPropagation();
  event.preventDefault();
  void api.openExternal("https://www.rocketleague.com/en/developer/stats-api");
});

elements.onboardingBackBallchasing?.addEventListener("click", () => {
  goToPreviousOnboardingStep("ballchasing");
});

elements.onboardingSkipBallchasing?.addEventListener("click", () => {
  if (elements.onboardingBallchasingToken instanceof HTMLInputElement) {
    elements.onboardingBallchasingToken.value = "";
  }
  if (elements.onboardingAutoUpload instanceof HTMLInputElement) {
    elements.onboardingAutoUpload.checked = false;
  }
  resetOnboardingBallchasingTokenValidation();
  showOnboardingStep("preferences");
});

elements.onboardingNextBallchasing?.addEventListener("click", async () => {
  const token = elements.onboardingBallchasingToken?.value.trim() ?? "";
  if (token && token !== onboardingBallchasingValidatedToken) {
    const valid = await validateOnboardingBallchasingToken();
    if (!valid) {
      return;
    }
  }

  updateOnboardingBallchasingContinueButton();
  if (
    elements.onboardingNextBallchasing instanceof HTMLButtonElement &&
    elements.onboardingNextBallchasing.disabled
  ) {
    return;
  }

  goToNextOnboardingStep("ballchasing");
});

elements.onboardingValidateBallchasingToken?.addEventListener("click", () => {
  void validateOnboardingBallchasingToken();
});

elements.onboardingBallchasingToken?.addEventListener("input", () => {
  const token = elements.onboardingBallchasingToken?.value.trim() ?? "";
  if (token !== onboardingBallchasingValidatedToken) {
    onboardingBallchasingValidatedToken = null;
    if (elements.onboardingBallchasingTokenStatus instanceof HTMLElement) {
      elements.onboardingBallchasingTokenStatus.textContent = "";
    }
  }
  updateOnboardingBallchasingContinueButton();
});

elements.onboardingAutoUpload?.addEventListener("change", () => {
  updateOnboardingBallchasingContinueButton();
});

elements.onboardingBallchasingUploadLink?.addEventListener("click", (event) => {
  event.preventDefault();
  void api.openExternal("https://ballchasing.com/upload");
});

elements.onboardingBackPreferences?.addEventListener("click", () => {
  goToPreviousOnboardingStep("preferences");
});

elements.onboardingFinish?.addEventListener("click", () => {
  void finishOnboarding();
});

void bootstrap();
