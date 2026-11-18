import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2 } from '../game/types';

export type ConstructionBlockKind = 'woodWall' | 'ironWall' | 'loophole' | 'door' | 'roadTile' | 'bridgeTile';

export interface ConstructionBlockDefinition {
  label: string;
  maxHp: number;
  bulletDamageMultiplier: number;
  artilleryDamageMultiplier: number;
  explosionDamageMultiplier: number;
}

export const CONSTRUCTION_DEFINITIONS: Readonly<Record<ConstructionBlockKind, ConstructionBlockDefinition>> = Object.freeze({
  woodWall: Object.freeze({ label: '木製壁', maxHp: 520, bulletDamageMultiplier: 0.20, artilleryDamageMultiplier: 1.35, explosionDamageMultiplier: 0.85 }),
  ironWall: Object.freeze({ label: '鉄製壁', maxHp: 980, bulletDamageMultiplier: 0.09, artilleryDamageMultiplier: 0.95, explosionDamageMultiplier: 0.62 }),
  loophole: Object.freeze({ label: '銃眼', maxHp: 430, bulletDamageMultiplier: 0.24, artilleryDamageMultiplier: 1.20, explosionDamageMultiplier: 0.78 }),
  door: Object.freeze({ label: '扉', maxHp: 460, bulletDamageMultiplier: 0.22, artilleryDamageMultiplier: 1.22, explosionDamageMultiplier: 0.80 }),
  roadTile: Object.freeze({ label: '道路', maxHp: 260, bulletDamageMultiplier: 0.0, artilleryDamageMultiplier: 0.65, explosionDamageMultiplier: 0.55 }),
  bridgeTile: Object.freeze({ label: '橋', maxHp: 620, bulletDamageMultiplier: 0.05, artilleryDamageMultiplier: 0.90, explosionDamageMultiplier: 0.70 }),
});

export class ConstructionBlock {
  readonly id: string;
  readonly team: Team;
  readonly kind: ConstructionBlockKind;
  readonly col: number;
  readonly row: number;
  direction: number;
  hp: number;
  readonly maxHp: number;
  active = true;

  constructor(id: string, team: Team, kind: ConstructionBlockKind, col: number, row: number, direction = 0, hp?: number) {
    this.id = id;
    this.team = team;
    this.kind = kind;
    this.col = col;
    this.row = row;
    this.direction = ((Math.round(direction) % 4) + 4) % 4;
    this.maxHp = CONSTRUCTION_DEFINITIONS[kind].maxHp;
    this.hp = Math.max(0, Math.min(this.maxHp, hp ?? this.maxHp));
    this.active = this.hp > 0;
  }

  get position(): Vec2 {
    const grid = GAME_CONFIG.world.grid;
    return { x: (this.col + 0.5) * grid, y: (this.row + 0.5) * grid };
  }

  get cellKey(): string {
    return `${this.col},${this.row}`;
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
}
