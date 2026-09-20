export type Team = 'blue' | 'red';
export type WeaponType = 'musket' | 'bayonet' | 'axe';

export const SQUAD_CLASSES = [
  'infantry',
  'lightInfantry',
  'grenadier',
  'dragoon',
  'cavalry',
  'hussar',
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
  return value === 'infantry' || value === 'lightInfantry' || value === 'grenadier';
}

export function canVolleyClass(value: SquadClass): boolean {
  return isFootInfantryClass(value) || value === 'dragoon';
}

export function canBannerAttackClass(value: SquadClass): boolean {
  return isFootInfantryClass(value);
}

export function isArtilleryClass(value: SquadClass): boolean {
  return value === 'artillery' || value === 'heavyArtillery' || value === 'horseArtillery';
}

export function isChargeCavalryClass(value: SquadClass): boolean {
  return value === 'cavalry' || value === 'hussar';
}

export function isMountedClass(value: SquadClass): boolean {
  return isChargeCavalryClass(value) || value === 'dragoon' || value === 'horseArtillery';
}

export function classShortLabel(value: SquadClass): string {
  switch (value) {
    case 'infantry': return 'INF';
    case 'lightInfantry': return 'LGT';
    case 'grenadier': return 'GRN';
    case 'dragoon': return 'DRG';
    case 'cavalry': return 'CAV';
    case 'hussar': return 'HUS';
    case 'artillery': return 'ART';
    case 'heavyArtillery': return 'HART';
    case 'horseArtillery': return 'HARTY';
  }
}

export function classLabel(value: SquadClass): string {
  switch (value) {
    case 'infantry': return 'LINE INFANTRY';
    case 'lightInfantry': return 'LIGHT INFANTRY';
    case 'grenadier': return 'GRENADIERS';
    case 'dragoon': return 'DRAGOONS';
    case 'cavalry': return 'CAVALRY';
    case 'hussar': return 'HUSSARS';
    case 'artillery': return 'FIELD ARTILLERY';
    case 'heavyArtillery': return 'HEAVY ARTILLERY';
    case 'horseArtillery': return 'HORSE ARTILLERY';
  }
}
