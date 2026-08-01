import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function isProcessRunningWin32(imageName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "tasklist",
      ["/FI", `IMAGENAME eq ${imageName}`, "/NH"],
      { windowsHide: true, timeout: 5000 },
    );
    return stdout.toLowerCase().includes(imageName.toLowerCase());
  } catch {
    return false;
  }
}

async function isProcessRunningPgrep(pattern: string, exact = false): Promise<boolean> {
  try {
    const args = exact ? ["-x", pattern] : ["-f", pattern];
    const { stdout } = await execFileAsync("pgrep", args, { timeout: 5000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function isRocketLeagueRunning(): Promise<boolean> {
  switch (process.platform) {
    case "win32":
      return isProcessRunningWin32("RocketLeague.exe");
    case "linux":
      if (await isProcessRunningPgrep("RocketLeague.exe", true)) {
        return true;
      }
      return isProcessRunningPgrep("RocketLeague");
    case "darwin":
      return isProcessRunningPgrep("Rocket League");
    default:
      return false;
  }
}
