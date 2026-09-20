import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2, WeaponType } from '../game/types';
import { Unit } from './unit';

export type FormationMode = 'line' | 'charging' | 'melee' | 'reforming' | 'bannerAttack';

export class Formation {
  readonly id: string;
  readonly team: Team;
  readonly soldiers: Unit[];
  readonly isPlayerControlled: boolean;
  center: Vec2;
  direction: number;
  reloadTimer = 0;
  volleysFired = 0;
  mode: FormationMode = 'line';
  chargeTarget: Vec2 | null = null;
  bannerTargetTeam: Team | null = null;
  bannerAttackTimer = 0;
  weapon: WeaponType = 'musket';
  spawnProtectionTimer = 0;
  debugIntent = 'HOLD';
  debugTargetId: string | null = null;

  private layoutCount: number;

  constructor(id: string, team: Team, center: Vec2, direction: number, isPlayerControlled = false) {
    this.id = id;
    this.team = team;
    this.center = { ...center };
    this.direction = direction;
    this.isPlayerControlled = isPlayerControlled;
    const count = GAME_CONFIG.formation.rows * GAME_CONFIG.formation.columns;
    this.layoutCount = count;
    this.soldiers = Array.from({ length: count }, (_, index) => {
      const unit = new Unit(`${id}-${index}`, team, index, this.slotPosition(index, count));
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
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.weapon = 'musket';
    this.spawnProtectionTimer = GAME_CONFIG.army.spawnProtectionSeconds;
    this.debugIntent = this.isPlayerControlled ? 'PLAYER' : 'HOLD';
    this.debugTargetId = null;
    this.layoutCount = this.soldiers.length;
    for (const soldier of this.soldiers) {
      soldier.formationSlotIndex = soldier.slotIndex;
      soldier.reset(this.slotPosition(soldier.slotIndex, this.layoutCount));
      soldier.direction = direction;
    }
  }

  beginCharge(target: Vec2): boolean {
    if (this.mode !== 'line' || this.aliveCount() === 0) return false;
    const dx = target.x - this.center.x;
    const dy = target.y - this.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < GAME_CONFIG.charge.arrowMinDistance) return false;
    this.weapon = 'bayonet';
    this.direction = Math.atan2(dy, dx);
    this.chargeTarget = { ...target };
    this.bannerTargetTeam = null;
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
    this.weapon = 'bayonet';
    this.mode = 'melee';
    this.chargeTarget = null;
    this.bannerTargetTeam = null;
    this.reloadTimer = Math.max(this.reloadTimer, 0.25);
  }

  beginBannerAttack(targetTeam: Team, targetPosition: Vec2): boolean {
    if (this.aliveCount() === 0 || targetTeam === this.team) return false;
    this.weapon = 'axe';
    this.mode = 'bannerAttack';
    this.bannerTargetTeam = targetTeam;
    this.bannerAttackTimer = 0;
    this.chargeTarget = null;
    this.direction = Math.atan2(targetPosition.y - this.center.y, targetPosition.x - this.center.x);
    return true;
  }

  cancelBannerAttack(direction = this.direction): void {
    if (this.mode !== 'bannerAttack') return;
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.beginReform(direction, this.averageAlivePosition(), GAME_CONFIG.reform.reloadPenalty);
  }

  beginReform(
    direction: number,
    targetCenter?: Vec2,
    reloadPenalty: number = GAME_CONFIG.reform.reloadPenalty,
  ): boolean {
    const alive = this.aliveSoldiers();
    if (alive.length === 0) return false;
    this.center = targetCenter ? { ...targetCenter } : this.averageAlivePosition();
    this.direction = direction;
    this.layoutCount = alive.length;
    this.assignCompactSlots(alive);
    this.mode = 'reforming';
    this.chargeTarget = null;
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.reloadTimer = Math.max(this.reloadTimer, reloadPenalty);
    return true;
  }

  update(dt: number): void {
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.spawnProtectionTimer = Math.max(0, this.spawnProtectionTimer - dt);
    for (const soldier of this.soldiers) soldier.update(dt);

    if (this.mode === 'melee') {
      this.center = this.averageAlivePosition();
      return;
    }

    let settled = true;
    const catchup = this.mode === 'reforming'
      ? GAME_CONFIG.reform.soldierCatchupSpeed
      : GAME_CONFIG.formation.soldierCatchupSpeed;

    for (const soldier of this.soldiers) {
      if (soldier.dead) continue;
      const target = this.slotPosition(soldier.formationSlotIndex, this.layoutCount);
      const dx = target.x - soldier.position.x;
      const dy = target.y - soldier.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > GAME_CONFIG.reform.settleDistance) settled = false;
      if (distance > 0.01) {
        const ratio = Math.min(1, (catchup * dt) / distance);
        soldier.position.x += dx * ratio;
        soldier.position.y += dy * ratio;
      }
      soldier.direction = this.direction;
    }

    if (this.mode === 'reforming' && settled) this.mode = 'line';
  }

