export const GAME_MODES = ['BATTLE', 'CONQUEST'] as const;

export type GameMode = (typeof GAME_MODES)[number];

export interface GameModeCapabilities {
  resources: boolean;
  recruitment: boolean;
  equipment: boolean;
  construction: boolean;
  supply: boolean;
  conquest: boolean;
}

export const GAME_MODE_RULES: Readonly<Record<GameMode, Readonly<GameModeCapabilities>>> = Object.freeze({
  BATTLE: Object.freeze({
    resources: false,
    recruitment: false,
    equipment: false,
    construction: false,
    supply: false,
    conquest: false,
  }),
  CONQUEST: Object.freeze({
    resources: true,
    recruitment: true,
    equipment: true,
    construction: false,
    supply: false,
    conquest: true,
  }),
});

export const GAME_MODE_LABELS: Readonly<Record<GameMode, string>> = Object.freeze({
  BATTLE: '戦闘モード',
  CONQUEST: 'コンクエストモード',
});

export const GAME_MODE_DESCRIPTIONS: Readonly<Record<GameMode, string>> = Object.freeze({
  BATTLE: '完成した部隊ですぐに大規模戦闘を楽しみます。敵Bannerを破壊すれば勝利です。',
  CONQUEST: 'A/B/Cの旗を奪い合い、部隊壊滅と拠点支配で敵Ticketを削ります。資源採取・兵員上限・武器防具/砲兵強化も有効です。',
});

export function isGameMode(value: unknown): value is GameMode {
  return value === 'BATTLE' || value === 'CONQUEST';
}

export function gameModeLabel(mode: GameMode): string {
  return GAME_MODE_LABELS[mode];
}

export function gameModeDescription(mode: GameMode): string {
  return GAME_MODE_DESCRIPTIONS[mode];
}

export function gameModeRules(mode: GameMode): Readonly<GameModeCapabilities> {
  return GAME_MODE_RULES[mode];
}
