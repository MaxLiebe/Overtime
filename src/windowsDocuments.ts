import { execSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

function expandWindowsEnvVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`);
}

function readWindowsRegistryDocumentsFolder(): string | undefined {
  const keys = [
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders",
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders",
  ];

  for (const key of keys) {
    try {
      const output = execSync(`reg query "${key}" /v Personal`, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      });
      const match = output.match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/i);
      if (match?.[1]) {
        return expandWindowsEnvVars(match[1].trim());
      }
    } catch {
      // Try the next registry location.
    }
  }

  return undefined;
}

function getWindowsDocumentsFolder(): string | undefined {
  try {
    const output = execSync(
      "powershell -NoProfile -Command \"[Environment]::GetFolderPath('MyDocuments')\"",
      { encoding: "utf8", windowsHide: true, timeout: 5000 },
    ).trim();
    if (output) {
      return output;
    }
  } catch {
    // Fall back to registry lookup below.
  }

  return readWindowsRegistryDocumentsFolder();
}

let cachedCandidates: string[] | null = null;

/**
 * Documents folders that may hold `My Games\Rocket League`.
 *
 * The redirected Documents folder is the only reliable source: OneDrive-for-Business
 * redirects it to e.g. `%USERPROFILE%\OneDrive - Contoso\Documenten` while leaving
 * `%OneDrive%` pointing at the personal OneDrive and `%OneDriveCommercial%` unset.
 */
export function getWindowsDocumentsCandidates(): string[] {
  if (cachedCandidates) {
    return cachedCandidates;
  }

  const home = homedir();
  const candidates = [
    getWindowsDocumentsFolder(),
    process.env.OneDrive ? join(process.env.OneDrive, "Documents") : undefined,
    process.env.OneDrive ? join(process.env.OneDrive, "Documenten") : undefined,
    process.env.OneDriveCommercial
      ? join(process.env.OneDriveCommercial, "Documents")
      : undefined,
    process.env.OneDriveCommercial
      ? join(process.env.OneDriveCommercial, "Documenten")
      : undefined,
    join(home, "Documents"),
    join(home, "OneDrive", "Documents"),
  ].filter((value): value is string => Boolean(value));

  cachedCandidates = [...new Set(candidates)];
  return cachedCandidates;
}