  aliveSoldiers(): Unit[] {
    return this.soldiers.filter((soldier) => !soldier.dead);
  }

  aliveCount(): number {
    let count = 0;
    for (const soldier of this.soldiers) if (!soldier.dead) count += 1;
    return count;
  }

  canVolley(): boolean {
    return this.mode === 'line' && this.weapon === 'musket' && this.reloadTimer <= 0 && this.aliveCount() > 0;
  }

  beginReload(seconds: number): void {
    this.reloadTimer = seconds;
    this.volleysFired += 1;
  }

  needsReform(): boolean {
    return this.mode === 'line' && this.aliveCount() > 0 && this.aliveCount() < this.layoutCount;
  }

  averageAlivePosition(): Vec2 {
    const alive = this.aliveSoldiers();
    if (alive.length === 0) return { ...this.center };
    let x = 0;
    let y = 0;
    for (const soldier of alive) {
      x += soldier.position.x;
      y += soldier.position.y;
    }
    return { x: x / alive.length, y: y / alive.length };
  }

  slotPosition(index: number, count = this.layoutCount): Vec2 {
    const layout = this.layoutFor(index, count);
    const lateral = (layout.column - (layout.rowCount - 1) / 2) * GAME_CONFIG.formation.lateralSpacing;
    const depth = layout.row * GAME_CONFIG.formation.rankSpacing;
    const forwardX = Math.cos(this.direction);
    const forwardY = Math.sin(this.direction);
    const rightX = -forwardY;
    const rightY = forwardX;
    return {
      x: this.center.x + rightX * lateral - forwardX * depth,
      y: this.center.y + rightY * lateral - forwardY * depth,
    };
  }

  private layoutFor(index: number, count: number): { row: number; column: number; rowCount: number } {
    if (count <= 1) return { row: 0, column: 0, rowCount: 1 };
    const frontCount = Math.ceil(count / 2);
    const rearCount = Math.floor(count / 2);
    if (index < frontCount) return { row: 0, column: index, rowCount: frontCount };
    return { row: 1, column: index - frontCount, rowCount: Math.max(1, rearCount) };
  }

  private assignCompactSlots(alive: Unit[]): void {
    const remaining = [...alive];
    for (let slot = 0; slot < alive.length; slot += 1) {
      const target = this.slotPosition(slot, alive.length);
      let bestIndex = 0;
      let bestDistanceSq = Number.POSITIVE_INFINITY;
      for (let i = 0; i < remaining.length; i += 1) {
        const dx = remaining[i].position.x - target.x;
        const dy = remaining[i].position.y - target.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < bestDistanceSq) {
          bestDistanceSq = distanceSq;
          bestIndex = i;
        }
      }
      const [chosen] = remaining.splice(bestIndex, 1);
      chosen.formationSlotIndex = slot;
    }
  }
}
