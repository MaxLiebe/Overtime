export function isInGameReplaySupported(): boolean {
  return process.platform === "win32";
}
