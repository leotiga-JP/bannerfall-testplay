import { BATTLEFIELD_MAP, MAP_SITES } from './battlefieldMap';
import type { ResourceStockpile } from './resourceSystem';
import { isArtilleryClass, type SquadClass, type Team, type Vec2 } from './types';

export type UpgradeTier = 1 | 2 | 3;
export type EquipmentUpgradeKind = 'weapon' | 'armor' | 'artillery-performance' | 'artillery-battery';
export type DamageCategory = 'bullet' | 'melee' | 'explosive' | 'charge';

export interface FormationUpgradeState {
  weaponTier: UpgradeTier;
  armorTier: UpgradeTier;
  artilleryPerformanceTier: UpgradeTier;
  artilleryBatteryTier: UpgradeTier;
}

export interface UpgradeFacilityState {
  id: string;
  label: string;
  kind: 'workshop' | 'foundry';
  team: Team;
  position: Vec2;
}

export interface WeaponTierMultipliers {
  damage: number;
  reload: number;
  spread: number;
  range: number;
  morale: number;
  melee: number;
  charge: number;
  chargeMorale: number;
  axe: number;
  grenade: number;
}

export interface ArtilleryTierMultipliers {
  range: number;
  reload: number;
  jitter: number;
  damage: number;
  blastRadius: number;
  morale: number;
  shellSpeed: number;
}

export const UPGRADE_INTERACTION_RANGE = 270;

export const DEFAULT_FORMATION_UPGRADES: Readonly<FormationUpgradeState> = Object.freeze({
  weaponTier: 1,
  armorTier: 1,
  artilleryPerformanceTier: 1,
  artilleryBatteryTier: 1,
});

export const UPGRADE_FACILITIES: readonly UpgradeFacilityState[] = MAP_SITES
  .filter((site): site is typeof site & { team: Team } => site.kind === 'facility' && !!site.team && (site.shortLabel === '工房' || site.shortLabel === '砲兵工廠'))
  .map((site) => ({
    id: site.id,
    label: site.team === 'blue' ? `BLUE ${site.shortLabel}` : `RED ${site.shortLabel}`,
    kind: site.shortLabel === '砲兵工廠' ? 'foundry' : 'workshop',
    team: site.team,
    position: BATTLEFIELD_MAP.nearestPassablePoint(site.position, 22),
  }));

const ZERO_COST: ResourceStockpile = Object.freeze({ wood: 0, iron: 0, gunpowder: 0, alloy: 0 });

const WEAPON_T2_COST: Readonly<Record<SquadClass, ResourceStockpile>> = Object.freeze({
  infantry: Object.freeze({ wood: 70, iron: 110, gunpowder: 70, alloy: 0 }),
  lightInfantry: Object.freeze({ wood: 65, iron: 95, gunpowder: 75, alloy: 0 }),
  grenadier: Object.freeze({ wood: 80, iron: 120, gunpowder: 110, alloy: 0 }),
  sharpshooter: Object.freeze({ wood: 65, iron: 145, gunpowder: 95, alloy: 8 }),
  engineer: Object.freeze({ wood: 90, iron: 105, gunpowder: 55, alloy: 0 }),
  dragoon: Object.freeze({ wood: 110, iron: 155, gunpowder: 95, alloy: 8 }),
  cavalry: Object.freeze({ wood: 130, iron: 190, gunpowder: 0, alloy: 8 }),
  hussar: Object.freeze({ wood: 120, iron: 170, gunpowder: 0, alloy: 8 }),
  cuirassier: Object.freeze({ wood: 150, iron: 240, gunpowder: 0, alloy: 15 }),
  lancer: Object.freeze({ wood: 145, iron: 210, gunpowder: 0, alloy: 12 }),
  militaryBand: Object.freeze({ wood: 70, iron: 100, gunpowder: 0, alloy: 0 }),
  artillery: ZERO_COST,
  heavyArtillery: ZERO_COST,
  horseArtillery: ZERO_COST,
  mortar: ZERO_COST,
});

