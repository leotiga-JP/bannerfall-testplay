import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { Fieldwork } from '../entities/fieldwork';
import { GAME_CONFIG } from '../game/config';
import { volleyProfile } from '../game/classProfiles';
import { isMountedClass, type Team, type Vec2 } from '../game/types';

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

export function fireVolley(formation: Formation): VolleyResult {
  const projectiles: Projectile[] = [];
  const smoke: SmokeParticle[] = [];
  const flashes: MuzzleFlash[] = [];
  const profile = volleyProfile(formation.squadClass);

  for (const soldier of formation.aliveSoldiers()) {
    const angle = formation.direction + (Math.random() * 2 - 1) * profile.spread;
    const muzzle = {
      x: soldier.position.x + Math.cos(formation.direction) * GAME_CONFIG.musket.muzzleOffset,
      y: soldier.position.y + Math.sin(formation.direction) * GAME_CONFIG.musket.muzzleOffset,
    };

    projectiles.push(new Projectile(
      formation.team,
      muzzle,
      {
        x: Math.cos(angle) * profile.projectileSpeed,
        y: Math.sin(angle) * profile.projectileSpeed,
      },
      profile.projectileLife,
      profile.damage,
      profile.moraleDamage,
      formation.id,
    ));

    flashes.push({ position: { ...muzzle }, direction: formation.direction, life: GAME_CONFIG.effects.flashLifetime });
    smoke.push({
      position: { x: muzzle.x + (Math.random() - 0.5) * 6, y: muzzle.y + (Math.random() - 0.5) * 6 },
      velocity: {
        x: Math.cos(formation.direction) * (12 + Math.random() * 16) + (Math.random() - 0.5) * 15,
        y: Math.sin(formation.direction) * (12 + Math.random() * 16) + (Math.random() - 0.5) * 15,
      },
      age: 0,
      lifetime: GAME_CONFIG.effects.smokeLifetime * (0.8 + Math.random() * 0.4),
      size: 8 + Math.random() * 7,
    });
  }

  return { projectiles, smoke, flashes };
}

function distanceToSegmentSquared(point: Vec2, start: Vec2, end: Vec2): number {
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const wx = point.x - start.x;
  const wy = point.y - start.y;
  const lengthSquared = vx * vx + vy * vy;
  if (lengthSquared <= 0.000001) return wx * wx + wy * wy;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
  const closestX = start.x + vx * t;
  const closestY = start.y + vy * t;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  return dx * dx + dy * dy;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return ((o1 >= 0 && o2 <= 0) || (o1 <= 0 && o2 >= 0))
    && ((o3 >= 0 && o4 <= 0) || (o3 <= 0 && o4 >= 0));
}

function projectileHitsFieldwork(start: Vec2, end: Vec2, fieldwork: Fieldwork): boolean {
  const endpoints = fieldwork.endpoints();
  if (segmentsIntersect(start, end, endpoints.a, endpoints.b)) return true;
  const r2 = (GAME_CONFIG.fieldworks.thickness + GAME_CONFIG.musket.bulletRadius) ** 2;
  return distanceToSegmentSquared(endpoints.a, start, end) <= r2
    || distanceToSegmentSquared(endpoints.b, start, end) <= r2
    || distanceToSegmentSquared(start, endpoints.a, endpoints.b) <= r2
    || distanceToSegmentSquared(end, endpoints.a, endpoints.b) <= r2;
}

export function updateProjectiles(
  projectiles: Projectile[],
  formations: Formation[],
  fieldworks: Fieldwork[],
  dt: number,
  onDeath: (position: Vec2, team: Team, impactDirection: Vec2, sourceFormationId: string, targetFormationId: string) => void,
): void {
  const bulletRadius = GAME_CONFIG.musket.bulletRadius;
  const coarseRadius = GAME_CONFIG.formation.collisionRadius + 70;
  const coarseRadiusSq = coarseRadius * coarseRadius;

  for (const projectile of projectiles) {
    if (projectile.life <= 0) continue;
    const previous = { ...projectile.position };
    projectile.update(dt);
    const segmentMid = { x: (previous.x + projectile.position.x) / 2, y: (previous.y + projectile.position.y) / 2 };

    let hit = false;
    for (const fieldwork of fieldworks) {
      if (!fieldwork.active || fieldwork.team === projectile.team) continue;
      if (!projectileHitsFieldwork(previous, projectile.position, fieldwork)) continue;
      fieldwork.takeDamage(projectile.damage * GAME_CONFIG.fieldworks.bulletDamageMultiplier);
      projectile.life = 0;
      hit = true;
      break;
    }
    if (hit) continue;
    for (const formation of formations) {
      if (formation.team === projectile.team || formation.aliveCount() === 0 || formation.spawnProtectionTimer > 0) continue;
      const cdx = formation.center.x - segmentMid.x;
      const cdy = formation.center.y - segmentMid.y;
      if (cdx * cdx + cdy * cdy > coarseRadiusSq) continue;

      for (const target of formation.soldiers) {
        if (target.dead) continue;
        const hitRadius = GAME_CONFIG.soldier.radius + bulletRadius;
        if (distanceToSegmentSquared(target.position, previous, projectile.position) > hitRadius * hitRadius) continue;
        const sourceFormation = formations.find((candidate) => candidate.id === projectile.sourceFormationId);
        const damage = sourceFormation?.squadClass === 'sharpshooter' && isMountedClass(formation.squadClass)
          ? Math.max(projectile.damage, target.hp + 1)
          : projectile.damage;
        const killed = target.takeDamage(damage);
        formation.applyMoraleDamage(projectile.moraleDamage + (killed ? 1.8 : 0));
        projectile.life = 0;
        if (killed) {
          const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1;
          onDeath(target.position, target.team, { x: projectile.velocity.x / speed, y: projectile.velocity.y / speed }, projectile.sourceFormationId, formation.id);
        }
        hit = true;
        break;
      }
      if (hit) break;
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i -= 1) {
    const projectile = projectiles[i];
    const outside = projectile.position.x < -50
      || projectile.position.x > GAME_CONFIG.world.width + 50
      || projectile.position.y < -50
      || projectile.position.y > GAME_CONFIG.world.height + 50;
    if (projectile.life <= 0 || outside) projectiles.splice(i, 1);
  }
}
