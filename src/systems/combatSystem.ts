import { Unit } from '../entities/unit';

const EPSILON = 0.0001;

export interface AttackResult {
  attacker: Unit;
  target: Unit;
  hit: boolean;
}

function normalizeAngle(angle: number): number {
  let result = angle;
  while (result <= -Math.PI) result += Math.PI * 2;
  while (result > Math.PI) result -= Math.PI * 2;
  return result;
}

export function isInAttackArc(attacker: Unit, target: Unit): boolean {
  const dx = target.position.x - attacker.position.x;
  const dy = target.position.y - attacker.position.y;
  const distanceSquared = dx * dx + dy * dy;
  const range = attacker.config.attackRange;
  if (distanceSquared > range * range + EPSILON) return false;

  const angleToTarget = Math.atan2(dy, dx);
  const delta = Math.abs(normalizeAngle(angleToTarget - attacker.direction));
  const halfAngle = (attacker.config.attackAngleDeg * Math.PI) / 360;
  return delta <= halfAngle + EPSILON;
}

export function tryAttack(attacker: Unit, target: Unit): AttackResult {
  if (!attacker.canAttack()) return { attacker, target, hit: false };

  attacker.startAttack();
  if (!isInAttackArc(attacker, target) || target.dead) {
    return { attacker, target, hit: false };
  }

  target.takeDamage(attacker.config.damage);
  return { attacker, target, hit: true };
}
