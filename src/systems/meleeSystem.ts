import { Formation } from '../entities/formation';
import { Unit } from '../entities/unit';
import { GAME_CONFIG } from '../game/config';
import { meleeProfile } from '../game/classProfiles';
import type { Team, Vec2 } from '../game/types';

export interface MeleeStrike {
  start: Vec2;
  end: Vec2;
  team: Team;
  life: number;
}

interface PendingHit {
  attacker: Unit;
  target: Unit;
  direction: Vec2;
}

export class MeleeSystem {
  findContact(charger: Formation, enemies: Formation[]): Formation | null {
    const centerRange = GAME_CONFIG.formation.collisionRadius * 2 + GAME_CONFIG.charge.contactDistance;
    const centerRangeSq = centerRange * centerRange;
    const contactSq = GAME_CONFIG.charge.contactDistance * GAME_CONFIG.charge.contactDistance;

    for (const enemy of enemies) {
      if (enemy.aliveCount() === 0 || enemy.spawnProtectionTimer > 0) continue;
      const cdx = enemy.center.x - charger.center.x;
      const cdy = enemy.center.y - charger.center.y;
      if (cdx * cdx + cdy * cdy > centerRangeSq) continue;
      for (const own of charger.soldiers) {
        if (own.dead) continue;
        for (const target of enemy.soldiers) {
          if (target.dead) continue;
          const dx = target.position.x - own.position.x;
          const dy = target.position.y - own.position.y;
          if (dx * dx + dy * dy <= contactSq) return enemy;
        }
      }
    }
    return null;
  }

  hasNearbyEnemy(formation: Formation, enemies: Formation[], range: number = GAME_CONFIG.melee.disengageDistance): boolean {
    const centerRange = range + GAME_CONFIG.formation.collisionRadius * 2;
    const centerRangeSq = centerRange * centerRange;
    const rangeSq = range * range;
    for (const enemy of enemies) {
      if (enemy.aliveCount() === 0 || enemy.spawnProtectionTimer > 0) continue;
      const cdx = enemy.center.x - formation.center.x;
      const cdy = enemy.center.y - formation.center.y;
      if (cdx * cdx + cdy * cdy > centerRangeSq) continue;
      for (const own of formation.soldiers) {
        if (own.dead) continue;
        for (const target of enemy.soldiers) {
          if (target.dead) continue;
          const dx = target.position.x - own.position.x;
          const dy = target.position.y - own.position.y;
          if (dx * dx + dy * dy <= rangeSq) return true;
        }
      }
    }
    return false;
  }

  update(
    formations: Formation[],
    dt: number,
    strikes: MeleeStrike[],
    onDeath: (position: Vec2, team: Team, impactDirection: Vec2, sourceFormationId: string, targetFormationId: string) => void,
  ): boolean {
    let anyStrike = false;
    const pendingHits: PendingHit[] = [];

    for (const formation of formations) {
      if (formation.mode !== 'melee' || formation.aliveCount() === 0) continue;
      const enemyUnits = this.nearbyEnemyUnits(formation, formations);
      if (enemyUnits.length === 0) continue;
      const own = formation.aliveSoldiers();
      this.moveSide(formation, own, enemyUnits, dt);
      this.collectAttacks(own, enemyUnits, pendingHits);
    }

    for (const hit of pendingHits) {
      if (hit.attacker.dead || hit.target.dead) continue;
      const attackerFormationForCooldown = formations.find((formation) => formation.team === hit.attacker.team && formation.soldiers.includes(hit.attacker));
      const attackProfile = meleeProfile(attackerFormationForCooldown?.squadClass ?? 'infantry');
      hit.attacker.meleeCooldown = attackProfile.cooldown * (0.88 + Math.random() * 0.24);
      hit.attacker.meleeStabTimer = GAME_CONFIG.melee.attackWindup;
      hit.attacker.direction = Math.atan2(hit.direction.y, hit.direction.x);
      strikes.push({
        start: {
          x: hit.attacker.position.x + hit.direction.x * 9,
          y: hit.attacker.position.y + hit.direction.y * 9,
        },
        end: { ...hit.target.position },
        team: hit.attacker.team,
        life: GAME_CONFIG.effects.meleeStrikeLifetime,
      });
      const attackerFormation = formations.find((formation) => formation.team === hit.attacker.team && formation.soldiers.includes(hit.attacker));
      const targetFormation = formations.find((formation) => formation.team === hit.target.team && formation.soldiers.includes(hit.target));
      const profile = meleeProfile(attackerFormation?.squadClass ?? 'infantry');
      const damage = profile.damage * (0.85 + Math.random() * 0.3);
      const killed = hit.target.takeDamage(damage);
      targetFormation?.applyMoraleDamage(profile.moraleDamage + (killed ? 2.2 : 0));
      hit.target.knockback.x += hit.direction.x * GAME_CONFIG.melee.knockbackSpeed;
      hit.target.knockback.y += hit.direction.y * GAME_CONFIG.melee.knockbackSpeed;
      anyStrike = true;
      if (killed) onDeath(hit.target.position, hit.target.team, hit.direction, attackerFormation?.id ?? '', targetFormation?.id ?? '');
    }

    return anyStrike;
  }

