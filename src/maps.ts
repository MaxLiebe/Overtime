const MAP_DISPLAY_NAMES: Record<string, string> = {
  stadium_p: "DFH Stadium",
  stadium_foggy_p: "DFH Stadium (Stormy)",
  stadium_day_p: "DFH Stadium (Day)",
  stadium_winter_p: "DFH Stadium (Snowy)",
  stadium_anniversary_p: "DFH Stadium (Anniversary)",
  stadium_circuit_p: "DFH Stadium (Circuit)",
  eurostadium_p: "Mannfield",
  eurostadium_rainy_p: "Mannfield (Stormy)",
  eurostadium_night_p: "Mannfield (Night)",
  eurostadium_snownight_p: "Mannfield (Snowy)",
  eurostadium_dusk_p: "Mannfield (Dusk)",
  cs_p: "Champions Field",
  cs_day_p: "Champions Field (Day)",
  cs_hw_p: "Rivals Arena",
  trainstation_p: "Urban Central",
  trainstation_night_p: "Urban Central (Night)",
  trainstation_dawn_p: "Urban Central (Dawn)",
  haunted_trainstation_p: "Urban Central (Haunted)",
  park_p: "Beckwith Park",
  park_rainy_p: "Beckwith Park (Stormy)",
  park_night_p: "Beckwith Park (Midnight)",
  park_snowy_p: "Beckwith Park (Snowy)",
  utopiastadium_p: "Utopia Coliseum",
  utopiastadium_dusk_p: "Utopia Coliseum (Dusk)",
  utopiastadium_snow_p: "Utopia Coliseum (Snowy)",
  utopiastadium_gilded_p: "Utopia Coliseum (Gilded)",
  wasteland_p: "Wasteland",
  wasteland_s_p: "Wasteland (Standard)",
  wasteland_night_p: "Wasteland (Night)",
  wasteland_night_s_p: "Wasteland (Standard, Night)",
  wasteland_pitched_p: "Wasteland (Pitched)",
  neotokyo_p: "Neo Tokyo",
  neotokyo_standard_p: "Neo Tokyo (Standard)",
  neotokyo_hacked_p: "Neo Tokyo (Hacked)",
  neotokyo_comic_p: "Neo Tokyo (Comic)",
  neotokyo_arcade_p: "Neo Tokyo (Arcade)",
  underwater_p: "AquaDome",
  underwater_shallows_p: "AquaDome (Shallows)",
  arc_p: "Starbase ARC",
  arc_standard_p: "Starbase ARC (Standard)",
  arc_aftermath_p: "Starbase ARC (Aftermath)",
  farm_p: "Farmstead",
  farm_night_p: "Farmstead (Night)",
  farm_pitched_p: "Farmstead (Pitched)",
  farm_upsidedown_p: "Farmstead (The Upside Down)",
  beach_p: "Salty Shores",
  beach_night_p: "Salty Shores (Night)",
  beach_saltyfest_p: "Salty Shores (Salty Fest)",
  chn_stadium_p: "Forbidden Temple",
  chn_stadium_day_p: "Forbidden Temple (Day)",
  chn_stadium_fireice_p: "Forbidden Temple (Fire & Ice)",
  hoopsstadium_p: "Dunk House",
  shattershot_p: "Core 707",
  throwbackstadium_p: "Throwback Stadium",
  neonfields_p: "Neon Fields",
  sovereignheights_p: "Sovereign Heights",
  deadeyecanyon_p: "Deadeye Canyon",
  deadeyecanyon_oasis_p: "Deadeye Canyon (Oasis)",
  estadiovida_dusk_p: "Estadio Vida (Dusk)",
  driftwoods_p: "Drift Woods",
  driftwoods_night_p: "Drift Woods (Night)",
  futuragarden_p: "Futura Garden",
  boostfieldmall_p: "Boostfield Mall",
  parcdeparis_p: "Parc de Paris",
  labs_circlepillars_p: "Pillars",
  labs_cosmic_p: "Cosmic",
  labs_cosmic_v4_p: "Cosmic",
  labs_doublegoal_p: "Double Goal",
  labs_doublegoal_v2_p: "Double Goal",
  labs_octagon_p: "Octagon",
  labs_octagon_02_p: "Octagon",
  labs_underpass_p: "Underpass",
  labs_underpass_v0_p: "Underpass",
  labs_utopia_p: "Utopia Retro",
};

function normalizeMapKey(mapName: string): string {
  return mapName.trim().toLowerCase().replace(/\.upk$/i, "");
}

function formatFallbackMapName(mapName: string): string {
  return mapName
    .replace(/\.upk$/i, "")
    .replace(/_p$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getMapDisplayName(mapName: string): string {
  if (!mapName.trim()) {
    return "Unknown Arena";
  }

  const key = normalizeMapKey(mapName);
  return MAP_DISPLAY_NAMES[key] ?? formatFallbackMapName(mapName);
}
