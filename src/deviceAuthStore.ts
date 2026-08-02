import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { EpicDeviceAuthCredentials } from "./types.js";

interface StoredDeviceAuthFile {
  v: 1;
  encrypted: boolean;
  /** Plain JSON credentials when encrypted=false; base64 ciphertext when encrypted=true. */
  data: string;
}

function getDeviceAuthPath(accountsPath: string, accountId: string): string {
  return join(dirname(accountsPath), "tokens", `${accountId}.deviceauth.json`);
}

async function getSafeStorage(): Promise<{
  isEncryptionAvailable: () => boolean;
  encryptString: (plain: string) => Buffer;
  decryptString: (encrypted: Buffer) => string;
} | null> {
  try {
    const electron = await import("electron");
    if (!electron.safeStorage) {
      return null;
    }
    return electron.safeStorage;
  } catch {
    return null;
  }
}

function parseCredentials(raw: unknown): EpicDeviceAuthCredentials | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Partial<EpicDeviceAuthCredentials>;
  const accountId = value.accountId?.trim();
  const deviceId = value.deviceId?.trim();
  const secret = value.secret?.trim();
  const clientId = value.clientId?.trim();
  if (!accountId || !deviceId || !secret || !clientId) {
    return null;
  }

  return { accountId, deviceId, secret, clientId };
}

export async function loadDeviceAuthCredentials(
  accountsPath: string,
  accountId: string,
): Promise<EpicDeviceAuthCredentials | null> {
  try {
    const raw = await readFile(getDeviceAuthPath(accountsPath, accountId), "utf8");
    const parsed = JSON.parse(raw) as StoredDeviceAuthFile | EpicDeviceAuthCredentials;

    if ("data" in parsed && typeof parsed.data === "string") {
      if (parsed.encrypted) {
        const safeStorage = await getSafeStorage();
        if (!safeStorage?.isEncryptionAvailable()) {
          return null;
        }
        const plain = safeStorage.decryptString(Buffer.from(parsed.data, "base64"));
        return parseCredentials(JSON.parse(plain));
      }
      return parseCredentials(JSON.parse(parsed.data));
    }

    return parseCredentials(parsed);
  } catch {
    return null;
  }
}

export async function writeDeviceAuthCredentials(
  accountsPath: string,
  credentials: EpicDeviceAuthCredentials,
): Promise<void> {
  const parsed = parseCredentials(credentials);
  if (!parsed) {
    throw new Error("Invalid device auth credentials.");
  }

  const path = getDeviceAuthPath(accountsPath, parsed.accountId);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  const plain = JSON.stringify(parsed);
  const safeStorage = await getSafeStorage();
  let file: StoredDeviceAuthFile;

  if (safeStorage?.isEncryptionAvailable()) {
    file = {
      v: 1,
      encrypted: true,
      data: safeStorage.encryptString(plain).toString("base64"),
    };
  } else {
    file = {
      v: 1,
      encrypted: false,
      data: plain,
    };
  }

  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function deleteDeviceAuthCredentials(
  accountsPath: string,
  accountId: string,
): Promise<void> {
  try {
    await unlink(getDeviceAuthPath(accountsPath, accountId));
  } catch {
    // File may already be gone.
  }
}

export function accountHasDeviceAuth(account: {
  deviceAuth?: EpicDeviceAuthCredentials | null;
}): boolean {
  return Boolean(
    account.deviceAuth?.accountId?.trim() &&
      account.deviceAuth?.deviceId?.trim() &&
      account.deviceAuth?.secret?.trim() &&
      account.deviceAuth?.clientId?.trim(),
  );
}
