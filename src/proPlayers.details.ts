interface GeneratedProPlayerProfile {
  platformId: string;
  names: readonly string[];
  displayName: string;
  liquipediaPage?: string;
  country: string;
  winnings: string;
  imageUrl: string;
}

// Optional profile overrides (e.g. players missing from the generated bundle).
export const PRO_PLAYER_PROFILES: readonly GeneratedProPlayerProfile[] = [
  {
    platformId: "steam:76561198994386260",
    names: ["atomic", "franceschi", "massimo"],
    displayName: "Atomic",
    liquipediaPage: "Atomic",
    country: "United States",
    winnings: "",
    imageUrl:
      "https://liquipedia.net/commons/images/thumb/2/26/RLCS_2026_Micha%C5%82_Konkol_Paris_Major_Atomic.jpg/120px-RLCS_2026_Micha%C5%82_Konkol_Paris_Major_Atomic.jpg",
  },
  {
    platformId: "steam:76561198136523266",
    names: ["garrettg", "garrett", "gordon"],
    displayName: "GarrettG",
    liquipediaPage: "GarrettG",
    country: "United States",
    winnings: "",
    imageUrl:
      "https://liquipedia.net/commons/images/thumb/f/f8/RLCS_Worlds_2022_LAN_Stephanie_Lindgren_GarrettG.jpg/120px-RLCS_Worlds_2022_LAN_Stephanie_Lindgren_GarrettG.jpg",
  },
  {
    platformId: "steam:76561198960239428",
    names: ["vatira", "axel", "touret"],
    displayName: "Vatira",
    liquipediaPage: "Vatira",
    country: "France",
    winnings: "",
    imageUrl:
      "https://liquipedia.net/commons/images/thumb/9/92/RLCS_2026_Micha%C5%82_Konkol_Paris_Major_Vatira.jpg/120px-RLCS_2026_Micha%C5%82_Konkol_Paris_Major_Vatira.jpg",
  },
  {
    platformId: "steam:76561198144145654",
    names: ["zen", "alexis", "bernier"],
    displayName: "zen",
    liquipediaPage: "zen",
    country: "France",
    winnings: "$523,707",
    imageUrl:
      "https://liquipedia.net/commons/images/thumb/7/74/RLCS_Paris_Major_2026_LAN_Michal_Konkol_zen.jpg/120px-RLCS_Paris_Major_2026_LAN_Michal_Konkol_zen.jpg",
  },
];
