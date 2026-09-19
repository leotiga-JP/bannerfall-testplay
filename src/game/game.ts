import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { GAME_CONFIG } from './config';
import type { Team, Vec2 } from './types';
import { InputManager } from '../input/inputManager';
import { AiSystem } from '../systems/aiSystem';
import {
  type CorpseParticle,
  type MuzzleFlash,
  type SmokeParticle,
  fireVolley,
  updateProjectiles,
} from '../systems/combatSystem';

export interface GameSnapshot {
  time: number;
  paused: boolean;
  winner: Team | null;
  playerAlive: number;
  enemyAlive: number;
  playerReload: number;
  enemyReload: number;
  playerVolleys: number;
  enemyVolleys: number;
  screenShake: number;
}

export class Game {
  readonly playerFormation = new Formation('player', { x: 225, y: GAME_CONFIG.height / 2 }, 0);
  readonly enemyFormation = new Formation('enemy', { x: 735, y: GAME_CONFIG.height / 2 }, Math.PI);
  readonly projectiles: Projectile[] = [];
  readonly smoke: SmokeParticle[] = [];
  readonly muzzleFlashes: MuzzleFlash[] = [];
  readonly corpses: CorpseParticle[] = [];

  private readonly aiSystem = new AiSystem();
  private time = 0;
  private paused = false;
  private winner: Team | null = null;
  private screenShake = 0;

  constructor(private readonly input: InputManager) {}

  reset(): void {
    this.playerFormation.reset({ x: 225, y: GAME_CONFIG.height / 2 }, 0);
    this.enemyFormation.reset({ x: 735, y: GAME_CONFIG.height / 2 }, Math.PI);
    this.projectiles.length = 0;
    this.smoke.length = 0;
    this.muzzleFlashes.length = 0;
    this.corpses.length = 0;
    this.time = 0;
    this.paused = false;
    this.winner = null;
    this.screenShake = 0;
  }

  update(dt: number): void {
    if (this.input.consumePause()) this.paused = !this.paused;
    if (this.input.consumeRestart()) {
      this.reset();
      this.input.endFrame();
      return;
    }

    if (this.paused) {
      this.input.endFrame();
      return;
    }

    this.time += dt;
    this.updatePlayerFormation(dt);

    const enemyShouldVolley = this.aiSystem.update(this.enemyFormation, this.playerFormation, dt);

    this.playerFormation.update(dt);
    this.enemyFormation.update(dt);

    if (!this.winner && this.input.consumeAttack() && this.playerFormation.canVolley()) {
      this.performVolley(this.playerFormation, GAME_CONFIG.musket.reloadSeconds);
    }

    if (!this.winner && enemyShouldVolley) {
      this.performVolley(this.enemyFormation, GAME_CONFIG.musket.enemyReloadSeconds);
    }

    updateProjectiles(
      this.projectiles,
      this.playerFormation,
      this.enemyFormation,
      dt,
      (position, team, impactDirection) => this.spawnCorpse(position, team, impactDirection),
    );

    this.updateEffects(dt);
    this.updateWinner();
    this.screenShake = Math.max(0, this.screenShake - 18 * dt);
    this.input.endFrame();
  }

  snapshot(): GameSnapshot {
    return {
      time: this.time,
      paused: this.paused,
      winner: this.winner,
      playerAlive: this.playerFormation.aliveCount(),
      enemyAlive: this.enemyFormation.aliveCount(),
      playerReload: this.playerFormation.reloadTimer,
      enemyReload: this.enemyFormation.reloadTimer,
      playerVolleys: this.playerFormation.volleysFired,
      enemyVolleys: this.enemyFormation.volleysFired,
      screenShake: this.screenShake,
    };
  }

  private updatePlayerFormation(dt: number): void {
    if (this.winner || this.playerFormation.aliveCount() === 0) return;

    const pointer = this.input.getPointer();
    this.playerFormation.direction = Math.atan2(
      pointer.y - this.playerFormation.center.y,
      pointer.x - this.playerFormation.center.x,
    );

    let x = 0;
    let y = 0;
    if (this.input.isDown('a')) x -= 1;
    if (this.input.isDown('d')) x += 1;
    if (this.input.isDown('w')) y -= 1;
    if (this.input.isDown('s')) y += 1;

    const length = Math.hypot(x, y);
    if (length > 0) {
      const speed = GAME_CONFIG.formation.playerMoveSpeed * dt;
      this.playerFormation.center.x += (x / length) * speed;
      this.playerFormation.center.y += (y / length) * speed;
    }

    this.playerFormation.center.x = Math.max(
      GAME_CONFIG.formation.arenaMarginX,
      Math.min(GAME_CONFIG.width - GAME_CONFIG.formation.arenaMarginX, this.playerFormation.center.x),
    );
    this.playerFormation.center.y = Math.max(
      GAME_CONFIG.formation.arenaMarginY,
      Math.min(GAME_CONFIG.height - GAME_CONFIG.formation.arenaMarginY, this.playerFormation.center.y),
    );
  }

  private performVolley(formation: Formation, reloadSeconds: number): void {
    const result = fireVolley(formation);
    this.projectiles.push(...result.projectiles);
    this.smoke.push(...result.smoke);
    this.muzzleFlashes.push(...result.flashes);
    formation.beginReload(reloadSeconds);
    this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.screenShake);
  }

  private spawnCorpse(position: Vec2, team: Team, impactDirection: Vec2): void {
    const speed = 110 + Math.random() * 80;
    this.corpses.push({
      position: { ...position },
      velocity: {
        x: impactDirection.x * speed + (Math.random() - 0.5) * 40,
        y: impactDirection.y * speed + (Math.random() - 0.5) * 40,
      },
      angle: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 10,
      team,
      life: GAME_CONFIG.effects.corpseLifetime,
      maxLife: GAME_CONFIG.effects.corpseLifetime,
    });
  }

  private updateEffects(dt: number): void {
    for (const particle of this.smoke) {
      particle.age += dt;
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.velocity.x *= Math.pow(0.45, dt);
      particle.velocity.y *= Math.pow(0.45, dt);
    }
    for (let i = this.smoke.length - 1; i >= 0; i -= 1) {
      if (this.smoke[i].age >= this.smoke[i].lifetime) this.smoke.splice(i, 1);
    }

    for (const flash of this.muzzleFlashes) flash.life -= dt;
    for (let i = this.muzzleFlashes.length - 1; i >= 0; i -= 1) {
      if (this.muzzleFlashes[i].life <= 0) this.muzzleFlashes.splice(i, 1);
    }

    for (const corpse of this.corpses) {
      corpse.life -= dt;
      corpse.position.x += corpse.velocity.x * dt;
      corpse.position.y += corpse.velocity.y * dt;
      corpse.velocity.x *= Math.pow(0.15, dt);
      corpse.velocity.y *= Math.pow(0.15, dt);
      corpse.angle += corpse.angularVelocity * dt;
    }
    for (let i = this.corpses.length - 1; i >= 0; i -= 1) {
      if (this.corpses[i].life <= 0) this.corpses.splice(i, 1);
    }
  }

  private updateWinner(): void {
    if (this.winner) return;
    if (this.playerFormation.aliveCount() === 0) this.winner = 'enemy';
    if (this.enemyFormation.aliveCount() === 0) this.winner = 'player';
  }
}