const ARMOR_T2_COST: Readonly<Record<SquadClass, ResourceStockpile>> = Object.freeze({
  infantry: Object.freeze({ wood: 45, iron: 145, gunpowder: 0, alloy: 0 }),
  lightInfantry: Object.freeze({ wood: 35, iron: 115, gunpowder: 0, alloy: 0 }),
  grenadier: Object.freeze({ wood: 55, iron: 170, gunpowder: 0, alloy: 5 }),
  sharpshooter: Object.freeze({ wood: 30, iron: 105, gunpowder: 0, alloy: 0 }),
  engineer: Object.freeze({ wood: 55, iron: 135, gunpowder: 0, alloy: 0 }),
  dragoon: Object.freeze({ wood: 80, iron: 205, gunpowder: 0, alloy: 8 }),
  cavalry: Object.freeze({ wood: 95, iron: 255, gunpowder: 0, alloy: 12 }),
  hussar: Object.freeze({ wood: 80, iron: 215, gunpowder: 0, alloy: 10 }),
  cuirassier: Object.freeze({ wood: 105, iron: 330, gunpowder: 0, alloy: 20 }),
  lancer: Object.freeze({ wood: 90, iron: 270, gunpowder: 0, alloy: 14 }),
  militaryBand: Object.freeze({ wood: 50, iron: 125, gunpowder: 0, alloy: 0 }),
  artillery: ZERO_COST,
  heavyArtillery: ZERO_COST,
  horseArtillery: ZERO_COST,
  mortar: ZERO_COST,
});

const ARTILLERY_PERFORMANCE_T2: Readonly<Record<'artillery' | 'heavyArtillery' | 'horseArtillery' | 'mortar', ResourceStockpile>> = Object.freeze({
  artillery: Object.freeze({ wood: 120, iron: 210, gunpowder: 180, alloy: 12 }),
  heavyArtillery: Object.freeze({ wood: 150, iron: 300, gunpowder: 250, alloy: 22 }),
  horseArtillery: Object.freeze({ wood: 140, iron: 240, gunpowder: 190, alloy: 16 }),
  mortar: Object.freeze({ wood: 135, iron: 225, gunpowder: 210, alloy: 14 }),
});

const ARTILLERY_BATTERY_T2: Readonly<Record<'artillery' | 'heavyArtillery' | 'horseArtillery' | 'mortar', ResourceStockpile>> = Object.freeze({
  artillery: Object.freeze({ wood: 190, iron: 330, gunpowder: 150, alloy: 20 }),
  heavyArtillery: Object.freeze({ wood: 250, iron: 460, gunpowder: 220, alloy: 35 }),
  horseArtillery: Object.freeze({ wood: 240, iron: 390, gunpowder: 180, alloy: 28 }),
  mortar: Object.freeze({ wood: 180, iron: 300, gunpowder: 175, alloy: 20 }),
});

function cloneCost(cost: ResourceStockpile): ResourceStockpile {
  return { wood: cost.wood, iron: cost.iron, gunpowder: cost.gunpowder, alloy: cost.alloy };
}

function tierThreeCost(base: ResourceStockpile, alloyFloor: number): ResourceStockpile {
  return {
    wood: Math.round(base.wood * 1.75),
    iron: Math.round(base.iron * 1.85),
    gunpowder: Math.round(base.gunpowder * 1.75),
    alloy: Math.max(alloyFloor, Math.round(base.alloy * 2.3)),
  };
}

export function defaultUpgradeState(): FormationUpgradeState {
  return { ...DEFAULT_FORMATION_UPGRADES };
}

export function nextUpgradeTier(current: UpgradeTier): UpgradeTier | null {
  if (current >= 3) return null;
  return (current + 1) as UpgradeTier;
}

export function upgradeKindLabel(kind: EquipmentUpgradeKind): string {
  switch (kind) {
    case 'weapon': return '武器';
    case 'armor': return '防具';
    case 'artillery-performance': return '砲性能';
    case 'artillery-battery': return '砲門数';
  }
}

export function validUpgradeKinds(squadClass: SquadClass): readonly EquipmentUpgradeKind[] {
  return isArtilleryClass(squadClass)
    ? ['artillery-performance', 'artillery-battery']
    : ['weapon', 'armor'];
}

export function tierForKind(state: FormationUpgradeState, kind: EquipmentUpgradeKind): UpgradeTier {
  switch (kind) {
    case 'weapon': return state.weaponTier;
    case 'armor': return state.armorTier;
    case 'artillery-performance': return state.artilleryPerformanceTier;
    case 'artillery-battery': return state.artilleryBatteryTier;
  }
}

export function withUpgradeTier(state: FormationUpgradeState, kind: EquipmentUpgradeKind, tier: UpgradeTier): FormationUpgradeState {
  const next = { ...state };
  if (kind === 'weapon') next.weaponTier = tier;
  else if (kind === 'armor') next.armorTier = tier;
  else if (kind === 'artillery-performance') next.artilleryPerformanceTier = tier;
  else next.artilleryBatteryTier = tier;
  return next;
}

