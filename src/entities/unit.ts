import type { Team, Vec2 } from '../game/types';
import { GAME_CONFIG } from '../game/config';

export class Unit {
  readonly id: string;
  readonly team: Team;
  readonly slotIndex: number;

  position: Vec2;
  direction = 0;
  hp: number = GAME_CONFIG.soldier.maxHp;
  dead = false;
  hitFlashTimer = 0;
  meleeCooldown = 0;
  meleeStabTimer = 0;
  knockback: Vec2 = { x: 0, y: 0 };

  constructor(id: string, team: Team, slotIndex: number, position: Vec2) {
    this.id = id;
    this.team = team;
    this.slotIndex = slotIndex;
    this.position = { ...position };
  }

  reset(position: Vec2): void {
    this.position = { ...position };
    this.direction = 0;
    this.hp = GAME_CONFIG.soldier.maxHp;
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
