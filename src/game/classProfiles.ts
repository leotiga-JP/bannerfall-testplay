import { GAME_CONFIG } from './config';
import type { SquadClass, Vec2 } from './types';
import { isArtilleryClass, isChargeCavalryClass } from './types';
import { artilleryGunCount, artilleryPerformanceMultipliers, weaponTierMultipliers, type UpgradeTier } from './upgradeSystem';

export interface VolleyProfile {
  damage: number;
  playerReload: number;
  aiReloadMin: number;
  aiReloadMax: number;
  spread: number;
  projectileSpeed: number;
  projectileLife: number;
  effectiveRange: number;
  defensiveRange: number;
  moraleDamage: number;
}

export interface ArtilleryProfile {
  guns: number;
  deploySeconds: number;
  range: number;
  minRange: number;
  playerReload: number;
  aiReloadMin: number;
  aiReloadMax: number;
  shellSpeed: number;
  blastRadius: number;
  blastDamage: number;
  edgeDamage: number;
  moraleDamage: number;
  targetJitter: number;
  threatRetreatRange: number;
  preferredRange: number;
  smokeScale: number;
  shakeScale: number;
}

export interface ChargeProfile {
  maxDistance: number;
  speed: number;
  aiMinDistance: number;
  aiMaxDistance: number;
  roadkillDamage: number;
  roadkillMoraleDamage: number;
  roadkillRadius: number;
  momentumPerHit: number;
  minMomentum: number;
}

export interface MeleeProfile {
  damage: number;
  cooldown: number;
  moveSpeed: number;
  moraleDamage: number;
}

const standardVolley: VolleyProfile = {
  damage: GAME_CONFIG.musket.damage,
  playerReload: GAME_CONFIG.musket.playerReloadSeconds,
  aiReloadMin: GAME_CONFIG.musket.aiReloadMin,
  aiReloadMax: GAME_CONFIG.musket.aiReloadMax,
  spread: GAME_CONFIG.musket.spreadRadians,
  projectileSpeed: GAME_CONFIG.musket.projectileSpeed,
  projectileLife: GAME_CONFIG.musket.projectileLife,
  effectiveRange: GAME_CONFIG.musket.effectiveRange,
  defensiveRange: GAME_CONFIG.musket.defensiveVolleyRange,
  moraleDamage: 0.9,
};

export function volleyProfile(squadClass: SquadClass, weaponTier: UpgradeTier = 1): VolleyProfile {
  let base: VolleyProfile;
  switch (squadClass) {
    case 'lightInfantry':
      base = { ...standardVolley, damage: 82, playerReload: 2.85, aiReloadMin: 2.8, aiReloadMax: 3.5, spread: 0.13, effectiveRange: 690, defensiveRange: 410, moraleDamage: 0.65 };
      break;
    case 'grenadier':
      base = { ...standardVolley, damage: 108, playerReload: 3.9, aiReloadMin: 3.8, aiReloadMax: 4.55, spread: 0.10, effectiveRange: 600, defensiveRange: 385, moraleDamage: 1.25 };
      break;
    case 'sharpshooter':
      base = { ...standardVolley, damage: 230, playerReload: 6.4, aiReloadMin: 6.2, aiReloadMax: 7.3, spread: 0.035, projectileSpeed: 1500, projectileLife: 2.0, effectiveRange: 1240, defensiveRange: 720, moraleDamage: 1.15 };
      break;
    case 'engineer':
      base = { ...standardVolley, damage: 88, playerReload: 4.25, aiReloadMin: 4.2, aiReloadMax: 5.0, spread: 0.14, effectiveRange: 545, defensiveRange: 340, moraleDamage: 0.8 };
      break;
    case 'dragoon':
      base = { ...standardVolley, damage: 78, playerReload: 3.15, aiReloadMin: 3.1, aiReloadMax: 3.75, spread: 0.12, effectiveRange: 565, defensiveRange: 360, moraleDamage: 0.7 };
      break;
    default:
      base = { ...standardVolley };
      break;
  }
  const mult = weaponTierMultipliers(squadClass, weaponTier);
  return {
    ...base,
    damage: base.damage * mult.damage,
    playerReload: base.playerReload * mult.reload,
    aiReloadMin: base.aiReloadMin * mult.reload,
    aiReloadMax: base.aiReloadMax * mult.reload,
    spread: base.spread * mult.spread,
    projectileLife: base.projectileLife * mult.range,
    effectiveRange: base.effectiveRange * mult.range,
    defensiveRange: base.defensiveRange * mult.range,
    moraleDamage: base.moraleDamage * mult.morale,
  };
}