export function upgradeCost(squadClass: SquadClass, kind: EquipmentUpgradeKind, currentTier: UpgradeTier): ResourceStockpile {
  const next = nextUpgradeTier(currentTier);
  if (!next) return cloneCost(ZERO_COST);
  if (kind === 'weapon') {
    if (isArtilleryClass(squadClass)) return cloneCost(ZERO_COST);
    const base = WEAPON_T2_COST[squadClass];
    return next === 2 ? cloneCost(base) : tierThreeCost(base, 22);
  }
  if (kind === 'armor') {
    if (isArtilleryClass(squadClass)) return cloneCost(ZERO_COST);
    const base = ARMOR_T2_COST[squadClass];
    return next === 2 ? cloneCost(base) : tierThreeCost(base, 28);
  }
  if (!isArtilleryClass(squadClass)) return cloneCost(ZERO_COST);
  const key = squadClass as 'artillery' | 'heavyArtillery' | 'horseArtillery' | 'mortar';
  const base = kind === 'artillery-performance' ? ARTILLERY_PERFORMANCE_T2[key] : ARTILLERY_BATTERY_T2[key];
  const alloyFloor = kind === 'artillery-battery' ? 55 : 42;
  return next === 2 ? cloneCost(base) : tierThreeCost(base, alloyFloor);
}

export function closestUpgradeFacility(team: Team, squadClass: SquadClass, point: Vec2, maxDistance = Number.POSITIVE_INFINITY): UpgradeFacilityState | null {
  const kind = isArtilleryClass(squadClass) ? 'foundry' : 'workshop';
  let best: UpgradeFacilityState | null = null;
  let bestDistance = maxDistance;
  for (const facility of UPGRADE_FACILITIES) {
    if (facility.team !== team || facility.kind !== kind) continue;
    const distance = Math.hypot(facility.position.x - point.x, facility.position.y - point.y);
    if (distance > bestDistance) continue;
    best = facility;
    bestDistance = distance;
  }
  return best;
}

export function nearestUpgradeFacility(team: Team, squadClass: SquadClass, point: Vec2, maxDistance = UPGRADE_INTERACTION_RANGE): UpgradeFacilityState | null {
  return closestUpgradeFacility(team, squadClass, point, maxDistance);
}

export function weaponTierMultipliers(squadClass: SquadClass, tier: UpgradeTier): WeaponTierMultipliers {
  const t = Math.max(1, Math.min(3, tier));
  if (t === 1) return { damage: 1, reload: 1, spread: 1, range: 1, morale: 1, melee: 1, charge: 1, chargeMorale: 1, axe: 1, grenade: 1 };
  const top = t === 3;
  switch (squadClass) {
    case 'lightInfantry':
      return { damage: top ? 1.12 : 1.05, reload: top ? 0.86 : 0.93, spread: top ? 0.72 : 0.85, range: top ? 1.16 : 1.08, morale: top ? 1.12 : 1.05, melee: top ? 1.12 : 1.06, charge: 1, chargeMorale: 1, axe: 1, grenade: 1 };
    case 'grenadier':
      return { damage: top ? 1.18 : 1.09, reload: top ? 0.90 : 0.95, spread: top ? 0.82 : 0.91, range: top ? 1.10 : 1.05, morale: top ? 1.18 : 1.08, melee: top ? 1.20 : 1.10, charge: 1, chargeMorale: 1, axe: 1, grenade: top ? 1.22 : 1.10 };
    case 'sharpshooter':
      return { damage: top ? 1.18 : 1.08, reload: top ? 0.88 : 0.94, spread: top ? 0.62 : 0.80, range: top ? 1.22 : 1.10, morale: top ? 1.15 : 1.07, melee: top ? 1.08 : 1.04, charge: 1, chargeMorale: 1, axe: 1, grenade: 1 };
    case 'engineer':
      return { damage: top ? 1.14 : 1.07, reload: top ? 0.90 : 0.95, spread: top ? 0.82 : 0.91, range: top ? 1.10 : 1.05, morale: top ? 1.10 : 1.05, melee: top ? 1.15 : 1.08, charge: 1, chargeMorale: 1, axe: top ? 1.32 : 1.16, grenade: 1 };
    case 'dragoon':
      return { damage: top ? 1.16 : 1.08, reload: top ? 0.86 : 0.93, spread: top ? 0.76 : 0.87, range: top ? 1.15 : 1.07, morale: top ? 1.12 : 1.05, melee: top ? 1.16 : 1.08, charge: 1, chargeMorale: 1, axe: 1, grenade: 1 };
    case 'cavalry':
      return { damage: 1, reload: 1, spread: 1, range: 1, morale: 1, melee: top ? 1.18 : 1.08, charge: top ? 1.18 : 1.08, chargeMorale: top ? 1.16 : 1.08, axe: 1, grenade: 1 };
    case 'hussar':
      return { damage: 1, reload: 1, spread: 1, range: 1, morale: 1, melee: top ? 1.12 : 1.05, charge: top ? 1.12 : 1.06, chargeMorale: top ? 1.28 : 1.12, axe: 1, grenade: 1 };
    case 'lancer':
      return { damage: 1, reload: 1, spread: 1, range: 1, morale: 1, melee: top ? 1.16 : 1.08, charge: top ? 1.22 : 1.10, chargeMorale: top ? 1.18 : 1.08, axe: 1, grenade: 1 };
    case 'militaryBand':
      return { damage: 1, reload: 1, spread: 1, range: 1, morale: top ? 1.15 : 1.08, melee: top ? 1.12 : 1.06, charge: 1, chargeMorale: 1, axe: 1, grenade: 1 };
    case 'cuirassier':
      return { damage: 1, reload: 1, spread: 1, range: 1, morale: 1, melee: top ? 1.16 : 1.08, charge: top ? 1.16 : 1.08, chargeMorale: top ? 1.12 : 1.06, axe: 1, grenade: 1 };
    default:
      return { damage: top ? 1.18 : 1.08, reload: top ? 0.88 : 0.94, spread: top ? 0.78 : 0.90, range: top ? 1.12 : 1.05, morale: top ? 1.12 : 1.05, melee: top ? 1.18 : 1.08, charge: 1, chargeMorale: 1, axe: top ? 1.18 : 1.08, grenade: 1 };
  }
}

