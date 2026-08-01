import { basename } from "node:path";
import { isAllowedBallchasingApiUrl, sanitizeReplayDownloadFileName } from "./security.js";

export type BallchasingVisibility = "public" | "unlisted" | "private";

export type BallchasingErrorKind = "quota" | "unknown";

export interface BallchasingUploadResult {
  id: string;
  url: string;
  duplicate: boolean;
}

export class BallchasingUploadError extends Error {
  readonly kind: BallchasingErrorKind;
  readonly statusCode?: number;

  constructor(message: string, kind: BallchasingErrorKind, statusCode?: number) {
    super(message);
    this.name = "BallchasingUploadError";
    this.kind = kind;
    this.statusCode = statusCode;
  }
}

function classifyBallchasingFailure(
  status: number,
  bodyText: string,
): BallchasingErrorKind {
  const body = bodyText.toLowerCase();

  if (
    status === 429 ||
    body.includes("quota") ||
    body.includes("upload limit") ||
    body.includes("rate limit") ||
    body.includes("too many requests") ||
    body.includes("too many uploads")
  ) {
    return "quota";
  }

  return "unknown";
}

function formatBallchasingFailureMessage(
  kind: BallchasingErrorKind,
  status: number,
  bodyText: string,
): string {
  if (kind === "quota") {
    return "Ballchasing daily quota reached. Try again later or check ballchasing.com/upload.";
  }

  return `Ballchasing upload failed (${status}): ${bodyText || "Unknown error"}`;
}

export function getBallchasingErrorKind(error: unknown): BallchasingErrorKind {
  if (error instanceof BallchasingUploadError) {
    return error.kind;
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("upload limit") ||
    message.includes("rate limit")
  ) {
    return "quota";
  }

  return "unknown";
}

export function ballchasingFailureUpdates(error: unknown): {
  ballchasingError: string;
  ballchasingErrorKind: BallchasingErrorKind;
} {
  return {
    ballchasingError: error instanceof Error ? error.message : String(error),
    ballchasingErrorKind: getBallchasingErrorKind(error),
  };
}

export function parseBallchasingReplayUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
  ) {
    return trimmed.toLowerCase();
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "ballchasing.com" && !url.hostname.endsWith(".ballchasing.com")) {
      return null;
    }

    const replayMatch = url.pathname.match(/\/replay\/([^/]+)/i);
    if (replayMatch?.[1]) {
      return replayMatch[1].toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}

export function parseBallchasingGroupUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "ballchasing.com" && !url.hostname.endsWith(".ballchasing.com")) {
      return null;
    }

    const groupMatch = url.pathname.match(/\/group\/([^/]+)/i);
    return groupMatch?.[1]?.toLowerCase() ?? null;
  } catch {
    if (/^[a-z0-9-]+$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    return null;
  }
}

export type BallchasingImportTarget =
  | { kind: "replay"; id: string }
  | { kind: "group"; id: string };

export function parseBallchasingImportUrl(input: string): BallchasingImportTarget | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname === "ballchasing.com" || url.hostname.endsWith(".ballchasing.com")) {
      const groupMatch = url.pathname.match(/\/group\/([^/]+)/i);
      if (groupMatch?.[1]) {
        return { kind: "group", id: groupMatch[1].toLowerCase() };
      }

      const replayMatch = url.pathname.match(/\/replay\/([^/]+)/i);
      if (replayMatch?.[1]) {
        return { kind: "replay", id: replayMatch[1].toLowerCase() };
      }
    }
  } catch {
    // Fall through to bare id parsing.
  }

  const replayId = parseBallchasingReplayUrl(trimmed);
  if (replayId) {
    return { kind: "replay", id: replayId };
  }

  const groupId = parseBallchasingGroupUrl(trimmed);
  if (groupId) {
    return { kind: "group", id: groupId };
  }

  return null;
}

interface BallchasingReplayListResponse {
  list?: Array<{ id?: string }>;
  next?: string | null;
}

export async function listGroupReplayIds(
  groupId: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<string[]> {
  const ids: string[] = [];
  let nextUrl: string | null =
    `https://ballchasing.com/api/replays?group=${encodeURIComponent(groupId)}&count=200`;

  while (nextUrl) {
    const response = await fetchFn(nextUrl, {
      headers: {
        Authorization: token,
      },
    });

    const bodyText = response.ok ? "" : await response.text();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Ballchasing rejected the request. Check your API token and group access.",
        );
      }

      if (response.status === 404) {
        throw new Error("Ballchasing group was not found.");
      }

      throw new Error(
        `Failed to list group replays (${response.status}): ${bodyText || response.statusText}`,
      );
    }

    const payload = (await response.json()) as BallchasingReplayListResponse;
    for (const replay of payload.list ?? []) {
      if (replay.id) {
        ids.push(replay.id.toLowerCase());
      }
    }

    const candidate = payload.next?.trim() || null;
    if (!candidate) {
      nextUrl = null;
      continue;
    }
    if (!isAllowedBallchasingApiUrl(candidate)) {
      throw new Error("Ballchasing returned an unexpected pagination URL.");
    }
    nextUrl = candidate;
  }

  return ids;
}

