import { Banner } from '../entities/banner';
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
import type { Team, Vec2, WeaponType } from './types';

export interface AxeStrike {
  start: Vec2;
  end: Vec2;
  team: Team;
  life: number;
}

export type NoticeKind = 'info' | 'warning' | 'success';
export type IntroStage = 'own-banner' | 'pan-enemy' | 'enemy-banner' | 'return-player' | 'done';

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
  playerRespawn: number | null;
  selectedWeapon: WeaponType;
  playerBannerTargetTeam: Team | null;
  playerBannerInRange: boolean;
  blueSquads: number;
  redSquads: number;
  blueSoldiers: number;
  redSoldiers: number;
  blueBannerHp: number;
  redBannerHp: number;
  bannerMaxHp: number;
  blueBannerUnderAttack: boolean;
  redBannerUnderAttack: boolean;
  screenShake: number;
  cameraZoom: number;
  cameraFollow: boolean;
  introActive: boolean;
  introStage: IntroStage;
  introProgress: number;
  noticeText: string;
  noticeKind: NoticeKind;
  noticeVisible: boolean;
  contextualHint: string;
}

export class Game {
  readonly formations: Formation[];
  readonly playerFormation: Formation;
  readonly banners: Banner[];
  readonly camera: Camera;
  readonly projectiles: Projectile[] = [];
  readonly smoke: SmokeParticle[] = [];
  readonly muzzleFlashes: MuzzleFlash[] = [];
  readonly corpses: CorpseParticle[] = [];
  readonly meleeStrikes: MeleeStrike[] = [];
  readonly axeStrikes: AxeStrike[] = [];

  private readonly aiSystem = new BattleAiSystem();
  private readonly meleeSystem = new MeleeSystem();
  private readonly meleeQuietTimers = new Map<string, number>();
  private readonly respawnTimers = new Map<string, number>();
  private time = 0;
  private paused = false;
  private winner: Team | null = null;
  private screenShake = 0;
  private chargeAiming = false;
  private chargeAimTarget: Vec2 | null = null;
  private timeScale = 1;
  private debugAi = false;
  private selectedWeapon: WeaponType = 'musket';
  private introElapsed = 0;
  private introActive = true;
  private introStage: IntroStage = 'own-banner';
  private introProgress = 0;
  private noticeText = '';
  private noticeKind: NoticeKind = 'info';
  private noticeTimer = 0;
  private contextualHint = '';
  private hintTimer = 0;

  constructor(private readonly input: InputManager) {
    this.formations = this.createArmies();
    const player = this.formations.find((formation) => formation.isPlayerControlled);
    if (!player) throw new Error('Player formation was not created.');
    this.playerFormation = player;
    this.banners = [
      new Banner('blue', { x: GAME_CONFIG.banner.blueX, y: GAME_CONFIG.banner.y }),
      new Banner('red', { x: GAME_CONFIG.banner.redX, y: GAME_CONFIG.banner.y }),
    ];
    this.camera = new Camera(this.blueBanner.position);
    this.camera.setCinematic(this.blueBanner.position, 0.76);
    this.aiSystem.reset(this.formations);
  }

  get blueBanner(): Banner {
    return this.banners[0];
  }

  get redBanner(): Banner {
    return this.banners[1];
  }

  reset(): void {
    for (let i = 0; i < this.formations.length; i += 1) {
      const formation = this.formations[i];
      const teamIndex = i % GAME_CONFIG.army.squadsPerTeam;
      const spawn = this.spawnFor(formation.team, teamIndex);
      formation.reset(spawn, formation.team === 'blue' ? 0 : Math.PI);
      formation.spawnProtectionTimer = 0;
    }
    for (const banner of this.banners) banner.reset();
    this.projectiles.length = 0;
    this.smoke.length = 0;
    this.muzzleFlashes.length = 0;
    this.corpses.length = 0;
    this.meleeStrikes.length = 0;
    this.axeStrikes.length = 0;
    this.meleeQuietTimers.clear();
    this.respawnTimers.clear();
    this.time = 0;
    this.paused = false;
    this.winner = null;
    this.screenShake = 0;
    this.chargeAiming = false;
    this.chargeAimTarget = null;
    this.timeScale = 1;
    this.selectedWeapon = 'musket';
    this.playerFormation.weapon = 'musket';
    this.introElapsed = 0;
    this.introActive = true;
    this.introStage = 'own-banner';
    this.introProgress = 0;
    this.noticeText = '';
    this.noticeTimer = 0;
    this.contextualHint = '';
    this.hintTimer = 0;
    this.camera.reset(this.blueBanner.position);
    this.camera.setCinematic(this.blueBanner.position, 0.76);
    this.aiSystem.reset(this.formations);
  }

