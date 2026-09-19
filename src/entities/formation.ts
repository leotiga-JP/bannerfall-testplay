import { Unit } from './unit';
import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2 } from '../game/types';

export type FormationMode = 'line' | 'charging' | 'melee';

export class Formation {
  readonly team: Team;
  readonly soldiers: Unit[];
  center: Vec2;
  direction: number;
  reloadTimer = 0;
  volleysFired = 0;
  mode: FormationMode = 'line';
  chargeTarget: Vec2 | null = null;

  constructor(team: Team, center: Vec2, direction: number) {
    this.team = team;
    this.center = { ...center };
    this.direction = direction;
    const count = GAME_CONFIG.formation.rows * GAME_CONFIG.formation.columns;
    this.soldiers = Array.from({ length: count }, (_, index) => {
      const position = this.slotPosition(index);
      const unit = new Unit(`${team}-${index}`, team, index, position);
      unit.direction = direction;
      return unit;
    });
  }

  reset(center: Vec2, direction: number): void {
    this.center = { ...center };
    this.direction = direction;
    this.reloadTimer = 0;
    this.volleysFired = 0;
    this.mode = 'line';
    this.chargeTarget = null;
    for (const soldier of this.soldiers) {
      soldier.reset(this.slotPosition(soldier.slotIndex));
      soldier.direction = direction;
    }
  }

  beginCharge(target: Vec2): boolean {
    if (this.mode !== 'line' || this.aliveCount() === 0) return false;
    const dx = target.x - this.center.x;
    const dy = target.y - this.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < GAME_CONFIG.charge.arrowMinDistance) return false;

    this.direction = Math.atan2(dy, dx);
    this.chargeTarget = { ...target };
    this.mode = 'charging';
    return true;
  }

  advanceCharge(dt: number): boolean {
    if (this.mode !== 'charging' || !this.chargeTarget) return false;
    const dx = this.chargeTarget.x - this.center.x;
    const dy = this.chargeTarget.y - this.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= GAME_CONFIG.charge.stopDistance) {
      this.center = { ...this.chargeTarget };
      return true;
    }

    const step = Math.min(distance, GAME_CONFIG.charge.moveSpeed * dt);
    this.center.x += (dx / distance) * step;
    this.center.y += (dy / distance) * step;
    this.direction = Math.atan2(dy, dx);
    return distance - step <= GAME_CONFIG.charge.stopDistance;
  }

  enterMelee(): void {
    this.mode = 'melee';
    this.chargeTarget = null;
    this.reloadTimer = Math.max(this.reloadTimer, 0.25);
  }

  returnToLine(reloadPenalty = 0): void {
    this.recalculateCenter();
    this.mode = 'line';
    this.chargeTarget = null;
    this.reloadTimer = Math.max(this.reloadTimer, reloadPenalty);
  }

  update(dt: number): void {
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    for (const soldier of this.soldiers) soldier.update(dt);

    if (this.mode === 'melee') {
      this.recalculateCenter();
      return;
    }

    for (const soldier of this.soldiers) {
      if (soldier.dead) continue;

      const target = this.slotPosition(soldier.slotIndex);
      const dx = target.x - soldier.position.x;
      const dy = target.y - soldier.position.y;
      const distance = Math.hypot(dx, dy);
      const maxStep = GAME_CONFIG.formation.soldierCatchupSpeed * dt;
      if (distance > 0.01) {
        const ratio = Math.min(1, maxStep / distance);
        soldier.position.x += dx * ratio;
        soldier.position.y += dy * ratio;
      }
      soldier.direction = this.direction;
    }
  }

  aliveSoldiers(): Unit[] {
    return this.soldiers.filter((unit) => !unit.dead);
  }

  aliveCount(): number {
    let count = 0;
    for (const soldier of this.soldiers) if (!soldier.dead) count += 1;
    return count;
  }

  canVolley(): boolean {
    return this.mode === 'line' && this.reloadTimer <= 0 && this.aliveCount() > 0;
  }

  beginReload(seconds: number): void {
    this.reloadTimer = seconds;
    this.volleysFired += 1;
  }

  slotPosition(index: number): Vec2 {
    const { columns, lateralSpacing, rankSpacing } = GAME_CONFIG.formation;
    const row = Math.floor(index / columns);
    const column = index % columns;
    const lateral = (column - (columns - 1) / 2) * lateralSpacing;
    const depth = row * rankSpacing;

    const forwardX = Math.cos(this.direction);
    const forwardY = Math.sin(this.direction);
    const rightX = -forwardY;
    const rightY = forwardX;

    return {
      x: this.center.x + rightX * lateral - forwardX * depth,
      y: this.center.y + rightY * lateral - forwardY * depth,
    };
  }

  private recalculateCenter(): void {
    const alive = this.aliveSoldiers();
    if (alive.length === 0) return;
    let x = 0;
    let y = 0;
    for (const soldier of alive) {
      x += soldier.position.x;
      y += soldier.position.y;
    }
    this.center.x = x / alive.length;
    this.center.y = y / alive.length;
  }
}
