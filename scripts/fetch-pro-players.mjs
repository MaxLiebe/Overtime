/**
 * Fetches pro player profiles from Liquipedia (steam64ID in player infoboxes).
 *
 * Liquipedia limits: 1 query request / 2s, 1 parse request / 30s.
 * Run: npm run fetch-pro-players
 * Optional winnings (slow): npm run fetch-pro-players:winnings
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = "https://liquipedia.net/rocketleague/api.php";
const USER_AGENT = "Overtime/0.1 (Rocket League replay viewer; https://github.com/)";
const QUERY_DELAY_MS = 2100;
const PARSE_DELAY_MS = 31_000;
const WITH_WINNINGS = process.argv.includes("--with-winnings");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function wikiQuery(params, attempt = 0) {
  const url = new URL(API);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    },
  });

  if (response.status === 429 && attempt < 5) {
    const waitMs = QUERY_DELAY_MS * (attempt + 3);
    console.warn(`Rate limited (${params.action}). Waiting ${waitMs}ms…`);
    await sleep(waitMs);
    return wikiQuery(params, attempt + 1);
  }

  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Liquipedia API ${response.status}: ${body}`);
  }

  return response.json();
}

async function listAllCategoryMembers(category) {
  const members = [];
  let continueToken;

  do {
    const params = {
      action: "query",
      list: "categorymembers",
      cmtitle: category,
      cmlimit: 500,
      format: "json",
    };
    if (continueToken) {
      params.cmcontinue = continueToken;
    }

    const data = await wikiQuery(params);
    members.push(...(data.query?.categorymembers ?? []));
    continueToken = data.continue?.cmcontinue;
    await sleep(QUERY_DELAY_MS);
  } while (continueToken);

  return members.filter((member) => member.ns === 0);
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

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseWinnings(html) {
  const match = html.match(/Approx\.?\s*Total Winnings:\s*(\$[\d,]+)/i);
  return match?.[1] ?? "";
}

async function fetchPlayerBatch(titles) {
  const data = await wikiQuery({
    action: "query",
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    titles: titles.join("|"),
    format: "json",
  });

  return Object.values(data.query?.pages ?? {});
}

async function fetchParseHtml(title) {
  const data = await wikiQuery({
    action: "parse",
    page: title,
    prop: "text",
    format: "json",
  });

  return data.parse?.text?.["*"] ?? "";
}

async function fetchImageUrls(imageFiles) {
  const urls = new Map();
  const uniqueFiles = [...new Set(imageFiles.filter(Boolean))];

  for (let index = 0; index < uniqueFiles.length; index += 50) {
    const batch = uniqueFiles.slice(index, index + 50);
    const titles = batch.map((file) => `File:${file}`);
    const data = await wikiQuery({
      action: "query",
      titles: titles.join("|"),
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "120",
      format: "json",
    });

    for (const page of Object.values(data.query?.pages ?? {})) {
      const thumbUrl = page.imageinfo?.[0]?.thumburl;
      if (thumbUrl && page.title?.startsWith("File:")) {
        urls.set(page.title.slice(5), thumbUrl);
      }
    }

    await sleep(QUERY_DELAY_MS);
  }

  return urls;
}

function collectAliases(fields, pageTitle) {
  const aliases = new Set();

  if (fields.id) {
    aliases.add(normalizeName(fields.id));
  }
  if (pageTitle) {
    aliases.add(normalizeName(pageTitle));
  }

  return [...aliases].filter(Boolean).sort();
}

async function main() {
  console.log("Listing Liquipedia players…");
  const members = await listAllCategoryMembers("Category:Players");
  console.log(`Found ${members.length} player pages`);

  const draftProfiles = [];

  for (let index = 0; index < members.length; index += 50) {
    const batch = members.slice(index, index + 50);
    const titles = batch.map((member) => member.title);
    const pages = await fetchPlayerBatch(titles);

    for (const page of pages) {
      const wikitext = page.revisions?.[0]?.slots?.main?.["*"] ?? "";
      if (!wikitext.includes("{{Infobox player")) {
        continue;
      }

      const fields = parseInfoboxFields(wikitext);
      if (!fields.steam64ID) {
        continue;
      }

      draftProfiles.push({
        pageTitle: page.title,
        platformId: `steam:${fields.steam64ID}`,
        names: collectAliases(fields, page.title),
        displayName: fields.id || page.title,
        country: fields.country || "",
        winnings: "",
        imageFile: fields.image || "",
      });
    }

    console.log(
      `Processed ${Math.min(index + 50, members.length)}/${members.length} (${draftProfiles.length} pro profiles)`,
    );
    await sleep(QUERY_DELAY_MS);
  }

  if (WITH_WINNINGS) {
    console.log(`Fetching winnings for ${draftProfiles.length} profiles (about ${Math.ceil((draftProfiles.length * PARSE_DELAY_MS) / 60000)} min)…`);
    for (let index = 0; index < draftProfiles.length; index += 1) {
      const profile = draftProfiles[index];
      try {
        const html = await fetchParseHtml(profile.pageTitle);
        profile.winnings = parseWinnings(html);
      } catch (error) {
        console.warn(`Failed winnings for ${profile.pageTitle}:`, error.message);
      }

      if ((index + 1) % 10 === 0 || index + 1 === draftProfiles.length) {
        console.log(`Winnings ${index + 1}/${draftProfiles.length}`);
      }

      await sleep(PARSE_DELAY_MS);
    }
  }

  console.log("Resolving player images…");
  const imageUrls = await fetchImageUrls(draftProfiles.map((profile) => profile.imageFile));

  const profiles = draftProfiles
    .map(({ pageTitle, imageFile, ...profile }) => ({
      platformId: profile.platformId,
      names: profile.names,
      displayName: profile.displayName,
      liquipediaPage: pageTitle,
      country: profile.country,
      winnings: profile.winnings,
      imageUrl: imageUrls.get(imageFile) || "",
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  const output = `// Generated by scripts/fetch-pro-players.mjs — do not edit manually.
export interface GeneratedProPlayerProfile {
  platformId: string;
  names: readonly string[];
  displayName: string;
  liquipediaPage?: string;
  country: string;
  winnings: string;
  imageUrl: string;
}

export const PRO_PLAYER_PROFILES: readonly GeneratedProPlayerProfile[] = ${JSON.stringify(profiles, null, 2)};
`;

  const outPath = join(__dirname, "..", "src", "proPlayers.generated.ts");
  writeFileSync(outPath, output, "utf8");
  console.log(`Wrote ${profiles.length} pro profiles to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