export type ArtilleryTargetIssue = 'too-far' | 'too-close' | null;

export function artilleryTargetIssue(
  squadClass: SquadClass,
  origin: Vec2,
  target: Vec2,
  tolerance = 0,
  performanceTier: UpgradeTier = 1,
  batteryTier: UpgradeTier = 1,
): ArtilleryTargetIssue {
  const profile = artilleryProfile(squadClass, performanceTier, batteryTier);
  const distance = Math.hypot(target.x - origin.x, target.y - origin.y);
  if (distance > profile.range + Math.max(0, tolerance)) return 'too-far';
  if (distance < Math.max(0, profile.minRange - Math.max(0, tolerance))) return 'too-close';
  return null;
}

export function artilleryTargetDistance(origin: Vec2, target: Vec2): number {
  return Math.hypot(target.x - origin.x, target.y - origin.y);
}

export function artilleryProfile(
  squadClass: SquadClass,
  performanceTier: UpgradeTier = 1,
  batteryTier: UpgradeTier = 1,
): ArtilleryProfile {
  let base: ArtilleryProfile;
  if (squadClass === 'mortar') {
    base = {
      guns: 1, deploySeconds: 1.8, range: GAME_CONFIG.mortar.range, minRange: GAME_CONFIG.mortar.minRange,
      playerReload: 10.8, aiReloadMin: 10.5, aiReloadMax: 12.4, shellSpeed: 720, blastRadius: 154,
      blastDamage: 176, edgeDamage: 58, moraleDamage: 30, targetJitter: 74, threatRetreatRange: 520,
      preferredRange: GAME_CONFIG.mortar.preferredRange, smokeScale: 1.35, shakeScale: 1.15,
    };
  } else if (squadClass === 'heavyArtillery') {
    base = {
      guns: 1, deploySeconds: 4.2, range: GAME_CONFIG.heavyArtillery.range, minRange: GAME_CONFIG.heavyArtillery.minRange,
      playerReload: 12.8, aiReloadMin: 12.5, aiReloadMax: 14.5, shellSpeed: 1040, blastRadius: 218,
      blastDamage: 260, edgeDamage: 82, moraleDamage: 44, targetJitter: 48, threatRetreatRange: 720,
      preferredRange: GAME_CONFIG.heavyArtillery.preferredRange, smokeScale: 2.0, shakeScale: 1.65,
    };
  } else if (squadClass === 'horseArtillery') {
    base = {
      guns: 3, deploySeconds: 0.9, range: GAME_CONFIG.horseArtillery.range, minRange: GAME_CONFIG.horseArtillery.minRange,
      playerReload: 4.7, aiReloadMin: 4.7, aiReloadMax: 5.7, shellSpeed: 1320, blastRadius: 88, blastDamage: 92,
      edgeDamage: 30, moraleDamage: 9, targetJitter: 90, threatRetreatRange: 430,
      preferredRange: GAME_CONFIG.horseArtillery.preferredRange, smokeScale: 0.75, shakeScale: 0.72,
    };
  } else {
    base = {
      guns: 2, deploySeconds: GAME_CONFIG.artillery.deploySeconds, range: GAME_CONFIG.artillery.range, minRange: GAME_CONFIG.artillery.minRange,
      playerReload: 7.2, aiReloadMin: 7.1, aiReloadMax: 8.5, shellSpeed: GAME_CONFIG.artillery.shellSpeed,
      blastRadius: GAME_CONFIG.artillery.blastRadius, blastDamage: 142, edgeDamage: GAME_CONFIG.artillery.edgeDamage,
      moraleDamage: 20, targetJitter: GAME_CONFIG.artillery.targetJitter, threatRetreatRange: GAME_CONFIG.artillery.threatRetreatRange,
      preferredRange: GAME_CONFIG.artillery.preferredRange, smokeScale: 1, shakeScale: 1,
    };
  }
  const mult = artilleryPerformanceMultipliers(performanceTier);
  return {
    ...base,
    guns: artilleryGunCount(squadClass, batteryTier),
    range: base.range * mult.range,
    playerReload: base.playerReload * mult.reload,
    aiReloadMin: base.aiReloadMin * mult.reload,
    aiReloadMax: base.aiReloadMax * mult.reload,
    shellSpeed: base.shellSpeed * mult.shellSpeed,
    blastRadius: base.blastRadius * mult.blastRadius,
    blastDamage: base.blastDamage * mult.damage,
    edgeDamage: base.edgeDamage * mult.damage,
    moraleDamage: base.moraleDamage * mult.morale,
    targetJitter: base.targetJitter * mult.jitter,
    preferredRange: base.preferredRange * mult.range,
  };
}

