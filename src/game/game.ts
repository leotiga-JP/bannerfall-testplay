import { GAME_CONFIG } from './config';
import { Unit } from '../entities/unit';
import type { Vec2 } from './types';
import { AiSystem } from '../systems/aiSystem';
import { tryAttack } from '../systems/combatSystem';
import { InputManager } from '../input/inputManager';

export interface GameSnapshot {
  time: number;
  paused: boolean;
  winner: 'player' | 'enemy' | null;
}

export class Game {
  readonly player: Unit;
  readonly enemy: Unit;

  private readonly aiSystem = new AiSystem();
  private time = 0;
  private paused = false;
  private winner: GameSnapshot['winner'] = null;

  constructor(private readonly input: InputManager) {
    this.player = new Unit('player', 'player', { x: 220, y: 270 }, GAME_CONFIG.player);
    this.enemy = new Unit('enemy', 'enemy', { x: 740, y: 270 }, GAME_CONFIG.ai);
  }

  reset(): void {
    this.player.reset();
    this.enemy.reset();
    this.time = 0;
    this.paused = false;
    this.winner = null;
  }

  update(dt: number): void {
    if (this.input.consumePause()) {
      this.paused = !this.paused;
    }

    if (this.input.consumeRestart()) {
      this.reset();
      return;
    }

    if (this.paused) {
      this.input.endFrame();
      return;
    }

    this.time += dt;
    this.player.updateTimers(dt);
    this.enemy.updateTimers(dt);

    this.updatePlayer(dt);
    this.aiSystem.update(this.enemy, this.player, dt, GAME_CONFIG);

    this.player.regenerate(dt);
    this.enemy.regenerate(dt);

    this.updateRespawn(this.player, dt, { x: 220, y: 270 });
    this.updateRespawn(this.enemy, dt, { x: 740, y: 270 });

    if (this.player.dead && !this.enemy.dead) {
      this.winner = 'enemy';
    } else if (this.enemy.dead && !this.player.dead) {
      this.winner = 'player';
    }

    this.input.endFrame();
  }

  snapshot(): GameSnapshot {
    return { time: this.time, paused: this.paused, winner: this.winner };
  }

  private updatePlayer(dt: number): void {
    if (this.player.dead) return;

    const pointer = this.input.getPointer();
    this.player.direction = Math.atan2(
      pointer.y - this.player.position.y,
      pointer.x - this.player.position.x,
    );

    const velocity = this.getMovementVector();
    const speed = this.player.config.moveSpeed;
    this.player.position.x += velocity.x * speed * dt;
    this.player.position.y += velocity.y * speed * dt;

    this.player.position.x = Math.max(this.player.config.radius, Math.min(GAME_CONFIG.width - this.player.config.radius, this.player.position.x));
    this.player.position.y = Math.max(this.player.config.radius, Math.min(GAME_CONFIG.height - this.player.config.radius, this.player.position.y));

    if (this.input.isAttacking()) {
      tryAttack(this.player, this.enemy);
    }
  }

  private getMovementVector(): Vec2 {
    let x = 0;
    let y = 0;
    if (this.input.isDown('a')) x -= 1;
    if (this.input.isDown('d')) x += 1;
    if (this.input.isDown('w')) y -= 1;
    if (this.input.isDown('s')) y += 1;

    const length = Math.hypot(x, y);
    if (length === 0) return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
  }

  private updateRespawn(unit: Unit, dt: number, spawn: Vec2): void {
    if (!unit.dead) return;
    unit.respawnTimer -= dt;
    if (unit.respawnTimer <= 0) {
      unit.position = { ...spawn };
      unit.hp = unit.config.maxHp;
      unit.dead = false;
      unit.aiState = 'IDLE';
      unit.timeSinceDamage = 999;
      this.winner = null;
    }
  }
}
