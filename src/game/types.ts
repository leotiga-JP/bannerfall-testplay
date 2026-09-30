export const TEAM_IDS = ['blue', 'red', 'yellow', 'green'] as const;
export type Team = typeof TEAM_IDS[number];

export function isTeam(value: unknown): value is Team {
  return typeof value === 'string' && (TEAM_IDS as readonly string[]).includes(value);
}

export function teamLabel(team: Team): string {
  return team.toUpperCase();
}

export function teamPrefix(team: Team): string {
  if (team === 'blue') return 'B';
  if (team === 'red') return 'R';
  if (team === 'yellow') return 'Y';
  return 'G';
}

export function teamStartingDirection(team: Team): number {
  if (team === 'blue') return 0;
  if (team === 'red') return Math.PI;
  if (team === 'yellow') return Math.PI / 2;
  return -Math.PI / 2;
}

export function teamDisplayColor(team: Team): string {
  if (team === 'blue') return '#5f9de8';
  if (team === 'red') return '#dc6666';
  if (team === 'yellow') return '#d9b94c';
  return '#58ad78';
}

export type WeaponType = 'musket' | 'bayonet' | 'axe' | 'pickaxe';
export const FORMATION_SHAPES = ['line', 'column', 'block'] as const;
export type FormationShape = typeof FORMATION_SHAPES[number];

export function isFormationShape(value: unknown): value is FormationShape {
  return typeof value === 'string' && (FORMATION_SHAPES as readonly string[]).includes(value);
}

export function formationShapeLabel(value: FormationShape): string {
  if (value === 'column') return '縦列';
  if (value === 'block') return '方形';
  return '横列';
}

export const SQUAD_CLASSES = [
  'infantry',
  'lightInfantry',
  'grenadier',
  'sharpshooter',
  'engineer',
  'dragoon',
  'cavalry',
  'hussar',
  'cuirassier',
  'lancer',
  'militaryBand',
  'artillery',
  'heavyArtillery',
  'horseArtillery',
  'mortar',
] as const;

export type SquadClass = typeof SQUAD_CLASSES[number];

export interface Vec2 {
  x: number;
  y: number;
}

export function isSquadClass(value: unknown): value is SquadClass {
  return typeof value === 'string' && (SQUAD_CLASSES as readonly string[]).includes(value);
}

export function isFootInfantryClass(value: SquadClass): boolean {
  return value === 'infantry'
    || value === 'lightInfantry'
    || value === 'grenadier'
    || value === 'sharpshooter'
    || value === 'engineer'
    || value === 'militaryBand';
}

export function canVolleyClass(value: SquadClass): boolean {
  return (isFootInfantryClass(value) && value !== 'militaryBand') || value === 'dragoon';
}

export function isSupportClass(value: SquadClass): boolean {
  return value === 'militaryBand';
}


export function canBannerAttackClass(value: SquadClass): boolean {
  return value === 'infantry' || value === 'lightInfantry' || value === 'grenadier' || value === 'engineer';
}

export function isArtilleryClass(value: SquadClass): boolean {
  return value === 'artillery' || value === 'heavyArtillery' || value === 'horseArtillery' || value === 'mortar';
}

export function formationShapesForClass(value: SquadClass): readonly FormationShape[] {
  return isArtilleryClass(value) ? ['line', 'column', 'block'] : ['line', 'column'];
}

export function nextFormationShape(value: SquadClass, current: FormationShape): FormationShape {
  const shapes = formationShapesForClass(value);
  const index = Math.max(0, shapes.indexOf(current));
  return shapes[(index + 1) % shapes.length] ?? 'line';
}

export function isChargeCavalryClass(value: SquadClass): boolean {
  return value === 'cavalry' || value === 'hussar' || value === 'cuirassier' || value === 'lancer';
}

export function isMountedClass(value: SquadClass): boolean {
  return isChargeCavalryClass(value) || value === 'dragoon' || value === 'horseArtillery';
}

export function classShortLabel(value: SquadClass): string {
  switch (value) {
    case 'infantry': return '戦列';
    case 'lightInfantry': return '軽歩';
    case 'grenadier': return '擲弾';
    case 'sharpshooter': return '狙撃';
    case 'engineer': return '工兵';
    case 'dragoon': return '竜騎';
    case 'cavalry': return '騎兵';
    case 'hussar': return 'フッサー';
    case 'cuirassier': return '胸甲';
    case 'lancer': return '槍騎';
    case 'militaryBand': return '軍楽';
    case 'artillery': return '野砲';
    case 'heavyArtillery': return '重砲';
    case 'horseArtillery': return '騎砲';
    case 'mortar': return '迫撃';
  }
}

export function classLabel(value: SquadClass): string {
  switch (value) {
    case 'infantry': return '戦列歩兵';
    case 'lightInfantry': return '軽歩兵';
    case 'grenadier': return '擲弾兵';
    case 'sharpshooter': return '狙撃兵';
    case 'engineer': return '工兵';
    case 'dragoon': return '竜騎兵';
    case 'cavalry': return '騎兵';
    case 'hussar': return 'フッサー';
    case 'cuirassier': return '胸甲騎兵';
    case 'lancer': return '槍騎兵';
    case 'militaryBand': return '軍楽隊';
    case 'artillery': return '野戦砲兵';
    case 'heavyArtillery': return '重砲兵';
    case 'horseArtillery': return '騎馬砲兵';
    case 'mortar': return '迫撃砲兵';
  }
}
