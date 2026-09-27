export type Team = 'blue' | 'red';
export type WeaponType = 'musket' | 'bayonet' | 'axe';
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
  'artillery',
  'heavyArtillery',
  'horseArtillery',
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
    || value === 'engineer';
}

export function canVolleyClass(value: SquadClass): boolean {
  return isFootInfantryClass(value) || value === 'dragoon';
}

export function canBannerAttackClass(value: SquadClass): boolean {
  return value === 'infantry' || value === 'lightInfantry' || value === 'grenadier' || value === 'engineer';
}

export function isArtilleryClass(value: SquadClass): boolean {
  return value === 'artillery' || value === 'heavyArtillery' || value === 'horseArtillery';
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
  return value === 'cavalry' || value === 'hussar' || value === 'cuirassier';
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
    case 'artillery': return '野砲';
    case 'heavyArtillery': return '重砲';
    case 'horseArtillery': return '騎砲';
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
    case 'artillery': return '野戦砲兵';
    case 'heavyArtillery': return '重砲兵';
    case 'horseArtillery': return '騎馬砲兵';
  }
}
