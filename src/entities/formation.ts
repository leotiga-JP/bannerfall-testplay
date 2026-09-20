import { GAME_CONFIG } from '../game/config';
import type { SquadClass, Team, Vec2, WeaponType } from '../game/types';
import { Unit } from './unit';

export type FormationMode = 'line' | 'charging' | 'melee' | 'reforming' | 'bannerAttack';

interface ClassSpec {
  soldiers: number;
  maxHp: number;
  rows: number;
  lateralSpacing: number;
  rankSpacing: number;
}

export class Formation {
  readonly id: string;
  readonly team: Team;
  soldiers: Unit[] = [];
  isPlayerControlled: boolean;
  center: Vec2;
  direction: number;
  squadClass: SquadClass;
  reloadTimer = 0;
  reloadDuration = 0;
  volleysFired = 0;
  mode: FormationMode = 'line';
  chargeTarget: Vec2 | null = null;
  bannerTargetTeam: Team | null = null;
  bannerAttackTimer = 0;
  weapon: WeaponType = 'musket';
  spawnProtectionTimer = 0;
  debugIntent = 'HOLD';
  debugTargetId: string | null = null;
  artilleryDeployTimer = 0;
  artilleryDeployed = false;
  chargeMomentum = 0;
  readonly chargeVictims = new Set<string>();

  private layoutCount = 0;
  private movedThisFrame = false;

  constructor(
    id: string,
    team: Team,
    center: Vec2,
    direction: number,
    isPlayerControlled = false,
    squadClass: SquadClass = 'infantry',
  ) {
    this.id = id;
    this.team = team;
    this.center = { ...center };
    this.direction = direction;
    this.isPlayerControlled = isPlayerControlled;
    this.squadClass = squadClass;
    this.rebuildSoldiers();
  }

  reset(center: Vec2, direction: number, squadClass: SquadClass = this.squadClass): void {
    this.center = { ...center };
    this.direction = direction;
    if (squadClass !== this.squadClass || this.soldiers.length !== this.classSpec(squadClass).soldiers) {
      this.squadClass = squadClass;
      this.rebuildSoldiers();
    }
    this.reloadTimer = 0;
    this.reloadDuration = 0;
    this.volleysFired = 0;
    this.mode = 'line';
    this.chargeTarget = null;
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.weapon = squadClass === 'infantry' ? 'musket' : 'bayonet';
    this.spawnProtectionTimer = GAME_CONFIG.army.spawnProtectionSeconds;
    this.debugIntent = this.isPlayerControlled ? 'PLAYER' : 'HOLD';
    this.debugTargetId = null;
    this.layoutCount = this.soldiers.length;
    this.artilleryDeployTimer = 0;
    this.artilleryDeployed = false;
    this.chargeMomentum = 0;
    this.chargeVictims.clear();
    this.movedThisFrame = false;
    const spec = this.classSpec();
    for (const soldier of this.soldiers) {
      soldier.formationSlotIndex = soldier.slotIndex;
      soldier.reset(this.slotPosition(soldier.slotIndex, this.layoutCount), spec.maxHp);
      soldier.direction = direction;
    }
  }

  setClass(squadClass: SquadClass): void {
    this.squadClass = squadClass;
    this.rebuildSoldiers();
  }

  markMoved(): void {
    this.movedThisFrame = true;
    if (this.squadClass === 'artillery') {
      this.artilleryDeployed = false;
      this.artilleryDeployTimer = 0;
    }
  }

