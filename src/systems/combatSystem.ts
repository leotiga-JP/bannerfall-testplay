import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2 } from '../game/types';

export interface SmokeParticle {
  position: Vec2;
  velocity: Vec2;
  age: number;
  lifetime: number;
  size: number;
}

export interface MuzzleFlash {
  position: Vec2;
  direction: number;
  life: number;
}

export interface CorpseParticle {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
  team: Team;
  life: number;
  maxLife: number;
}

export interface VolleyResult {
  projectiles: Projectile[];
  smoke: SmokeParticle[];
  flashes: MuzzleFlash[];
}

function randomSpread(): number {
  return (Math.random() * 2 - 1) * GAME_CONFIG.musket.spreadRadians;
}

export function fireVolley(formation: Formation): VolleyResult {
  const projectiles: Projectile[] = [];
  const smoke: SmokeParticle[] = [];
  const flashes: MuzzleFlash[] = [];

  for (const soldier of formation.aliveSoldiers()) {
    const angle = formation.direction + randomSpread();
    const muzzleX = soldier.position.x + Math.cos(formation.direction) * GAME_CONFIG.musket.muzzleOffset;
    const muzzleY = soldier.position.y + Math.sin(formation.direction) * GAME_CONFIG.musket.muzzleOffset;

    projectiles.push(new Projectile(
      formation.team,
      { x: muzzleX, y: muzzleY },
      {
        x: Math.cos(angle) * GAME_CONFIG.musket.projectileSpeed,
        y: Math.sin(angle) * GAME_CONFIG.musket.projectileSpeed,
      },
      GAME_CONFIG.musket.projectileLife,
      GAME_CONFIG.musket.damage,
    ));

    flashes.push({
      position: { x: muzzleX, y: muzzleY },
      direction: formation.direction,
      life: GAME_CONFIG.effects.flashLifetime,
    });

    for (let i = 0; i < 2; i += 1) {
      smoke.push({
        position: {
          x: muzzleX + (Math.random() - 0.5) * 7,
          y: muzzleY + (Math.random() - 0.5) * 7,
        },
        velocity: {
          x: Math.cos(formation.direction) * (14 + Math.random() * 18) + (Math.random() - 0.5) * 18,
          y: Math.sin(formation.direction) * (14 + Math.random() * 18) + (Math.random() - 0.5) * 18,
        },
        age: 0,
        lifetime: GAME_CONFIG.effects.smokeLifetime * (0.75 + Math.random() * 0.5),
        size: 8 + Math.random() * 8,
      });
    }
  }

  return { projectiles, smoke, flashes };
}


function distanceToSegmentSquared(point: Vec2, start: Vec2, end: Vec2): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared <= 0.000001) {
    return wx * wx + wy * wy;
  }
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
  const closestX = start.x + vx * t;
  const closestY = start.y + vy * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy;
}

export function updateProjectiles(
  projectiles: Projectile[],
  playerFormation: Formation,
  enemyFormation: Formation,
  dt: number,
  onDeath: (position: Vec2, team: Team, impactDirection: Vec2) => void,
): void {
  const bulletRadius = GAME_CONFIG.musket.bulletRadius;

  for (const projectile of projectiles) {
    if (projectile.life <= 0) continue;
    const previous = { ...projectile.position };
    projectile.update(dt);

    const targets = projectile.team === 'player' ? enemyFormation.soldiers : playerFormation.soldiers;
    for (const target of targets) {
      if (target.dead) continue;
      const hitRadius = GAME_CONFIG.soldier.radius + bulletRadius;
      if (distanceToSegmentSquared(target.position, previous, projectile.position) > hitRadius * hitRadius) continue;

      const killed = target.takeDamage(projectile.damage);
      projectile.life = 0;
      if (killed) {
        const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1;
        onDeath(target.position, target.team, {
          x: projectile.velocity.x / speed,
          y: projectile.velocity.y / speed,
        });
      }
      break;
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    const outside = projectile.position.x < -30 || projectile.position.x > GAME_CONFIG.width + 30 || projectile.position.y < -30 || projectile.position.y > GAME_CONFIG.height + 30;
    if (projectile.life <= 0 || outside) projectiles.splice(i, 1);
  }
}
