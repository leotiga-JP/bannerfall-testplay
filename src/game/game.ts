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
import { MeleeSystem, type MeleeStrike } from '../systems/meleeSystem';

export interface GameSnapshot {
  time: number;
  paused: boolean;
  winner: Team | null;
  playerMode: 'line' | 'charging' | 'melee';
  enemyMode: 'line' | 'charging' | 'melee';
  chargeAiming: boolean;
  chargeAimTarget: Vec2 | null;
  playerAlive: number;
  enemyAlive: number;
  playerReload: number;
  enemyReload: number;
  playerVolleys: number;
  enemyVolleys: number;
  screenShake: number;
}

const PLAYER_START: Vec2 = { x: 250, y: GAME_CONFIG.height / 2 };
const ENEMY_START: Vec2 = { x: GAME_CONFIG.width - 250, y: GAME_CONFIG.height / 2 };

export class Game {
  readonly playerFormation = new Formation('player', PLAYER_START, 0);
  readonly enemyFormation = new Formation('enemy', ENEMY_START, Math.PI);
  readonly projectiles: Projectile[] = [];
  readonly smoke: SmokeParticle[] = [];
  readonly muzzleFlashes: MuzzleFlash[] = [];
  readonly corpses: CorpseParticle[] = [];
  readonly meleeStrikes: MeleeStrike[] = [];

  private readonly aiSystem = new AiSystem();
  private readonly meleeSystem = new MeleeSystem();
  private time = 0;
  private paused = false;
  private winner: Team | null = null;
  private screenShake = 0;
  private chargeAiming = false;
  private chargeAimTarget: Vec2 | null = null;
  private playerMeleeQuietTimer = 0;
  private enemyMeleeQuietTimer = 0;

  constructor(private readonly input: InputManager) {
    this.aiSystem.reset();
  }

  reset(): void {
    this.playerFormation.reset(PLAYER_START, 0);
    this.enemyFormation.reset(ENEMY_START, Math.PI);
    this.projectiles.length = 0;
    this.smoke.length = 0;
    this.muzzleFlashes.length = 0;
    this.corpses.length = 0;
    this.meleeStrikes.length = 0;
    this.time = 0;
    this.paused = false;
    this.winner = null;
    this.screenShake = 0;
    this.chargeAiming = false;
    this.chargeAimTarget = null;
    this.playerMeleeQuietTimer = 0;
    this.enemyMeleeQuietTimer = 0;
    this.aiSystem.reset();
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

    this.updatePlayerControl(dt);
    this.updateEnemyAi(dt);
    this.updateCharges(dt);

    this.playerFormation.update(dt);
    this.enemyFormation.update(dt);

    const struck = this.meleeSystem.update(
      this.playerFormation,
      this.enemyFormation,
      dt,
      this.meleeStrikes,
      (position, team, impactDirection) => this.spawnCorpse(position, team, impactDirection),
    );
    if (struck) this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.meleeShake);

