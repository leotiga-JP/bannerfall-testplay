import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2 } from '../game/types';

export class Banner {
  readonly team: Team;
  readonly position: Vec2;
  readonly maxHp: number = GAME_CONFIG.banner.maxHp;
  hp: number = GAME_CONFIG.banner.maxHp;
  underAttackTimer = 0;

  constructor(team: Team, position: Vec2) {
    this.team = team;
    this.position = { ...position };
  }

  reset(): void {
    this.hp = this.maxHp;
    this.underAttackTimer = 0;
  }

  update(dt: number): void {
    this.underAttackTimer = Math.max(0, this.underAttackTimer - dt);
  }

  takeDamage(amount: number): number {
    if (this.hp <= 0) return 0;
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    this.underAttackTimer = GAME_CONFIG.banner.underAttackSeconds;
    return before - this.hp;
  }

  get destroyed(): boolean {
    return this.hp <= 0;
  }

  get ratio(): number {
    return this.hp / this.maxHp;
  }
}
