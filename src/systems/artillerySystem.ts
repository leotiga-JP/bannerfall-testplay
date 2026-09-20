import { ArtilleryShell } from '../entities/artilleryShell';
import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2 } from '../game/types';

export interface ArtilleryExplosion {
  position: Vec2;
  life: number;
  maxLife: number;
  team: Team;
}

export function createArtilleryShell(formation: Formation, target: Vec2): ArtilleryShell {
  const start = {
    x: formation.center.x + Math.cos(formation.direction) * 34,
    y: formation.center.y + Math.sin(formation.direction) * 34,
  };
  return new ArtilleryShell(formation.team, start, target, GAME_CONFIG.artillery.shellSpeed);
}

export function updateArtilleryShells(
  shells: ArtilleryShell[],
  formations: Formation[],
  dt: number,
  explosions: ArtilleryExplosion[],
  onDeath: (position: Vec2, team: Team, impactDirection: Vec2) => void,
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
    });

    for (const formation of formations) {
      if (formation.team === shell.team || formation.aliveCount() === 0 || formation.spawnProtectionTimer > 0) continue;
      for (const soldier of formation.aliveSoldiers()) {
        const dx = soldier.position.x - shell.position.x;
        const dy = soldier.position.y - shell.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance > GAME_CONFIG.artillery.blastRadius) continue;
        const t = Math.max(0, Math.min(1, distance / GAME_CONFIG.artillery.blastRadius));
        const damage = GAME_CONFIG.artillery.blastDamage
          + (GAME_CONFIG.artillery.edgeDamage - GAME_CONFIG.artillery.blastDamage) * t;
        const killed = soldier.takeDamage(damage);
        const norm = distance > 0.001 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
        soldier.knockback.x += norm.x * 115 * (1 - t * 0.6);
        soldier.knockback.y += norm.y * 115 * (1 - t * 0.6);
        if (killed) onDeath(soldier.position, soldier.team, norm);
      }
    }
  }

  for (let i = shells.length - 1; i >= 0; i -= 1) {
    if (!shells[i].active) shells.splice(i, 1);
  }
  return explodedNearAnything;
}
