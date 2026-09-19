import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';
import type { Vec2 } from '../game/types';

export interface AiDecision {
  volley: boolean;
  chargeTarget: Vec2 | null;
}

export class AiSystem {
  private decisionTimer = 0;
  private chargeBias = 0;

  reset(): void {
    this.decisionTimer = 0;
    this.chargeBias = Math.random() * 0.18;
  }

  update(enemy: Formation, player: Formation, dt: number): AiDecision {
    const decision: AiDecision = { volley: false, chargeTarget: null };
    if (enemy.aliveCount() === 0 || player.aliveCount() === 0) return decision;
    if (enemy.mode !== 'line') return decision;

    const dx = player.center.x - enemy.center.x;
    const dy = player.center.y - enemy.center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    enemy.direction = Math.atan2(dy, dx);

    const playerThreatening = player.mode === 'charging' || player.mode === 'melee';

    if (!playerThreatening) {
      if (distance > GAME_CONFIG.musket.enemyStopRange) {
        enemy.center.x += nx * GAME_CONFIG.musket.enemyMoveSpeed * dt;
        enemy.center.y += ny * GAME_CONFIG.musket.enemyMoveSpeed * dt;
      } else if (distance < GAME_CONFIG.musket.enemyRetreatRange) {
        enemy.center.x -= nx * GAME_CONFIG.musket.enemyRetreatSpeed * dt;
        enemy.center.y -= ny * GAME_CONFIG.musket.enemyRetreatSpeed * dt;
      }
    }

    enemy.center.x = Math.max(
      GAME_CONFIG.formation.arenaMarginX,
      Math.min(GAME_CONFIG.width - GAME_CONFIG.formation.arenaMarginX, enemy.center.x),
    );
    enemy.center.y = Math.max(
      GAME_CONFIG.formation.arenaMarginY,
      Math.min(GAME_CONFIG.height - GAME_CONFIG.formation.arenaMarginY, enemy.center.y),
    );

    const volleyRange = player.mode === 'charging'
      ? GAME_CONFIG.musket.defensiveVolleyRange
      : GAME_CONFIG.musket.effectiveRange;

    if (distance <= volleyRange && enemy.canVolley()) {
      decision.volley = true;
      return decision;
    }

    this.decisionTimer -= dt;
    if (this.decisionTimer > 0) return decision;
    this.decisionTimer = GAME_CONFIG.charge.enemyDecisionInterval * (0.8 + Math.random() * 0.45);

    const enemyAlive = enemy.aliveCount();
    const playerAlive = player.aliveCount();
    const strengthRatio = enemyAlive / Math.max(1, playerAlive);
    const playerReloadingHard = player.reloadTimer > GAME_CONFIG.musket.reloadSeconds * 0.48;
    const enemyReloading = enemy.reloadTimer > 0.8;
    const inChargeBand = distance >= GAME_CONFIG.charge.enemyChargeMinDistance
      && distance <= GAME_CONFIG.charge.enemyChargeMaxDistance;

    let chance = GAME_CONFIG.charge.enemyChargeChance + this.chargeBias;
    if (strengthRatio > 1.18) chance += 0.2;
    if (playerReloadingHard) chance += 0.24;
    if (enemyReloading) chance += 0.12;
    if (player.mode === 'melee') chance += 0.2;
    if (player.mode === 'charging') chance -= 0.08;

    if (inChargeBand && Math.random() < Math.min(0.82, chance)) {
      const lead = Math.min(48, distance * 0.12);
      decision.chargeTarget = {
        x: player.center.x + nx * lead,
        y: player.center.y + ny * lead,
      };
    }

    return decision;
  }
}
