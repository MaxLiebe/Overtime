import { authenticate, type AuthenticatedSession } from "./auth.js";
import {
  loadAccounts,
  saveAccounts,
  upsertAccount,
  updateAccount,
  type LinkedAccount,
} from "./accounts.js";
import type { TokenResponse } from "./types.js";
import { uploadReplayToBallchasing } from "./ballchasing.js";
import { getMatchResult, getPlaylistName } from "./format.js";
import { getMatchHistory } from "./matches.js";
import { getReplayFileName, syncReplays } from "./replays.js";
import {
  loadAppState,
  saveAppState,
  updateSavedReplay,
  upsertSavedReplay,
  type AppConfig,
  type AppState,
  type SavedReplayRecord,
} from "./store.js";

export interface SyncServicePaths {
  statePath: string;
  accountsPath: string;
}

export interface SyncRunResult {
  state: AppState;
  accounts: LinkedAccount[];
  downloadedCount: number;
  uploadedCount: number;
  skippedExisting: number;
  skippedNoReplayUrl: number;
  failedDownloads: number;
  failedUploads: number;
  accountsSynced: number;
}

export class SyncService {
  private running = false;

  constructor(
    private readonly paths: SyncServicePaths,
    private readonly getConfig: () => AppConfig,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  async run(onUpdate?: (state: AppState, accounts: LinkedAccount[]) => void): Promise<SyncRunResult> {
    if (this.running) {
      throw new Error("Sync already in progress");
    }

    this.running = true;
    const config = this.getConfig();
    let state = await loadAppState(this.paths.statePath);
    let accounts = await loadAccounts(this.paths.accountsPath);
    const enabledAccounts = accounts.filter((account) => account.enabled);

    if (enabledAccounts.length === 0) {
      this.running = false;
      throw new Error("No Epic accounts linked. Add an account in Settings to sync replays.");
    }

    state = {
      ...state,
      isSyncing: true,
      lastSyncError: undefined,
    };
    await saveAppState(this.paths.statePath, state);
    onUpdate?.(state, accounts);

    const result: SyncRunResult = {
      state,
      accounts,
      downloadedCount: 0,
      uploadedCount: 0,
      skippedExisting: 0,
      skippedNoReplayUrl: 0,
      failedDownloads: 0,
      failedUploads: 0,
      accountsSynced: 0,
    };

    const accountMessages: string[] = [];
    const accountErrors: string[] = [];

    try {
      for (const account of enabledAccounts) {
        let session: AuthenticatedSession | undefined;

        try {
          session = await authenticate({
            refreshToken: account.refreshToken,
          });

          if (account.accountId !== session.accountId) {
            accounts = upsertAccount(
              accounts.filter((item) => item.accountId !== account.accountId),
              {
                account_id: session.accountId,
                displayName: session.displayName,
                refresh_token: session.refreshToken,
              } as TokenResponse,
            );
          } else {
            accounts = updateAccount(accounts, account.accountId, {
              refreshToken: session.refreshToken,
              displayName: session.displayName,
            });
          }
          await saveAccounts(this.paths.accountsPath, accounts);

          const activeAccount =
            accounts.find((item) => item.accountId === session!.accountId) ?? account;

          const matches = await getMatchHistory(session.rpc);
          const syncResult = await syncReplays(matches, {
            replayDir: config.replayDir,
            knownGuids: state.downloadedMatchGuids,
            onGuidsUpdated: async (guids) => {
              state.downloadedMatchGuids = guids;
              await saveAppState(this.paths.statePath, state);
            },
          });

          result.skippedExisting += syncResult.skippedExisting;
          result.skippedNoReplayUrl += syncResult.skippedNoReplayUrl;
          result.failedDownloads += syncResult.failed.length;
          result.accountsSynced += 1;

          for (const failure of syncResult.failed) {
            accountErrors.push(`${account.displayName}: ${failure.matchGuid} - ${failure.error}`);
          }

          for (const downloaded of syncResult.downloaded) {
            const entry = matches.find(
              (match) => getReplayFileName(match.Match) === downloaded.fileName,
            );
            if (!entry) {
              continue;
            }

            const match = entry.Match;
            const record: SavedReplayRecord = {
              matchGuid: match.MatchGUID,
              accountId: activeAccount.accountId,
              accountDisplayName: session.displayName,
              filePath: downloaded.filePath,
              fileName: downloaded.fileName,
              downloadedAt: new Date().toISOString(),
              playlist: match.Playlist,
              playlistName: getPlaylistName(match.Playlist),
              mapName: match.MapName,
              recordStartTimestamp: match.RecordStartTimestamp,
              team0Score: match.Team0Score,
              team1Score: match.Team1Score,
              secondsPlayed: match.SecondsPlayed,
              result: getMatchResult(match, session.rpc.localPlayerId),
            };

            state = upsertSavedReplay(state, record);
            result.downloadedCount += 1;
            await saveAppState(this.paths.statePath, state);

            if (config.autoUploadBallchasing && config.ballchasingToken.trim()) {
              try {
                const upload = await uploadReplayToBallchasing(
                  downloaded.filePath,
                  config.ballchasingToken.trim(),
                  config.ballchasingVisibility,
                );

                state = updateSavedReplay(state, match.MatchGUID, {
                  ballchasingId: upload.id,
                  ballchasingUrl: upload.url,
                  ballchasingUploadedAt: new Date().toISOString(),
                  ballchasingError: undefined,
                });
                result.uploadedCount += 1;
                await saveAppState(this.paths.statePath, state);
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                state = updateSavedReplay(state, match.MatchGUID, {
                  ballchasingError: message,
                });
                result.failedUploads += 1;
                await saveAppState(this.paths.statePath, state);
              }
            }

            onUpdate?.(state, accounts);
          }

          const accountMessage = [
            `${session.displayName}: checked ${syncResult.checked}`,
            `${syncResult.downloaded.length} downloaded`,
            `${syncResult.skippedExisting} already saved`,
          ];
          if (syncResult.skippedNoReplayUrl > 0) {
            accountMessage.push(`${syncResult.skippedNoReplayUrl} without replay URL`);
          }
          if (syncResult.failed.length > 0) {
            accountMessage.push(`${syncResult.failed.length} failed`);
          }

          accounts = updateAccount(accounts, activeAccount.accountId, {
            lastSyncAt: new Date().toISOString(),
            lastSyncMessage: accountMessage.join(", "),
            lastSyncError: syncResult.failed[0]
              ? `${syncResult.failed[0].matchGuid}: ${syncResult.failed[0].error}`
              : undefined,
          });
          accountMessages.push(accountMessage.join(", "));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          accountErrors.push(`${account.displayName}: ${message}`);
          accounts = updateAccount(accounts, account.accountId, {
            lastSyncError: message,
          });
        } finally {
          await session?.rpc.close();
          await saveAccounts(this.paths.accountsPath, accounts);
          onUpdate?.(state, accounts);
        }
      }

      if (config.autoUploadBallchasing && config.ballchasingToken.trim()) {
        for (const replay of state.savedReplays) {
          if (replay.ballchasingId || replay.ballchasingUploadedAt) {
            continue;
          }

          try {
            const upload = await uploadReplayToBallchasing(
              replay.filePath,
              config.ballchasingToken.trim(),
              config.ballchasingVisibility,
            );

            state = updateSavedReplay(state, replay.matchGuid, {
              ballchasingId: upload.id,
              ballchasingUrl: upload.url,
              ballchasingUploadedAt: new Date().toISOString(),
              ballchasingError: undefined,
            });
            result.uploadedCount += 1;
            await saveAppState(this.paths.statePath, state);
            onUpdate?.(state, accounts);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            state = updateSavedReplay(state, replay.matchGuid, {
              ballchasingError: message,
            });
            result.failedUploads += 1;
            await saveAppState(this.paths.statePath, state);
          }
        }
      }

      const summary = [
        `Synced ${result.accountsSynced}/${enabledAccounts.length} account(s)`,
        `downloaded ${result.downloadedCount}`,
        `uploaded ${result.uploadedCount}`,
      ];
      if (result.skippedExisting > 0) {
        summary.push(`${result.skippedExisting} already saved`);
      }
      if (result.skippedNoReplayUrl > 0) {
        summary.push(`${result.skippedNoReplayUrl} without replay URL`);
      }
      if (result.failedDownloads > 0) {
        summary.push(`${result.failedDownloads} download failures`);
      }
      if (result.failedUploads > 0) {
        summary.push(`${result.failedUploads} upload failures`);
      }

      state = {
        ...state,
        lastSyncAt: new Date().toISOString(),
        lastSyncMessage: summary.join(", "),
        lastSyncError: accountErrors[0],
      };

      if (result.accountsSynced === 0 && accountErrors.length > 0) {
        throw new Error(accountErrors.join(" | "));
      }
    } catch (error) {
      state = {
        ...state,
        lastSyncError: error instanceof Error ? error.message : String(error),
      };
      throw error;
    } finally {
      state = {
        ...state,
        isSyncing: false,
      };
      await saveAppState(this.paths.statePath, state);
      await saveAccounts(this.paths.accountsPath, accounts);
      onUpdate?.(state, accounts);
      result.state = state;
      result.accounts = accounts;
      this.running = false;
    }

    return result;
  }
}
