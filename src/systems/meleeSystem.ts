import { Formation } from '../entities/formation';
import { Unit } from '../entities/unit';
import { GAME_CONFIG } from '../game/config';
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
  formationsInContact(a: Formation, b: Formation, threshold: number = GAME_CONFIG.charge.contactDistance): boolean {
    const thresholdSq = threshold * threshold;
    for (const unitA of a.soldiers) {
      if (unitA.dead) continue;
      for (const unitB of b.soldiers) {
        if (unitB.dead) continue;
        const dx = unitB.position.x - unitA.position.x;
        const dy = unitB.position.y - unitA.position.y;
        if (dx * dx + dy * dy <= thresholdSq) return true;
      }
    }
    return false;
  }

  hasNearbyEnemy(formation: Formation, enemy: Formation, range: number = GAME_CONFIG.melee.disengageDistance): boolean {
    const rangeSq = range * range;
    for (const unit of formation.soldiers) {
      if (unit.dead) continue;
      for (const candidate of enemy.soldiers) {
        if (candidate.dead) continue;
        const dx = candidate.position.x - unit.position.x;
        const dy = candidate.position.y - unit.position.y;
        if (dx * dx + dy * dy <= rangeSq) return true;
      }
    }
    return false;
  }

  update(
    player: Formation,
    enemy: Formation,
    dt: number,
    strikes: MeleeStrike[],
    onDeath: (position: Vec2, team: Team, impactDirection: Vec2) => void,
  ): boolean {
    const playerAlive = player.aliveSoldiers();
    const enemyAlive = enemy.aliveSoldiers();
    if (playerAlive.length === 0 || enemyAlive.length === 0) return false;

    if (player.mode === 'melee') this.moveSide(playerAlive, enemyAlive, playerAlive, dt);
    if (enemy.mode === 'melee') this.moveSide(enemyAlive, playerAlive, enemyAlive, dt);

    const pendingHits: PendingHit[] = [];
    if (player.mode === 'melee') this.collectAttacks(playerAlive, enemyAlive, pendingHits);
    if (enemy.mode === 'melee') this.collectAttacks(enemyAlive, playerAlive, pendingHits);

    let anyStrike = false;
    for (const hit of pendingHits) {
      if (hit.attacker.dead || hit.target.dead) continue;

      hit.attacker.meleeCooldown = GAME_CONFIG.melee.attackCooldown * (0.88 + Math.random() * 0.24);
      hit.attacker.meleeStabTimer = GAME_CONFIG.melee.attackWindup;
      hit.attacker.direction = Math.atan2(hit.direction.y, hit.direction.x);

      strikes.push({
        start: {
          x: hit.attacker.position.x + hit.direction.x * 10,
          y: hit.attacker.position.y + hit.direction.y * 10,
        },
        end: {
          x: hit.target.position.x,
          y: hit.target.position.y,
        },
        team: hit.attacker.team,
        life: GAME_CONFIG.effects.meleeStrikeLifetime,
      });

      const damage = GAME_CONFIG.melee.attackDamage * (0.85 + Math.random() * 0.3);
      const killed = hit.target.takeDamage(damage);
      hit.target.knockback.x += hit.direction.x * GAME_CONFIG.melee.knockbackSpeed;
      hit.target.knockback.y += hit.direction.y * GAME_CONFIG.melee.knockbackSpeed;
      anyStrike = true;

      if (killed) onDeath(hit.target.position, hit.target.team, hit.direction);
    }

    return anyStrike;
  }

  private moveSide(units: Unit[], enemies: Unit[], allies: Unit[], dt: number): void {
    for (const unit of units) {
      if (unit.dead) continue;
      const target = this.nearestWithin(unit, enemies, GAME_CONFIG.melee.acquireRange);

      let moveX = 0;
      let moveY = 0;
      if (target) {
        let dx = target.position.x - unit.position.x;
        let dy = target.position.y - unit.position.y;
        const distance = Math.hypot(dx, dy) || 1;
        const nx = dx / distance;
        const ny = dy / distance;
        unit.direction = Math.atan2(dy, dx);

        if (distance > GAME_CONFIG.melee.attackRange * 0.82) {
          moveX += nx * GAME_CONFIG.melee.moveSpeed;
          moveY += ny * GAME_CONFIG.melee.moveSpeed;
        }
      }

      for (const ally of allies) {
        if (ally === unit || ally.dead) continue;
        const dx = unit.position.x - ally.position.x;
        const dy = unit.position.y - ally.position.y;
        const separationDistance = Math.hypot(dx, dy);
        if (separationDistance <= 0.001 || separationDistance >= GAME_CONFIG.melee.separationRadius) continue;
        const strength = 1 - separationDistance / GAME_CONFIG.melee.separationRadius;
        moveX += (dx / separationDistance) * GAME_CONFIG.melee.separationStrength * strength;
        moveY += (dy / separationDistance) * GAME_CONFIG.melee.separationStrength * strength;
      }

      unit.position.x += (moveX + unit.knockback.x) * dt;
      unit.position.y += (moveY + unit.knockback.y) * dt;
      unit.knockback.x *= Math.pow(GAME_CONFIG.melee.knockbackDamping, dt);
      unit.knockback.y *= Math.pow(GAME_CONFIG.melee.knockbackDamping, dt);

      const pad = GAME_CONFIG.melee.arenaPadding;
      unit.position.x = Math.max(pad, Math.min(GAME_CONFIG.width - pad, unit.position.x));
      unit.position.y = Math.max(pad, Math.min(GAME_CONFIG.height - pad, unit.position.y));
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
    let best: Unit | null = null;
    let bestDistanceSq = range * range;
    for (const candidate of candidates) {
      if (candidate.dead) continue;
      const dx = candidate.position.x - unit.position.x;
      const dy = candidate.position.y - unit.position.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = candidate;
      }
    }
    return best;
  }
}
