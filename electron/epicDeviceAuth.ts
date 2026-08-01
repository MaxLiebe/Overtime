import { BrowserWindow, shell } from "electron";
import {
  completeDeviceAuthorization,
  EPIC_DEVICE_AUTH_CANCELLED,
  isAllowedEpicVerificationUrl,
  startDeviceAuthorization,
} from "rlapi";
import type { DeviceAuthResponse } from "rlapi";

export { EPIC_DEVICE_AUTH_CANCELLED };

export interface EpicDeviceAuthProgress {
  userCode: string;
  verificationUri: string;
}

interface ActiveDeviceAuthSession {
  verificationUri: string;
  abortController: AbortController;
}

let activeSession: ActiveDeviceAuthSession | null = null;

function openEpicVerificationUri(uri: string): void {
  if (!isAllowedEpicVerificationUrl(uri)) {
    throw new Error("Epic verification URL is not allowed.");
  }
  void shell.openExternal(uri);
}

export function cancelEpicDeviceLogin(): void {
  activeSession?.abortController.abort();
}

export function reopenEpicDeviceLogin(): boolean {
  if (!activeSession?.verificationUri) {
    return false;
  }

  openEpicVerificationUri(activeSession.verificationUri);
  return true;
}

export async function openEpicDeviceLogin(
  parent: BrowserWindow | null,
  onProgress: (progress: EpicDeviceAuthProgress) => void,
): Promise<Awaited<ReturnType<typeof completeDeviceAuthorization>>> {
  const abortController = new AbortController();
  const device: DeviceAuthResponse = await startDeviceAuthorization();

  activeSession = {
    verificationUri: device.verification_uri,
    abortController,
  };

  onProgress({
    userCode: device.user_code,
    verificationUri: device.verification_uri,
  });

  openEpicVerificationUri(device.verification_uri);

  try {
    return await completeDeviceAuthorization(device, { signal: abortController.signal });
  } catch (error) {
    if (parent && !parent.isDestroyed()) {
      parent.focus();
    }
    throw error;
  } finally {
    activeSession = null;
  }
}