  private nearbyEnemyUnits(formation: Formation, formations: Formation[]): Unit[] {
    const result: Unit[] = [];
    const maxSq = GAME_CONFIG.melee.formationSearchRange * GAME_CONFIG.melee.formationSearchRange;
    for (const enemy of formations) {
      if (enemy.team === formation.team || enemy.aliveCount() === 0 || enemy.spawnProtectionTimer > 0) continue;
      const dx = enemy.center.x - formation.center.x;
      const dy = enemy.center.y - formation.center.y;
      if (dx * dx + dy * dy > maxSq) continue;
      result.push(...enemy.aliveSoldiers());
    }
    return result;
  }

  private moveSide(formation: Formation, units: Unit[], enemies: Unit[], dt: number): void {
    for (const unit of units) {
      if (unit.dead) continue;
      const target = this.nearestWithin(unit, enemies, GAME_CONFIG.melee.acquireRange);
      let moveX = 0;
      let moveY = 0;

      if (target) {
        const dx = target.position.x - unit.position.x;
        const dy = target.position.y - unit.position.y;
        const distance = Math.hypot(dx, dy) || 1;
        const nx = dx / distance;
        const ny = dy / distance;
        unit.direction = Math.atan2(dy, dx);
        if (distance > GAME_CONFIG.melee.attackRange * 0.82) {
          const meleeSpeed = meleeProfile(formation.squadClass).moveSpeed;
          moveX += nx * meleeSpeed;
          moveY += ny * meleeSpeed;
        }
      }

      for (const ally of units) {
        if (ally === unit || ally.dead) continue;
        const dx = unit.position.x - ally.position.x;
        const dy = unit.position.y - ally.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= 0.001 || distance >= GAME_CONFIG.melee.separationRadius) continue;
        const strength = 1 - distance / GAME_CONFIG.melee.separationRadius;
        moveX += (dx / distance) * GAME_CONFIG.melee.separationStrength * strength;
        moveY += (dy / distance) * GAME_CONFIG.melee.separationStrength * strength;
      }

      unit.position.x += (moveX + unit.knockback.x) * dt;
      unit.position.y += (moveY + unit.knockback.y) * dt;
      unit.knockback.x *= Math.pow(GAME_CONFIG.melee.knockbackDamping, dt);
      unit.knockback.y *= Math.pow(GAME_CONFIG.melee.knockbackDamping, dt);
      unit.position.x = Math.max(GAME_CONFIG.world.padding, Math.min(GAME_CONFIG.world.width - GAME_CONFIG.world.padding, unit.position.x));
      unit.position.y = Math.max(GAME_CONFIG.world.padding, Math.min(GAME_CONFIG.world.height - GAME_CONFIG.world.padding, unit.position.y));
    }
  }

  private collectAttacks(attackers: Unit[], enemies: Unit[], pendingHits: PendingHit[]): void {
    for (const attacker of attackers) {
      if (attacker.dead || attacker.meleeCooldown > 0) continue;
      const target = this.nearestWithin(attacker, enemies, GAME_CONFIG.melee.attackRange);
      if (!target) continue;
      const dx = target.position.x - attacker.position.x;
      const dy = target.position.y - attacker.position.y;
      const distance = Math.hypot(dx, dy) || 1;
      pendingHits.push({
        attacker,
        target,
        direction: { x: dx / distance, y: dy / distance },
      });
    }
  }

  private nearestWithin(unit: Unit, candidates: Unit[], range: number): Unit | null {
    const rangeSq = range * range;
    let best: Unit | null = null;
    let bestSq = rangeSq;
    for (const candidate of candidates) {
      if (candidate.dead) continue;
      const dx = candidate.position.x - unit.position.x;
      const dy = candidate.position.y - unit.position.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < bestSq) {
        bestSq = distanceSq;
        best = candidate;
      }
    }
    return best;
  }
}