  beginCharge(target: Vec2): boolean {
    if (this.mode !== 'line' || this.aliveCount() === 0 || this.squadClass === 'artillery') return false;
    const dx = target.x - this.center.x;
    const dy = target.y - this.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < GAME_CONFIG.charge.arrowMinDistance) return false;
    this.weapon = 'bayonet';
    this.direction = Math.atan2(dy, dx);
    this.chargeTarget = { ...target };
    this.bannerTargetTeam = null;
    this.mode = 'charging';
    this.chargeMomentum = this.squadClass === 'cavalry' ? 1 : 0;
    this.chargeVictims.clear();
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
    const baseSpeed = this.squadClass === 'cavalry' ? GAME_CONFIG.cavalry.chargeSpeed : GAME_CONFIG.charge.moveSpeed;
    const speed = this.squadClass === 'cavalry' ? baseSpeed * Math.max(0.45, this.chargeMomentum) : baseSpeed;
    const step = Math.min(distance, speed * dt);
    this.center.x += (dx / distance) * step;
    this.center.y += (dy / distance) * step;
    this.direction = Math.atan2(dy, dx);
    this.markMoved();
    return distance - step <= GAME_CONFIG.charge.stopDistance;
  }

  enterMelee(): void {
    this.weapon = 'bayonet';
    this.mode = 'melee';
    this.chargeTarget = null;
    this.bannerTargetTeam = null;
    this.reloadTimer = Math.max(this.reloadTimer, 0.25);
    this.reloadDuration = Math.max(this.reloadDuration, this.reloadTimer);
    this.artilleryDeployed = false;
    this.artilleryDeployTimer = 0;
  }

  beginBannerAttack(targetTeam: Team, targetPosition: Vec2): boolean {
    if (this.aliveCount() === 0 || targetTeam === this.team || this.squadClass !== 'infantry') return false;
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
    this.reloadDuration = Math.max(this.reloadDuration, this.reloadTimer);
    this.artilleryDeployed = false;
    this.artilleryDeployTimer = 0;
    return true;
  }

  update(dt: number): void {
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.spawnProtectionTimer = Math.max(0, this.spawnProtectionTimer - dt);
    for (const soldier of this.soldiers) soldier.update(dt);

    if (this.squadClass === 'artillery' && this.mode === 'line') {
      if (!this.movedThisFrame) {
        this.artilleryDeployTimer = Math.min(GAME_CONFIG.artillery.deploySeconds, this.artilleryDeployTimer + dt);
        this.artilleryDeployed = this.artilleryDeployTimer >= GAME_CONFIG.artillery.deploySeconds;
      }
    }
    this.movedThisFrame = false;

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

  maxSoldiers(): number {
    return this.soldiers.length;
  }

  canVolley(): boolean {
    return this.squadClass === 'infantry'
      && this.mode === 'line'
      && this.weapon === 'musket'
      && this.reloadTimer <= 0
      && this.aliveCount() > 0;
  }

  canArtilleryFire(): boolean {
    return this.squadClass === 'artillery'
      && this.mode === 'line'
      && this.artilleryDeployed
      && this.reloadTimer <= 0
      && this.aliveCount() > 0;
  }

  beginReload(seconds: number): void {
    this.reloadTimer = seconds;
    this.reloadDuration = seconds;
    this.volleysFired += 1;
  }

  reloadProgress(): number {
    if (this.reloadTimer <= 0) return 1;
    if (this.reloadDuration <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - this.reloadTimer / this.reloadDuration));
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

  maxChargeDistance(): number {
    return this.squadClass === 'cavalry' ? GAME_CONFIG.cavalry.chargeMaxDistance : GAME_CONFIG.charge.maxDistance;
  }

  movementSpeed(player: boolean, retreat = false): number {
    if (this.squadClass === 'cavalry') {
      if (retreat) return GAME_CONFIG.cavalry.aiRetreatSpeed;
      return player ? GAME_CONFIG.cavalry.playerMoveSpeed : GAME_CONFIG.cavalry.aiMoveSpeed;
    }
    if (this.squadClass === 'artillery') {
      if (retreat) return GAME_CONFIG.artillery.aiRetreatSpeed;
      return player ? GAME_CONFIG.artillery.playerMoveSpeed : GAME_CONFIG.artillery.aiMoveSpeed;
    }
    if (retreat) return GAME_CONFIG.infantry.aiRetreatSpeed;
    return player ? GAME_CONFIG.infantry.playerMoveSpeed : GAME_CONFIG.infantry.aiMoveSpeed;
  }

  slotPosition(index: number, count = this.layoutCount): Vec2 {
    const layout = this.layoutFor(index, count);
    const spec = this.classSpec();
    const lateral = (layout.column - (layout.rowCount - 1) / 2) * spec.lateralSpacing;
    const depth = layout.row * spec.rankSpacing;
    const forwardX = Math.cos(this.direction);
    const forwardY = Math.sin(this.direction);
    const rightX = -forwardY;
    const rightY = forwardX;
    return {
      x: this.center.x + rightX * lateral - forwardX * depth,
      y: this.center.y + rightY * lateral - forwardY * depth,
    };
  }

  private classSpec(squadClass: SquadClass = this.squadClass): ClassSpec {
    return GAME_CONFIG[squadClass];
  }

  private rebuildSoldiers(): void {
    const spec = this.classSpec();
    this.layoutCount = spec.soldiers;
    this.soldiers = Array.from({ length: spec.soldiers }, (_, index) => {
      const unit = new Unit(`${this.id}-${index}`, this.team, index, this.slotPosition(index, spec.soldiers), spec.maxHp);
      unit.direction = this.direction;
      return unit;
    });
  }

  private layoutFor(index: number, count: number): { row: number; column: number; rowCount: number } {
    if (count <= 1) return { row: 0, column: 0, rowCount: 1 };
    const rows = Math.max(1, Math.min(this.classSpec().rows, count));
    const perRow = Math.ceil(count / rows);
    const row = Math.min(rows - 1, Math.floor(index / perRow));
    const rowStart = row * perRow;
    const rowCount = Math.min(perRow, count - rowStart);
    return { row, column: index - rowStart, rowCount: Math.max(1, rowCount) };
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
