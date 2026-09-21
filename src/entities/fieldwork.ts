import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2 } from '../game/types';

export class Fieldwork {
  readonly id: string;
  readonly team: Team;
  readonly sourceFormationId: string;
  position: Vec2;
  direction: number;
  hp: number;
  readonly maxHp: number;
  active = true;

  constructor(id: string, team: Team, position: Vec2, direction: number, sourceFormationId = '', hp: number = GAME_CONFIG.fieldworks.maxHp) {
    this.id = id;
    this.team = team;
    this.position = { ...position };
    this.direction = direction;
    this.sourceFormationId = sourceFormationId;
    this.maxHp = hp;
    this.hp = hp;
  }

  takeDamage(amount: number): boolean {
    if (!this.active || amount <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.active = false;
    return !this.active;
  }

  ratio(): number {
    return this.maxHp <= 0 ? 0 : this.hp / this.maxHp;
  }

  endpoints(): { a: Vec2; b: Vec2 } {
    const half = GAME_CONFIG.fieldworks.length / 2;
    const dx = Math.cos(this.direction) * half;
    const dy = Math.sin(this.direction) * half;
    return {
      a: { x: this.position.x - dx, y: this.position.y - dy },
      b: { x: this.position.x + dx, y: this.position.y + dy },
    };
  }
}