  update(rawDt: number): void {
    if (this.input.consumeRestart()) {
      this.reset();
      this.input.endFrame();
      return;
    }

    if (this.introActive) {
      this.updateIntro(rawDt);
      this.input.clearActionInputs();
      this.input.endFrame();
      return;
    }

    const primaryClick = this.input.consumePrimaryClick();
    const clickConsumedByMap = primaryClick ? this.updateCameraControls(primaryClick) : this.updateCameraControls(null);

    const scale = this.input.consumeTimeScale();
    if (scale !== null) this.timeScale = scale;
    if (this.input.consumeDebugToggle()) this.debugAi = !this.debugAi;
    if (this.input.consumePause()) this.paused = !this.paused;

    if (this.paused) {
      this.camera.updateFollow(this.playerCameraTarget(), rawDt);
      this.updateUiTimers(rawDt);
      this.input.endFrame();
      return;
    }

    const dt = rawDt * this.timeScale;
    this.time += dt;

    const weapon = this.input.consumeWeaponSelection();
    if (weapon) this.selectPlayerWeapon(weapon);

    this.updatePlayerControl(dt, clickConsumedByMap ? null : primaryClick);
    this.applyAiCommands(dt);
    this.updateCharges(dt);
    this.updateBannerAttacks(dt);
    this.resolveFriendlyFormationSeparation();

    for (const formation of this.formations) formation.update(dt);
    for (const banner of this.banners) banner.update(dt);

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

    this.updateRespawns(dt);
    this.updateEffects(dt);
    this.updateWinner();
    this.updateUiTimers(rawDt);
    this.screenShake = Math.max(0, this.screenShake - 18 * rawDt);
    this.camera.updateFollow(this.playerCameraTarget(), rawDt);
    this.input.endFrame();
  }

