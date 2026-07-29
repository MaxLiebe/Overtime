import { BrowserWindow, session } from "electron";
import {
  getAuthLoginUrl,
  isEpicRedirectPage,
  isValidEpicAuthCode,
  parseEpicAuthResponse,
} from "rlapi";

let authWindow: BrowserWindow | null = null;

const LOGIN_PARTITION = "persist:epic-login";
const PAGE_TEXT_SCRIPT = `(document.body && (document.body.innerText || document.body.textContent)) || ""`;

async function clearEpicLoginSession(): Promise<void> {
  const loginSession = session.fromPartition(LOGIN_PARTITION);
  await loginSession.clearStorageData();
}

export async function openEpicLoginWindow(
  parent: BrowserWindow | null,
  completeLogin: (code: string) => Promise<void>,
  options?: { forceAccountPicker?: boolean },
): Promise<void> {
  if (authWindow) {
    authWindow.focus();
    throw new Error("Epic login is already in progress");
  }

  await clearEpicLoginSession();

  const loginUrl = await getAuthLoginUrl({
    forceLogin: options?.forceAccountPicker ?? true,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let completing = false;
    const pendingResponses = new Map<string, string>();

    authWindow = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: Boolean(parent),
      title: "Sign in with Epic Games",
      backgroundColor: "#101014",
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        partition: LOGIN_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    const window = authWindow;
    const webContents = window.webContents;
    const debuggerSession = webContents.debugger;

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      handler();
    };

    const handleAuthCode = async (code: string) => {
      if (settled || completing || !isValidEpicAuthCode(code)) {
        return;
      }

      completing = true;
      window.setTitle("Completing sign-in…");

      try {
        await completeLogin(code);
        finish(() => {
          window.close();
          resolve();
        });
      } catch (error) {
        completing = false;
        finish(() => {
          window.close();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      }
    };

    const readResponseBody = async (requestId: string): Promise<void> => {
      if (settled || completing) {
        return;
      }

      try {
        const result = (await debuggerSession.sendCommand("Network.getResponseBody", {
          requestId,
        })) as { body: string; base64Encoded: boolean };

        let text = result.body;
        if (result.base64Encoded) {
          text = Buffer.from(result.body, "base64").toString("utf8");
        }

        const code = parseEpicAuthResponse(text);
        if (code) {
          await handleAuthCode(code);
        }
      } catch {
        // Response body not available yet or request failed.
      }
    };

    const tryCaptureFromPage = async (): Promise<void> => {
      if (settled || completing) {
        return;
      }

      const url = webContents.getURL();
      if (!isEpicRedirectPage(url)) {
        return;
      }

      try {
        const bodyText = await webContents.executeJavaScript(PAGE_TEXT_SCRIPT, true);
        const code = parseEpicAuthResponse(String(bodyText));
        if (code) {
          await handleAuthCode(code);
        }
      } catch {
        // Page still loading or inaccessible.
      }
    };

    const attachNetworkDebugger = async (): Promise<void> => {
      try {
        if (!debuggerSession.isAttached()) {
          debuggerSession.attach("1.3");
        }
        await debuggerSession.sendCommand("Network.enable");
      } catch {
        // Fall back to DOM parsing only.
      }
    };

    const onDebuggerMessage = (
      _event: Electron.Event,
      method: string,
      params: {
        requestId?: string;
        response?: { url?: string; status?: number };
      },
    ) => {
      if (method === "Network.responseReceived") {
        const url = params.response?.url;
        if (
          url &&
          isEpicRedirectPage(url) &&
          params.response?.status === 200 &&
          params.requestId
        ) {
          pendingResponses.set(params.requestId, url);
        }
        return;
      }

      if (method === "Network.loadingFinished" && params.requestId) {
        if (pendingResponses.has(params.requestId)) {
          pendingResponses.delete(params.requestId);
          void readResponseBody(params.requestId);
        }
      }
    };

    const onFrameFinishLoad = (_event: Electron.Event, isMainFrame: boolean) => {
      if (!isMainFrame) {
        return;
      }
      void tryCaptureFromPage();
    };

    const cleanup = () => {
      webContents.removeListener("did-frame-finish-load", onFrameFinishLoad);
      debuggerSession.removeListener("message", onDebuggerMessage);
      window.removeListener("closed", onClosed);

      if (debuggerSession.isAttached()) {
        try {
          debuggerSession.detach();
        } catch {
          // Ignore detach errors during shutdown.
        }
      }

      authWindow = null;
    };

    const onClosed = () => {
      if (settled || completing) {
        return;
      }
      finish(() => {
        reject(new Error("Epic login was cancelled"));
      });
    };

    void attachNetworkDebugger().then(() => {
      debuggerSession.on("message", onDebuggerMessage);
    });

    webContents.on("did-frame-finish-load", onFrameFinishLoad);
    window.once("closed", onClosed);
    window.once("ready-to-show", () => {
      window.show();
    });

    webContents.loadURL(loginUrl).catch((error: unknown) => {
      finish(() => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  });
}
