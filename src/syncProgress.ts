export type SyncProgressEvent =
  | {
      phase: "auth";
      accountDisplayName: string;
      accountIndex: number;
      accountTotal: number;
    }
  | {
      phase: "fetching-history";
      accountDisplayName: string;
      accountIndex: number;
      accountTotal: number;
    }
  | {
      phase: "checking-replays";
      accountDisplayName: string;
      pendingDownloads: number;
    }
  | {
      phase: "downloads-queued";
      accountDisplayName: string;
      items: Array<{ matchGuid: string; fileName: string }>;
    }
  | {
      phase: "download-start";
      accountDisplayName: string;
      matchGuid: string;
      fileName: string;
      index: number;
      total: number;
    }
  | {
      phase: "download-progress";
      matchGuid: string;
      bytesReceived: number;
      bytesTotal?: number;
    }
  | {
      phase: "download-complete";
      matchGuid: string;
      fileName: string;
    }
  | {
      phase: "download-failed";
      matchGuid: string;
      fileName: string;
      error: string;
    }
  | {
      phase: "uploading-ballchasing";
      matchGuid: string;
      fileName: string;
    }
  | {
      phase: "saving-replay";
      matchGuid: string;
      fileName: string;
      index: number;
      total: number;
    }
  | {
      phase: "account-complete";
      accountDisplayName: string;
      message: string;
    };
