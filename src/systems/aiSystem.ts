import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';

export class AiSystem {
  update(enemy: Formation, player: Formation, dt: number): boolean {
    if (enemy.aliveCount() === 0 || player.aliveCount() === 0) return false;

    const dx = player.center.x - enemy.center.x;
    const dy = player.center.y - enemy.center.y;
    const distance = Math.hypot(dx, dy);
    enemy.direction = Math.atan2(dy, dx);

    if (distance > GAME_CONFIG.musket.enemyStopRange) {
      const move = GAME_CONFIG.musket.enemyMoveSpeed * dt;
      enemy.center.x += Math.cos(enemy.direction) * move;
      enemy.center.y += Math.sin(enemy.direction) * move;
    }

    return distance <= GAME_CONFIG.musket.effectiveRange && enemy.canVolley();
  }
}
