import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "electron", "assets", "ranks");

function sourceUrlForTier(tier) {
  if (tier >= 19) {
    return `https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s15rank${tier}.png`;
  }

  return `https://trackercdn.com/cdn/tracker.gg/rocket-league/ranks/s4-${tier}.png`;
}

await mkdir(outputDir, { recursive: true });

for (let tier = 1; tier <= 22; tier += 1) {
  const url = sourceUrlForTier(tier);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download tier ${tier} from ${url}: ${response.status}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const outputPath = join(outputDir, `${tier}.png`);
  await writeFile(outputPath, data);
  console.log(`Wrote ${outputPath} (${data.length} bytes)`);
}
