import { ArtilleryShell } from '../entities/artilleryShell';
import { Formation } from '../entities/formation';
import { Fieldwork } from '../entities/fieldwork';
import { ConstructionBlock, CONSTRUCTION_DEFINITIONS } from '../entities/constructionBlock';
import { GAME_CONFIG } from '../game/config';
import { BATTLEFIELD_MAP } from '../game/battlefieldMap';
import { constructionBlocksProjectiles, segmentIntersectsConstructionBlock } from '../game/constructionSystem';
import { artilleryProfile } from '../game/classProfiles';
import { artilleryGunLocalOffset, artilleryTargetLocalOffset } from '../game/formationSystem';
import type { Team, Vec2 } from '../game/types';
import { armorDamageMultiplier } from '../game/upgradeSystem';

export interface ArtilleryExplosion {
  position: Vec2;
  life: number;
  maxLife: number;
  team: Team;
  radius?: number;
}

export function createArtilleryShells(formation: Formation, target: Vec2): ArtilleryShell[] {
  const profile = artilleryProfile(formation.squadClass, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
  const forward = { x: Math.cos(formation.direction), y: Math.sin(formation.direction) };
  const right = { x: -forward.y, y: forward.x };
  const shells: ArtilleryShell[] = [];
  const patternSpacing = Math.max(82, profile.blastRadius * 0.62 + 46);
  for (let i = 0; i < profile.guns; i += 1) {
    const gunOffset = artilleryGunLocalOffset(formation.formationShape, i, profile.guns, 34, 42);
    const start = {
      x: formation.center.x + forward.x * (34 + gunOffset.forward) + right.x * gunOffset.lateral,
      y: formation.center.y + forward.y * (34 + gunOffset.forward) + right.y * gunOffset.lateral,
    };
    const patternOffset = artilleryTargetLocalOffset(formation.formationShape, i, profile.guns, patternSpacing);
    const jitter = profile.targetJitter;
    const adjustedTarget = {
      x: target.x + forward.x * patternOffset.forward + right.x * patternOffset.lateral + (Math.random() - 0.5) * jitter,
      y: target.y + forward.y * patternOffset.forward + right.y * patternOffset.lateral + (Math.random() - 0.5) * jitter,
    };
    shells.push(new ArtilleryShell(
      formation.team,
      start,
      adjustedTarget,
      profile.shellSpeed,
      formation.squadClass,
      profile.blastRadius,
      profile.blastDamage,
      profile.edgeDamage,
      profile.moraleDamage,
      formation.id,
    ));
  }
  return shells;
}

export function updateArtilleryShells(
  shells: ArtilleryShell[],
  formations: Formation[],
  fieldworks: Fieldwork[],
  constructionBlocks: ConstructionBlock[],
  dt: number,
  explosions: ArtilleryExplosion[],
  onDeath: (position: Vec2, team: Team, impactDirection: Vec2, sourceFormationId: string, targetFormationId: string) => void,
): boolean {
  let explodedNearAnything = false;
  for (const shell of shells) {
    if (!shell.active) continue;
    const previous = { ...shell.position };
    let impact = shell.update(dt);
    if (!impact) {
      const mountainHit = BATTLEFIELD_MAP.segmentHitsMountain(previous, shell.position);
      if (mountainHit) {
        shell.position = mountainHit;
        shell.active = false;
        impact = true;
      } else {
        for (const block of constructionBlocks) {
          if (!block.active || !constructionBlocksProjectiles(block.kind) || !segmentIntersectsConstructionBlock(previous, shell.position, block, 4)) continue;
          shell.position = { ...block.position };
          if (block.team !== shell.team) {
            block.takeDamage(shell.blastDamage * CONSTRUCTION_DEFINITIONS[block.kind].artilleryDamageMultiplier * 1.65);
          }
          shell.active = false;
          impact = true;
          break;
        }
      }
    }
    if (!impact) continue;
    explodedNearAnything = true;
    explosions.push({
      position: { ...shell.position },
      life: GAME_CONFIG.effects.artilleryExplosionLifetime,
      maxLife: GAME_CONFIG.effects.artilleryExplosionLifetime,
      team: shell.team,
      radius: shell.blastRadius,
    });

    for (const block of constructionBlocks) {
      if (!block.active || block.team === shell.team) continue;
      const dx = block.position.x - shell.position.x;
      const dy = block.position.y - shell.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > shell.blastRadius + GAME_CONFIG.world.grid * 0.75) continue;
      const falloff = Math.max(0.22, 1 - distance / Math.max(1, shell.blastRadius + GAME_CONFIG.world.grid * 0.75));
      block.takeDamage(shell.blastDamage * CONSTRUCTION_DEFINITIONS[block.kind].explosionDamageMultiplier * falloff);
    }

    for (const fieldwork of fieldworks) {
      if (!fieldwork.active || fieldwork.team === shell.team) continue;
      const dx = fieldwork.position.x - shell.position.x;
      const dy = fieldwork.position.y - shell.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > shell.blastRadius + GAME_CONFIG.fieldworks.length * 0.45) continue;
      const falloff = Math.max(0.25, 1 - distance / Math.max(1, shell.blastRadius + GAME_CONFIG.fieldworks.length * 0.45));
      fieldwork.takeDamage(shell.blastDamage * GAME_CONFIG.fieldworks.artilleryDamageMultiplier * falloff);
    }

    for (const formation of formations) {
      if (formation.team === shell.team || formation.aliveCount() === 0 || formation.spawnProtectionTimer > 0) continue;
      let formationHit = false;
      for (const soldier of formation.aliveSoldiers()) {
        const dx = soldier.position.x - shell.position.x;
        const dy = soldier.position.y - shell.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance > shell.blastRadius) continue;
        if (BATTLEFIELD_MAP.segmentHitsMountain(shell.position, soldier.position)) continue;
        const blockedByWall = constructionBlocks.some((block) => block.active
          && constructionBlocksProjectiles(block.kind)
          && segmentIntersectsConstructionBlock(shell.position, soldier.position, block, 1));
        if (blockedByWall) continue;
        const t = Math.max(0, Math.min(1, distance / shell.blastRadius));
        const damage = shell.blastDamage + (shell.edgeDamage - shell.blastDamage) * t;
        const killed = soldier.takeDamage(damage * armorDamageMultiplier(formation.squadClass, formation.armorTier, 'explosive'));
        const norm = distance > 0.001 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
        soldier.knockback.x += norm.x * 135 * (1 - t * 0.55);
        soldier.knockback.y += norm.y * 135 * (1 - t * 0.55);
        if (killed) onDeath(soldier.position, soldier.team, norm, shell.sourceFormationId, formation.id);
        formationHit = true;
      }
      if (formationHit) formation.applyMoraleDamage(shell.moraleDamage);
    }
  }

  for (let i = shells.length - 1; i >= 0; i -= 1) {
    if (!shells[i].active) shells.splice(i, 1);
  }
  return explodedNearAnything;
}
