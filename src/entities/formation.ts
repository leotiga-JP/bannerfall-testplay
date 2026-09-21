import { GAME_CONFIG } from '../game/config';
import { artilleryProfile, chargeProfile, fieldworkKitCapacity, moraleResistance } from '../game/classProfiles';
import {
  canBannerAttackClass,
  canVolleyClass,
  isArtilleryClass,
  isChargeCavalryClass,
  type SquadClass,
  type Team,
  type Vec2,
  type WeaponType,
} from '../game/types';
import { Unit } from './unit';

export type FormationMode = 'line' | 'charging' | 'melee' | 'reforming' | 'bannerAttack' | 'routed';

interface ClassSpec {
  soldiers: number;
  maxHp: number;
  rows: number;
  lateralSpacing: number;
  rankSpacing: number;
  playerMoveSpeed: number;
  aiMoveSpeed: number;
  aiRetreatSpeed: number;
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
  routTarget: Vec2 | null = null;
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
  morale: number = GAME_CONFIG.morale.max;
  moraleShockTimer = 0;
  routTravelled = 0;
  forcedMarch = false;
  fieldworkKits = 0;
  grenadeCooldown = 0;

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
    this.fieldworkKits = fieldworkKitCapacity(squadClass);
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
    this.routTarget = null;
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.weapon = canVolleyClass(squadClass) ? 'musket' : 'bayonet';
    this.spawnProtectionTimer = GAME_CONFIG.army.spawnProtectionSeconds;
    this.debugIntent = this.isPlayerControlled ? 'PLAYER' : 'HOLD';
    this.debugTargetId = null;
    this.layoutCount = this.soldiers.length;
    this.artilleryDeployTimer = 0;
    this.artilleryDeployed = false;
    this.chargeMomentum = 0;
    this.chargeVictims.clear();
    this.movedThisFrame = false;
    this.morale = GAME_CONFIG.morale.max;
    this.moraleShockTimer = 0;
    this.routTravelled = 0;
    this.forcedMarch = false;
    this.fieldworkKits = fieldworkKitCapacity(squadClass);
    this.grenadeCooldown = 0;
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
    this.weapon = canVolleyClass(squadClass) ? 'musket' : 'bayonet';
    this.morale = GAME_CONFIG.morale.max;
    this.forcedMarch = false;
    this.fieldworkKits = fieldworkKitCapacity(squadClass);
    this.grenadeCooldown = 0;
  }

  relocate(center: Vec2, direction: number): void {
    const alive = this.aliveSoldiers();
    if (alive.length === 0) return;
    this.center = { ...center };
    this.direction = direction;
    this.layoutCount = alive.length;
    this.assignCompactSlots(alive);
    this.mode = 'line';
    this.chargeTarget = null;
    this.routTarget = null;
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.artilleryDeployed = false;
    this.artilleryDeployTimer = 0;
    this.chargeMomentum = 0;
    this.chargeVictims.clear();
    this.movedThisFrame = false;
    for (const soldier of alive) {
      const target = this.slotPosition(soldier.formationSlotIndex, this.layoutCount);
      soldier.position = { ...target };
      soldier.direction = direction;
      soldier.knockback = { x: 0, y: 0 };
    }
  }

  markMoved(): void {
    this.movedThisFrame = true;
    if (isArtilleryClass(this.squadClass)) {
      this.artilleryDeployed = false;
      this.artilleryDeployTimer = 0;
    }
  }

  beginCharge(target: Vec2): boolean {
    if (this.mode !== 'line' || this.aliveCount() === 0 || isArtilleryClass(this.squadClass) || this.squadClass === 'dragoon') return false;
    const dx = target.x - this.center.x;
    const dy = target.y - this.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance < GAME_CONFIG.charge.arrowMinDistance) return false;
    this.weapon = 'bayonet';
    this.direction = Math.atan2(dy, dx);
    this.chargeTarget = { ...target };
    this.routTarget = null;
    this.bannerTargetTeam = null;
    this.mode = 'charging';
    this.forcedMarch = false;
    this.chargeMomentum = isChargeCavalryClass(this.squadClass) ? 1 : 0;
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
    const profile = chargeProfile(this.squadClass);
    const speed = isChargeCavalryClass(this.squadClass)
      ? profile.speed * Math.max(0.45, this.chargeMomentum)
      : profile.speed;
    const step = Math.min(distance, speed * dt);
    this.center.x += (dx / distance) * step;
    this.center.y += (dy / distance) * step;
    this.direction = Math.atan2(dy, dx);
    this.markMoved();
    return distance - step <= GAME_CONFIG.charge.stopDistance;
  }

  beginRout(target: Vec2): boolean {
    if (this.aliveCount() === 0 || this.mode === 'routed') return false;
    this.mode = 'routed';
    this.forcedMarch = false;
    this.routTarget = { ...target };
    this.chargeTarget = null;
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.artilleryDeployed = false;
    this.artilleryDeployTimer = 0;
    this.routTravelled = 0;
    this.debugIntent = 'ROUT';
    return true;
  }

  advanceRout(dt: number): boolean {
    if (this.mode !== 'routed' || !this.routTarget) return false;
    const dx = this.routTarget.x - this.center.x;
    const dy = this.routTarget.y - this.center.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 15) return true;
    const speed = this.movementSpeed(false, true) * GAME_CONFIG.morale.routedSpeedMultiplier;
    const step = Math.min(distance, speed * dt);
    const moveX = (dx / distance) * step;
    const moveY = (dy / distance) * step;
    this.center.x += moveX;
    this.center.y += moveY;
    this.direction = Math.atan2(dy, dx);

    // ROUT is a real retreat, not just a logical formation-center move.
    // Move every surviving soldier with the retreating center so enemies can
    // visually track, shoot, and pursue the broken unit while it falls back.
    for (const soldier of this.soldiers) {
      if (soldier.dead) continue;
      soldier.position.x += moveX;
      soldier.position.y += moveY;
      soldier.position.x = Math.max(
        GAME_CONFIG.world.padding,
        Math.min(GAME_CONFIG.world.width - GAME_CONFIG.world.padding, soldier.position.x),
      );
      soldier.position.y = Math.max(
        GAME_CONFIG.world.padding,
        Math.min(GAME_CONFIG.world.height - GAME_CONFIG.world.padding, soldier.position.y),
      );
      soldier.direction = this.direction;
    }

    this.routTravelled += step;
    this.markMoved();
    return distance - step <= 15;
  }

  enterMelee(): void {
    this.weapon = 'bayonet';
    this.mode = 'melee';
    this.forcedMarch = false;
    this.chargeTarget = null;
    this.routTarget = null;
    this.bannerTargetTeam = null;
    this.reloadTimer = Math.max(this.reloadTimer, 0.25);
    this.reloadDuration = Math.max(this.reloadDuration, this.reloadTimer);
    this.artilleryDeployed = false;
    this.artilleryDeployTimer = 0;
  }

  beginBannerAttack(targetTeam: Team, targetPosition: Vec2): boolean {
    if (this.aliveCount() === 0 || targetTeam === this.team || !canBannerAttackClass(this.squadClass)) return false;
    this.weapon = 'axe';
    this.mode = 'bannerAttack';
    this.forcedMarch = false;
    this.bannerTargetTeam = targetTeam;
    this.bannerAttackTimer = 0;
    this.chargeTarget = null;
    this.routTarget = null;
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
    this.forcedMarch = false;
    this.chargeTarget = null;
    this.routTarget = null;
    this.bannerTargetTeam = null;
    this.bannerAttackTimer = 0;
    this.reloadTimer = Math.max(this.reloadTimer, reloadPenalty);
    this.reloadDuration = Math.max(this.reloadDuration, this.reloadTimer);
    this.artilleryDeployed = false;
    this.artilleryDeployTimer = 0;
    return true;
  }

  totalAliveHp(): number {
    let total = 0;
    for (const soldier of this.soldiers) {
      if (!soldier.dead) total += soldier.hp;
    }
    return total;
  }

  applyMoraleDamage(amount: number): void {
    if (amount <= 0 || this.aliveCount() === 0 || this.spawnProtectionTimer > 0) return;
    this.morale = Math.max(0, this.morale - amount * moraleResistance(this.squadClass));
    this.moraleShockTimer = GAME_CONFIG.morale.shockCooldown;
  }

  update(dt: number): void {
    this.reloadTimer = Math.max(0, this.reloadTimer - dt);
    this.spawnProtectionTimer = Math.max(0, this.spawnProtectionTimer - dt);
    this.moraleShockTimer = Math.max(0, this.moraleShockTimer - dt);
    this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
    for (const soldier of this.soldiers) soldier.update(dt);

    if (isArtilleryClass(this.squadClass) && this.mode === 'line') {
      if (!this.movedThisFrame) {
        const deploy = artilleryProfile(this.squadClass).deploySeconds;
        this.artilleryDeployTimer = Math.min(deploy, this.artilleryDeployTimer + dt);
        this.artilleryDeployed = this.artilleryDeployTimer >= deploy;
      }
    }

    if (this.moraleShockTimer <= 0 && this.aliveCount() > 0 && !this.forcedMarch) {
      let recovery: number = GAME_CONFIG.morale.lineRecoveryPerSecond;
      if (this.mode === 'reforming') recovery = GAME_CONFIG.morale.reformRecoveryPerSecond;
      if (this.mode === 'routed') recovery = GAME_CONFIG.morale.routRecoveryPerSecond;
      this.morale = Math.min(GAME_CONFIG.morale.max, this.morale + recovery * dt);
    }

    this.movedThisFrame = false;

    if (this.mode === 'melee') {
      this.center = this.averageAlivePosition();
      return;
    }
    if (this.mode === 'routed') return;

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
    return canVolleyClass(this.squadClass)
      && this.mode === 'line'
      && this.weapon === 'musket'
      && this.reloadTimer <= 0
      && this.aliveCount() > 0;
  }

  canArtilleryFire(): boolean {
    return isArtilleryClass(this.squadClass)
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
    return chargeProfile(this.squadClass).maxDistance;
  }

  movementSpeed(player: boolean, retreat = false): number {
    const spec = this.classSpec();
    if (retreat) return spec.aiRetreatSpeed;
    return player ? spec.playerMoveSpeed : spec.aiMoveSpeed;
  }

  forcedMarchMultiplier(): number {
    if (isArtilleryClass(this.squadClass)) return GAME_CONFIG.army.forcedMarchArtilleryMultiplier;
    if (this.squadClass === 'dragoon' || isChargeCavalryClass(this.squadClass)) return GAME_CONFIG.army.forcedMarchMountedMultiplier;
    return GAME_CONFIG.army.forcedMarchFootMultiplier;
  }

  applyForcedMarch(dt: number): void {
    if (!this.forcedMarch || this.mode !== 'line' || this.aliveCount() === 0) return;
    if (this.morale <= GAME_CONFIG.army.forcedMarchMoraleFloor) {
      this.morale = GAME_CONFIG.army.forcedMarchMoraleFloor;
      this.forcedMarch = false;
      return;
    }
    this.morale = Math.max(
      GAME_CONFIG.army.forcedMarchMoraleFloor,
      this.morale - GAME_CONFIG.army.forcedMarchMoralePerSecond * dt,
    );
    if (this.morale <= GAME_CONFIG.army.forcedMarchMoraleFloor) this.forcedMarch = false;
  }

  moraleRatio(): number {
    return this.morale / GAME_CONFIG.morale.max;
  }

  isShaken(): boolean {
    return this.morale < GAME_CONFIG.morale.shakenThreshold;
  }

  shouldRout(): boolean {
    return this.mode !== 'routed' && this.morale <= GAME_CONFIG.morale.routThreshold && this.aliveCount() > 0;
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
    return GAME_CONFIG[squadClass] as ClassSpec;
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
