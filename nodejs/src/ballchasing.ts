export type BallchasingVisibility = "public" | "unlisted" | "private";

export interface BallchasingUploadResult {
  id: string;
  url: string;
  duplicate: boolean;
}

export async function uploadReplayToBallchasing(
  filePath: string,
  token: string,
  visibility: BallchasingVisibility = "private",
  fetchFn: typeof fetch = fetch,
): Promise<BallchasingUploadResult> {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");

  const data = await readFile(filePath);
  const fileName = basename(filePath);
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

    return {
      id: payload.id,
      url: `https://ballchasing.com/replay/${payload.id}`,
      duplicate: response.status === 409,
    };
  }

  throw new Error(
    `Ballchasing upload failed (${response.status}): ${bodyText || response.statusText}`,
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
