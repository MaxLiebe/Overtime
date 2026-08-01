import { authenticate, type AuthenticatedSession } from "./auth.js";
import {
  accountAccessTokenIsValid,
  accountCanAuthenticate,
  loadAccounts,
  modifyAccounts,
  sessionFromAuth,
  sessionFromEos,
  upsertAccount,
  updateAccount,
  type LinkedAccount,
} from "./accounts.js";
import type { TokenResponse } from "./types.js";
import { uploadReplayToBallchasing, ballchasingFailureUpdates } from "./ballchasing.js";
import {
  buildBallchasingReplayTitle,
  buildReplayExportFileName,
  getMatchResult,
  getPlaylistName,
  discoverPlatformPlayerId,
  resolveLocalPlayerInMatch,
  isCloudOnlyReplay,
} from "./format.js";
import { isProPlayer } from "./proPlayers.js";
import { rankFromMatchSkills } from "./ranks.js";
import { promoteReplayToCloudOnly } from "./replayCloud.js";
import { getMapDisplayName } from "./maps.js";
import { getMatchHistory } from "./matches.js";
import { syncReplays } from "./replays.js";
import {
  loadAppState,
  saveAppState,
  updateSavedReplay,
  upsertSavedReplay,
  type AppConfig,
  type AppState,
  type SavedReplayRecord,
} from "./store.js";
import type { SyncProgressEvent } from "./syncProgress.js";
import {
  SESSION_EXPIRED_MESSAGE,
  SESSION_REVOKED_MESSAGE,
} from "./sessionNotify.js";

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

export interface SyncRunOptions {
  /** Auth-code login responses keyed by account ID — skip redundant refresh on first sync. */
  freshTokenResponses?: ReadonlyMap<string, TokenResponse>;
  /** Device-code EOS login responses keyed by account ID. */
  freshEosTokens?: ReadonlyMap<string, import("./types.js").EosTokenResponse>;
  /** When set, only these accounts are synced (used after adding a new account). */
  onlyAccountIds?: readonly string[];
  onProgress?: (event: SyncProgressEvent) => void;
}

function formatAccountAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("invalid_refresh_token") ||
    message.includes("TOKEN_NOT_FOUND") ||
    message.includes("oauth.invalid_token") ||
    message.includes("Epic exchange failed") ||
    message.includes("Epic EOS token failed")
  ) {
    return SESSION_EXPIRED_MESSAGE;
  }
  return message;
}

