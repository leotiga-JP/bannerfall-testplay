export const FACTION_IDS = ['FRENCH', 'PRUSSIAN', 'BRITISH', 'RUSSIAN'] as const;

export type FactionId = (typeof FACTION_IDS)[number];

export interface FactionBannerInfo {
  id: FactionId;
  label: string;
  shortLabel: string;
  description: string;
  accent: string;
}

export const FACTION_BANNERS: Readonly<Record<FactionId, Readonly<FactionBannerInfo>>> = Object.freeze({
  FRENCH: Object.freeze({
    id: 'FRENCH',
    label: 'フランス風',
    shortLabel: 'フランス',
    description: '青・白・赤を基調にした華やかな軍旗。',
    accent: '#d7b65b',
  }),
  PRUSSIAN: Object.freeze({
    id: 'PRUSSIAN',
    label: 'プロイセン風',
    shortLabel: 'プロイセン',
    description: '白・黒を基調にした端正な軍旗。',
    accent: '#202020',
  }),
  BRITISH: Object.freeze({
    id: 'BRITISH',
    label: 'イギリス風',
    shortLabel: 'イギリス',
    description: '赤・白・青を基調にした十字旗。',
    accent: '#b82e32',
  }),
  RUSSIAN: Object.freeze({
    id: 'RUSSIAN',
    label: 'ロシア風',
    shortLabel: 'ロシア',
    description: '白・緑・金を基調にした重厚な帝国風軍旗。',
    accent: '#bda14c',
  }),
});

export const DEFAULT_BLUE_FACTION: FactionId = 'FRENCH';
export const DEFAULT_RED_FACTION: FactionId = 'PRUSSIAN';

export function isFactionId(value: unknown): value is FactionId {
  return typeof value === 'string' && (FACTION_IDS as readonly string[]).includes(value);
}

export function factionLabel(faction: FactionId): string {
  return FACTION_BANNERS[faction].label;
}

export function factionShortLabel(faction: FactionId): string {
  return FACTION_BANNERS[faction].shortLabel;
}

export function ensureDistinctFactions(blue: FactionId, red: FactionId): { blue: FactionId; red: FactionId } {
  if (blue !== red) return { blue, red };
  const alternate = FACTION_IDS.find((candidate) => candidate !== blue) ?? DEFAULT_RED_FACTION;
  return { blue, red: alternate };
}
