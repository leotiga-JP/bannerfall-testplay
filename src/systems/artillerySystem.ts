import { ArtilleryShell } from '../entities/artilleryShell';
import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';
import { artilleryProfile } from '../game/classProfiles';
import type { Team, Vec2 } from '../game/types';

export interface ArtilleryExplosion {
  position: Vec2;
  life: number;
  maxLife: number;
  team: Team;
  radius?: number;
}

export function createArtilleryShells(formation: Formation, target: Vec2): ArtilleryShell[] {
  const profile = artilleryProfile(formation.squadClass);
  const right = { x: -Math.sin(formation.direction), y: Math.cos(formation.direction) };
  const shells: ArtilleryShell[] = [];
  for (let i = 0; i < profile.guns; i += 1) {
    const offset = (i - (profile.guns - 1) / 2) * 22;
    const start = {
      x: formation.center.x + Math.cos(formation.direction) * 34 + right.x * offset,
      y: formation.center.y + Math.sin(formation.direction) * 34 + right.y * offset,
    };
    const jitter = profile.targetJitter;
    const adjustedTarget = {
      x: target.x + (Math.random() - 0.5) * jitter,
      y: target.y + (Math.random() - 0.5) * jitter,
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
  dt: number,
  explosions: ArtilleryExplosion[],
  onDeath: (position: Vec2, team: Team, impactDirection: Vec2, sourceFormationId: string, targetFormationId: string) => void,
): boolean {
  let explodedNearAnything = false;
  for (const shell of shells) {
    if (!shell.active) continue;
    if (!shell.update(dt)) continue;
    explodedNearAnything = true;
    explosions.push({
      position: { ...shell.position },
      life: GAME_CONFIG.effects.artilleryExplosionLifetime,
      maxLife: GAME_CONFIG.effects.artilleryExplosionLifetime,
      team: shell.team,
      radius: shell.blastRadius,
    });

    for (const formation of formations) {
      if (formation.team === shell.team || formation.aliveCount() === 0 || formation.spawnProtectionTimer > 0) continue;
      let formationHit = false;
      for (const soldier of formation.aliveSoldiers()) {
        const dx = soldier.position.x - shell.position.x;
        const dy = soldier.position.y - shell.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance > shell.blastRadius) continue;
        const t = Math.max(0, Math.min(1, distance / shell.blastRadius));
        const damage = shell.blastDamage + (shell.edgeDamage - shell.blastDamage) * t;
        const killed = soldier.takeDamage(damage);
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