    this.updateMeleeDisengagement(dt);

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
      playerMode: this.playerFormation.mode,
      enemyMode: this.enemyFormation.mode,
      chargeAiming: this.chargeAiming,
      chargeAimTarget: this.chargeAimTarget ? { ...this.chargeAimTarget } : null,
      playerAlive: this.playerFormation.aliveCount(),
      enemyAlive: this.enemyFormation.aliveCount(),
      playerReload: this.playerFormation.reloadTimer,
      enemyReload: this.enemyFormation.reloadTimer,
      playerVolleys: this.playerFormation.volleysFired,
      enemyVolleys: this.enemyFormation.volleysFired,
      screenShake: this.screenShake,
    };
  }

  private updatePlayerControl(dt: number): void {
    if (this.winner || this.playerFormation.aliveCount() === 0) return;

    if (this.playerFormation.mode === 'line') {
      const pointer = this.input.getPointer();
      this.playerFormation.direction = Math.atan2(
        pointer.y - this.playerFormation.center.y,
        pointer.x - this.playerFormation.center.x,
      );

      if (this.input.consumeChargeStart()) {
        this.chargeAiming = true;
        this.chargeAimTarget = this.computeChargeTarget(pointer);
      }

      if (this.chargeAiming) {
        this.chargeAimTarget = this.computeChargeTarget(pointer);
        if (!this.input.isChargeHeld() && this.input.consumeChargeRelease()) {
          const target = this.chargeAimTarget;
          this.chargeAiming = false;
          this.chargeAimTarget = null;
          if (target && this.playerFormation.beginCharge(target)) {
            this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.chargeShake);
            return;
          }
        }
      }

      if (!this.chargeAiming) {
        this.movePlayerFormation(dt);
        if (this.input.consumeAttack() && this.playerFormation.canVolley()) {
          this.performVolley(this.playerFormation, GAME_CONFIG.musket.reloadSeconds);
        }
      }
    } else {
      this.chargeAiming = false;
      this.chargeAimTarget = null;
      // Consume stray inputs so a held click does not fire immediately after reforming.
      this.input.consumeAttack();
      this.input.consumeChargeStart();
      this.input.consumeChargeRelease();
    }
  }

  private movePlayerFormation(dt: number): void {
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

    this.clampFormationCenter(this.playerFormation);
  }

  private updateEnemyAi(dt: number): void {
    if (this.winner) return;
    const decision = this.aiSystem.update(this.enemyFormation, this.playerFormation, dt);

    if (decision.volley && this.enemyFormation.canVolley()) {
      this.performVolley(this.enemyFormation, GAME_CONFIG.musket.enemyReloadSeconds);
    }

    if (decision.chargeTarget && this.enemyFormation.mode === 'line') {
      const target = this.clampChargeTarget(this.enemyFormation.center, decision.chargeTarget);
      if (this.enemyFormation.beginCharge(target)) {
        this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.chargeShake * 0.75);
      }
    }
  }

  private updateCharges(dt: number): void {
    this.updateFormationCharge(this.playerFormation, this.enemyFormation, dt);
    this.updateFormationCharge(this.enemyFormation, this.playerFormation, dt);
  }

  private updateFormationCharge(charger: Formation, opponent: Formation, dt: number): void {
    if (charger.mode !== 'charging') return;

    const reached = charger.advanceCharge(dt);
    this.clampFormationCenter(charger);

    const contact = this.meleeSystem.formationsInContact(charger, opponent);
    if (contact) {
      charger.enterMelee();
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.chargeShake + 1.8);
      return;
    }

    if (reached) {
      const nearby = this.meleeSystem.hasNearbyEnemy(charger, opponent, GAME_CONFIG.melee.acquireRange);
      if (nearby) {
        charger.enterMelee();
      } else {
        charger.returnToLine(GAME_CONFIG.charge.postChargeReloadPenalty);
      }
    }
  }

  private updateMeleeDisengagement(dt: number): void {
    this.playerMeleeQuietTimer = this.updateOneDisengagement(
      this.playerFormation,
      this.enemyFormation,
      this.playerMeleeQuietTimer,
      dt,
    );
    this.enemyMeleeQuietTimer = this.updateOneDisengagement(
      this.enemyFormation,
      this.playerFormation,
      this.enemyMeleeQuietTimer,
      dt,
    );
  }

  private updateOneDisengagement(
    formation: Formation,
    opponent: Formation,
    timer: number,
    dt: number,
  ): number {
    if (formation.mode !== 'melee') return 0;
    if (this.meleeSystem.hasNearbyEnemy(formation, opponent)) return 0;

    const next = timer + dt;
    if (next >= GAME_CONFIG.melee.disengageDelay) {
      formation.returnToLine(GAME_CONFIG.charge.postChargeReloadPenalty);
      return 0;
    }
    return next;
  }

  private computeChargeTarget(pointer: Vec2): Vec2 {
    return this.clampChargeTarget(this.playerFormation.center, pointer);
  }

  private clampChargeTarget(origin: Vec2, desired: Vec2): Vec2 {
    const dx = desired.x - origin.x;
    const dy = desired.y - origin.y;
    const distance = Math.hypot(dx, dy);
    const maxDistance = GAME_CONFIG.charge.maxDistance;
    const scale = distance > maxDistance ? maxDistance / distance : 1;
    const target = {
      x: origin.x + dx * scale,
      y: origin.y + dy * scale,
    };

    return {
      x: Math.max(GAME_CONFIG.formation.arenaMarginX, Math.min(GAME_CONFIG.width - GAME_CONFIG.formation.arenaMarginX, target.x)),
      y: Math.max(GAME_CONFIG.formation.arenaMarginY, Math.min(GAME_CONFIG.height - GAME_CONFIG.formation.arenaMarginY, target.y)),
    };
  }

  private clampFormationCenter(formation: Formation): void {
    formation.center.x = Math.max(
      GAME_CONFIG.formation.arenaMarginX,
      Math.min(GAME_CONFIG.width - GAME_CONFIG.formation.arenaMarginX, formation.center.x),
    );
    formation.center.y = Math.max(
      GAME_CONFIG.formation.arenaMarginY,
      Math.min(GAME_CONFIG.height - GAME_CONFIG.formation.arenaMarginY, formation.center.y),
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

    for (const strike of this.meleeStrikes) strike.life -= dt;
    for (let i = this.meleeStrikes.length - 1; i >= 0; i -= 1) {
      if (this.meleeStrikes[i].life <= 0) this.meleeStrikes.splice(i, 1);
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
