import { randomBytes } from "node:crypto";
import { rename, unlink, writeFile } from "node:fs/promises";

type WriteOptions = { encoding?: BufferEncoding; mode?: number };

/** Serialise writes per path so overlapping saves cannot interleave. */
const writeChains = new Map<string, Promise<void>>();

/**
 * Write `data` to a temporary sibling and rename it over `path`. A crash, power loss or
 * two overlapping saves can no longer leave a half-written JSON file behind, which the
 * loaders would read as "no accounts" or "empty library".
 */
export function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  options: WriteOptions = {},
): Promise<void> {
  const previous = writeChains.get(path) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        await writeFile(tempPath, data, {
          encoding: typeof data === "string" ? (options.encoding ?? "utf8") : undefined,
          mode: options.mode,
        });
        await renameWithRetry(tempPath, path);
      } catch (error) {
        await unlink(tempPath).catch(() => undefined);
        throw error;
      }
    });

  const tracked = next.finally(() => {
    if (writeChains.get(path) === tracked) {
      writeChains.delete(path);
    }
  });
  writeChains.set(path, tracked);
  return next;
}

/**
 * On Windows, antivirus scanners and the search indexer briefly hold files open, which
 * makes rename fail with EPERM/EBUSY/EACCES. Those clear within milliseconds.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const delays = [20, 60, 150, 400];
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!retryable || attempt >= delays.length) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}
