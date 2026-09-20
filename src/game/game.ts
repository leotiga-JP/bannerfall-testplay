import { Banner } from '../entities/banner';
import { Formation, type FormationMode } from '../entities/formation';
import type { InputManager } from '../input/inputManager';
import { BattleAiSystem } from '../systems/aiSystem';
import {
  type CorpseParticle,
  type MuzzleFlash,
  type SmokeParticle,
  fireVolley,
  updateProjectiles,
} from '../systems/combatSystem';
import { type ArtilleryExplosion, createArtilleryShell, updateArtilleryShells } from '../systems/artillerySystem';
import { MeleeSystem, type MeleeStrike } from '../systems/meleeSystem';
import { Camera } from './camera';
import { GAME_CONFIG } from './config';
import type { SquadClass, Team, Vec2, WeaponType } from './types';
import { ArtilleryShell } from '../entities/artilleryShell';
import { Projectile } from '../entities/projectile';
import type { BattleNetSnapshot, ContinuousControl, PlayerAction } from '../network/protocol';


export interface GameOptions {
  squadsPerTeam?: number;
  blueSquads?: number;
  redSquads?: number;
  respawnSeconds?: number;
  localFormationId?: string;
  humanFormationIds?: string[];
  introEnabled?: boolean;
}

export interface AxeStrike {
  start: Vec2;
  end: Vec2;
  team: Team;
  life: number;
}

export type NoticeKind = 'info' | 'warning' | 'success';
export type IntroStage = 'own-banner' | 'pan-enemy' | 'enemy-banner' | 'return-player' | 'done';

export interface ClassCounts {
  infantry: number;
  cavalry: number;
  artillery: number;
}

export interface GameSnapshot {
  time: number;
  paused: boolean;
  winner: Team | null;
  timeScale: number;
  debugAi: boolean;
  chargeAiming: boolean;
  chargeAimTarget: Vec2 | null;
  playerMode: FormationMode;
  playerClass: SquadClass;
  playerNextClass: SquadClass;
  playerRecommendedClass: SquadClass;
  playerAlive: number;
  playerMaxSoldiers: number;
  playerReload: number;
  playerReloadProgress: number;
  playerRespawn: number | null;
  playerArtilleryDeployed: boolean;
  playerArtilleryDeployProgress: number;
  selectedWeapon: WeaponType;
  playerBannerTargetTeam: Team | null;
  playerBannerInRange: boolean;
  blueSquads: number;
  redSquads: number;
  blueSoldiers: number;
  redSoldiers: number;
  blueClasses: ClassCounts;
  redClasses: ClassCounts;
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

interface NetworkSoldierTarget {
  x: number;
  y: number;
  direction: number;
}

interface NetworkFormationTarget {
  x: number;
  y: number;
  direction: number;
  soldiers: NetworkSoldierTarget[];
}

export class Game {
  readonly formations: Formation[];
  readonly playerFormation: Formation;
  readonly blueSquads: number;
  readonly redSquads: number;
  readonly respawnSeconds: number;
  readonly humanFormationIds: Set<string>;
  readonly banners: Banner[];
  readonly camera: Camera;
  readonly projectiles: Projectile[] = [];
  readonly smoke: SmokeParticle[] = [];
  readonly muzzleFlashes: MuzzleFlash[] = [];
  readonly corpses: CorpseParticle[] = [];
  readonly meleeStrikes: MeleeStrike[] = [];
  readonly axeStrikes: AxeStrike[] = [];
  readonly artilleryShells: ArtilleryShell[] = [];
  readonly artilleryExplosions: ArtilleryExplosion[] = [];

  private readonly aiSystem = new BattleAiSystem();
  private readonly meleeSystem = new MeleeSystem();
  private readonly meleeQuietTimers = new Map<string, number>();
  private readonly respawnTimers = new Map<string, number>();
  private readonly plannedRespawnClasses = new Map<string, SquadClass>();
  private readonly remoteControls = new Map<string, ContinuousControl>();
  private readonly humanWeapons = new Map<string, WeaponType>();
  private networkSnapshotSeq = 0;
  private readonly networkTargets = new Map<string, NetworkFormationTarget>();
  private hasNetworkSnapshot = false;
  private time = 0;
  private paused = false;
  private winner: Team | null = null;
  private screenShake = 0;
  private chargeAiming = false;
  private chargeAimTarget: Vec2 | null = null;
  private timeScale = 1;
  private debugAi = false;
  private selectedWeapon: WeaponType = 'musket';
  private nextPlayerClass: SquadClass = 'infantry';
  private introElapsed = 0;
  private introActive = true;
  private introStage: IntroStage = 'own-banner';
  private introProgress = 0;
  private noticeText = '';
  private noticeKind: NoticeKind = 'info';
  private noticeTimer = 0;
  private contextualHint = '';
  private hintTimer = 0;