  snapshot(): GameSnapshot {
    const playerRespawn = this.respawnTimers.get(this.playerFormation.id) ?? null;
    const playerTarget = this.playerFormation.bannerTargetTeam;
    const targetBanner = playerTarget ? this.bannerFor(playerTarget) : null;
    const playerBannerInRange = !!targetBanner
      && this.distance(this.playerFormation.center, targetBanner.position) <= GAME_CONFIG.banner.approachDistance + 16;

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
      playerRespawn,
      selectedWeapon: this.selectedWeapon,
      playerBannerTargetTeam: playerTarget,
      playerBannerInRange,
      blueSquads: this.aliveSquads('blue'),
      redSquads: this.aliveSquads('red'),
      blueSoldiers: this.aliveSoldiers('blue'),
      redSoldiers: this.aliveSoldiers('red'),
      blueBannerHp: this.blueBanner.hp,
      redBannerHp: this.redBanner.hp,
      bannerMaxHp: this.blueBanner.maxHp,
      blueBannerUnderAttack: this.blueBanner.underAttackTimer > 0,
      redBannerUnderAttack: this.redBanner.underAttackTimer > 0,
      screenShake: this.screenShake,
      cameraZoom: this.camera.zoom,
      cameraFollow: this.camera.followPlayer,
      introActive: this.introActive,
      introStage: this.introStage,
      introProgress: this.introProgress,
      noticeText: this.noticeText,
      noticeKind: this.noticeKind,
      noticeVisible: this.noticeTimer > 0,
      contextualHint: this.hintTimer > 0 ? this.contextualHint : '',
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

  private updateIntro(rawDt: number): void {
    this.introElapsed += rawDt;
    const ownEnd = GAME_CONFIG.intro.ownHold;
    const panEnd = ownEnd + GAME_CONFIG.intro.panToEnemy;
    const enemyEnd = panEnd + GAME_CONFIG.intro.enemyHold;
    const returnEnd = enemyEnd + GAME_CONFIG.intro.panBack;

    if (this.introElapsed < ownEnd) {
      this.introStage = 'own-banner';
      this.introProgress = this.introElapsed / ownEnd;
      this.camera.setCinematic(this.blueBanner.position, 0.76);
      return;
    }

    if (this.introElapsed < panEnd) {
      this.introStage = 'pan-enemy';
      const t = this.smoothstep((this.introElapsed - ownEnd) / GAME_CONFIG.intro.panToEnemy);
      this.introProgress = t;
      this.camera.setCinematic(this.lerpPoint(this.blueBanner.position, this.redBanner.position, t), 0.66);
      return;
    }

    if (this.introElapsed < enemyEnd) {
      this.introStage = 'enemy-banner';
      this.introProgress = (this.introElapsed - panEnd) / GAME_CONFIG.intro.enemyHold;
      this.camera.setCinematic(this.redBanner.position, 0.76);
      return;
    }

    if (this.introElapsed < returnEnd) {
      this.introStage = 'return-player';
      const t = this.smoothstep((this.introElapsed - enemyEnd) / GAME_CONFIG.intro.panBack);
      this.introProgress = t;
      this.camera.setCinematic(this.lerpPoint(this.redBanner.position, this.playerFormation.center, t), 0.64);
      return;
    }

    this.introActive = false;
    this.introStage = 'done';
    this.introProgress = 1;
    this.camera.centerOn(this.playerFormation.center);
    this.setHint('1 MUSKET · 2 BAYONET · 3 AXE', 6);
  }

  private updateCameraControls(primaryClick: Vec2 | null): boolean {
    const pan = this.input.consumePanDelta();
    if (pan.x !== 0 || pan.y !== 0) this.camera.panByScreen(pan);
    const wheel = this.input.consumeWheelDelta();
    if (wheel !== 0) this.camera.adjustZoom(wheel);
    if (this.input.consumeCenterCamera()) this.camera.centerOn(this.playerCameraTarget());

    if (primaryClick) {
      const world = this.minimapWorldPoint(primaryClick);
      if (world) {
        this.camera.jumpTo(world);
        this.setHint('FREE CAMERA · C で自部隊へ戻る', 2.5);
        return true;
      }
    }
    return false;
  }

  private updatePlayerControl(dt: number, primaryClick: Vec2 | null): void {
    const formation = this.playerFormation;
    if (this.winner || formation.aliveCount() === 0) {
      this.input.clearActionInputs();
      return;
    }
    formation.debugIntent = 'PLAYER';
    formation.debugTargetId = null;
    const pointer = this.camera.screenToWorld(this.input.getPointer());

    if (this.input.consumeReform()) {
      this.cancelChargeAim();
      if (formation.mode === 'bannerAttack') formation.cancelBannerAttack();
      const center = formation.averageAlivePosition();
      const direction = Math.atan2(pointer.y - center.y, pointer.x - center.x);
      formation.weapon = this.selectedWeapon;
      formation.beginReform(direction, undefined, GAME_CONFIG.reform.reloadPenalty);
      this.input.clearActionInputs();
      return;
    }

    if (formation.mode === 'charging' || formation.mode === 'melee') {
      if (this.input.consumeBreakOff()) {
        this.cancelChargeAim();
        const target = this.nearestEnemyFormation(formation);
        if (target) this.orderBreakOff(formation, target);
        this.input.consumeChargeRelease();
        return;
      }
      return;
    }

    if (formation.mode === 'bannerAttack') {
      formation.weapon = 'axe';
      this.input.clearActionInputs();
      return;
    }

    if (formation.mode !== 'line') {
      this.cancelChargeAim();
      this.input.clearActionInputs();
      return;
    }

    formation.weapon = this.selectedWeapon;
    formation.direction = Math.atan2(pointer.y - formation.center.y, pointer.x - formation.center.x);

    if (this.selectedWeapon === 'bayonet') {
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
    } else {
      this.cancelChargeAim();
    }

    if (this.selectedWeapon === 'axe' && this.input.consumeChargeStart()) {
      const enemyBanner = this.bannerFor(formation.team === 'blue' ? 'red' : 'blue');
      if (this.distance(pointer, enemyBanner.position) <= GAME_CONFIG.banner.clickRadius) {
        formation.beginBannerAttack(enemyBanner.team, enemyBanner.position);
        this.setNotice('AXE ORDER — ENEMY BANNER', 'info', 2.2);
        return;
      }
      this.setHint('斧を装備中：敵旗を右クリック', 2.4);
    }

    if (!this.chargeAiming) {
      this.movePlayerFormation(dt);
      if (primaryClick && this.selectedWeapon === 'musket' && formation.canVolley()) {
        this.performVolley(formation, GAME_CONFIG.musket.playerReloadSeconds);
      } else if (primaryClick && this.selectedWeapon !== 'musket') {
        this.setHint(this.selectedWeapon === 'bayonet'
          ? '銃剣：右クリック / Space 長押し → 離して突撃'
          : '斧：敵旗を右クリックして破壊命令', 2.2);
      }
    }
  }

  private selectPlayerWeapon(weapon: WeaponType): void {
    this.selectedWeapon = weapon;
    if (this.playerFormation.aliveCount() === 0) return;
    if (this.playerFormation.mode === 'bannerAttack' && weapon !== 'axe') {
      this.playerFormation.cancelBannerAttack();
    }
    if (this.playerFormation.mode === 'line' || this.playerFormation.mode === 'reforming') {
      this.playerFormation.weapon = weapon;
    }
    const label = weapon === 'musket' ? 'MUSKET — 左クリックで一斉射撃'
      : weapon === 'bayonet' ? 'BAYONET — 右クリック / Spaceで突撃'
        : 'AXE — 敵旗を右クリックして破壊';
    this.setHint(label, 2.5);
  }

  private applyAiCommands(dt: number): void {
    if (this.winner) return;
    const commands = this.aiSystem.update(this.formations, this.banners, dt);
    for (const command of commands) {
      const formation = command.formation;
      if (formation.aliveCount() === 0 || formation.mode === 'bannerAttack') continue;

      if (command.faceAngle !== null && formation.mode === 'line') {
        formation.direction = command.faceAngle;
      }

      if (command.bannerAttackTarget && formation.mode === 'line') {
        formation.beginBannerAttack(command.bannerAttackTarget.team, command.bannerAttackTarget.position);
        continue;
      }

      if (command.reform && formation.mode === 'line') {
        formation.weapon = 'musket';
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

      if (command.volley && formation.mode === 'line') {
        formation.weapon = 'musket';
        if (formation.canVolley()) {
          const reload = GAME_CONFIG.musket.aiReloadMin
            + Math.random() * (GAME_CONFIG.musket.aiReloadMax - GAME_CONFIG.musket.aiReloadMin);
          this.performVolley(formation, reload);
        }
      }

      if (command.chargeTarget && formation.mode === 'line') {
        const target = this.clampChargeTarget(formation.center, command.chargeTarget);
        formation.beginCharge(target);
        continue;
      }

      if (formation.mode === 'line') {
        formation.weapon = 'musket';
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
          charger.weapon = charger.isPlayerControlled ? this.selectedWeapon : 'musket';
          charger.beginReform(
            charger.direction,
            this.clampFormationPoint(charger.center),
            GAME_CONFIG.charge.postChargeReloadPenalty,
          );
        }
      }
    }
  }

  private updateBannerAttacks(dt: number): void {
    for (const formation of this.formations) {
      if (formation.mode !== 'bannerAttack' || formation.aliveCount() === 0 || !formation.bannerTargetTeam) continue;
      const banner = this.bannerFor(formation.bannerTargetTeam);
      if (banner.destroyed) {
        formation.weapon = formation.isPlayerControlled ? this.selectedWeapon : 'musket';
        formation.cancelBannerAttack(this.angleTo(formation.center, this.enemyDirectionPoint(formation.team)));
        continue;
      }

      const dx = formation.center.x - banner.position.x;
      const dy = formation.center.y - banner.position.y;
      let distance = Math.hypot(dx, dy);
      let nx = distance > 0.001 ? dx / distance : formation.team === 'blue' ? -1 : 1;
      let ny = distance > 0.001 ? dy / distance : 0;
      const targetCenter = {
        x: banner.position.x + nx * GAME_CONFIG.banner.approachDistance,
        y: banner.position.y + ny * GAME_CONFIG.banner.approachDistance,
      };
      const mdx = targetCenter.x - formation.center.x;
      const mdy = targetCenter.y - formation.center.y;
      const moveDistance = Math.hypot(mdx, mdy);

      formation.weapon = 'axe';
      formation.direction = Math.atan2(banner.position.y - formation.center.y, banner.position.x - formation.center.x);

      if (moveDistance > 8) {
        const step = Math.min(moveDistance, GAME_CONFIG.banner.approachSpeed * dt);
        formation.center.x += (mdx / moveDistance) * step;
        formation.center.y += (mdy / moveDistance) * step;
        this.clampFormationCenter(formation);
        formation.bannerAttackTimer = 0;
        continue;
      }

      distance = this.distance(formation.center, banner.position);
      if (distance > GAME_CONFIG.banner.approachDistance + 22) continue;
      formation.bannerAttackTimer -= dt;
      if (formation.bannerAttackTimer > 0) continue;

      const attackers = Math.min(GAME_CONFIG.banner.attackSlots, formation.aliveCount());
      if (attackers <= 0) continue;
      const wasUnderAttack = banner.underAttackTimer > 0;
      const beforeRatio = banner.ratio;
      banner.takeDamage(attackers * GAME_CONFIG.banner.axeDamagePerSoldier);
      formation.bannerAttackTimer = GAME_CONFIG.banner.axeInterval;
      this.spawnAxeStrikes(formation, banner, attackers);

      if (!wasUnderAttack) {
        const own = banner.team === this.playerFormation.team;
        this.setNotice(
          own ? 'YOUR BANNER IS UNDER ATTACK' : 'ENEMY BANNER UNDER ATTACK',
          own ? 'warning' : 'success',
          3.2,
        );
      }
      if (beforeRatio > 0.5 && banner.ratio <= 0.5) {
        this.setNotice(`${banner.team.toUpperCase()} BANNER — 50%`, banner.team === 'blue' ? 'warning' : 'success', 2.8);
      } else if (beforeRatio > 0.25 && banner.ratio <= 0.25) {
        this.setNotice(`${banner.team.toUpperCase()} BANNER — 25%`, banner.team === 'blue' ? 'warning' : 'success', 3.2);
      }

      if (formation.isPlayerControlled || this.distanceToPlayer(formation.center) < 520) {
        this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.axeShake);
      }
    }
  }

