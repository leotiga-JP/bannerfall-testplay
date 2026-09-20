import type { Team, Vec2 } from '../game/types';

export class Unit {
  readonly id: string;
  readonly team: Team;
  readonly slotIndex: number;

  formationSlotIndex: number;
  position: Vec2;
  direction = 0;
  maxHp: number;
  hp: number;
  dead = false;
  hitFlashTimer = 0;
  meleeCooldown = 0;
  meleeStabTimer = 0;
  knockback: Vec2 = { x: 0, y: 0 };

  constructor(id: string, team: Team, slotIndex: number, position: Vec2, maxHp: number) {
    this.id = id;
    this.team = team;
    this.slotIndex = slotIndex;
    this.formationSlotIndex = slotIndex;
    this.position = { ...position };
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  reset(position: Vec2, maxHp = this.maxHp): void {
    this.formationSlotIndex = this.slotIndex;
    this.position = { ...position };
    this.direction = 0;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.dead = false;
    this.hitFlashTimer = 0;
    this.meleeCooldown = 0;
    this.meleeStabTimer = 0;
    this.knockback = { x: 0, y: 0 };
  }

  update(dt: number): void {
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.meleeCooldown = Math.max(0, this.meleeCooldown - dt);
    this.meleeStabTimer = Math.max(0, this.meleeStabTimer - dt);
  }

  takeDamage(amount: number): boolean {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.12;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }
}
