import { Formation, type FormationMode } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { InputManager } from '../input/inputManager';
import { BattleAiSystem } from '../systems/aiSystem';
import {
  type CorpseParticle,
  type MuzzleFlash,
  type SmokeParticle,
  fireVolley,
  updateProjectiles,
} from '../systems/combatSystem';
import { MeleeSystem, type MeleeStrike } from '../systems/meleeSystem';
import { Camera } from './camera';
import { GAME_CONFIG } from './config';
import type { Team, Vec2 } from './types';

export interface GameSnapshot {
  time: number;
  paused: boolean;
  winner: Team | null;
  timeScale: number;
  debugAi: boolean;
  chargeAiming: boolean;
  chargeAimTarget: Vec2 | null;
  playerMode: FormationMode;
  playerAlive: number;
  playerReload: number;
  blueSquads: number;
  redSquads: number;
  blueSoldiers: number;
  redSoldiers: number;
  screenShake: number;
  cameraZoom: number;
  cameraFollow: boolean;
}

export class Game {
  readonly formations: Formation[];
  readonly playerFormation: Formation;
  readonly camera: Camera;
  readonly projectiles: Projectile[] = [];
  readonly smoke: SmokeParticle[] = [];
  readonly muzzleFlashes: MuzzleFlash[] = [];
  readonly corpses: CorpseParticle[] = [];
  readonly meleeStrikes: MeleeStrike[] = [];

  private readonly aiSystem = new BattleAiSystem();
  private readonly meleeSystem = new MeleeSystem();
  private readonly meleeQuietTimers = new Map<string, number>();
  private time = 0;
  private paused = false;
  private winner: Team | null = null;
  private screenShake = 0;
  private chargeAiming = false;
  private chargeAimTarget: Vec2 | null = null;
  private timeScale = 1;
  private debugAi = false;

  constructor(private readonly input: InputManager) {
    this.formations = this.createArmies();
    const player = this.formations.find((formation) => formation.isPlayerControlled);
    if (!player) throw new Error('Player formation was not created.');
    this.playerFormation = player;
    this.camera = new Camera(this.playerFormation.center);
    this.aiSystem.reset(this.formations);
  }

  reset(): void {
    for (let i = 0; i < this.formations.length; i += 1) {
      const formation = this.formations[i];
      const teamIndex = i % GAME_CONFIG.army.squadsPerTeam;
      const spawn = this.spawnFor(formation.team, teamIndex);
      formation.reset(spawn, formation.team === 'blue' ? 0 : Math.PI);
    }
    this.projectiles.length = 0;
    this.smoke.length = 0;
    this.muzzleFlashes.length = 0;
    this.corpses.length = 0;
    this.meleeStrikes.length = 0;
    this.meleeQuietTimers.clear();
    this.time = 0;
    this.paused = false;
    this.winner = null;
    this.screenShake = 0;
    this.chargeAiming = false;
    this.chargeAimTarget = null;
    this.timeScale = 1;
    this.camera.reset(this.playerFormation.center);
    this.aiSystem.reset(this.formations);
  }

  update(rawDt: number): void {
    this.updateCameraControls();

    const scale = this.input.consumeTimeScale();
    if (scale !== null) this.timeScale = scale;
    if (this.input.consumeDebugToggle()) this.debugAi = !this.debugAi;
    if (this.input.consumePause()) this.paused = !this.paused;
    if (this.input.consumeRestart()) {
      this.reset();
      this.input.endFrame();
      return;
    }

    if (this.paused) {
      this.camera.updateFollow(this.playerFormation.center, rawDt);
      this.input.endFrame();
      return;
    }

    const dt = rawDt * this.timeScale;
    this.time += dt;

    this.updatePlayerControl(dt);
    this.applyAiCommands(dt);
    this.updateCharges(dt);
    this.resolveFriendlyFormationSeparation();

    for (const formation of this.formations) formation.update(dt);

    const struck = this.meleeSystem.update(
      this.formations,
      dt,
      this.meleeStrikes,
      (position, team, impactDirection) => this.spawnCorpse(position, team, impactDirection),
    );
    if (struck && this.playerFormation.mode === 'melee') {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.meleeShake);
    }

    this.updateMeleeDisengagement(dt);
    updateProjectiles(
      this.projectiles,
      this.formations,
      dt,
      (position, team, impactDirection) => this.spawnCorpse(position, team, impactDirection),
    );

