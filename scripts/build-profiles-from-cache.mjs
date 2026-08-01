/**
 * Build proPlayers.generated.ts from a saved Liquipedia API JSON response.
 * Usage: node scripts/build-proprofiles-from-cache.mjs <path-to-json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseInfoboxFields(wikitext) {
  const start = wikitext.search(/\{\{Infobox player/i);
  if (start === -1) {
    return {};
  }

  const infobox = wikitext.slice(start);
  const readField = (name) => {
    const match = infobox.match(new RegExp(`\\|${name}=([^\\n|]+)`, "i"));
    return match?.[1]?.trim();
  };

  return {
    id: readField("id"),
    name: readField("name"),
    country: readField("country"),
    image: readField("image"),
    steam64ID: readField("steam64ID"),
  };
}

function collectAliases(fields, pageTitle) {
  const aliases = new Set();
  if (fields.id) aliases.add(normalizeName(fields.id));
  if (fields.name) {
    for (const part of fields.name.split(/\s+/)) {
      const normalized = normalizeName(part);
      if (normalized.length >= 2) aliases.add(normalized);
    }
  }
  if (pageTitle) aliases.add(normalizeName(pageTitle));
  return [...aliases].filter(Boolean).sort();
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/build-profiles-from-cache.mjs <api-json-file>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(inputPath, "utf8"));
const pages = Object.values(data.query?.pages ?? {});
const profiles = [];

for (const page of pages) {
  const wikitext = page.revisions?.[0]?.slots?.main?.["*"] ?? "";
  if (!wikitext.includes("{{Infobox player")) continue;

  const fields = parseInfoboxFields(wikitext);
  if (!fields.steam64ID) continue;

  profiles.push({
    platformId: `steam:${fields.steam64ID}`,
    names: collectAliases(fields, page.title),
    displayName: fields.id || page.title,
    country: fields.country || "",
    winnings: "",
    imageUrl: "",
  });
}

profiles.sort((a, b) => a.displayName.localeCompare(b.displayName));

const output = `// Generated from cache file — run npm run fetch-pro-players for full data.
export interface GeneratedProPlayerProfile {
  platformId: string;
  names: readonly string[];
  displayName: string;
  country: string;
  winnings: string;
  imageUrl: string;
}

export const PRO_PLAYER_PROFILES: readonly GeneratedProPlayerProfile[] = ${JSON.stringify(profiles, null, 2)};
`;

const outPath = join(__dirname, "..", "src", "proPlayers.generated.ts");
writeFileSync(outPath, output, "utf8");
console.log(`Wrote ${profiles.length} profiles to ${outPath}`);