export function armorDamageMultiplier(squadClass: SquadClass, tier: UpgradeTier, category: DamageCategory): number {
  if (tier <= 1 || isArtilleryClass(squadClass)) return 1;
  const top = tier >= 3;
  let bullet = top ? 0.74 : 0.88;
  let melee = top ? 0.84 : 0.92;
  let explosive = top ? 0.86 : 0.94;
  let charge = top ? 0.80 : 0.90;

  if (squadClass === 'lightInfantry' || squadClass === 'sharpshooter') {
    bullet = top ? 0.82 : 0.92;
    melee = top ? 0.88 : 0.95;
    explosive = top ? 0.90 : 0.96;
    charge = top ? 0.86 : 0.94;
  } else if (squadClass === 'grenadier') {
    explosive = top ? 0.74 : 0.88;
    melee = top ? 0.80 : 0.90;
  } else if (squadClass === 'dragoon') {
    bullet = top ? 0.70 : 0.86;
    charge = top ? 0.76 : 0.88;
  } else if (squadClass === 'cavalry') {
    bullet = top ? 0.68 : 0.84;
    charge = top ? 0.72 : 0.86;
  } else if (squadClass === 'hussar') {
    bullet = top ? 0.76 : 0.88;
    charge = top ? 0.78 : 0.90;
  } else if (squadClass === 'cuirassier') {
    bullet = top ? 0.58 : 0.78;
    melee = top ? 0.70 : 0.86;
    explosive = top ? 0.78 : 0.90;
    charge = top ? 0.58 : 0.78;
  }

  if (category === 'bullet') return bullet;
  if (category === 'melee') return melee;
  if (category === 'explosive') return explosive;
  return charge;
}

export function artilleryPerformanceMultipliers(tier: UpgradeTier): ArtilleryTierMultipliers {
  if (tier <= 1) return { range: 1, reload: 1, jitter: 1, damage: 1, blastRadius: 1, morale: 1, shellSpeed: 1 };
  if (tier === 2) return { range: 1.08, reload: 0.92, jitter: 0.88, damage: 1.08, blastRadius: 1.05, morale: 1.08, shellSpeed: 1.03 };
  return { range: 1.16, reload: 0.85, jitter: 0.76, damage: 1.16, blastRadius: 1.10, morale: 1.18, shellSpeed: 1.06 };
}

export function artilleryGunCount(squadClass: SquadClass, batteryTier: UpgradeTier): number {
  const tier = Math.max(1, Math.min(3, batteryTier));
  if (squadClass === 'mortar') return tier === 1 ? 1 : tier === 2 ? 2 : 3;
  if (squadClass === 'heavyArtillery') return tier === 1 ? 1 : tier === 2 ? 2 : 3;
  if (squadClass === 'horseArtillery') return tier === 1 ? 3 : tier === 2 ? 4 : 5;
  if (squadClass === 'artillery') return tier === 1 ? 2 : tier === 2 ? 3 : 4;
  return 0;
}

export function equipmentSummary(state: FormationUpgradeState, squadClass: SquadClass): string {
  if (isArtilleryClass(squadClass)) return `砲性能 T${state.artilleryPerformanceTier} · 砲門 ${artilleryGunCount(squadClass, state.artilleryBatteryTier)}門`;
  return `武器 T${state.weaponTier} · 防具 T${state.armorTier}`;
}
