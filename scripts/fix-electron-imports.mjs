import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const electronDist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "electron");

for (const file of readdirSync(electronDist)) {
  if (!file.endsWith(".js")) {
    continue;
  }

  const filePath = join(electronDist, file);
  const updated = readFileSync(filePath, "utf8").replaceAll('"rlapi"', '"../index.js"');
  writeFileSync(filePath, updated);
}

console.log("Rewrote rlapi imports in dist/electron");
