import { GAME_CONFIG } from './config';
import type { SquadClass } from './types';
import { isArtilleryClass, isChargeCavalryClass } from './types';

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

export function volleyProfile(squadClass: SquadClass): VolleyProfile {
  switch (squadClass) {
    case 'lightInfantry':
      return { ...standardVolley, damage: 82, playerReload: 2.85, aiReloadMin: 2.8, aiReloadMax: 3.5, spread: 0.13, effectiveRange: 690, defensiveRange: 410, moraleDamage: 0.65 };
    case 'grenadier':
      return { ...standardVolley, damage: 108, playerReload: 3.9, aiReloadMin: 3.8, aiReloadMax: 4.55, spread: 0.10, effectiveRange: 600, defensiveRange: 385, moraleDamage: 1.25 };
    case 'dragoon':
      return { ...standardVolley, damage: 78, playerReload: 3.15, aiReloadMin: 3.1, aiReloadMax: 3.75, spread: 0.12, effectiveRange: 565, defensiveRange: 360, moraleDamage: 0.7 };
    default:
      return standardVolley;
  }
}

export function artilleryProfile(squadClass: SquadClass): ArtilleryProfile {
  if (squadClass === 'heavyArtillery') {
    return {
      guns: 1,
      deploySeconds: 4.2,
      range: 6200,
      minRange: 480,
      playerReload: 12.8,
      aiReloadMin: 12.5,
      aiReloadMax: 14.5,
      shellSpeed: 1040,
      blastRadius: 218,
      blastDamage: 260,
      edgeDamage: 82,
      moraleDamage: 44,
      targetJitter: 48,
      threatRetreatRange: 720,
      preferredRange: 4750,
      smokeScale: 2.0,
      shakeScale: 1.65,
    };
  }
  if (squadClass === 'horseArtillery') {
    return {
      guns: 3,
      deploySeconds: 0.9,
      range: 3550,
      minRange: 230,
      playerReload: 4.7,
      aiReloadMin: 4.7,
      aiReloadMax: 5.7,
      shellSpeed: 1320,
      blastRadius: 88,
      blastDamage: 92,
      edgeDamage: 30,
      moraleDamage: 9,
      targetJitter: 90,
      threatRetreatRange: 430,
      preferredRange: 2500,
      smokeScale: 0.75,
      shakeScale: 0.72,
    };
  }
  return {
    guns: 2,
    deploySeconds: GAME_CONFIG.artillery.deploySeconds,
    range: GAME_CONFIG.artillery.range,
    minRange: GAME_CONFIG.artillery.minRange,
    playerReload: 7.2,
    aiReloadMin: 7.1,
    aiReloadMax: 8.5,
    shellSpeed: GAME_CONFIG.artillery.shellSpeed,
    blastRadius: GAME_CONFIG.artillery.blastRadius,
    blastDamage: 142,
    edgeDamage: GAME_CONFIG.artillery.edgeDamage,
    moraleDamage: 20,
    targetJitter: GAME_CONFIG.artillery.targetJitter,
    threatRetreatRange: GAME_CONFIG.artillery.threatRetreatRange,
    preferredRange: GAME_CONFIG.artillery.preferredRange,
    smokeScale: 1,
    shakeScale: 1,
  };
}

export function chargeProfile(squadClass: SquadClass): ChargeProfile {
  if (squadClass === 'hussar') {
    return {
      maxDistance: GAME_CONFIG.hussar.chargeMaxDistance,
      speed: GAME_CONFIG.hussar.chargeSpeed,
      aiMinDistance: GAME_CONFIG.hussar.aiChargeMinDistance,
      aiMaxDistance: GAME_CONFIG.hussar.aiChargeMaxDistance,
      roadkillDamage: GAME_CONFIG.hussar.roadkillDamage,
      roadkillMoraleDamage: 22,
      roadkillRadius: GAME_CONFIG.hussar.roadkillRadius,
      momentumPerHit: GAME_CONFIG.hussar.momentumPerHit,
      minMomentum: GAME_CONFIG.hussar.minMomentum,
    };
  }
  if (squadClass === 'cavalry') {
    return {
      maxDistance: GAME_CONFIG.cavalry.chargeMaxDistance,
      speed: GAME_CONFIG.cavalry.chargeSpeed,
      aiMinDistance: GAME_CONFIG.cavalry.aiChargeMinDistance,
      aiMaxDistance: GAME_CONFIG.cavalry.aiChargeMaxDistance,
      roadkillDamage: GAME_CONFIG.cavalry.roadkillDamage,
      roadkillMoraleDamage: 8,
      roadkillRadius: GAME_CONFIG.cavalry.roadkillRadius,
      momentumPerHit: GAME_CONFIG.cavalry.momentumPerHit,
      minMomentum: GAME_CONFIG.cavalry.minMomentum,
    };
  }
  return {
    maxDistance: GAME_CONFIG.charge.maxDistance,
    speed: GAME_CONFIG.charge.moveSpeed,
    aiMinDistance: GAME_CONFIG.charge.aiMinDistance,
    aiMaxDistance: GAME_CONFIG.charge.aiMaxDistance,
    roadkillDamage: 0,
    roadkillMoraleDamage: 0,
    roadkillRadius: 0,
    momentumPerHit: 0,
    minMomentum: 0,
  };
}

export function meleeProfile(squadClass: SquadClass): MeleeProfile {
  switch (squadClass) {
    case 'grenadier': return { damage: 48, cooldown: 0.66, moveSpeed: 106, moraleDamage: 4.2 };
    case 'lightInfantry': return { damage: 27, cooldown: 0.72, moveSpeed: 112, moraleDamage: 2.0 };
    case 'dragoon': return { damage: 33, cooldown: 0.68, moveSpeed: 132, moraleDamage: 2.4 };
    case 'cavalry': return { damage: GAME_CONFIG.cavalry.meleeDamage, cooldown: GAME_CONFIG.cavalry.meleeCooldown, moveSpeed: GAME_CONFIG.cavalry.meleeMoveSpeed, moraleDamage: 4.5 };
    case 'hussar': return { damage: GAME_CONFIG.hussar.meleeDamage, cooldown: GAME_CONFIG.hussar.meleeCooldown, moveSpeed: GAME_CONFIG.hussar.meleeMoveSpeed, moraleDamage: 9.0 };
    case 'artillery': return { damage: 16, cooldown: 1.05, moveSpeed: 76, moraleDamage: 1.0 };
    case 'heavyArtillery': return { damage: 14, cooldown: 1.15, moveSpeed: 62, moraleDamage: 0.8 };
    case 'horseArtillery': return { damage: 18, cooldown: 0.96, moveSpeed: 90, moraleDamage: 1.2 };
    default: return { damage: GAME_CONFIG.melee.attackDamage, cooldown: GAME_CONFIG.melee.attackCooldown, moveSpeed: GAME_CONFIG.melee.moveSpeed, moraleDamage: 2.8 };
  }
}

export function moraleResistance(squadClass: SquadClass): number {
  switch (squadClass) {
    case 'grenadier': return 0.66;
    case 'hussar': return 0.78;
    case 'cavalry': return 0.84;
    case 'dragoon': return 0.88;
    case 'lightInfantry': return 0.9;
    case 'heavyArtillery': return 1.2;
    case 'artillery': return 1.12;
    case 'horseArtillery': return 1.0;
    default: return 1;
  }
}

export function artilleryClass(squadClass: SquadClass): boolean {
  return isArtilleryClass(squadClass);
}

export function mountedChargeClass(squadClass: SquadClass): boolean {
  return isChargeCavalryClass(squadClass);
}
