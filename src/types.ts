export interface PsyNetError {
  Type: string;
  Message: string;
}

export class PsyNetRequestError extends Error {
  readonly psyError: PsyNetError;

  constructor(psyError: PsyNetError) {
    super(`${psyError.Type}: ${psyError.Message}`);
    this.name = "PsyNetRequestError";
    this.psyError = psyError;
  }
}

export interface PsyResponse<T = unknown> {
  PsyResponseID?: string;
  Result?: T;
  Error?: PsyNetError;
}

export interface AuthPlayerRequest {
  Platform: string;
  PlayerName: string;
  PlayerID: string;
  Language: string;
  AuthTicket: string;
  BuildRegion: string;
  FeatureSet: string;
  Device: string;
  LocalFirstPlayerID: string;
  bSkipAuth: boolean;
  bSetAsPrimaryAccount: boolean;
  EpicAuthTicket: string;
  EpicAccountID: string;
}

export interface AuthPlayerResponse {
  IsLastChanceAuthBan: boolean;
  SessionID: string;
  VerifiedPlayerName: string;
  UseWebSocket: boolean;
  PerConURL: string;
  PerConURLv2: string;
  PsyToken: string;
  CountryRestrictions: string[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string;
  token_type: string;
  client_id: string;
  internal_client: boolean;
  client_service: string;
  account_id: string;
  displayName: string;
  app: string;
  in_app_id: string;
  device_id: string;
}

export interface EosTokenResponse {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
  expires_at: string;
  refresh_expires_in: number;
  refresh_expires_at: string;
  token_type: string;
  scope: string;
  client_id: string;
  application_id: string;
  account_id: string;
  selected_account_id: string;
  merged_accounts: string[];
  acr: string;
  auth_time: string;
}

export interface DeviceAuthResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/** Long-lived Epic device_auth credentials (account_id + device_id + secret). */
export interface EpicDeviceAuthCredentials {
  accountId: string;
  deviceId: string;
  secret: string;
  /** OAuth client that created/owns these credentials. */
  clientId: string;
}

export interface MatchSkills {
  Mu: number | null;
  Sigma: number | null;
  Tier: number | null;
  Division: number | null;
  PrevMu: number | null;
  PrevSigma: number | null;
  PrevTier: number | null;
  PrevDivision: number | null;
  bValid: boolean;
}

export interface MatchPlayer {
  PlayerID: string;
  PlayerName: string;
  ConnectTimestamp: number;
  JoinTimestamp: number;
  LeaveTimestamp: number;
  PartyLeaderID: string;
  InParty: boolean;
  bAbandoned: boolean;
  bMvp: boolean;
  LastTeam: number;
  TeamColor: string;
  SecondsPlayed: number;
  Score: number;
  Goals: number;
  Assists: number;
  Saves: number;
  Shots: number;
  Demolishes: number;
  OwnGoals: number;
  Skills: MatchSkills;
}

export interface Match {
  MatchGUID: string;
  RecordStartTimestamp: number;
  MapName: string;
  Playlist: number;
  SecondsPlayed: number;
  OvertimeSecondsPlayed: number;
  WinningTeam: number;
  Team0Score: number;
  Team1Score: number;
  bOverTime: boolean;
  bNoContest: boolean;
  bForfeit: boolean;
  CustomMatchCreatorPlayerID?: string;
  bClubVsClub: boolean;
  Mutators: string[];
  Players: MatchPlayer[];
}

export interface MatchEntry {
  ReplayUrl: string;
  Match: Match;
}

export interface GetMatchHistoryResponse {
  Matches: MatchEntry[];
}

export enum EventType {
  Disconnected = 0,
  Message = 1,
}

export interface PsyNetEvent {
  type: EventType;
  content: string;
}

export interface ParsedPsyResponse {
  ResponseID: string;
  Result: unknown;
  Error: PsyNetError | null;
}