function sessionAccountUpdates(
  session: AuthenticatedSession,
  freshAuth?: TokenResponse,
): Partial<LinkedAccount> {
  return {
    displayName: session.displayName,
    ...(freshAuth ? sessionFromAuth(freshAuth) : {}),
    eosRefreshToken: session.eosRefreshToken,
    eosRefreshExpiresAt: session.eosRefreshExpiresAt,
    ...(session.refreshToken.trim() ? { refreshToken: session.refreshToken } : {}),
    lastSyncError: undefined,
  };
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

  async run(
    onUpdate?: (state: AppState, accounts: LinkedAccount[]) => void,
    options?: SyncRunOptions,
  ): Promise<SyncRunResult> {
    if (this.running) {
      throw new Error("Sync already in progress");
    }

    this.running = true;
    const config = this.getConfig();
    let state = await loadAppState(this.paths.statePath);
    let accounts = await loadAccounts(this.paths.accountsPath);
    let enabledAccounts = accounts
      .filter((account) => account.enabled)
      .sort((a, b) => Date.parse(a.addedAt) - Date.parse(b.addedAt));

    if (options?.onlyAccountIds?.length) {
      const allowed = new Set(options.onlyAccountIds);
      enabledAccounts = enabledAccounts.filter((account) => allowed.has(account.accountId));
    }

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
      for (const [accountIndex, accountRef] of enabledAccounts.entries()) {
        let session: AuthenticatedSession | undefined;

        accounts = await loadAccounts(this.paths.accountsPath);
        const account = accounts.find(
          (item) => item.accountId === accountRef.accountId && item.enabled,
        );
        if (!account) {
          continue;
        }

        try {
          options?.onProgress?.({
            phase: "auth",
            accountDisplayName: account.displayName,
            accountIndex: accountIndex + 1,
            accountTotal: enabledAccounts.length,
          });

          const freshAuth = options?.freshTokenResponses?.get(account.accountId);
          const freshEos = options?.freshEosTokens?.get(account.accountId);

          if (!freshAuth && !freshEos && !accountCanAuthenticate(account)) {
            throw new Error(SESSION_REVOKED_MESSAGE);
          }

          const persistAuthTokens = async (updates: Partial<LinkedAccount>) => {
            accounts = await modifyAccounts(this.paths.accountsPath, (current) =>
              updateAccount(current, account.accountId, {
                ...updates,
                lastSyncError: undefined,
              }),
            );
            onUpdate?.(state, accounts);
          };

          session = await authenticate(
            freshEos
              ? {
                  eosTokenResponse: freshEos,
                  displayName: account.displayName,
                  accountId: account.accountId,
                  onEosTokenRefreshed: async (eos) => {
                    await persistAuthTokens(sessionFromEos(eos));
                  },
                }
              : freshAuth
              ? {
                  tokenResponse: freshAuth,
                  displayName: account.displayName,
                  accountId: account.accountId,
                  onEosTokenRefreshed: async (eos) => {
                    await persistAuthTokens(sessionFromEos(eos));
                  },
                }
              : accountAccessTokenIsValid(account)
                ? {
                    accessToken: account.accessToken,
                    accessTokenExpiresAt: account.accessTokenExpiresAt,
                    refreshToken: account.refreshToken,
                    eosRefreshToken: account.eosRefreshToken,
                    eosRefreshExpiresAt: account.eosRefreshExpiresAt,
                    displayName: account.displayName,
                    accountId: account.accountId,
                    onEosTokenRefreshed: async (eos) => {
                      await persistAuthTokens(sessionFromEos(eos));
                    },
                  }
                : {
                    refreshToken: account.refreshToken,
                    eosRefreshToken: account.eosRefreshToken,
                    eosRefreshExpiresAt: account.eosRefreshExpiresAt,
                    displayName: account.displayName,
                    accountId: account.accountId,
                    onTokenRefreshed: async (auth) => {
                      const nextToken = auth.refresh_token?.trim();
                      await persistAuthTokens({
                        ...sessionFromAuth(auth),
                        ...(nextToken ? { refreshToken: nextToken } : {}),
                      });
                    },
                    onEosTokenRefreshed: async (eos) => {
                      await persistAuthTokens(sessionFromEos(eos));
                    },
                  },
          );

          if (account.accountId !== session.accountId) {
            accounts = await modifyAccounts(this.paths.accountsPath, (current) =>
              upsertAccount(
                current.filter((item) => item.accountId !== account.accountId),
                {
                  account_id: session!.accountId,
                  displayName: session!.displayName,
                  refresh_token: session!.refreshToken,
                } as TokenResponse,
              ),
            );
            accounts = await modifyAccounts(this.paths.accountsPath, (current) =>
              updateAccount(current, session!.accountId, sessionAccountUpdates(session!)),
            );
          } else {
            accounts = await modifyAccounts(this.paths.accountsPath, (current) =>
              updateAccount(current, account.accountId, sessionAccountUpdates(session!, freshAuth)),
            );
          }
          onUpdate?.(state, accounts);

          const activeAccount =
            accounts.find((item) => item.accountId === session!.accountId) ?? account;

          options?.onProgress?.({
            phase: "fetching-history",
            accountDisplayName: session.displayName,
            accountIndex: accountIndex + 1,
            accountTotal: enabledAccounts.length,
          });

          const matches = await getMatchHistory(session.rpc);
          const playerLookup = {
            epicPlayerId: session.rpc.localPlayerId,
            accountId: activeAccount.accountId,
            displayName: session.displayName,
            platformPlayerId: activeAccount.platformPlayerId,
          };
          const platformPlayerId = discoverPlatformPlayerId(matches, playerLookup);
          if (platformPlayerId && platformPlayerId !== activeAccount.platformPlayerId) {
            accounts = await modifyAccounts(this.paths.accountsPath, (current) =>
              updateAccount(current, activeAccount.accountId, {
                platformPlayerId,
              }),
            );
            playerLookup.platformPlayerId = platformPlayerId;
          }

          options?.onProgress?.({
            phase: "checking-replays",
            accountDisplayName: session.displayName,
            pendingDownloads: 0,
          });

          const syncResult = await syncReplays(matches, {
            replayDir: config.replayDir,
            knownGuids: state.downloadedMatchGuids,
            skipDownloadGuids: state.savedReplays
              .filter(isCloudOnlyReplay)
              .map((replay) => replay.matchGuid),
            fileNameContext: {
              localPlayerId: session.rpc.localPlayerId,
              lookup: playerLookup,
            },
            onGuidsUpdated: async (guids) => {
              state.downloadedMatchGuids = guids;
              await saveAppState(this.paths.statePath, state);
            },
            onDownloadsQueued: (items) => {
              options?.onProgress?.({
                phase: "checking-replays",
                accountDisplayName: session!.displayName,
                pendingDownloads: items.length,
              });
              options?.onProgress?.({
                phase: "downloads-queued",
                accountDisplayName: session!.displayName,
                items,
              });
            },
            onDownloadStart: (info) => {
              options?.onProgress?.({
                phase: "download-start",
                accountDisplayName: session!.displayName,
                ...info,
              });
            },
            onDownloadProgress: (info) => {
              options?.onProgress?.({
                phase: "download-progress",
                ...info,
              });
            },
            onDownloadComplete: (info) => {
              options?.onProgress?.({
                phase: "download-complete",
                ...info,
              });
            },
            onDownloadFailed: (info) => {
              options?.onProgress?.({
                phase: "download-failed",
                ...info,
              });
            },
          });

          result.skippedExisting += syncResult.skippedExisting;
          result.skippedNoReplayUrl += syncResult.skippedNoReplayUrl;
          result.failedDownloads += syncResult.failed.length;
          result.accountsSynced += 1;

          for (const failure of syncResult.failed) {
            accountErrors.push(`${account.displayName}: ${failure.matchGuid} - ${failure.error}`);
          }

          for (const [downloadIndex, downloaded] of syncResult.downloaded.entries()) {
            const entry = matches.find(
              (match) =>
                match.Match.MatchGUID.toUpperCase() === downloaded.matchGuid.toUpperCase(),
            );
            if (!entry) {
              continue;
            }

            const match = entry.Match;
            options?.onProgress?.({
              phase: "saving-replay",
              matchGuid: match.MatchGUID,
              fileName: downloaded.fileName,
              index: downloadIndex + 1,
              total: syncResult.downloaded.length,
            });

            const localPlayer = resolveLocalPlayerInMatch(match.Players, playerLookup);
            const record: SavedReplayRecord = {
              matchGuid: match.MatchGUID,
              accountId: activeAccount.accountId,
              accountDisplayName: session.displayName,
              filePath: downloaded.filePath,
              fileName: downloaded.fileName,
              downloadedAt: new Date().toISOString(),
              playlist: match.Playlist,
              playlistName: getPlaylistName(match.Playlist),
              mapName: getMapDisplayName(match.MapName),
              recordStartTimestamp: match.RecordStartTimestamp,
              team0Score: match.Team0Score,
              team1Score: match.Team1Score,
              secondsPlayed: match.SecondsPlayed,
              overtimeSecondsPlayed: match.OvertimeSecondsPlayed,
              wentToOvertime: match.bOverTime,
              result: getMatchResult(match, session.rpc.localPlayerId, playerLookup),
              winningTeam: match.WinningTeam,
              localPlayerTeam: localPlayer?.LastTeam,
              localPlayerId: localPlayer?.PlayerID ?? playerLookup.platformPlayerId,
              isForfeit: match.bForfeit,
              players: match.Players.map((player) => {
                const rank = rankFromMatchSkills(player.Skills);
                return {
                  playerId: player.PlayerID,
                  playerName: player.PlayerName,
                  team: player.LastTeam,
                  teamColor: player.TeamColor,
                  score: player.Score,
                  goals: player.Goals,
                  assists: player.Assists,
                  saves: player.Saves,
                  shots: player.Shots,
                  demolishes: player.Demolishes,
                  isMvp: player.bMvp,
                  isPro: isProPlayer(player.PlayerID, player.PlayerName),
                  rankTier: rank?.tier ?? null,
                  rankDivision: rank?.division ?? null,
                };
              }),
              source: "synced",
              hasAccountMatch: true,
            };

            state = upsertSavedReplay(state, record);
            result.downloadedCount += 1;
            await saveAppState(this.paths.statePath, state);

            if (config.autoUploadBallchasing && config.ballchasingToken.trim()) {
              options?.onProgress?.({
                phase: "uploading-ballchasing",
                matchGuid: match.MatchGUID,
                fileName: downloaded.fileName,
              });

              try {
                const upload = await uploadReplayToBallchasing(
                  downloaded.filePath,
                  config.ballchasingToken.trim(),
                  config.ballchasingVisibility,
                  {
                    uploadFileName: buildReplayExportFileName(record),
                    title: buildBallchasingReplayTitle(record),
                  },
                );

                state = updateSavedReplay(state, match.MatchGUID, {
                  ballchasingId: upload.id,
                  ballchasingUrl: upload.url,
                  ballchasingUploadedAt: new Date().toISOString(),
                  ballchasingError: undefined,
                  ballchasingErrorKind: undefined,
                });
                result.uploadedCount += 1;
                if (config.deleteLocalAfterBallchasingUpload) {
                  const uploaded = state.savedReplays.find(
                    (item) =>
                      item.matchGuid.toUpperCase() === match.MatchGUID.toUpperCase(),
                  );
                  if (uploaded) {
                    state = await promoteReplayToCloudOnly(state, uploaded);
                  }
                }
                await saveAppState(this.paths.statePath, state);
              } catch (error) {
                state = updateSavedReplay(state, match.MatchGUID, ballchasingFailureUpdates(error));
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

          accounts = await modifyAccounts(this.paths.accountsPath, (current) =>
            updateAccount(current, activeAccount.accountId, {
              lastSyncAt: new Date().toISOString(),
              lastSyncMessage: accountMessage.join(", "),
              lastSyncError: syncResult.failed[0]
                ? `${syncResult.failed[0].matchGuid}: ${syncResult.failed[0].error}`
                : undefined,
            }),
          );
          accountMessages.push(accountMessage.join(", "));
          options?.onProgress?.({
            phase: "account-complete",
            accountDisplayName: session.displayName,
            message: accountMessage.join(", "),
          });
        } catch (error) {
          const message = formatAccountAuthError(error);
          accountErrors.push(`${account.displayName}: ${message}`);
          accounts = await modifyAccounts(this.paths.accountsPath, (current) =>
            updateAccount(current, account.accountId, {
              lastSyncError: message,
            }),
          );
        } finally {
          await session?.rpc.close();
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
              {
                uploadFileName: buildReplayExportFileName(replay),
                title: buildBallchasingReplayTitle(replay),
              },
            );

            state = updateSavedReplay(state, replay.matchGuid, {
              ballchasingId: upload.id,
              ballchasingUrl: upload.url,
              ballchasingUploadedAt: new Date().toISOString(),
              ballchasingError: undefined,
              ballchasingErrorKind: undefined,
            });
            result.uploadedCount += 1;
            if (config.deleteLocalAfterBallchasingUpload) {
              const uploaded = state.savedReplays.find(
                (item) =>
                  item.matchGuid.toUpperCase() === replay.matchGuid.toUpperCase(),
              );
              if (uploaded) {
                state = await promoteReplayToCloudOnly(state, uploaded);
              }
            }
            await saveAppState(this.paths.statePath, state);
            onUpdate?.(state, accounts);
          } catch (error) {
            state = updateSavedReplay(state, replay.matchGuid, ballchasingFailureUpdates(error));
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
        lastSyncError:
          result.accountsSynced === 0 && accountErrors.length > 0
            ? accountErrors[0]
            : undefined,
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
      accounts = await loadAccounts(this.paths.accountsPath);
      onUpdate?.(state, accounts);
      result.state = state;
      result.accounts = accounts;
      this.running = false;
    }

    return result;
  }
}