  constructor(private readonly input: InputManager, options: GameOptions = {}) {
    const legacyCount = options.squadsPerTeam ?? GAME_CONFIG.army.squadsPerTeam;
    this.blueSquads = Math.max(1, Math.min(50, Math.floor(options.blueSquads ?? legacyCount)));
    this.redSquads = Math.max(1, Math.min(50, Math.floor(options.redSquads ?? legacyCount)));
    this.respawnSeconds = Math.max(5, Math.min(60, options.respawnSeconds ?? GAME_CONFIG.army.respawnSeconds));
    const defaultLocal = `B${String(Math.min(this.blueSquads, GAME_CONFIG.army.playerSquadIndex + 1)).padStart(2, '0')}`;
    const localFormationId = options.localFormationId ?? defaultLocal;
    this.humanFormationIds = new Set(options.humanFormationIds ?? [localFormationId]);
    this.humanFormationIds.add(localFormationId);
    this.formations = this.createArmies();
    const player = this.formations.find((formation) => formation.id === localFormationId) ?? this.formations[0];
    if (!player) throw new Error('Player formation was not created.');
    this.playerFormation = player;
    this.banners = [
      new Banner('blue', { x: GAME_CONFIG.banner.blueX, y: GAME_CONFIG.banner.y }),
      new Banner('red', { x: GAME_CONFIG.banner.redX, y: GAME_CONFIG.banner.y }),
    ];
    this.camera = new Camera(this.blueBanner.position);
    this.introActive = options.introEnabled ?? true;
    if (this.introActive) this.camera.setCinematic(this.blueBanner.position, 0.76);
    else { this.introStage = 'done'; this.introProgress = 1; this.camera.centerOn(this.playerFormation.center); }
    for (const formation of this.formations) {
      formation.isPlayerControlled = this.humanFormationIds.has(formation.id);
      if (formation.isPlayerControlled) this.humanWeapons.set(formation.id, formation.weapon);
    }
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
      const teamIndex = this.teamIndexOf(formation);
      const squadClass = this.initialClassFor(teamIndex, this.squadCountFor(formation.team));
      const spawn = this.initialSpawnFor(formation.team, teamIndex);
      formation.reset(spawn, formation.team === 'blue' ? 0 : Math.PI, squadClass);
      formation.spawnProtectionTimer = 0;
    }
    for (const banner of this.banners) banner.reset();
    this.projectiles.length = 0;
    this.artilleryShells.length = 0;
    this.artilleryExplosions.length = 0;
    this.smoke.length = 0;
    this.muzzleFlashes.length = 0;
    this.corpses.length = 0;
    this.meleeStrikes.length = 0;
    this.axeStrikes.length = 0;
    this.meleeQuietTimers.clear();
    this.respawnTimers.clear();
    this.plannedRespawnClasses.clear();
    this.time = 0;
    this.paused = false;
    this.winner = null;
    this.screenShake = 0;
    this.chargeAiming = false;
    this.chargeAimTarget = null;
    this.timeScale = 1;
    this.selectedWeapon = 'musket';
    this.nextPlayerClass = 'infantry';
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

    if (this.playerFormation.aliveCount() === 0) {
      const classChoice = this.input.consumeClassSelection();
      if (classChoice) {
        this.nextPlayerClass = classChoice;
        this.plannedRespawnClasses.set(this.playerFormation.id, classChoice);
        this.setHint(`NEXT CLASS — ${this.classLabel(classChoice)}`, 2);
      }
    } else if (this.playerFormation.squadClass === 'infantry') {
      const weapon = this.input.consumeWeaponSelection();
      if (weapon) this.selectPlayerWeapon(weapon);
    } else {
      this.input.consumeWeaponSelection();
    }

