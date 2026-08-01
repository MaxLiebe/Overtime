import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = join(root, "electron", "assets", "overtime-logo.png");
const iconPath = join(root, "electron", "assets", "icon.ico");

const icon = await pngToIco(logoPath);
writeFileSync(iconPath, icon);
console.log(`Wrote ${iconPath}`);