function parseDownloadFileName(
  contentDisposition: string | null,
  replayId: string,
): string {
  let rawName = `${replayId}.replay`;

  if (contentDisposition) {
    const quoted = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i.exec(
      contentDisposition,
    );
    const encoded = quoted?.[1]?.trim();
    const plain = (quoted?.[2] ?? quoted?.[3])?.trim();
    if (encoded) {
      try {
        rawName = decodeURIComponent(encoded);
      } catch {
        rawName = encoded;
      }
    } else if (plain) {
      rawName = plain;
    }
  }

  return sanitizeReplayDownloadFileName(basename(rawName), replayId);
}

export async function downloadReplayFromBallchasing(
  replayId: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ data: Buffer; fileName: string }> {
  const response = await fetchFn(
    `https://ballchasing.com/api/replays/${encodeURIComponent(replayId)}/file`,
    {
      headers: {
        Authorization: token,
      },
    },
  );

  const bodyText = response.ok ? "" : await response.text();

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Ballchasing rejected the download. Check your API token and replay access.",
      );
    }

    if (response.status === 404) {
      throw new Error("Ballchasing replay was not found.");
    }

    throw new Error(
      `Failed to download replay (${response.status}): ${bodyText || response.statusText}`,
    );
  }

  const fileName = parseDownloadFileName(
    response.headers.get("content-disposition"),
    replayId,
  );
  const data = Buffer.from(await response.arrayBuffer());

  if (data.length === 0) {
    throw new Error("Ballchasing returned an empty replay file.");
  }

  return { data, fileName };
}

export async function setBallchasingReplayTitle(
  replayId: string,
  title: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }

  const response = await fetchFn(
    `https://ballchasing.com/api/replays/${encodeURIComponent(replayId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: trimmed }),
    },
  );

  if (!response.ok && response.status !== 204) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `Could not set Ballchasing title (${response.status}): ${bodyText || "Unknown error"}`,
    );
  }
}

export async function uploadReplayToBallchasing(
  filePath: string,
  token: string,
  visibility: BallchasingVisibility = "private",
  options: {
    uploadFileName?: string;
    title?: string;
    fetchFn?: typeof fetch;
  } = {},
): Promise<BallchasingUploadResult> {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const fetchFn = options.fetchFn ?? fetch;

  const data = await readFile(filePath);
  const preferredName = options.uploadFileName?.trim();
  let fileName = preferredName || basename(filePath);
  if (!fileName.toLowerCase().endsWith(".replay")) {
    fileName = `${fileName}.replay`;
  }
  const form = new FormData();
  form.append("file", new Blob([data]), fileName);

  const response = await fetchFn(
    `https://ballchasing.com/api/v2/upload?visibility=${visibility}`,
    {
      method: "POST",
      headers: {
        Authorization: token,
      },
      body: form,
    },
  );

  const bodyText = await response.text();
  let payload: { id?: string } = {};
  try {
    payload = JSON.parse(bodyText) as { id?: string };
  } catch {
    payload = {};
  }

  if (response.status === 201 || response.status === 409) {
    if (!payload.id) {
      throw new Error("Ballchasing response missing replay id");
    }

    const title =
      options.title?.trim() ||
      preferredName?.replace(/\.replay$/i, "").trim() ||
      "";
    if (title) {
      try {
        await setBallchasingReplayTitle(payload.id, title, token, fetchFn);
      } catch {
        // Upload succeeded; title is best-effort and should not fail the upload.
      }
    }

    return {
      id: payload.id,
      url: `https://ballchasing.com/replay/${payload.id}`,
      duplicate: response.status === 409,
    };
  }

  const kind = classifyBallchasingFailure(response.status, bodyText);
  throw new BallchasingUploadError(
    formatBallchasingFailureMessage(kind, response.status, bodyText),
    kind,
    response.status,
  );
}

export async function validateBallchasingToken(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetchFn("https://ballchasing.com/api/", {
    headers: { Authorization: token },
  });
  return response.ok;
}