    this.updatePlayerControl(dt, clickConsumedByMap ? null : primaryClick);
    this.applyRemoteControls(dt);
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
    const artilleryImpact = updateArtilleryShells(
      this.artilleryShells,
      this.formations,
      dt,
      this.artilleryExplosions,
      (position, team, impactDirection) => this.spawnCorpse(position, team, impactDirection),
    );
    if (artilleryImpact && this.artilleryExplosions.some((explosion) => this.distanceToPlayer(explosion.position) < 900)) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.artilleryShake);
    }

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
    const playerRecommendedClass = this.aiSystem.recommendClass(
      this.playerFormation.team,
      this.formations,
      this.banners,
      this.plannedRespawnClasses,
    );

    return {
      time: this.time,
      paused: this.paused,
      winner: this.winner,
      timeScale: this.timeScale,
      debugAi: this.debugAi,
      chargeAiming: this.chargeAiming,
      chargeAimTarget: this.chargeAimTarget ? { ...this.chargeAimTarget } : null,
      playerMode: this.playerFormation.mode,
      playerClass: this.playerFormation.squadClass,
      playerNextClass: this.nextPlayerClass,
      playerRecommendedClass,
      playerAlive: this.playerFormation.aliveCount(),
      playerMaxSoldiers: this.playerFormation.maxSoldiers(),
      playerReload: this.playerFormation.reloadTimer,
      playerReloadProgress: this.playerFormation.reloadProgress(),
      playerRespawn,
      playerArtilleryDeployed: this.playerFormation.artilleryDeployed,
      playerArtilleryDeployProgress: this.playerFormation.squadClass === 'artillery'
        ? Math.min(1, this.playerFormation.artilleryDeployTimer / GAME_CONFIG.artillery.deploySeconds)
        : 0,
      selectedWeapon: this.selectedWeapon,
      playerBannerTargetTeam: playerTarget,
      playerBannerInRange,
      blueSquads: this.aliveSquads('blue'),
      redSquads: this.aliveSquads('red'),
      blueSoldiers: this.aliveSoldiers('blue'),
      redSoldiers: this.aliveSoldiers('red'),
      blueClasses: this.classCounts('blue'),
      redClasses: this.classCounts('red'),
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

  createNetworkSnapshot(): BattleNetSnapshot {
    const formations = this.formations.map((formation) => ({
      id: formation.id,
      team: formation.team,
      x: formation.center.x,
      y: formation.center.y,
      direction: formation.direction,
      squadClass: formation.squadClass,
      mode: formation.mode,
      weapon: formation.weapon,
      reloadTimer: formation.reloadTimer,
      reloadDuration: formation.reloadDuration,
      spawnProtectionTimer: formation.spawnProtectionTimer,
      artilleryDeployTimer: formation.artilleryDeployTimer,
      artilleryDeployed: formation.artilleryDeployed,
      chargeMomentum: formation.chargeMomentum,
      bannerTargetTeam: formation.bannerTargetTeam,
      respawnRemaining: this.respawnTimers.get(formation.id) ?? null,
      plannedClass: this.plannedRespawnClasses.get(formation.id) ?? null,
      soldiers: formation.soldiers.map((soldier) => ({
        x: soldier.position.x,
        y: soldier.position.y,
        hp: soldier.hp,
        dead: soldier.dead,
        direction: soldier.direction,
        hit: soldier.hitFlashTimer,
        stab: soldier.meleeStabTimer,
      })),
    }));
    return {
      seq: ++this.networkSnapshotSeq,
      time: this.time,
      winner: this.winner,
      blueBannerHp: this.blueBanner.hp,
      redBannerHp: this.redBanner.hp,
      blueBannerUnderAttack: this.blueBanner.underAttackTimer,
      redBannerUnderAttack: this.redBanner.underAttackTimer,
      formations,
      projectiles: this.projectiles.map((projectile) => ({
        team: projectile.team,
        x: projectile.position.x,
        y: projectile.position.y,
        vx: projectile.velocity.x,
        vy: projectile.velocity.y,
        life: projectile.life,
        damage: projectile.damage,
      })),
      shells: this.artilleryShells.map((shell) => ({
        team: shell.team,
        x: shell.position.x,
        y: shell.position.y,
        targetX: shell.target.x,
        targetY: shell.target.y,
        vx: shell.velocity.x,
        vy: shell.velocity.y,
        active: shell.active,
      })),
    };
  }

  applyNetworkSnapshot(snapshot: BattleNetSnapshot): void {
    if (snapshot.seq < this.networkSnapshotSeq) return;
    this.networkSnapshotSeq = snapshot.seq;
    this.time = snapshot.time;
    this.winner = snapshot.winner;
    this.blueBanner.hp = snapshot.blueBannerHp;
    this.redBanner.hp = snapshot.redBannerHp;
    this.blueBanner.underAttackTimer = snapshot.blueBannerUnderAttack;
    this.redBanner.underAttackTimer = snapshot.redBannerUnderAttack;

    const firstSnapshot = !this.hasNetworkSnapshot;
    const teleportDistance = 520;

    for (const net of snapshot.formations) {
      const formation = this.formations.find((candidate) => candidate.id === net.id);
      if (!formation) continue;

      const classChanged = formation.squadClass !== net.squadClass || formation.soldiers.length !== net.soldiers.length;
      if (classChanged) formation.setClass(net.squadClass);

      const distanceToAuthoritative = Math.hypot(formation.center.x - net.x, formation.center.y - net.y);
      const snapImmediately = firstSnapshot || classChanged || distanceToAuthoritative >= teleportDistance;

      formation.mode = net.mode;
      formation.weapon = net.weapon;
      formation.reloadTimer = net.reloadTimer;
      formation.reloadDuration = net.reloadDuration;
      formation.spawnProtectionTimer = net.spawnProtectionTimer;
      formation.artilleryDeployTimer = net.artilleryDeployTimer;
      formation.artilleryDeployed = net.artilleryDeployed;
      formation.chargeMomentum = net.chargeMomentum;
      formation.bannerTargetTeam = net.bannerTargetTeam;
      if (net.respawnRemaining === null) this.respawnTimers.delete(formation.id);
      else this.respawnTimers.set(formation.id, net.respawnRemaining);
      if (net.plannedClass === null) this.plannedRespawnClasses.delete(formation.id);
      else this.plannedRespawnClasses.set(formation.id, net.plannedClass);

      const soldiers: NetworkSoldierTarget[] = [];
      for (let i = 0; i < formation.soldiers.length; i += 1) {
        const soldier = formation.soldiers[i];
        const state = net.soldiers[i];
        if (!state) continue;
        soldier.hp = state.hp;
        soldier.dead = state.dead;
        soldier.hitFlashTimer = state.hit;
        soldier.meleeStabTimer = state.stab;
        soldiers.push({ x: state.x, y: state.y, direction: state.direction });
        if (snapImmediately) {
          soldier.position.x = state.x;
          soldier.position.y = state.y;
          soldier.direction = state.direction;
        }
      }

      if (snapImmediately) {
        formation.center.x = net.x;
        formation.center.y = net.y;
        formation.direction = net.direction;
      }

      this.networkTargets.set(formation.id, {
        x: net.x,
        y: net.y,
        direction: net.direction,
        soldiers,
      });
    }

    this.hasNetworkSnapshot = true;

    // Projectiles are short lived. They still use authoritative snapshots, while
    // formations/soldiers are visually reconciled over several render frames.
    this.projectiles.length = 0;
    for (const net of snapshot.projectiles) {
      this.projectiles.push(new Projectile(net.team, { x: net.x, y: net.y }, { x: net.vx, y: net.vy }, net.life, net.damage));
    }
    this.artilleryShells.length = 0;
    for (const net of snapshot.shells) {
      const speed = Math.hypot(net.vx, net.vy);
      const shell = new ArtilleryShell(net.team, { x: net.x, y: net.y }, { x: net.targetX, y: net.targetY }, speed);
      shell.active = net.active;
      this.artilleryShells.push(shell);
    }
  }

  smoothNetworkState(dt: number): void {
    if (!this.hasNetworkSnapshot || dt <= 0) return;

    // Exponential reconciliation keeps the 10 Hz authoritative snapshots from
    // appearing as 10 visible teleports per second on a 60+ Hz display.
    const remoteBlend = 1 - Math.exp(-16 * dt);
    const localBlend = 1 - Math.exp(-8 * dt);
    const soldierBlend = 1 - Math.exp(-20 * dt);

    for (const formation of this.formations) {
      const target = this.networkTargets.get(formation.id);
      if (!target) continue;
      const blend = formation === this.playerFormation ? localBlend : remoteBlend;
      formation.center.x += (target.x - formation.center.x) * blend;
      formation.center.y += (target.y - formation.center.y) * blend;
      formation.direction = this.lerpAngle(formation.direction, target.direction, blend);

      const count = Math.min(formation.soldiers.length, target.soldiers.length);
      for (let i = 0; i < count; i += 1) {
        const soldier = formation.soldiers[i];
        const state = target.soldiers[i];
        soldier.position.x += (state.x - soldier.position.x) * soldierBlend;
        soldier.position.y += (state.y - soldier.position.y) * soldierBlend;
        soldier.direction = this.lerpAngle(soldier.direction, state.direction, soldierBlend);
      }
    }
  }

  private lerpAngle(from: number, to: number, amount: number): number {
    let delta = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * amount;
  }

  private createArmies(): Formation[] {
    const formations: Formation[] = [];
    for (const team of ['blue', 'red'] as const) {
      const count = this.squadCountFor(team);
      for (let i = 0; i < count; i += 1) {
        const id = `${team === 'blue' ? 'B' : 'R'}${String(i + 1).padStart(2, '0')}`;
        const isPlayer = this.humanFormationIds.has(id);
        const squadClass = this.initialClassFor(i, count);
        formations.push(new Formation(
          id,
          team,
          this.initialSpawnFor(team, i),
          team === 'blue' ? 0 : Math.PI,
          isPlayer,
          squadClass,
        ));
      }
    }
    return formations;
  }

  private initialClassFor(index: number, count: number): SquadClass {
    const ratio = (index + 0.5) / count;
    if (ratio < 0.70) return 'infantry';
    if (ratio < 0.90) return 'cavalry';
    return 'artillery';
  }

  private formationGrid(index: number, count: number, rear: boolean): Vec2 {
    const columns = count <= 20 ? Math.min(4, count) : count <= 35 ? 5 : 6;
    const rows = Math.ceil(count / columns);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const yMin = rear ? 500 : 520;
    const yMax = rear ? GAME_CONFIG.world.height - 500 : GAME_CONFIG.world.height - 520;
    const y = rows <= 1 ? GAME_CONFIG.world.height / 2 : yMin + (row / (rows - 1)) * (yMax - yMin);
    const xBase = rear ? GAME_CONFIG.army.respawnX : GAME_CONFIG.army.initialSpawnX;
    const gap = rear ? GAME_CONFIG.army.respawnColumnGap : GAME_CONFIG.army.initialColumnGap;
    return { x: xBase + column * gap, y };
  }

  private initialSpawnFor(team: Team, index: number): Vec2 {
    const point = this.formationGrid(index, this.squadCountFor(team), false);
    return { x: team === 'blue' ? point.x : GAME_CONFIG.world.width - point.x, y: point.y };
  }

  private respawnFor(team: Team, index: number): Vec2 {
    const point = this.formationGrid(index, this.squadCountFor(team), true);
    return { x: team === 'blue' ? point.x : GAME_CONFIG.world.width - point.x, y: point.y };
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
    this.setHint('歩兵: 1 MUSKET · 2 BAYONET · 3 AXE / 騎兵: 右クリック突撃 / 砲兵: 停止して展開→左クリック砲撃', 7);
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
      formation.weapon = formation.squadClass === 'infantry' ? this.selectedWeapon : 'bayonet';
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

    formation.direction = Math.atan2(pointer.y - formation.center.y, pointer.x - formation.center.x);

    if (formation.squadClass === 'artillery') {
      this.cancelChargeAim();
      this.movePlayerFormation(dt);
      if (primaryClick) {
        if (!formation.artilleryDeployed) {
          this.setHint('ARTILLERY — 停止して展開完了を待つ', 2.2);
        } else if (formation.reloadTimer > 0) {
          this.setHint(`CANNON RELOAD ${formation.reloadTimer.toFixed(1)}s`, 1.4);
        } else {
          this.performArtilleryShot(formation, pointer, GAME_CONFIG.artillery.playerReloadSeconds);
        }
      }
      return;
    }

    if (formation.squadClass === 'cavalry') {
      formation.weapon = 'bayonet';
      if (this.input.consumeChargeStart()) {
        this.chargeAiming = true;
        this.chargeAimTarget = this.computeChargeTarget(formation, pointer);
      }
      if (this.chargeAiming) {
        this.chargeAimTarget = this.computeChargeTarget(formation, pointer);
        if (!this.input.isChargeHeld() && this.input.consumeChargeRelease()) {
          const target = this.chargeAimTarget;
          this.cancelChargeAim();
          if (target && formation.beginCharge(target)) {
            this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.cavalryChargeShake);
            return;
          }
        }
      } else {
        this.movePlayerFormation(dt);
      }
      if (primaryClick) this.setHint('CAVALRY — 射撃不可。右クリック / Spaceで長距離突撃', 2.4);
      return;
    }

    formation.weapon = this.selectedWeapon;
    if (this.selectedWeapon === 'bayonet') {
      if (this.input.consumeChargeStart()) {
        this.chargeAiming = true;
        this.chargeAimTarget = this.computeChargeTarget(formation, pointer);
      }
      if (this.chargeAiming) {
        this.chargeAimTarget = this.computeChargeTarget(formation, pointer);
        if (!this.input.isChargeHeld() && this.input.consumeChargeRelease()) {
          const target = this.chargeAimTarget;
          this.cancelChargeAim();
          if (target && formation.beginCharge(target)) {
            this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.chargeShake);
            return;
          }
        }
      }
    } else this.cancelChargeAim();

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

  releaseHumanFormation(formationId: string): void {
    this.humanFormationIds.delete(formationId);
    this.remoteControls.delete(formationId);
    this.humanWeapons.delete(formationId);
    const formation = this.formations.find((candidate) => candidate.id === formationId);
    if (formation) formation.isPlayerControlled = false;
    this.aiSystem.reset(this.formations);
  }

  setRemoteControl(control: ContinuousControl): void {
    if (!this.humanFormationIds.has(control.formationId)) return;
    this.remoteControls.set(control.formationId, control);
    this.humanWeapons.set(control.formationId, control.weapon);
  }

  clearRemoteControl(formationId: string): void {
    this.remoteControls.delete(formationId);
  }

  applyRemoteAction(action: PlayerAction): void {
    const formation = this.formations.find((candidate) => candidate.id === action.formationId);
    if (!formation || !formation.isPlayerControlled) return;

    if (action.type === 'class') {
      this.plannedRespawnClasses.set(formation.id, action.squadClass);
      return;
    }
    if (formation.aliveCount() === 0 || this.winner) return;

    if (action.type === 'weapon') {
      if (formation.squadClass !== 'infantry') return;
      this.humanWeapons.set(formation.id, action.weapon);
      if (formation.mode === 'bannerAttack' && action.weapon !== 'axe') formation.cancelBannerAttack();
      if (formation.mode === 'line' || formation.mode === 'reforming') formation.weapon = action.weapon;
      return;
    }
    if (action.type === 'reform') {
      if (formation.mode === 'charging' || formation.mode === 'melee') {
        const target = this.nearestEnemyFormation(formation);
        if (target) this.orderBreakOff(formation, target);
        return;
      }
      if (formation.mode === 'bannerAttack') formation.cancelBannerAttack();
      const target = this.nearestEnemyFormation(formation);
      const direction = target
        ? Math.atan2(target.center.y - formation.center.y, target.center.x - formation.center.x)
        : formation.direction;
      formation.beginReform(direction, undefined, GAME_CONFIG.reform.reloadPenalty);
      return;
    }
    if (formation.mode !== 'line') return;

    if (action.type === 'fire') {
      if (formation.squadClass === 'artillery') {
        this.performArtilleryShot(formation, action.target, GAME_CONFIG.artillery.playerReloadSeconds);
      } else if (formation.squadClass === 'infantry' && this.weaponForFormation(formation) === 'musket' && formation.canVolley()) {
        this.performVolley(formation, GAME_CONFIG.musket.playerReloadSeconds);
      }
      return;
    }
    if (action.type === 'charge') {
      if (formation.squadClass === 'artillery') return;
      if (formation.squadClass === 'infantry' && this.weaponForFormation(formation) !== 'bayonet') return;
      const target = this.clampChargeTarget(formation, action.target);
      formation.beginCharge(target);
      return;
    }
    if (action.type === 'banner-attack') {
      if (formation.squadClass !== 'infantry' || this.weaponForFormation(formation) !== 'axe') return;
      const banner = this.bannerFor(action.targetTeam);
      formation.beginBannerAttack(banner.team, banner.position);
    }
  }

  private applyRemoteControls(dt: number): void {
    for (const [formationId, control] of this.remoteControls) {
      const formation = this.formations.find((candidate) => candidate.id === formationId);
      if (!formation || !formation.isPlayerControlled || formation.aliveCount() === 0) continue;
      if (formation.mode !== 'line') continue;
      formation.direction = Math.atan2(control.aim.y - formation.center.y, control.aim.x - formation.center.x);
      if (formation.squadClass === 'infantry') formation.weapon = this.weaponForFormation(formation);
      else formation.weapon = 'bayonet';
      const length = Math.hypot(control.moveX, control.moveY);
      if (length > 0.001) {
        const speed = formation.movementSpeed(true) * dt;
        formation.center.x += (control.moveX / length) * speed;
        formation.center.y += (control.moveY / length) * speed;
        formation.markMoved();
        this.clampFormationCenter(formation);
      }
    }
  }

  private weaponForFormation(formation: Formation): WeaponType {
    return this.humanWeapons.get(formation.id) ?? (formation === this.playerFormation ? this.selectedWeapon : formation.weapon);
  }

  private selectPlayerWeapon(weapon: WeaponType): void {
    if (this.playerFormation.squadClass !== 'infantry') return;
    this.selectedWeapon = weapon;
    this.humanWeapons.set(this.playerFormation.id, weapon);
    if (this.playerFormation.aliveCount() === 0) return;
    if (this.playerFormation.mode === 'bannerAttack' && weapon !== 'axe') this.playerFormation.cancelBannerAttack();
    if (this.playerFormation.mode === 'line' || this.playerFormation.mode === 'reforming') this.playerFormation.weapon = weapon;
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

      if (command.faceAngle !== null && formation.mode === 'line') formation.direction = command.faceAngle;

      if (command.bannerAttackTarget && formation.mode === 'line') {
        formation.beginBannerAttack(command.bannerAttackTarget.team, command.bannerAttackTarget.position);
        continue;
      }

      if (command.reform && formation.mode === 'line') {
        formation.weapon = formation.squadClass === 'infantry' ? 'musket' : 'bayonet';
        formation.beginReform(command.faceAngle ?? formation.direction, undefined, GAME_CONFIG.reform.reloadPenalty);
        continue;
      }

      if (command.breakOffTarget) {
        this.orderBreakOff(formation, command.breakOffTarget);
        continue;
      }

      if (command.volley && formation.mode === 'line' && formation.canVolley()) {
        formation.weapon = 'musket';
        const reload = GAME_CONFIG.musket.aiReloadMin
          + Math.random() * (GAME_CONFIG.musket.aiReloadMax - GAME_CONFIG.musket.aiReloadMin);
        this.performVolley(formation, reload);
      }

      if (command.artilleryTarget && formation.mode === 'line' && formation.canArtilleryFire()) {
        const reload = GAME_CONFIG.artillery.aiReloadMin
          + Math.random() * (GAME_CONFIG.artillery.aiReloadMax - GAME_CONFIG.artillery.aiReloadMin);
        this.performArtilleryShot(formation, command.artilleryTarget, reload);
        continue;
      }

      if (command.chargeTarget && formation.mode === 'line') {
        const target = this.clampChargeTarget(formation, command.chargeTarget);
        formation.beginCharge(target);
        continue;
      }

      if (formation.mode === 'line') {
        if (formation.squadClass === 'infantry') formation.weapon = 'musket';
        else formation.weapon = 'bayonet';
        const length = Math.hypot(command.move.x, command.move.y);
        if (length > 0.001) {
          const speed = formation.movementSpeed(false, formation.debugIntent === 'RETREAT');
          formation.center.x += (command.move.x / length) * speed * dt;
          formation.center.y += (command.move.y / length) * speed * dt;
          formation.markMoved();
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
      const speed = this.playerFormation.movementSpeed(true) * dt;
      this.playerFormation.center.x += (x / length) * speed;
      this.playerFormation.center.y += (y / length) * speed;
      this.playerFormation.markMoved();
      this.clampFormationCenter(this.playerFormation);
    }
  }

  private updateCharges(dt: number): void {
    for (const charger of this.formations) {
      if (charger.mode !== 'charging' || charger.aliveCount() === 0) continue;
      const reached = charger.advanceCharge(dt);
      this.clampFormationCenter(charger);
      const enemies = this.formations.filter((formation) => formation.team !== charger.team && formation.aliveCount() > 0);

      if (charger.squadClass === 'cavalry') {
        this.resolveCavalryRoadkill(charger, enemies);
        if (charger.chargeMomentum <= GAME_CONFIG.cavalry.minMomentum || reached) {
          const nearby = this.meleeSystem.hasNearbyEnemy(charger, enemies, GAME_CONFIG.melee.acquireRange + 40);
          if (nearby) charger.enterMelee();
          else charger.beginReform(charger.direction, this.clampFormationPoint(charger.center), GAME_CONFIG.charge.postChargeReloadPenalty);
        }
        continue;
      }

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
        if (nearby) charger.enterMelee();
        else charger.beginReform(charger.direction, this.clampFormationPoint(charger.center), GAME_CONFIG.charge.postChargeReloadPenalty);
      }
    }
  }

  private resolveCavalryRoadkill(charger: Formation, enemies: Formation[]): void {
    const radiusSq = GAME_CONFIG.cavalry.roadkillRadius * GAME_CONFIG.cavalry.roadkillRadius;
    let hitSomething = false;
    const cavalryAlive = charger.aliveSoldiers();
    const riderPositions = cavalryAlive.map((_, index) => charger.slotPosition(index, cavalryAlive.length));
    for (const enemy of enemies) {
      if (enemy.spawnProtectionTimer > 0) continue;
      for (const target of enemy.aliveSoldiers()) {
        if (charger.chargeVictims.has(target.id)) continue;
        let collided = false;
        for (const rider of riderPositions) {
          const dx = target.position.x - rider.x;
          const dy = target.position.y - rider.y;
          if (dx * dx + dy * dy <= radiusSq) {
            collided = true;
            break;
          }
        }
        if (!collided) continue;
        charger.chargeVictims.add(target.id);
        const impact = { x: Math.cos(charger.direction), y: Math.sin(charger.direction) };
        const killed = target.takeDamage(GAME_CONFIG.cavalry.roadkillDamage * Math.max(0.55, charger.chargeMomentum));
        target.knockback.x += impact.x * 220;
        target.knockback.y += impact.y * 220;
        target.position.x += impact.x * 18;
        target.position.y += impact.y * 18;
        charger.chargeMomentum = Math.max(0, charger.chargeMomentum - GAME_CONFIG.cavalry.momentumPerHit);
        hitSomething = true;
        if (killed) this.spawnCorpse(target.position, target.team, impact);
      }
    }
    if (hitSomething && (charger.isPlayerControlled || this.distanceToPlayer(charger.center) < 760)) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.cavalryChargeShake);
    }
  }

  private updateBannerAttacks(dt: number): void {
    for (const formation of this.formations) {
      if (formation.mode !== 'bannerAttack' || formation.aliveCount() === 0 || !formation.bannerTargetTeam) continue;
      const banner = this.bannerFor(formation.bannerTargetTeam);
      if (banner.destroyed) {
        formation.weapon = formation.isPlayerControlled ? this.weaponForFormation(formation) : 'musket';
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
        formation.markMoved();
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
        this.plannedRespawnClasses.delete(formation.id);
        continue;
      }

      let remaining = this.respawnTimers.get(formation.id);
      if (remaining === undefined) {
        remaining = this.respawnSeconds;
        this.respawnTimers.set(formation.id, remaining);
        if (formation.isPlayerControlled) {
          const planned = this.plannedRespawnClasses.get(formation.id) ?? formation.squadClass;
          this.plannedRespawnClasses.set(formation.id, planned);
          if (formation === this.playerFormation) {
            this.cancelChargeAim();
            this.nextPlayerClass = planned;
            this.setNotice('YOUR SQUAD WAS WIPED — CHOOSE NEXT CLASS', 'warning', 4);
          }
        } else {
          const chosen = this.aiSystem.chooseRespawnClass(formation, this.formations, this.banners, this.plannedRespawnClasses);
          this.plannedRespawnClasses.set(formation.id, chosen);
        }
      }

      remaining -= dt;
      if (remaining > 0) {
        this.respawnTimers.set(formation.id, remaining);
        continue;
      }

      let chosenClass = this.plannedRespawnClasses.get(formation.id) ?? formation.squadClass;
      if (!formation.isPlayerControlled) {
        this.plannedRespawnClasses.delete(formation.id);
        chosenClass = this.aiSystem.chooseRespawnClass(formation, this.formations, this.banners, this.plannedRespawnClasses);
      }
      const index = this.teamIndexOf(formation);
      formation.reset(this.respawnFor(formation.team, index), formation.team === 'blue' ? 0 : Math.PI, chosenClass);
      this.respawnTimers.delete(formation.id);
      this.plannedRespawnClasses.delete(formation.id);
      if (formation.isPlayerControlled) {
        const nextWeapon: WeaponType = chosenClass === 'infantry' ? 'musket' : 'bayonet';
        this.humanWeapons.set(formation.id, nextWeapon);
        formation.weapon = nextWeapon;
        if (formation === this.playerFormation) {
          this.nextPlayerClass = chosenClass;
          this.selectedWeapon = nextWeapon;
          this.camera.centerOn(formation.center);
          this.setNotice(`${this.classLabel(chosenClass)} REDEPLOYED — REINFORCEMENT MARCH`, 'success', 3.2);
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
        formation.weapon = formation.squadClass === 'infantry'
          ? (formation.isPlayerControlled ? this.weaponForFormation(formation) : 'musket')
          : 'bayonet';
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
    formation.weapon = formation.squadClass === 'infantry'
      ? (formation.isPlayerControlled ? this.weaponForFormation(formation) : 'musket')
      : 'bayonet';
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

  private computeChargeTarget(formation: Formation, pointer: Vec2): Vec2 {
    return this.clampChargeTarget(formation, pointer);
  }

  private clampChargeTarget(formation: Formation, desired: Vec2): Vec2 {
    const origin = formation.center;
    const dx = desired.x - origin.x;
    const dy = desired.y - origin.y;
    const distance = Math.hypot(dx, dy) || 1;
    const maxDistance = formation.maxChargeDistance();
    const scale = distance > maxDistance ? maxDistance / distance : 1;
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

  private performArtilleryShot(formation: Formation, desiredTarget: Vec2, reloadSeconds: number): void {
    if (!formation.canArtilleryFire()) return;
    const dx = desiredTarget.x - formation.center.x;
    const dy = desiredTarget.y - formation.center.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > GAME_CONFIG.artillery.range) {
      if (formation === this.playerFormation) this.setHint('TARGET OUT OF ARTILLERY RANGE', 1.8);
      return;
    }
    if (distance < GAME_CONFIG.artillery.minRange) {
      if (formation === this.playerFormation) this.setHint('TARGET TOO CLOSE FOR CANNON', 1.8);
      return;
    }
    formation.direction = Math.atan2(dy, dx);
    this.artilleryShells.push(createArtilleryShell(formation, desiredTarget));
    formation.beginReload(reloadSeconds);
    this.smoke.push({
      position: {
        x: formation.center.x + Math.cos(formation.direction) * 42,
        y: formation.center.y + Math.sin(formation.direction) * 42,
      },
      velocity: { x: Math.cos(formation.direction) * 35, y: Math.sin(formation.direction) * 35 },
      age: 0,
      lifetime: GAME_CONFIG.effects.smokeLifetime * 1.7,
      size: 24,
    });
    if (formation.isPlayerControlled || this.distanceToPlayer(formation.center) < 900) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.artilleryShake * 0.7);
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

    for (const explosion of this.artilleryExplosions) explosion.life -= dt;
    for (let i = this.artilleryExplosions.length - 1; i >= 0; i -= 1) {
      if (this.artilleryExplosions[i].life <= 0) this.artilleryExplosions.splice(i, 1);
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

  private classCounts(team: Team): ClassCounts {
    const counts: ClassCounts = { infantry: 0, cavalry: 0, artillery: 0 };
    for (const formation of this.formations) {
      if (formation.team === team && formation.aliveCount() > 0) counts[formation.squadClass] += 1;
    }
    return counts;
  }

  private classLabel(squadClass: SquadClass): string {
    if (squadClass === 'cavalry') return 'CAVALRY';
    if (squadClass === 'artillery') return 'ARTILLERY';
    return 'LINE INFANTRY';
  }

  private bannerFor(team: Team): Banner {
    return team === 'blue' ? this.blueBanner : this.redBanner;
  }

  private squadCountFor(team: Team): number {
    return team === 'blue' ? this.blueSquads : this.redSquads;
  }

  private teamIndexOf(formation: Formation): number {
    const prefix = formation.team === 'blue' ? 'B' : 'R';
    return Math.max(0, Number.parseInt(formation.id.replace(prefix, ''), 10) - 1);
  }

  private playerCameraTarget(): Vec2 {
    if (this.playerFormation.aliveCount() > 0) return this.playerFormation.center;
    return this.respawnFor(this.playerFormation.team, this.teamIndexOf(this.playerFormation));
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
