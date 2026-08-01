/** Map Liquipedia country names to flagcdn.com codes (ISO 3166-1 or regional). */
const COUNTRY_CODES: Record<string, string> = {
  afghanistan: "af",
  albania: "al",
  algeria: "dz",
  argentina: "ar",
  australia: "au",
  austria: "at",
  belgium: "be",
  bolivia: "bo",
  bosniaandherzegovina: "ba",
  brazil: "br",
  bulgaria: "bg",
  canada: "ca",
  chile: "cl",
  china: "cn",
  colombia: "co",
  croatia: "hr",
  czechia: "cz",
  czechrepublic: "cz",
  denmark: "dk",
  ecuador: "ec",
  egypt: "eg",
  england: "gb-eng",
  estonia: "ee",
  finland: "fi",
  france: "fr",
  georgia: "ge",
  germany: "de",
  greece: "gr",
  hungary: "hu",
  iceland: "is",
  india: "in",
  indonesia: "id",
  iran: "ir",
  ireland: "ie",
  israel: "il",
  italy: "it",
  japan: "jp",
  jordan: "jo",
  kazakhstan: "kz",
  kuwait: "kw",
  latvia: "lv",
  lebanon: "lb",
  lithuania: "lt",
  luxembourg: "lu",
  malaysia: "my",
  mexico: "mx",
  morocco: "ma",
  netherlands: "nl",
  newzealand: "nz",
  northmacedonia: "mk",
  norway: "no",
  oman: "om",
  pakistan: "pk",
  paraguay: "py",
  peru: "pe",
  philippines: "ph",
  poland: "pl",
  portugal: "pt",
  qatar: "qa",
  romania: "ro",
  russia: "ru",
  saudiarabia: "sa",
  scotland: "gb-sct",
  serbia: "rs",
  singapore: "sg",
  slovakia: "sk",
  slovenia: "si",
  southafrica: "za",
  southkorea: "kr",
  spain: "es",
  sweden: "se",
  switzerland: "ch",
  syria: "sy",
  taiwan: "tw",
  thailand: "th",
  tunisia: "tn",
  turkey: "tr",
  ukraine: "ua",
  unitedarabemirates: "ae",
  unitedkingdom: "gb",
  unitedstates: "us",
  uruguay: "uy",
  usa: "us",
  venezuela: "ve",
  vietnam: "vn",
  wales: "gb-wls",
};

function normalizeCountryKey(country: string): string {
  return country.trim().toLowerCase().replace(/[^a-z]/g, "");
}

export function getCountryCode(country: string | undefined): string | undefined {
  if (!country?.trim()) {
    return undefined;
  }

  const primary = country.split("/")[0]?.trim() ?? country;
  return COUNTRY_CODES[normalizeCountryKey(primary)];
}

/** SVG flag image URL (works on Windows; scales cleanly at any size). */
export function getCountryFlagImageUrl(country: string | undefined): string | undefined {
  const code = getCountryCode(country);
  if (!code) {
    return undefined;
  }

  return `https://flagcdn.com/${code}.svg`;
}