export function chargeProfile(squadClass: SquadClass, weaponTier: UpgradeTier = 1): ChargeProfile {
  let base: ChargeProfile;
  if (squadClass === 'hussar') {
    base = {
      maxDistance: GAME_CONFIG.hussar.chargeMaxDistance, speed: GAME_CONFIG.hussar.chargeSpeed, aiMinDistance: GAME_CONFIG.hussar.aiChargeMinDistance, aiMaxDistance: GAME_CONFIG.hussar.aiChargeMaxDistance,
      roadkillDamage: GAME_CONFIG.hussar.roadkillDamage, roadkillMoraleDamage: 22, roadkillRadius: GAME_CONFIG.hussar.roadkillRadius, momentumPerHit: GAME_CONFIG.hussar.momentumPerHit, minMomentum: GAME_CONFIG.hussar.minMomentum,
    };
  } else if (squadClass === 'cuirassier') {
    base = {
      maxDistance: GAME_CONFIG.cuirassier.chargeMaxDistance, speed: GAME_CONFIG.cuirassier.chargeSpeed, aiMinDistance: GAME_CONFIG.cuirassier.aiChargeMinDistance, aiMaxDistance: GAME_CONFIG.cuirassier.aiChargeMaxDistance,
      roadkillDamage: GAME_CONFIG.cuirassier.roadkillDamage, roadkillMoraleDamage: 4, roadkillRadius: GAME_CONFIG.cuirassier.roadkillRadius, momentumPerHit: GAME_CONFIG.cuirassier.momentumPerHit, minMomentum: GAME_CONFIG.cuirassier.minMomentum,
    };
  } else if (squadClass === 'lancer') {
    base = {
      maxDistance: GAME_CONFIG.lancer.chargeMaxDistance, speed: GAME_CONFIG.lancer.chargeSpeed, aiMinDistance: GAME_CONFIG.lancer.aiChargeMinDistance, aiMaxDistance: GAME_CONFIG.lancer.aiChargeMaxDistance,
      roadkillDamage: GAME_CONFIG.lancer.roadkillDamage, roadkillMoraleDamage: 12, roadkillRadius: GAME_CONFIG.lancer.roadkillRadius, momentumPerHit: GAME_CONFIG.lancer.momentumPerHit, minMomentum: GAME_CONFIG.lancer.minMomentum,
    };
  } else if (squadClass === 'cavalry') {
    base = {
      maxDistance: GAME_CONFIG.cavalry.chargeMaxDistance, speed: GAME_CONFIG.cavalry.chargeSpeed, aiMinDistance: GAME_CONFIG.cavalry.aiChargeMinDistance, aiMaxDistance: GAME_CONFIG.cavalry.aiChargeMaxDistance,
      roadkillDamage: GAME_CONFIG.cavalry.roadkillDamage, roadkillMoraleDamage: 8, roadkillRadius: GAME_CONFIG.cavalry.roadkillRadius, momentumPerHit: GAME_CONFIG.cavalry.momentumPerHit, minMomentum: GAME_CONFIG.cavalry.minMomentum,
    };
  } else {
    base = {
      maxDistance: GAME_CONFIG.charge.maxDistance, speed: GAME_CONFIG.charge.moveSpeed, aiMinDistance: GAME_CONFIG.charge.aiMinDistance, aiMaxDistance: GAME_CONFIG.charge.aiMaxDistance,
      roadkillDamage: 0, roadkillMoraleDamage: 0, roadkillRadius: 0, momentumPerHit: 0, minMomentum: 0,
    };
  }
  const mult = weaponTierMultipliers(squadClass, weaponTier);
  return { ...base, roadkillDamage: base.roadkillDamage * mult.charge, roadkillMoraleDamage: base.roadkillMoraleDamage * mult.chargeMorale };
}