  private updateRespawns(dt: number): void {
    if (this.winner) return;
    for (const formation of this.formations) {
      if (formation.aliveCount() > 0) {
        this.respawnTimers.delete(formation.id);
        continue;
      }

      let remaining = this.respawnTimers.get(formation.id);
      if (remaining === undefined) {
        remaining = GAME_CONFIG.army.respawnSeconds;
        this.respawnTimers.set(formation.id, remaining);
        if (formation.isPlayerControlled) {
          this.cancelChargeAim();
          this.setNotice('YOUR SQUAD WAS WIPED — REINFORCEMENTS INBOUND', 'warning', 4);
        }
      }

      remaining -= dt;
      if (remaining > 0) {
        this.respawnTimers.set(formation.id, remaining);
        continue;
      }

      const index = this.teamIndexOf(formation);
      formation.reset(this.spawnFor(formation.team, index), formation.team === 'blue' ? 0 : Math.PI);
      this.respawnTimers.delete(formation.id);
      if (formation.isPlayerControlled) {
        this.selectedWeapon = 'musket';
        formation.weapon = 'musket';
        this.camera.centerOn(formation.center);
        this.setNotice('SQUAD REDEPLOYED', 'success', 2.7);
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
        formation.weapon = formation.isPlayerControlled ? this.selectedWeapon : 'musket';
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
    formation.weapon = formation.isPlayerControlled ? this.selectedWeapon : 'musket';
    formation.beginReform(facing, target, GAME_CONFIG.reform.breakOffReloadPenalty);
    if (formation.isPlayerControlled) this.screenShake = Math.max(this.screenShake, 1.4);
  }

  private resolveFriendlyFormationSeparation(): void {
    const minDistance = GAME_CONFIG.formation.friendlySeparation;
    const minDistanceSq = minDistance * minDistance;
    for (let i = 0; i < this.formations.length; i += 1) {
      const a = this.formations[i];
      if (a.aliveCount() === 0 || !this.isSeparationMode(a.mode)) continue;
      for (let j = i + 1; j < this.formations.length; j += 1) {
        const b = this.formations[j];
        if (b.team !== a.team || b.aliveCount() === 0 || !this.isSeparationMode(b.mode)) continue;
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
      const distance = this.distance(candidate.center, formation.center);
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
    formation.weapon = 'musket';
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

  private spawnAxeStrikes(formation: Formation, banner: Banner, count: number): void {
    const alive = formation.aliveSoldiers().slice(0, count);
    for (let i = 0; i < alive.length; i += 1) {
      const soldier = alive[i];
      this.axeStrikes.push({
        start: { ...soldier.position },
        end: {
          x: banner.position.x + (Math.random() - 0.5) * 24,
          y: banner.position.y + 5 + (Math.random() - 0.5) * 38,
        },
        team: formation.team,
        life: GAME_CONFIG.effects.axeStrikeLifetime,
      });
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

    for (const strike of this.axeStrikes) strike.life -= dt;
    for (let i = this.axeStrikes.length - 1; i >= 0; i -= 1) {
      if (this.axeStrikes[i].life <= 0) this.axeStrikes.splice(i, 1);
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
    if (this.blueBanner.destroyed) {
      this.winner = 'red';
      this.setNotice('BLUE BANNER HAS FALLEN', 'warning', 6);
    } else if (this.redBanner.destroyed) {
      this.winner = 'blue';
      this.setNotice('RED BANNER HAS FALLEN', 'success', 6);
    }
  }

  private updateUiTimers(rawDt: number): void {
    this.noticeTimer = Math.max(0, this.noticeTimer - rawDt);
    this.hintTimer = Math.max(0, this.hintTimer - rawDt);
  }

  private setNotice(text: string, kind: NoticeKind, seconds: number): void {
    this.noticeText = text;
    this.noticeKind = kind;
    this.noticeTimer = seconds;
  }

  private setHint(text: string, seconds: number): void {
    this.contextualHint = text;
    this.hintTimer = seconds;
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

  private bannerFor(team: Team): Banner {
    return team === 'blue' ? this.blueBanner : this.redBanner;
  }

  private teamIndexOf(formation: Formation): number {
    const prefix = formation.team === 'blue' ? 'B' : 'R';
    return Math.max(0, Number.parseInt(formation.id.replace(prefix, ''), 10) - 1);
  }

  private playerCameraTarget(): Vec2 {
    if (this.playerFormation.aliveCount() > 0) return this.playerFormation.center;
    return this.spawnFor('blue', GAME_CONFIG.army.playerSquadIndex);
  }

  private distanceToPlayer(point: Vec2): number {
    return this.distance(point, this.playerFormation.center);
  }

  private distance(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private angleTo(from: Vec2, to: Vec2): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  private enemyDirectionPoint(team: Team): Vec2 {
    return team === 'blue' ? this.redBanner.position : this.blueBanner.position;
  }

  private minimapWorldPoint(point: Vec2): Vec2 | null {
    const x = GAME_CONFIG.viewport.width - GAME_CONFIG.minimap.width - GAME_CONFIG.minimap.margin;
    const y = GAME_CONFIG.viewport.height - GAME_CONFIG.minimap.height - GAME_CONFIG.minimap.margin;
    if (
      point.x < x || point.x > x + GAME_CONFIG.minimap.width
      || point.y < y || point.y > y + GAME_CONFIG.minimap.height
    ) return null;
    return {
      x: ((point.x - x) / GAME_CONFIG.minimap.width) * GAME_CONFIG.world.width,
      y: ((point.y - y) / GAME_CONFIG.minimap.height) * GAME_CONFIG.world.height,
    };
  }

  private isSeparationMode(mode: FormationMode): boolean {
    return mode === 'line' || mode === 'reforming' || mode === 'bannerAttack';
  }

  private cancelChargeAim(): void {
    this.chargeAiming = false;
    this.chargeAimTarget = null;
  }

  private lerpPoint(a: Vec2, b: Vec2, t: number): Vec2 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private smoothstep(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }
}
