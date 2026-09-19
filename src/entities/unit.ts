import type { AiState, Team, Vec2 } from '../game/types';

export interface UnitConfig {
  maxHp: number;
  moveSpeed: number;
  radius: number;
  attackRange: number;
  attackAngleDeg: number;
  damage: number;
  attackCooldown: number;
  regenPerSecond: number;
  regenDelay: number;
  respawnDelay: number;
}

export class Unit {
  readonly id: string;
  readonly team: Team;
  readonly spawn: Vec2;
  readonly config: UnitConfig;

  position: Vec2;
  direction = 0;
  hp: number;
  attackTimer = 0;
  timeSinceDamage = 999;
  dead = false;
  respawnTimer = 0;
  aiState: AiState = 'IDLE';
  hitFlashTimer = 0;

  constructor(id: string, team: Team, spawn: Vec2, config: UnitConfig) {
    this.id = id;
    this.team = team;
    this.spawn = { ...spawn };
    this.position = { ...spawn };
    this.config = config;
    this.hp = config.maxHp;
  }

  reset(): void {
    this.position = { ...this.spawn };
    this.hp = this.config.maxHp;
    this.attackTimer = 0;
    this.timeSinceDamage = 999;
    this.dead = false;
    this.respawnTimer = 0;
    this.aiState = 'IDLE';
    this.hitFlashTimer = 0;
  }

  updateTimers(dt: number): void {
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.timeSinceDamage += dt;
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
  }

  canAttack(): boolean {
    return !this.dead && this.attackTimer <= 0;
  }

  startAttack(): void {
    this.attackTimer = this.config.attackCooldown;
  }

  takeDamage(amount: number): void {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.timeSinceDamage = 0;
    this.hitFlashTimer = 0.1;
    if (this.hp <= 0) {
      this.dead = true;
      this.aiState = 'DEAD';
      this.respawnTimer = this.config.respawnDelay;
    }
  }

  regenerate(dt: number): void {
    if (this.dead || this.hp >= this.config.maxHp || this.timeSinceDamage < this.config.regenDelay) return;
    this.hp = Math.min(this.config.maxHp, this.hp + this.config.regenPerSecond * dt);
  }
}