export function meleeProfile(squadClass: SquadClass, weaponTier: UpgradeTier = 1): MeleeProfile {
  let base: MeleeProfile;
  switch (squadClass) {
    case 'grenadier': base = { damage: 48, cooldown: 0.66, moveSpeed: 106, moraleDamage: 4.2 }; break;
    case 'lightInfantry': base = { damage: 27, cooldown: 0.72, moveSpeed: 112, moraleDamage: 2.0 }; break;
    case 'sharpshooter': base = { damage: 20, cooldown: 0.82, moveSpeed: 108, moraleDamage: 1.0 }; break;
    case 'engineer': base = { damage: 31, cooldown: 0.74, moveSpeed: 116, moraleDamage: 2.2 }; break;
    case 'dragoon': base = { damage: 33, cooldown: 0.68, moveSpeed: 132, moraleDamage: 2.4 }; break;
    case 'cavalry': base = { damage: GAME_CONFIG.cavalry.meleeDamage, cooldown: GAME_CONFIG.cavalry.meleeCooldown, moveSpeed: GAME_CONFIG.cavalry.meleeMoveSpeed, moraleDamage: 4.5 }; break;
    case 'hussar': base = { damage: GAME_CONFIG.hussar.meleeDamage, cooldown: GAME_CONFIG.hussar.meleeCooldown, moveSpeed: GAME_CONFIG.hussar.meleeMoveSpeed, moraleDamage: 9.0 }; break;
    case 'cuirassier': base = { damage: GAME_CONFIG.cuirassier.meleeDamage, cooldown: GAME_CONFIG.cuirassier.meleeCooldown, moveSpeed: GAME_CONFIG.cuirassier.meleeMoveSpeed, moraleDamage: 2.0 }; break;
    case 'lancer': base = { damage: GAME_CONFIG.lancer.meleeDamage, cooldown: GAME_CONFIG.lancer.meleeCooldown, moveSpeed: GAME_CONFIG.lancer.meleeMoveSpeed, moraleDamage: 3.2 }; break;
    case 'militaryBand': base = { damage: 20, cooldown: 0.82, moveSpeed: 112, moraleDamage: 1.5 }; break;
    case 'artillery': base = { damage: 16, cooldown: 1.05, moveSpeed: 76, moraleDamage: 1.0 }; break;
    case 'heavyArtillery': base = { damage: 14, cooldown: 1.15, moveSpeed: 62, moraleDamage: 0.8 }; break;
    case 'horseArtillery': base = { damage: 18, cooldown: 0.96, moveSpeed: 90, moraleDamage: 1.2 }; break;
    case 'mortar': base = { damage: 15, cooldown: 1.08, moveSpeed: 72, moraleDamage: 0.9 }; break;
    default: base = { damage: GAME_CONFIG.melee.attackDamage, cooldown: GAME_CONFIG.melee.attackCooldown, moveSpeed: GAME_CONFIG.melee.moveSpeed, moraleDamage: 2.8 }; break;
  }
  const mult = weaponTierMultipliers(squadClass, weaponTier);
  return { ...base, damage: base.damage * mult.melee, moraleDamage: base.moraleDamage * mult.morale };
}

export function moraleResistance(squadClass: SquadClass): number {
  switch (squadClass) {
    case 'grenadier': return 0.66;
    case 'hussar': return 0.78;
    case 'cuirassier': return 0.62;
    case 'lancer': return 0.82;
    case 'militaryBand': return 0.72;
    case 'sharpshooter': return 0.92;
    case 'engineer': return 0.90;
    case 'cavalry': return 0.84;
    case 'dragoon': return 0.88;
    case 'lightInfantry': return 0.9;
    case 'heavyArtillery': return 1.2;
    case 'artillery': return 1.12;
    case 'horseArtillery': return 1.0;
    case 'mortar': return 1.08;
    default: return 1;
  }
}

export function artilleryClass(squadClass: SquadClass): boolean {
  return isArtilleryClass(squadClass);
}

export function mountedChargeClass(squadClass: SquadClass): boolean {
  return isChargeCavalryClass(squadClass);
}

export function fieldworkKitCapacity(_squadClass: SquadClass): number {
  return 0;
}
