import { Unit } from '../entities/unit';
import type { Vec2 } from '../game/types';
import { isInAttackArc, tryAttack } from './combatSystem';

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function moveTowards(unit: Unit, target: Vec2, dt: number): void {
  const dx = target.x - unit.position.x;
  const dy = target.y - unit.position.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001) return;

  const step = unit.config.moveSpeed * dt;
  const ratio = Math.min(step / length, 1);
  unit.position.x += dx * ratio;
  unit.position.y += dy * ratio;
}

export class AiSystem {
  update(ai: Unit, player: Unit, dt: number, bounds: { width: number; height: number }): void {
    if (ai.dead) {
      ai.aiState = 'DEAD';
      return;
    }

    const d = distance(ai.position, player.position);
    ai.direction = Math.atan2(player.position.y - ai.position.y, player.position.x - ai.position.x);

    if (player.dead) {
      ai.aiState = 'IDLE';
      return;
    }

    if (d > ai.config.attackRange || !isInAttackArc(ai, player)) {
      ai.aiState = 'APPROACH';
      moveTowards(ai, player.position, dt);
    } else {
      ai.aiState = 'ENGAGE';
      tryAttack(ai, player);
    }

    ai.position.x = Math.max(ai.config.radius, Math.min(bounds.width - ai.config.radius, ai.position.x));
    ai.position.y = Math.max(ai.config.radius, Math.min(bounds.height - ai.config.radius, ai.position.y));
  }
}
