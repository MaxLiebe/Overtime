interface GeneratedProPlayerProfile {
  platformId: string;
  names: readonly string[];
  displayName: string;
  country: string;
  winnings: string;
  imageUrl: string;
  liquipediaPage?: string;
}

export interface ProPlayerProfile {
  displayName: string;
  country: string;
  winnings: string;
  imageUrl: string;
  liquipediaPage?: string;
}

const proPlatformIds = new Set<string>();
const profileByPlatformId = new Map<string, ProPlayerProfile>();

function isSupportedProPlatform(platformKey: string): boolean {
  return platformKey.startsWith("steam:") || platformKey.startsWith("epic:");
}

function toProfile(profile: GeneratedProPlayerProfile): ProPlayerProfile {
  return {
    displayName: profile.displayName,
    country: profile.country,
    winnings: profile.winnings,
    imageUrl: profile.imageUrl,
    liquipediaPage: profile.liquipediaPage,
  };
}

export function getLiquipediaProfileUrl(pageTitle: string): string {
  const slug = pageTitle.trim().replace(/ /g, "_");
  return `https://liquipedia.net/rocketleague/${encodeURI(slug)}`;
}

export function getProPlayerLiquipediaUrl(
  playerId: string,
  playerName: string,
): string | undefined {
  const profile = getProPlayerProfile(playerId, playerName);
  if (!profile) {
    return undefined;
  }

  const page = profile.liquipediaPage || profile.displayName || playerName;
  return getLiquipediaProfileUrl(page);
}

function registerProfile(
  platformId: string | undefined,
  profile: ProPlayerProfile,
) {
  if (platformId) {
    proPlatformIds.add(platformId);
    profileByPlatformId.set(platformId, profile);
  }
}

async function loadGeneratedData(): Promise<void> {
  const generated = await import("./proPlayers.generated.js");

  if ("PRO_PLAYER_PROFILES" in generated && Array.isArray(generated.PRO_PLAYER_PROFILES)) {
    for (const profile of generated.PRO_PLAYER_PROFILES) {
      registerProfile(profile.platformId, toProfile(profile));
    }
  }

  const legacyIds =
    "PRO_PLAYER_PLATFORM_IDS" in generated && Array.isArray(generated.PRO_PLAYER_PLATFORM_IDS)
      ? generated.PRO_PLAYER_PLATFORM_IDS
      : [];

  for (const platformId of legacyIds) {
    proPlatformIds.add(platformId);
  }

  try {
    const details = await import("./proPlayers.details.js");
    if (Array.isArray(details.PRO_PLAYER_PROFILES)) {
      for (const profile of details.PRO_PLAYER_PROFILES) {
        registerProfile(profile.platformId, toProfile(profile));
      }
    }
  } catch {
    // Optional seed overrides.
  }
}

await loadGeneratedData();

/** Normalize replay/ballchasing player IDs to `platform:id` (lowercase). */
export function normalizeProLookupPlatformId(playerId: string): string | undefined {
  const trimmed = playerId.trim();
  if (!trimmed) {
    return undefined;
  }

  const pipeParts = trimmed.split("|");
  if (pipeParts.length >= 2) {
    const platform = pipeParts[0].trim().toLowerCase();
    const id = pipeParts[1].trim();
    if (!id || id === "0") {
      return undefined;
    }

    switch (platform) {
      case "steam":
        return `steam:${id}`;
      case "epic":
        return `epic:${id.toLowerCase()}`;
      case "ps4":
        return `ps4:${id.toLowerCase()}`;
      case "xboxone":
        return `xboxone:${id.toLowerCase()}`;
      default:
        return `${platform}:${id.toLowerCase()}`;
    }
  }

  if (trimmed.includes(":")) {
    const [platform, ...rest] = trimmed.split(":");
    const id = rest.join(":").trim();
    if (platform && id) {
      return `${platform.trim().toLowerCase()}:${id.toLowerCase()}`;
    }
  }

  return undefined;
}

function fallbackProfile(playerName: string): ProPlayerProfile {
  return {
    displayName: playerName,
    country: "",
    winnings: "",
    imageUrl: "",
  };
}

export function profileHasTooltipData(profile: ProPlayerProfile): boolean {
  return Boolean(profile.imageUrl || profile.country || profile.winnings);
}

export function getProPlayerTooltipProfile(
  playerId: string,
  playerName: string,
): ProPlayerProfile | undefined {
  const profile = getProPlayerProfile(playerId, playerName);
  if (!profile || !profileHasTooltipData(profile)) {
    return undefined;
  }

  return profile;
}

export function getProPlayerProfile(
  playerId: string,
  playerName: string,
): ProPlayerProfile | undefined {
  const platformKey = normalizeProLookupPlatformId(playerId);
  if (!platformKey || !isSupportedProPlatform(platformKey)) {
    return undefined;
  }

  const byPlatform = profileByPlatformId.get(platformKey);
  if (byPlatform) {
    return byPlatform;
  }

  if (proPlatformIds.has(platformKey)) {
    return fallbackProfile(playerName);
  }

  return undefined;
}

export function isProPlayer(playerId: string, playerName: string): boolean {
  return getProPlayerProfile(playerId, playerName) !== undefined;
}
