import stadiumAssets from "../../data/stadiums-assets.json";

export interface StadiumAsset {
  id: string;
  slug: string;
  asset: string;
  width: number;
  height: number;
  format: string;
  stadiumOfficialName: string;
  knownAs?: string;
  city?: string;
  country?: string;
  recommendedUse?: string[];
}

const assets = stadiumAssets.assets as StadiumAsset[];

const normalize = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const byOfficial = new Map<string, StadiumAsset>();
const byKnown = new Map<string, StadiumAsset>();

assets.forEach((stadium) => {
  byOfficial.set(normalize(stadium.stadiumOfficialName), stadium);
  if (stadium.knownAs) byKnown.set(normalize(stadium.knownAs), stadium);
});

export function getStadiumAsset(location: string | null | undefined): StadiumAsset | null {
  if (!location) return null;
  const key = normalize(location);
  return byOfficial.get(key) ?? byKnown.get(key) ?? null;
}
