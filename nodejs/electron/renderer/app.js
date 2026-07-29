/** @typedef {import('../../dist/store.js').AppConfig} AppConfig */
/** @typedef {import('../../dist/store.js').AppState} AppState */
/** @typedef {import('../../dist/store.js').SavedReplayRecord} SavedReplayRecord */
/** @typedef {import('../../dist/accounts.js').LinkedAccount} LinkedAccount */

const api = window.api;

/** @type {AppConfig | null} */
let config = null;

/** @type {AppState | null} */
let state = null;

/** @type {LinkedAccount[]} */
let accounts = [];

const elements = {
  statusLine: document.getElementById("status-line"),
  syncBanner: document.getElementById("sync-banner"),
  syncNow: document.getElementById("sync-now"),
  replaySearch: document.getElementById("replay-search"),
  replayCount: document.getElementById("replay-count"),
  replayList: document.getElementById("replay-list"),
  replayEmpty: document.getElementById("replay-empty"),
  settingsForm: document.getElementById("settings-form"),
  pollInterval: document.getElementById("poll-interval"),
  startMinimized: document.getElementById("start-minimized"),
  minimizeOnClose: document.getElementById("minimize-on-close"),
  launchAtLogin: document.getElementById("launch-at-login"),
  replayDir: document.getElementById("replay-dir"),
  browseReplayDir: document.getElementById("browse-replay-dir"),
  autoUploadBallchasing: document.getElementById("auto-upload-ballchasing"),
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
  authCode: document.getElementById("auth-code"),
  submitAuthCode: document.getElementById("submit-auth-code"),
};

function formatDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function resultBadgeClass(result) {
  if (result === "Win") return "win";
  if (result === "Loss") return "loss";
  return "neutral";
}

function ballchasingBadge(replay) {
  if (replay.ballchasingUrl) {
    return `<span class="badge uploaded">Ballchasing</span>`;
  }
  if (replay.ballchasingError) {
    return `<span class="badge failed">Upload failed</span>`;
  }
  return "";
}

function enabledAccountsCount() {
  return accounts.filter((account) => account.enabled).length;
}