    this.updateEffects(dt);
    this.updateWinner();
    this.screenShake = Math.max(0, this.screenShake - 18 * rawDt);
    this.camera.updateFollow(this.playerFormation.center, rawDt);
    this.input.endFrame();
  }

  snapshot(): GameSnapshot {
    return {
      time: this.time,
      paused: this.paused,
      winner: this.winner,
      timeScale: this.timeScale,
      debugAi: this.debugAi,
      chargeAiming: this.chargeAiming,
      chargeAimTarget: this.chargeAimTarget ? { ...this.chargeAimTarget } : null,
      playerMode: this.playerFormation.mode,
      playerAlive: this.playerFormation.aliveCount(),
      playerReload: this.playerFormation.reloadTimer,
      blueSquads: this.aliveSquads('blue'),
      redSquads: this.aliveSquads('red'),
      blueSoldiers: this.aliveSoldiers('blue'),
      redSoldiers: this.aliveSoldiers('red'),
      screenShake: this.screenShake,
      cameraZoom: this.camera.zoom,
      cameraFollow: this.camera.followPlayer,
    };
  }

  private createArmies(): Formation[] {
    const formations: Formation[] = [];
    for (const team of ['blue', 'red'] as const) {
      for (let i = 0; i < GAME_CONFIG.army.squadsPerTeam; i += 1) {
        const id = `${team === 'blue' ? 'B' : 'R'}${String(i + 1).padStart(2, '0')}`;
        const isPlayer = team === 'blue' && i === GAME_CONFIG.army.playerSquadIndex;
        formations.push(new Formation(
          id,
          team,
          this.spawnFor(team, i),
          team === 'blue' ? 0 : Math.PI,
          isPlayer,
        ));
      }
    }
    return formations;
  }

  private spawnFor(team: Team, index: number): Vec2 {
    const row = Math.floor(index / GAME_CONFIG.army.spawnColumns);
    const column = index % GAME_CONFIG.army.spawnColumns;
    const xOffset = GAME_CONFIG.army.spawnX + column * GAME_CONFIG.army.spawnColumnGap;
    return {
      x: team === 'blue' ? xOffset : GAME_CONFIG.world.width - xOffset,
      y: GAME_CONFIG.army.spawnY + row * GAME_CONFIG.army.spawnRowGap,
    };
  }

  private updateCameraControls(): void {
    const pan = this.input.consumePanDelta();
    if (pan.x !== 0 || pan.y !== 0) this.camera.panByScreen(pan);
    const wheel = this.input.consumeWheelDelta();
    if (wheel !== 0) this.camera.adjustZoom(wheel);
    if (this.input.consumeCenterCamera()) this.camera.centerOn(this.playerFormation.center);
  }

  private updatePlayerControl(dt: number): void {
    const formation = this.playerFormation;
    if (this.winner || formation.aliveCount() === 0) return;
    formation.debugIntent = 'PLAYER';
    formation.debugTargetId = null;
    const pointer = this.camera.screenToWorld(this.input.getPointer());

    if (this.input.consumeReform()) {
      this.cancelChargeAim();
      const center = formation.averageAlivePosition();
      const direction = Math.atan2(pointer.y - center.y, pointer.x - center.x);
      formation.beginReform(direction, undefined, GAME_CONFIG.reform.reloadPenalty);
      this.consumeCombatInputs();
      return;
    }

    if (formation.mode === 'charging' || formation.mode === 'melee') {
      if (this.input.consumeBreakOff()) {
        this.cancelChargeAim();
        const target = this.nearestEnemyFormation(formation);
        if (target) this.orderBreakOff(formation, target);
        this.input.consumeAttack();
        this.input.consumeChargeRelease();
        return;
      }
    }

    if (formation.mode === 'line') {
      formation.direction = Math.atan2(pointer.y - formation.center.y, pointer.x - formation.center.x);

      if (this.input.consumeChargeStart()) {
        this.chargeAiming = true;
        this.chargeAimTarget = this.computeChargeTarget(formation.center, pointer);
      }

      if (this.chargeAiming) {
        this.chargeAimTarget = this.computeChargeTarget(formation.center, pointer);
        if (!this.input.isChargeHeld() && this.input.consumeChargeRelease()) {
          const target = this.chargeAimTarget;
          this.cancelChargeAim();
          if (target && formation.beginCharge(target)) {
            this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.chargeShake);
            return;
          }
        }
      }

      if (!this.chargeAiming) {
        this.movePlayerFormation(dt);
        if (this.input.consumeAttack() && formation.canVolley()) {
          this.performVolley(formation, GAME_CONFIG.musket.playerReloadSeconds);
        }
      }
      return;
    }

    this.cancelChargeAim();
    this.consumeCombatInputs();
  }

  private applyAiCommands(dt: number): void {
    if (this.winner) return;
    const commands = this.aiSystem.update(this.formations, dt);
    for (const command of commands) {
      const formation = command.formation;
      if (formation.aliveCount() === 0) continue;

      if (command.faceAngle !== null && formation.mode === 'line') {
        formation.direction = command.faceAngle;
      }

      if (command.reform && formation.mode === 'line') {
        formation.beginReform(
          command.faceAngle ?? formation.direction,
          undefined,
          GAME_CONFIG.reform.reloadPenalty,
        );
        continue;
      }

      if (command.breakOffTarget) {
        this.orderBreakOff(formation, command.breakOffTarget);
        continue;
      }

      if (command.volley && formation.canVolley()) {
        const reload = GAME_CONFIG.musket.aiReloadMin
          + Math.random() * (GAME_CONFIG.musket.aiReloadMax - GAME_CONFIG.musket.aiReloadMin);
        this.performVolley(formation, reload);
      }

      if (command.chargeTarget && formation.mode === 'line') {
        const target = this.clampChargeTarget(formation.center, command.chargeTarget);
        formation.beginCharge(target);
        continue;
      }

      if (formation.mode === 'line') {
        const length = Math.hypot(command.move.x, command.move.y);
        if (length > 0.001) {
          const speed = formation.debugIntent === 'RETREAT'
            ? GAME_CONFIG.formation.aiRetreatSpeed
            : GAME_CONFIG.formation.aiMoveSpeed;
          formation.center.x += (command.move.x / length) * speed * dt;
          formation.center.y += (command.move.y / length) * speed * dt;
          this.clampFormationCenter(formation);
        }
      }
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
      this.clampFormationCenter(this.playerFormation);
    }
  }

  private updateCharges(dt: number): void {
    for (const charger of this.formations) {
      if (charger.mode !== 'charging' || charger.aliveCount() === 0) continue;
      const reached = charger.advanceCharge(dt);
      this.clampFormationCenter(charger);
      const enemies = this.formations.filter((formation) => formation.team !== charger.team && formation.aliveCount() > 0);
      const contact = this.meleeSystem.findContact(charger, enemies);
      if (contact) {
        charger.enterMelee();
        if (charger.isPlayerControlled || this.distanceToPlayer(charger.center) < 650) {
          this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.chargeShake + 1.2);
        }
        continue;
      }

      if (reached) {
        const nearby = this.meleeSystem.hasNearbyEnemy(charger, enemies, GAME_CONFIG.melee.acquireRange);
        if (nearby) {
          charger.enterMelee();
        } else {
          charger.beginReform(
            charger.direction,
            this.clampFormationPoint(charger.center),
            GAME_CONFIG.charge.postChargeReloadPenalty,
          );
        }
      }
    }
  }

  private updateMeleeDisengagement(dt: number): void {
    for (const formation of this.formations) {
      if (formation.mode !== 'melee') {
        this.meleeQuietTimers.delete(formation.id);
        continue;
      }
      const enemies = this.formations.filter((candidate) => candidate.team !== formation.team && candidate.aliveCount() > 0);
      if (this.meleeSystem.hasNearbyEnemy(formation, enemies)) {
        this.meleeQuietTimers.set(formation.id, 0);
        continue;
      }
      const timer = (this.meleeQuietTimers.get(formation.id) ?? 0) + dt;
      if (timer >= GAME_CONFIG.melee.disengageDelay) {
        const target = this.nearestEnemyFormation(formation);
        const direction = target
          ? Math.atan2(target.center.y - formation.center.y, target.center.x - formation.center.x)
          : formation.direction;
        formation.beginReform(direction, undefined, GAME_CONFIG.charge.postChargeReloadPenalty);
        this.meleeQuietTimers.delete(formation.id);
      } else {
        this.meleeQuietTimers.set(formation.id, timer);
      }
    }
  }

  private orderBreakOff(formation: Formation, opponent: Formation): void {
    const own = formation.averageAlivePosition();
    const enemy = opponent.averageAlivePosition();
    let dx = own.x - enemy.x;
    let dy = own.y - enemy.y;
    let distance = Math.hypot(dx, dy);
    if (distance < 0.001) {
      dx = -Math.cos(formation.direction);
      dy = -Math.sin(formation.direction);
      distance = 1;
    }
    const target = this.clampFormationPoint({
      x: own.x + (dx / distance) * GAME_CONFIG.reform.breakOffDistance,
      y: own.y + (dy / distance) * GAME_CONFIG.reform.breakOffDistance,
    });
    const facing = Math.atan2(enemy.y - target.y, enemy.x - target.x);
    formation.beginReform(facing, target, GAME_CONFIG.reform.breakOffReloadPenalty);
    if (formation.isPlayerControlled) this.screenShake = Math.max(this.screenShake, 1.4);
  }

  private resolveFriendlyFormationSeparation(): void {
    const minDistance = GAME_CONFIG.formation.friendlySeparation;
    const minDistanceSq = minDistance * minDistance;
    for (let i = 0; i < this.formations.length; i += 1) {
      const a = this.formations[i];
      if (a.aliveCount() === 0 || (a.mode !== 'line' && a.mode !== 'reforming')) continue;
      for (let j = i + 1; j < this.formations.length; j += 1) {
        const b = this.formations[j];
        if (b.team !== a.team || b.aliveCount() === 0 || (b.mode !== 'line' && b.mode !== 'reforming')) continue;
        const dx = b.center.x - a.center.x;
        const dy = b.center.y - a.center.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq <= 0.001 || distanceSq >= minDistanceSq) continue;
        const distance = Math.sqrt(distanceSq);
        const push = (minDistance - distance) * 0.5;
        const nx = dx / distance;
        const ny = dy / distance;
        a.center.x -= nx * push;
        a.center.y -= ny * push;
        b.center.x += nx * push;
        b.center.y += ny * push;
        this.clampFormationCenter(a);
        this.clampFormationCenter(b);
      }
    }
  }

  private nearestEnemyFormation(formation: Formation): Formation | null {
    let best: Formation | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of this.formations) {
      if (candidate.team === formation.team || candidate.aliveCount() === 0) continue;
      const distance = Math.hypot(candidate.center.x - formation.center.x, candidate.center.y - formation.center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  private computeChargeTarget(origin: Vec2, pointer: Vec2): Vec2 {
    return this.clampChargeTarget(origin, pointer);
  }

  private clampChargeTarget(origin: Vec2, desired: Vec2): Vec2 {
    const dx = desired.x - origin.x;
    const dy = desired.y - origin.y;
    const distance = Math.hypot(dx, dy) || 1;
    const scale = distance > GAME_CONFIG.charge.maxDistance ? GAME_CONFIG.charge.maxDistance / distance : 1;
    return this.clampFormationPoint({
      x: origin.x + dx * scale,
      y: origin.y + dy * scale,
    });
  }

  private clampFormationPoint(point: Vec2): Vec2 {
    const padding = GAME_CONFIG.world.padding + GAME_CONFIG.formation.collisionRadius;
    return {
      x: Math.max(padding, Math.min(GAME_CONFIG.world.width - padding, point.x)),
      y: Math.max(padding, Math.min(GAME_CONFIG.world.height - padding, point.y)),
    };
  }

  private clampFormationCenter(formation: Formation): void {
    const clamped = this.clampFormationPoint(formation.center);
    formation.center.x = clamped.x;
    formation.center.y = clamped.y;
  }

  private performVolley(formation: Formation, reloadSeconds: number): void {
    const result = fireVolley(formation);
    this.projectiles.push(...result.projectiles);
    this.smoke.push(...result.smoke);
    this.muzzleFlashes.push(...result.flashes);
    formation.beginReload(reloadSeconds);
    if (formation.isPlayerControlled || this.distanceToPlayer(formation.center) < 750) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.screenShake);
    }
    if (this.smoke.length > GAME_CONFIG.effects.maxSmoke) {
      this.smoke.splice(0, this.smoke.length - GAME_CONFIG.effects.maxSmoke);
    }
  }

  private spawnCorpse(position: Vec2, team: Team, impactDirection: Vec2): void {
    const speed = 100 + Math.random() * 75;
    this.corpses.push({
      position: { ...position },
      velocity: {
        x: impactDirection.x * speed + (Math.random() - 0.5) * 36,
        y: impactDirection.y * speed + (Math.random() - 0.5) * 36,
      },
      angle: Math.random() * Math.PI * 2,
      angularVelocity: (Math.random() - 0.5) * 9,
      team,
      life: GAME_CONFIG.effects.corpseLifetime,
      maxLife: GAME_CONFIG.effects.corpseLifetime,
    });
    if (this.corpses.length > GAME_CONFIG.effects.maxCorpses) {
      this.corpses.splice(0, this.corpses.length - GAME_CONFIG.effects.maxCorpses);
    }
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
    if (this.aliveSoldiers('blue') === 0) this.winner = 'red';
    else if (this.aliveSoldiers('red') === 0) this.winner = 'blue';
  }

  private aliveSquads(team: Team): number {
    return this.formations.filter((formation) => formation.team === team && formation.aliveCount() > 0).length;
  }

  private aliveSoldiers(team: Team): number {
    let count = 0;
    for (const formation of this.formations) {
      if (formation.team === team) count += formation.aliveCount();
    }
    return count;
  }

  private distanceToPlayer(point: Vec2): number {
    return Math.hypot(point.x - this.playerFormation.center.x, point.y - this.playerFormation.center.y);
  }

  private consumeCombatInputs(): void {
    this.input.consumeAttack();
    this.input.consumeChargeStart();
    this.input.consumeChargeRelease();
  }

  private cancelChargeAim(): void {
    this.chargeAiming = false;
    this.chargeAimTarget = null;
  }
}
