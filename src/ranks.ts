import type { MatchSkills } from "./types.js";

export interface PlayerRank {
  tier: number;
  division: number;
}

/** Relative to electron/renderer/index.html */
const RANK_ICON_BASE_PATH = "../assets/ranks";

export function rankFromMatchSkills(skills: MatchSkills | undefined): PlayerRank | null {
  if (!skills?.bValid || skills.Tier == null || skills.Tier <= 0) {
    return null;
  }

  return {
    tier: skills.Tier,
    division: skills.Division ?? 0,
  };
}

export function getRankIconUrl(tier: number): string | null {
  if (!Number.isFinite(tier) || tier <= 0) {
    return null;
  }

  const index = Math.min(22, Math.max(1, Math.round(tier)));
  return `${RANK_ICON_BASE_PATH}/${index}.png`;
}

export function getRankTitle(tier: number, _division = 0): string {
  const names = [
    "Unranked",
    "Bronze I",
    "Bronze II",
    "Bronze III",
    "Silver I",
    "Silver II",
    "Silver III",
    "Gold I",
    "Gold II",
    "Gold III",
    "Platinum I",
    "Platinum II",
    "Platinum III",
    "Diamond I",
    "Diamond II",
    "Diamond III",
    "Champion I",
    "Champion II",
    "Champion III",
    "Grand Champion I",
    "Grand Champion II",
    "Grand Champion III",
    "Supersonic Legend",
  ];

  if (tier <= 0) {
    return "Unranked";
  }

  if (tier >= names.length) {
    return names[names.length - 1];
  }

  return names[tier] ?? "Ranked";
}