function updateSyncBanner() {
  if (!state) {
    elements.syncBanner.classList.add("hidden");
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

/** @param {SavedReplayRecord[]} replays */
function renderReplays(replays) {
  const query = elements.replaySearch.value.trim().toLowerCase();
  const filtered = replays.filter((replay) => {
    if (!query) return true;
    const haystack = [
      replay.playlistName,
      replay.mapName,
      replay.result,
      replay.fileName,
      replay.accountDisplayName,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  elements.replayCount.textContent = `${filtered.length} replay${filtered.length === 1 ? "" : "s"}`;
  elements.replayEmpty.classList.toggle("hidden", filtered.length > 0);
  elements.replayList.innerHTML = "";

  for (const replay of filtered) {
    const card = document.createElement("article");
    card.className = "replay-card";
    card.innerHTML = `
      <div class="replay-card-header">
        <div>
          <h3>${replay.playlistName}</h3>
          <div class="replay-meta">
            <span>${replay.accountDisplayName ?? "Unknown account"}</span>
            <span>${formatDate(replay.recordStartTimestamp)}</span>
            <span>${replay.mapName}</span>
            <span>${replay.team0Score} - ${replay.team1Score}</span>
            <span>${formatDuration(replay.secondsPlayed)}</span>
          </div>
        </div>
        <div class="replay-badges">
          <span class="badge ${resultBadgeClass(replay.result)}">${replay.result}</span>
          ${ballchasingBadge(replay)}
        </div>
      </div>
      <div class="replay-meta">${replay.fileName}</div>
      ${
        replay.ballchasingError
          ? `<div class="hint" style="margin-top: 10px;">Ballchasing: ${replay.ballchasingError}</div>`
          : ""
      }
      <div class="replay-actions">
        <button class="btn" data-action="show" data-path="${replay.filePath}">Show in folder</button>
        ${
          replay.ballchasingUrl
            ? `<button class="btn" data-action="open-url" data-url="${replay.ballchasingUrl}">Open on Ballchasing</button>`
            : ""
        }
      </div>
    `;
    elements.replayList.appendChild(card);
  }
}

function renderAccounts() {
  elements.accountsList.innerHTML = "";

  if (accounts.length === 0) {
    elements.accountsList.innerHTML =
      `<p class="hint">No accounts linked yet. Add an Epic account to start syncing replays.</p>`;
    return;
  }

  for (const account of accounts) {
    const card = document.createElement("div");
    card.className = "account-card";
    card.innerHTML = `
      <div class="account-card-main">
        <strong>${account.displayName}</strong>
        <span class="hint">${account.lastSyncMessage ?? "Not synced yet"}</span>
        ${
          account.lastSyncError
            ? `<span class="hint" style="color: #ffb4b4;">${account.lastSyncError}</span>`
            : ""
        }
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
  const enabledCount = enabledAccountsCount();
  if (enabledCount > 0) {
    parts.push(`${enabledCount} account${enabledCount === 1 ? "" : "s"} enabled`);
  } else if (accounts.length > 0) {
    parts.push("No accounts enabled for sync");
  } else {
    parts.push("No Epic accounts linked");
  }

  if (state.isSyncing) {
    parts.push("Syncing…");
  } else if (state.lastSyncMessage) {
    parts.push(state.lastSyncMessage);
  } else if (state.lastSyncAt) {
    parts.push(`Last sync ${new Date(state.lastSyncAt).toLocaleString()}`);
  }

  elements.statusLine.textContent = parts.join(" · ");
  document.body.classList.toggle("syncing", Boolean(state.isSyncing));
  elements.syncNow.disabled = Boolean(state.isSyncing);
  updateSyncBanner();
}

function refreshAuthStatus() {
  const enabledCount = enabledAccountsCount();

  if (accounts.length === 0) {
    elements.authStatus.textContent =
      "Add one or more Epic accounts. Each account's replays will be synced when enabled.";
    elements.authBanner.classList.remove("hidden");
  } else {
    elements.authStatus.textContent =
      `${accounts.length} account${accounts.length === 1 ? "" : "s"} linked` +
      (enabledCount > 0 ? `, ${enabledCount} enabled for sync.` : ", none enabled for sync.");
    elements.authBanner.classList.toggle("hidden", enabledCount > 0);
  }

  renderAccounts();
}

/** @param {AppConfig} nextConfig */
function fillSettingsForm(nextConfig) {
  elements.pollInterval.value = String(nextConfig.pollIntervalMinutes);
  elements.startMinimized.checked = nextConfig.startMinimized;
  elements.minimizeOnClose.checked = nextConfig.minimizeOnClose;
  elements.launchAtLogin.checked = nextConfig.launchAtLogin;
  elements.replayDir.value = nextConfig.replayDir;
  elements.autoUploadBallchasing.checked = nextConfig.autoUploadBallchasing;
  elements.ballchasingToken.value = nextConfig.ballchasingToken;
  elements.ballchasingVisibility.value = nextConfig.ballchasingVisibility;
}

/** @returns {Partial<AppConfig>} */
function readSettingsForm() {
  return {
    pollIntervalMinutes: Math.max(
      1,
      Number.parseInt(elements.pollInterval.value, 10) || 10,
    ),
    startMinimized: elements.startMinimized.checked,
    minimizeToTrayOnClose: elements.minimizeOnClose.checked,
    launchAtLogin: elements.launchAtLogin.checked,
    autoUploadBallchasing: elements.autoUploadBallchasing.checked,
    ballchasingToken: elements.ballchasingToken.value.trim(),
    ballchasingVisibility: /** @type {AppConfig["ballchasingVisibility"]} */ (
      elements.ballchasingVisibility.value
    ),
  };
}

async function afterAccountAdded() {
  refreshAuthStatus();
  const result = await api.syncNow();
  state = result.state;
  accounts = result.accounts;
  renderReplays(state.savedReplays);
  updateStatusLine();
  refreshAuthStatus();
}

async function addEpicAccount(button) {
  button.disabled = true;
  const previousText = button.textContent;
  button.textContent = "Waiting for Epic login…";
  elements.authStatus.textContent =
    "Epic login opens in a fresh session so you can choose a different account.";

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
  config = await api.getConfig();
  state = await api.getState();
  accounts = await api.getAccounts();
  fillSettingsForm(config);
  renderReplays(state.savedReplays);
  updateStatusLine();
  refreshAuthStatus();
}

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
  if (state) {
    renderReplays(state.savedReplays);
  }
});

elements.replayList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const action = target.dataset.action;
  if (action === "show" && target.dataset.path) {
    await api.showItemInFolder(target.dataset.path);
  }
  if (action === "open-url" && target.dataset.url) {
    await api.openExternal(target.dataset.url);
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
  try {
    const result = await api.syncNow();
    state = result.state;
    accounts = result.accounts;
    renderReplays(state.savedReplays);
    updateStatusLine();
    refreshAuthStatus();
  } catch (error) {
    if (state) {
      state.lastSyncError = error instanceof Error ? error.message : String(error);
      updateStatusLine();
    }
  }
});

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  config = await api.setConfig(readSettingsForm());
  fillSettingsForm(config);
  elements.tokenStatus.textContent = "Settings saved.";
});

elements.browseReplayDir.addEventListener("click", async () => {
  const nextConfig = await api.selectReplayDir();
  if (nextConfig) {
    config = nextConfig;
    fillSettingsForm(config);
  }
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

elements.submitAuthCode.addEventListener("click", async () => {
  const authCode = elements.authCode.value.trim();
  if (!authCode) {
    elements.authStatus.textContent = "Paste an authorization code first.";
    return;
  }

  elements.submitAuthCode.disabled = true;
  try {
    await api.loginWithCode(authCode);
    elements.authCode.value = "";
    await afterAccountAdded();
  } catch (error) {
    elements.authStatus.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    elements.submitAuthCode.disabled = false;
  }
});

elements.ballchasingTokenLink.addEventListener("click", async (event) => {
  event.preventDefault();
  await api.openExternal("https://ballchasing.com/upload");
});

api.onStateUpdated((nextState) => {
  state = nextState;
  renderReplays(state.savedReplays);
  updateStatusLine();
});

api.onAccountsUpdated((nextAccounts) => {
  accounts = nextAccounts;
  refreshAuthStatus();
  updateStatusLine();
});

api.onConfigUpdated((nextConfig) => {
  config = nextConfig;
  fillSettingsForm(config);
});

api.onSyncStarted(() => {
  if (state) {
    state = { ...state, isSyncing: true, lastSyncError: undefined };
    updateStatusLine();
  }
});

api.onSyncCompleted(async () => {
  state = await api.getState();
  accounts = await api.getAccounts();
  renderReplays(state.savedReplays);
  updateStatusLine();
  refreshAuthStatus();
});

api.onSyncError((message) => {
  if (state) {
    state = { ...state, lastSyncError: message };
    updateStatusLine();
  }
});

void bootstrap();
