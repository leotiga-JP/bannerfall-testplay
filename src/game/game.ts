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
import { type ArtilleryExplosion, createArtilleryShells, updateArtilleryShells } from '../systems/artillerySystem';
import { MeleeSystem, type MeleeStrike } from '../systems/meleeSystem';
import { Camera } from './camera';
import { GAME_CONFIG } from './config';
import { BATTLEFIELD_MAP, MAP_SITES } from './battlefieldMap';
import { minimapRect, type MinimapPosition } from './minimapLayout';
import { artilleryGunLocalOffset } from './formationSystem';
import { SQUAD_CLASSES, canBannerAttackClass, canVolleyClass, classLabel as squadClassLabel, formationShapeLabel, isArtilleryClass, isChargeCavalryClass, nextFormationShape, type FormationShape, type SquadClass, type Team, type Vec2, type WeaponType } from './types';
import { artilleryProfile, artilleryTargetDistance, artilleryTargetIssue, chargeProfile, fieldworkKitCapacity, volleyProfile, type ArtilleryTargetIssue } from './classProfiles';
import { ArtilleryShell } from '../entities/artilleryShell';
import { Projectile } from '../entities/projectile';
import { Fieldwork } from '../entities/fieldwork';
import { ConstructionBlock, CONSTRUCTION_DEFINITIONS, type ConstructionBlockKind } from '../entities/constructionBlock';
import { CONSTRUCTION_COSTS, CONSTRUCTION_MOVEMENT_PADDING, CONSTRUCTION_PLACE_RANGE, CONSTRUCTION_REBUILD_COOLDOWN_SECONDS, CONSTRUCTION_ROAD_SPEED_MULTIPLIER, constructionWorkSecondsForClass, constructionBlocksMovement, constructionCellCenter, constructionCellKey, pointInsideConstructionBlock, worldToConstructionCell, type ConstructionNetworkState, type ConstructionWorkNetState } from './constructionSystem';
import type { BattleNetSnapshot, BattlePresentationEvent, ContinuousControl, PlayerAction } from '../network/protocol';
import { gameModeRules, isGameMode, type GameMode, type GameModeCapabilities } from './gameMode';
import { RESOURCE_INTERACTION_RANGE, RESOURCE_LABELS, ResourceSystem, type ResourceNetworkState, type ResourceNodeState, type ResourceStockpile, type ResourceType } from './resourceSystem';
import { RecruitmentSystem, recruitmentCost, standardStrength, growthLimit, nextGrowthCapacity, capacityUpgradeCost, isRecruitableClass, RECRUITMENT_INTERACTION_RANGE, type BarracksState } from './recruitmentSystem';
import { ConquestSystem, type CapturePointState } from './conquestSystem';
import {
  armorDamageMultiplier,
  defaultUpgradeState,
  equipmentSummary,
  closestUpgradeFacility,
  nearestUpgradeFacility,
  tierForKind,
  upgradeCost,
  upgradeKindLabel,
  validUpgradeKinds,
  weaponTierMultipliers,
  withUpgradeTier,
  type EquipmentUpgradeKind,
  type FormationUpgradeState,
  type UpgradeFacilityState,
} from './upgradeSystem';

const AI_RECRUIT_TRIGGER_RATIO = 0.75;
const AI_RECRUIT_BATCH_SIZE = 5;
const AI_RECRUIT_THREAT_RANGE = 1100;
const AI_RECRUIT_RESOURCE_RESERVE = 0.25;
const AI_ECONOMY_WORKER_RATIO = 0.15;
const AI_ECONOMY_MAX_WORKERS = 3;
const AI_GROWTH_UPGRADE_COOLDOWN = 20;
const AI_EQUIPMENT_UPGRADE_COOLDOWN = 28;
const AI_EQUIPMENT_THREAT_RANGE = 1350;
const AI_ECONOMY_THREAT_RANGE = 900;
const AI_ECONOMY_ROLE_REFRESH_SECONDS = 1.0;

export interface GameOptions {
  squadsPerTeam?: number;
  blueSquads?: number;
  redSquads?: number;
  respawnSeconds?: number;
  conquestTickets?: number;
  gameMode?: GameMode;
  localFormationId?: string;
  humanFormationIds?: string[];
  introEnabled?: boolean;
  constructionEnabled?: boolean;
  initialClasses?: Record<string, SquadClass>;
  initialSpawnAreas?: Record<string, number>;
  // Multiplayer clients wait for the authoritative server snapshot before creating cannon shells.
  predictArtilleryShots?: boolean;
  // Authoritative server instances capture lightweight presentation events for clients.
  capturePresentationEvents?: boolean;
}

export interface AxeStrike {
  start: Vec2;
  end: Vec2;
  team: Team;
  life: number;
}

interface PendingConstructionWork {
  type: 'place' | 'dismantle';
  formationId: string;
  startedAt: number;
  completeAt: number;
  kind?: ConstructionBlockKind;
  target?: Vec2;
  direction?: number;
  blockId?: string;
}

export type NoticeKind = 'info' | 'warning' | 'success';
export type IntroStage = 'own-banner' | 'pan-enemy' | 'enemy-banner' | 'return-player' | 'done';

export type ClassCounts = Record<SquadClass, number>;

export interface FormationCombatStats {
  kills: number;
  losses: number;
  bannerDamage: number;
}

export interface GameSnapshot {
  time: number;
  paused: boolean;
  winner: Team | null;
  conquestEnabled: boolean;
  conquestInitialTickets: number;
  blueTickets: number;
  redTickets: number;
  capturePoints: CapturePointState[];
  playerReinforcementsExhausted: boolean;
  timeScale: number;
  debugAi: boolean;
  chargeAiming: boolean;
  chargeAimTarget: Vec2 | null;
  playerMode: FormationMode;
  playerClass: SquadClass;
  playerNextClass: SquadClass;
  playerNextSpawn: number;
  playerRecommendedClass: SquadClass;
  playerAlive: number;
  playerMaxSoldiers: number;
  playerMorale: number;
  playerKills: number;
  playerLosses: number;
  playerBannerDamage: number;
  resourcesEnabled: boolean;
  playerResourcesGathered: number;
  playerCombatLoot: number;
  playerResourceStockpile: ResourceStockpile;
  resourceGatheringLabel: string;
  resourceGatheringDetail: string;
  resourceGatheringProgress: number | null;
  recruitmentEnabled: boolean;
  playerNearBarracks: boolean;
  playerBarracksLabel: string;
  playerStarterStrength: number;
  playerGrowthLimit: number;
  playerNextGrowthCapacity: number | null;
  playerGrowthUpgradeWood: number;
  playerGrowthUpgradeIron: number;
  playerRecruitmentProgress: number | null;
  playerRecruitmentCount: number;
  equipmentEnabled: boolean;
  playerNearUpgradeFacility: boolean;
  playerUpgradeFacilityLabel: string;
  playerWeaponTier: number;
  playerArmorTier: number;
  playerArtilleryPerformanceTier: number;
  playerArtilleryBatteryTier: number;
  playerFormationShape: FormationShape;
  playerEquipmentSummary: string;
  playerWeaponUpgradeCost: ResourceStockpile;
  playerArmorUpgradeCost: ResourceStockpile;
  playerArtilleryPerformanceUpgradeCost: ResourceStockpile;
  playerArtilleryBatteryUpgradeCost: ResourceStockpile;
  playerReload: number;
  playerReloadProgress: number;
  playerRespawn: number | null;
  playerForcedMarch: boolean;
  playerFieldworkKits: number;
  playerGrenadeCooldown: number;
  playerBaseRecoveryRemaining: number | null;
  playerHasReservedClass: boolean;
  playerHasReservedSpawn: boolean;
  playerArtilleryDeployed: boolean;
  playerArtilleryDeployProgress: number;
  playerArtilleryRangeOrigin: Vec2 | null;
  playerArtilleryAimDistance: number | null;
  playerArtilleryAimIssue: ArtilleryTargetIssue;
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
  blueReinforcementWave: number;
  redReinforcementWave: number;
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
  playerConstructionWorkType: 'place' | 'dismantle' | null;
  playerConstructionWorkLabel: string;
  playerConstructionWorkProgress: number | null;
  playerConstructionWorkRemaining: number | null;
}

interface NetworkSoldierTarget {
  fromX: number;
  fromY: number;
  fromDirection: number;
  x: number;
  y: number;
  direction: number;
}

interface NetworkFormationTarget {
  fromX: number;
  fromY: number;
  fromDirection: number;
  x: number;
  y: number;
  direction: number;
  elapsed: number;
  duration: number;
  soldiers: NetworkSoldierTarget[];
}

export class Game {
  readonly gameMode: GameMode;
  readonly modeRules: Readonly<GameModeCapabilities>;
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
  readonly fieldworks: Fieldwork[] = [];
  readonly constructionBlocks: ConstructionBlock[] = [];
  readonly combatStats = new Map<string, FormationCombatStats>();
  readonly resourceSystem: ResourceSystem | null;
  readonly recruitmentSystem: RecruitmentSystem | null;
  readonly conquestSystem: ConquestSystem | null;

  private readonly initialClasses: Record<string, SquadClass>;
  private readonly initialSpawnAreas: Record<string, number>;
  private readonly aiSystem = new BattleAiSystem();
  private readonly meleeSystem = new MeleeSystem();
  private readonly meleeQuietTimers = new Map<string, number>();
  private readonly respawnTimers = new Map<string, number>();
  private readonly plannedRespawnClasses = new Map<string, SquadClass>();
  private readonly plannedRespawnAreas = new Map<string, number>();
  private readonly formationSpawnAreas = new Map<string, number>();
  private readonly respawnSerial = new Map<string, number>();
  private readonly baseRecoveryTimers = new Map<string, number>();
  private readonly fieldworkAxeReadyAt = new Map<string, number>();
  private readonly constructionAxeReadyAt = new Map<string, number>();
  private readonly constructionCooldowns = new Map<string, number>();
  private readonly pendingConstructionWork = new Map<string, PendingConstructionWork>();
  private readonly networkConstructionWork = new Map<string, ConstructionWorkNetState>();
  private aiConstructionTimer = 1.5;
  private constructionDirty = true;
  private readonly deferredRespawns = new Set<string>();
  private readonly conquestWipeCounted = new Set<string>();
  private readonly aiEconomicWorkers = new Set<string>();
  private readonly aiEconomicAssignments = new Map<string, ResourceType>();
  private readonly formationClassCapacities = new Map<string, Partial<Record<SquadClass, number>>>();
  private readonly formationClassUpgrades = new Map<string, Partial<Record<SquadClass, FormationUpgradeState>>>();
  private readonly aiGrowthCooldowns = new Map<string, number>();
  private readonly aiEquipmentCooldowns = new Map<string, number>();
  private readonly aiGrowthFillTargets = new Map<string, number>();
  private aiEconomicRoleTimer = 0;
  private reinforcementWaveRemaining: Record<Team, number>;
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
  private introElapsed = 0;
  private introActive = true;
  private introStage: IntroStage = 'own-banner';
  private introProgress = 0;
  private noticeText = '';
  private noticeKind: NoticeKind = 'info';
  private noticeTimer = 0;
  private contextualHint = '';
  private hintTimer = 0;
  private minimapPosition: MinimapPosition = 'bottom-right';
  private readonly predictArtilleryShots: boolean;
  private readonly capturePresentationEvents: boolean;
  private readonly introConfigured: boolean;
  readonly constructionEnabled: boolean;
  private readonly presentationEvents: BattlePresentationEvent[] = [];
  private lastNetworkSnapshotArrivedAt = 0;

  constructor(private readonly input: InputManager, options: GameOptions = {}) {
    this.gameMode = isGameMode(options.gameMode) ? options.gameMode : 'BATTLE';
    this.modeRules = gameModeRules(this.gameMode);
    this.resourceSystem = this.modeRules.resources ? new ResourceSystem() : null;
    this.recruitmentSystem = this.modeRules.recruitment && this.resourceSystem ? new RecruitmentSystem() : null;
    const legacyCount = options.squadsPerTeam ?? GAME_CONFIG.army.squadsPerTeam;
    this.blueSquads = Math.max(1, Math.min(50, Math.floor(options.blueSquads ?? legacyCount)));
    this.redSquads = Math.max(1, Math.min(50, Math.floor(options.redSquads ?? legacyCount)));
    this.conquestSystem = this.modeRules.conquest ? new ConquestSystem(this.blueSquads, this.redSquads, options.conquestTickets) : null;
    this.respawnSeconds = Math.max(5, Math.min(60, options.respawnSeconds ?? GAME_CONFIG.army.respawnSeconds));
    this.reinforcementWaveRemaining = { blue: this.respawnSeconds, red: this.respawnSeconds };
    const defaultLocal = `B${String(Math.min(this.blueSquads, GAME_CONFIG.army.playerSquadIndex + 1)).padStart(2, '0')}`;
    const localFormationId = options.localFormationId ?? defaultLocal;
    this.humanFormationIds = new Set(options.humanFormationIds ?? [localFormationId]);
    this.humanFormationIds.add(localFormationId);
    this.initialClasses = { ...(options.initialClasses ?? {}) };
    this.initialSpawnAreas = { ...(options.initialSpawnAreas ?? {}) };
    this.predictArtilleryShots = options.predictArtilleryShots ?? true;
    this.capturePresentationEvents = options.capturePresentationEvents ?? false;
    this.introConfigured = options.introEnabled ?? true;
    this.constructionEnabled = options.constructionEnabled ?? true;
    this.formations = this.createArmies();
    for (const formation of this.formations) {
      this.combatStats.set(formation.id, { kills: 0, losses: 0, bannerDamage: 0 });
    }
    const player = this.formations.find((formation) => formation.id === localFormationId) ?? this.formations[0];
    if (!player) throw new Error('Player formation was not created.');
    this.playerFormation = player;
    this.selectedWeapon = canVolleyClass(player.squadClass) ? 'musket' : 'bayonet';
    this.playerFormation.weapon = this.selectedWeapon;
    this.banners = [
      new Banner('blue', { x: GAME_CONFIG.banner.blueX, y: GAME_CONFIG.banner.blueY }),
      new Banner('red', { x: GAME_CONFIG.banner.redX, y: GAME_CONFIG.banner.redY }),
    ];
    this.camera = new Camera(this.blueBanner.position);
    this.introActive = this.introConfigured;
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
    this.formationClassCapacities.clear();
    this.formationClassUpgrades.clear();
    this.aiGrowthCooldowns.clear();
    this.aiEquipmentCooldowns.clear();
    this.aiGrowthFillTargets.clear();
    for (let i = 0; i < this.formations.length; i += 1) {
      const formation = this.formations[i];
      const teamIndex = this.teamIndexOf(formation);
      const squadClass = this.initialClassForFormation(formation.id, teamIndex, this.squadCountFor(formation.team));
      const areaIndex = this.initialSpawnAreas[formation.id] ?? (teamIndex % 3);
      this.formationSpawnAreas.set(formation.id, areaIndex);
      const spawn = this.initialSpawnFor(formation.team, teamIndex, areaIndex);
      formation.reset(spawn, formation.team === 'blue' ? 0 : Math.PI, squadClass);
      this.restoreUpgrades(formation);
      formation.setActiveStrength(standardStrength(squadClass), true);
      formation.setMaxSoldiers(standardStrength(squadClass));
      formation.trimInactiveSoldiers(standardStrength(squadClass));
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
    this.fieldworks.length = 0;
    this.constructionBlocks.length = 0;
    this.constructionCooldowns.clear();
    this.constructionAxeReadyAt.clear();
    this.pendingConstructionWork.clear();
    this.aiConstructionTimer = 1.5;
    this.constructionDirty = true;
    this.meleeQuietTimers.clear();
    this.respawnTimers.clear();
    this.plannedRespawnClasses.clear();
    this.plannedRespawnAreas.clear();
    this.respawnSerial.clear();
    this.baseRecoveryTimers.clear();
    this.resourceSystem?.reset();
    this.conquestSystem?.reset();
    for (const formation of this.formations) this.recruitmentSystem?.clearFormation(formation.id);
    this.fieldworkAxeReadyAt.clear();
    this.deferredRespawns.clear();
    this.conquestWipeCounted.clear();
    this.aiEconomicWorkers.clear();
    this.aiEconomicAssignments.clear();
    this.aiEconomicRoleTimer = 0;
    for (const formation of this.formations) {
      this.combatStats.set(formation.id, { kills: 0, losses: 0, bannerDamage: 0 });
    }
    this.reinforcementWaveRemaining = { blue: this.respawnSeconds, red: this.respawnSeconds };
    this.time = 0;
    this.paused = false;
    this.winner = null;
    this.screenShake = 0;
    this.chargeAiming = false;
    this.chargeAimTarget = null;
    this.timeScale = 1;
    this.selectedWeapon = canVolleyClass(this.playerFormation.squadClass) ? 'musket' : 'bayonet';
    this.playerFormation.weapon = this.selectedWeapon;
    this.introElapsed = 0;
    this.introActive = this.introConfigured;
    this.introStage = this.introActive ? 'own-banner' : 'done';
    this.introProgress = this.introActive ? 0 : 1;
    this.noticeText = '';
    this.noticeTimer = 0;
    this.contextualHint = '';
    this.hintTimer = 0;
    this.camera.reset(this.blueBanner.position);
    if (this.introActive) this.camera.setCinematic(this.blueBanner.position, 0.76);
    else this.camera.centerOn(this.playerFormation.center);
    this.aiSystem.reset(this.formations);
  }


  setMinimapPosition(position: MinimapPosition): void {
    this.minimapPosition = position;
  }


  updateNetworkPresentation(rawDt: number): void {
    const dt = Math.max(0, Math.min(rawDt, 0.05));
    if (this.introActive) {
      this.updateIntro(dt);
      this.input.clearActionInputs();
      this.input.endFrame();
      return;
    }

    const primaryClick = this.input.consumePrimaryClick();
    this.updateCameraControls(primaryClick);
    if (this.input.consumeDebugToggle()) this.debugAi = !this.debugAi;
    this.updateNetworkChargePreview();
    this.predictLocalNetworkMovement(dt);

    // Multiplayer clients are presentation replicas. The authoritative server owns
    // AI, pathfinding, combat, morale and respawn simulation; clients only smooth
    // snapshots and advance short-lived visuals between network updates.
    for (const formation of this.formations) {
      for (const soldier of formation.soldiers) {
        soldier.hitFlashTimer = Math.max(0, soldier.hitFlashTimer - dt);
        soldier.meleeStabTimer = Math.max(0, soldier.meleeStabTimer - dt);
      }
    }
    for (const projectile of this.projectiles) projectile.update(dt);
    for (const shell of this.artilleryShells) {
      if (!shell.active) continue;
      if (shell.update(dt)) {
        this.artilleryExplosions.push({
          position: { ...shell.position },
          life: GAME_CONFIG.effects.artilleryExplosionLifetime,
          maxLife: GAME_CONFIG.effects.artilleryExplosionLifetime,
          team: shell.team,
          radius: shell.blastRadius,
        });
      }
    }
    this.updateEffects(dt);
    this.updateUiTimers(dt);
    this.screenShake = Math.max(0, this.screenShake - 18 * dt);
    this.camera.updateFollow(this.playerCameraTarget(), dt);
    this.input.endFrame();
  }

  showClientHint(text: string, seconds = 1.8): void {
    this.setHint(text, seconds);
  }

  setLocalWeaponSelection(weapon: WeaponType): void {
    if (!canBannerAttackClass(this.playerFormation.squadClass)) return;
    this.selectPlayerWeapon(weapon);
  }

  playerInputWeapon(): WeaponType {
    if (canBannerAttackClass(this.playerFormation.squadClass)) return this.selectedWeapon;
    if (canVolleyClass(this.playerFormation.squadClass)) return 'musket';
    return 'bayonet';
  }

  private updateNetworkChargePreview(): void {
    const formation = this.playerFormation;
    const chargeCapable = formation.aliveCount() > 0
      && formation.mode === 'line'
      && !isArtilleryClass(formation.squadClass)
      && formation.squadClass !== 'dragoon'
      && (isChargeCavalryClass(formation.squadClass) || this.playerInputWeapon() === 'bayonet');
    if (!chargeCapable || !this.input.isChargeHeld()) {
      this.cancelChargeAim();
      return;
    }
    const pointer = this.camera.screenToWorld(this.input.getPointer());
    this.chargeAiming = true;
    this.chargeAimTarget = this.computeChargeTarget(formation, pointer);
  }

  private predictLocalNetworkMovement(dt: number): void {
    const formation = this.playerFormation;
    if (this.winner || formation.aliveCount() === 0 || formation.mode !== 'line' || this.chargeAiming) return;

    let moveX = 0;
    let moveY = 0;
    if (this.input.isDown('a')) moveX -= 1;
    if (this.input.isDown('d')) moveX += 1;
    if (this.input.isDown('w')) moveY -= 1;
    if (this.input.isDown('s')) moveY += 1;
    const length = Math.hypot(moveX, moveY);
    if (length <= 0.001) return;

    const pointer = this.camera.screenToWorld(this.input.getPointer());
    formation.direction = Math.atan2(pointer.y - formation.center.y, pointer.x - formation.center.x);
    const forcedMarch = this.input.isForcedMarchHeld()
      && formation.morale > GAME_CONFIG.army.forcedMarchMoraleFloor;
    const speed = formation.movementSpeed(true) * (forcedMarch ? formation.forcedMarchMultiplier() : 1) * dt;
    const before = { ...formation.center };
    if (!this.moveFormationWithTerrain(formation, moveX, moveY, speed)) return;

    // Move the rendered soldiers with the predicted center. The next authoritative
    // snapshot gently reconciles any discrepancy, so this stays lightweight while
    // preserving immediate WASD response over WAN latency.
    const dx = formation.center.x - before.x;
    const dy = formation.center.y - before.y;
    for (const soldier of formation.soldiers) {
      if (soldier.dead) continue;
      soldier.position.x += dx;
      soldier.position.y += dy;
      soldier.direction = formation.direction;
    }
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
    for (const [key, until] of [...this.constructionCooldowns.entries()]) {
      if (until <= this.time) this.constructionCooldowns.delete(key);
    }
    this.updatePendingConstructionWork();
    this.updateAiConstruction(dt);
    for (const [id, remaining] of [...this.aiGrowthCooldowns.entries()]) {
      const next = remaining - dt;
      if (next <= 0) this.aiGrowthCooldowns.delete(id);
      else this.aiGrowthCooldowns.set(id, next);
    }
    for (const [id, remaining] of [...this.aiEquipmentCooldowns.entries()]) {
      const next = remaining - dt;
      if (next <= 0) this.aiEquipmentCooldowns.delete(id);
      else this.aiEquipmentCooldowns.set(id, next);
    }

    const classChoice = this.input.consumeClassSelection(false);
    if (classChoice) {
      this.plannedRespawnClasses.set(this.playerFormation.id, classChoice);
      this.setHint(`NEXT CLASS RESERVED — ${this.classLabel(classChoice)}`, 2);
    }

    if (this.playerFormation.aliveCount() > 0) {
      if (canBannerAttackClass(this.playerFormation.squadClass)) {
        const weapon = this.input.consumeWeaponSelection();
        if (weapon) this.selectPlayerWeapon(weapon);
      } else {
        this.input.consumeWeaponSelection();
      }
    }

    this.updatePlayerControl(dt, clickConsumedByMap ? null : primaryClick);
    this.applyRemoteControls(dt);
    const movementBlocks = this.constructionBlocks.filter((block) => block.active && constructionBlocksMovement(block.kind));
    this.aiSystem.setNavigationBlockedCells(
      new Set(movementBlocks.filter((block) => block.kind !== 'door' || block.team !== 'blue').map((block) => block.cellKey)),
      new Set(movementBlocks.filter((block) => block.kind !== 'door' || block.team !== 'red').map((block) => block.cellKey)),
    );
    this.refreshAiEconomicWorkers(dt);
    this.resourceSystem?.update(dt, this.formations, this.remoteControls);
    this.cancelThreatenedAiRecruitment();
    if (this.recruitmentSystem && this.resourceSystem) {
      this.recruitmentSystem.update(dt, this.formations, this.remoteControls, this.resourceSystem);
    }
    this.applyAiCommands(dt);
    this.updateCharges(dt);
    this.updateBannerAttacks(dt);

    for (const formation of this.formations) formation.update(dt);
    for (const banner of this.banners) banner.update(dt);

    const struck = this.meleeSystem.update(
      this.formations,
      dt,
      this.meleeStrikes,
      (position, team, impactDirection, sourceFormationId, targetFormationId) => this.recordDeath(position, team, impactDirection, sourceFormationId, targetFormationId),
    );
    if (struck && this.playerFormation.mode === 'melee') {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.meleeShake);
    }

    this.updateMeleeDisengagement(dt);
    const constructionHpBefore = this.constructionBlocks.reduce((sum, block) => sum + block.hp, 0);
    updateProjectiles(
      this.projectiles,
      this.formations,
      this.fieldworks,
      this.constructionBlocks,
      dt,
      (position, team, impactDirection, sourceFormationId, targetFormationId) => this.recordDeath(position, team, impactDirection, sourceFormationId, targetFormationId),
    );
    const artilleryImpact = updateArtilleryShells(
      this.artilleryShells,
      this.formations,
      this.fieldworks,
      this.constructionBlocks,
      dt,
      this.artilleryExplosions,
      (position, team, impactDirection, sourceFormationId, targetFormationId) => this.recordDeath(position, team, impactDirection, sourceFormationId, targetFormationId),
    );
    if (artilleryImpact && this.artilleryExplosions.some((explosion) => this.distanceToPlayer(explosion.position) < 900)) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.artilleryShake);
    }
    const constructionHpAfter = this.constructionBlocks.reduce((sum, block) => sum + block.hp, 0);
    if (Math.abs(constructionHpAfter - constructionHpBefore) > 0.001) {
      this.handleDestroyedConstructionBlocks();
      this.constructionDirty = true;
    }

    this.updateMoraleAndRouts(dt);
    this.rescueFormationsFromMountains();
    this.updateBaseRecovery(dt);
    this.conquestSystem?.update(dt, this.formations);
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
    const playerBaseRecoveryRemaining = this.baseRecoveryTimers.has(this.playerFormation.id)
      ? Math.max(0, GAME_CONFIG.army.baseRecoverySeconds - (this.baseRecoveryTimers.get(this.playerFormation.id) ?? 0))
      : null;
    const playerNextClass = this.plannedRespawnClasses.get(this.playerFormation.id) ?? this.playerFormation.squadClass;
    const playerNextSpawn = this.plannedRespawnAreas.get(this.playerFormation.id)
      ?? this.formationSpawnAreas.get(this.playerFormation.id)
      ?? 0;
    const playerTarget = this.playerFormation.bannerTargetTeam;
    const targetBanner = playerTarget ? this.bannerFor(playerTarget) : null;
    const playerBannerInRange = !!targetBanner
      && this.distance(this.playerFormation.center, targetBanner.position) <= GAME_CONFIG.banner.approachDistance + 16;
    const artilleryRangeOrigin = isArtilleryClass(this.playerFormation.squadClass)
      ? this.playerArtilleryRangeOrigin()
      : null;
    const artilleryAimTarget = artilleryRangeOrigin
      ? this.camera.screenToWorld(this.input.getPointer())
      : null;
    const artilleryAimDistance = artilleryRangeOrigin && artilleryAimTarget
      ? artilleryTargetDistance(artilleryRangeOrigin, artilleryAimTarget)
      : null;
    const artilleryAimIssue = artilleryRangeOrigin && artilleryAimTarget
      ? artilleryTargetIssue(this.playerFormation.squadClass, artilleryRangeOrigin, artilleryAimTarget, 0, this.playerFormation.artilleryPerformanceTier, this.playerFormation.artilleryBatteryTier)
      : null;
    const playerRecommendedClass = this.aiSystem.recommendClass(
      this.playerFormation.team,
      this.formations,
      this.banners,
      this.plannedRespawnClasses,
    );

    const playerWork = this.pendingConstructionWork.get(this.playerFormation.id) ?? this.networkConstructionWork.get(this.playerFormation.id) ?? null;
    const playerWorkDuration = playerWork ? Math.max(0.001, playerWork.completeAt - playerWork.startedAt) : 1;
    const playerWorkProgress = playerWork ? Math.max(0, Math.min(1, (this.time - playerWork.startedAt) / playerWorkDuration)) : null;
    const playerWorkRemaining = playerWork ? Math.max(0, playerWork.completeAt - this.time) : null;
    let playerWorkLabel = '';
    if (playerWork) {
      if (playerWork.type === 'dismantle') {
        const block = playerWork.blockId ? this.constructionBlocks.find((candidate) => candidate.id === playerWork.blockId) : null;
        playerWorkLabel = `${block ? CONSTRUCTION_DEFINITIONS[block.kind].label : 'ブロック'}を撤去中`;
      } else {
        playerWorkLabel = `${playerWork.kind ? CONSTRUCTION_DEFINITIONS[playerWork.kind].label : 'ブロック'}を建築中`;
      }
    }

    const playerStats = this.getFormationStats(this.playerFormation.id);
    const resourceStockpile = this.resourceSystem?.getStockpile(this.playerFormation.team)
      ?? { wood: 0, iron: 0, gunpowder: 0, alloy: 0 };
    const resourceGathering = this.resourceSystem?.gatheringState(this.playerFormation.id) ?? null;
    const nearbyResource = this.resourceSystem?.nearestNode(this.playerFormation.center) ?? null;
    const nearbyBarracks = this.recruitmentSystem?.nearestBarracks(this.playerFormation.team, this.playerFormation.center) ?? null;
    const recruitmentState = this.recruitmentSystem?.stateFor(this.playerFormation.id) ?? null;
    const nearbyUpgradeFacility = this.modeRules.equipment
      ? nearestUpgradeFacility(this.playerFormation.team, this.playerFormation.squadClass, this.playerFormation.center)
      : null;
    const playerUpgradeState = this.playerFormation.upgradeState();
    const weaponUpgradeCost = upgradeCost(this.playerFormation.squadClass, 'weapon', playerUpgradeState.weaponTier);
    const armorUpgradeCost = upgradeCost(this.playerFormation.squadClass, 'armor', playerUpgradeState.armorTier);
    const artilleryPerformanceUpgradeCost = upgradeCost(this.playerFormation.squadClass, 'artillery-performance', playerUpgradeState.artilleryPerformanceTier);
    const artilleryBatteryUpgradeCost = upgradeCost(this.playerFormation.squadClass, 'artillery-battery', playerUpgradeState.artilleryBatteryTier);
    let resourcePrompt = '';
    if (this.resourceSystem && this.playerFormation.aliveCount() > 0 && nearbyResource) {
      resourcePrompt = nearbyResource.amount > 0
        ? `${nearbyResource.label} · E長押しで採取 · 残量 ${Math.ceil(nearbyResource.amount)} / ${nearbyResource.maxAmount}`
        : `${nearbyResource.label} · 枯渇中`;
    }

    return {
      time: this.time,
      paused: this.paused,
      winner: this.winner,
      conquestEnabled: !!this.conquestSystem,
      conquestInitialTickets: this.conquestSystem?.initialTickets ?? 0,
      blueTickets: this.conquestSystem?.tickets.blue ?? 0,
      redTickets: this.conquestSystem?.tickets.red ?? 0,
      capturePoints: this.conquestSystem?.points.map((point) => ({ ...point, position: { ...point.position } })) ?? [],
      playerReinforcementsExhausted: !!this.conquestSystem && this.playerFormation.aliveCount() === 0 && !this.conquestSystem.canRespawn(this.playerFormation.team),
      timeScale: this.timeScale,
      debugAi: this.debugAi,
      chargeAiming: this.chargeAiming,
      chargeAimTarget: this.chargeAimTarget ? { ...this.chargeAimTarget } : null,
      playerMode: this.playerFormation.mode,
      playerClass: this.playerFormation.squadClass,
      playerNextClass,
      playerNextSpawn,
      playerRecommendedClass,
      playerAlive: this.playerFormation.aliveCount(),
      playerMaxSoldiers: this.playerFormation.maxSoldiers(),
      playerMorale: this.playerFormation.morale,
      playerKills: playerStats.kills,
      playerLosses: playerStats.losses,
      playerBannerDamage: playerStats.bannerDamage,
      resourcesEnabled: !!this.resourceSystem,
      playerResourcesGathered: this.resourceSystem?.getFormationGatheredTotal(this.playerFormation.id) ?? 0,
      playerCombatLoot: this.resourceSystem?.getFormationCombatLootTotal(this.playerFormation.id) ?? 0,
      playerResourceStockpile: resourceStockpile,
      resourceGatheringLabel: resourceGathering ? `${RESOURCE_LABELS[resourceGathering.node.resource]} 採取中` : '',
      resourceGatheringDetail: resourceGathering
        ? `${resourceGathering.node.label} · 残量 ${Math.ceil(resourceGathering.node.amount)} / ${resourceGathering.node.maxAmount}`
        : '',
      resourceGatheringProgress: resourceGathering?.progress ?? null,
      recruitmentEnabled: !!this.recruitmentSystem,
      playerNearBarracks: !!nearbyBarracks,
      playerBarracksLabel: nearbyBarracks?.label ?? '',
      playerStarterStrength: standardStrength(this.playerFormation.squadClass),
      playerGrowthLimit: growthLimit(this.playerFormation.squadClass),
      playerNextGrowthCapacity: nextGrowthCapacity(this.playerFormation.squadClass, this.playerFormation.maxSoldiers()),
      playerGrowthUpgradeWood: capacityUpgradeCost(this.playerFormation.squadClass, this.playerFormation.maxSoldiers()).wood,
      playerGrowthUpgradeIron: capacityUpgradeCost(this.playerFormation.squadClass, this.playerFormation.maxSoldiers()).iron,
      playerRecruitmentProgress: recruitmentState?.progress ?? null,
      playerRecruitmentCount: recruitmentState?.count ?? 0,
      equipmentEnabled: this.modeRules.equipment,
      playerNearUpgradeFacility: !!nearbyUpgradeFacility,
      playerUpgradeFacilityLabel: nearbyUpgradeFacility?.label ?? '',
      playerWeaponTier: playerUpgradeState.weaponTier,
      playerArmorTier: playerUpgradeState.armorTier,
      playerArtilleryPerformanceTier: playerUpgradeState.artilleryPerformanceTier,
      playerArtilleryBatteryTier: playerUpgradeState.artilleryBatteryTier,
      playerFormationShape: this.playerFormation.formationShape,
      playerEquipmentSummary: equipmentSummary(playerUpgradeState, this.playerFormation.squadClass),
      playerWeaponUpgradeCost: weaponUpgradeCost,
      playerArmorUpgradeCost: armorUpgradeCost,
      playerArtilleryPerformanceUpgradeCost: artilleryPerformanceUpgradeCost,
      playerArtilleryBatteryUpgradeCost: artilleryBatteryUpgradeCost,
      playerReload: this.playerFormation.reloadTimer,
      playerReloadProgress: this.playerFormation.reloadProgress(),
      playerRespawn,
      playerForcedMarch: this.playerFormation.forcedMarch,
      playerFieldworkKits: this.playerFormation.fieldworkKits,
      playerGrenadeCooldown: this.playerFormation.grenadeCooldown,
      playerBaseRecoveryRemaining,
      playerHasReservedClass: this.plannedRespawnClasses.has(this.playerFormation.id),
      playerHasReservedSpawn: this.plannedRespawnAreas.has(this.playerFormation.id),
      playerArtilleryDeployed: this.playerFormation.artilleryDeployed,
      playerArtilleryDeployProgress: isArtilleryClass(this.playerFormation.squadClass)
        ? Math.min(1, this.playerFormation.artilleryDeployTimer / artilleryProfile(this.playerFormation.squadClass, this.playerFormation.artilleryPerformanceTier, this.playerFormation.artilleryBatteryTier).deploySeconds)
        : 0,
      playerArtilleryRangeOrigin: artilleryRangeOrigin ? { ...artilleryRangeOrigin } : null,
      playerArtilleryAimDistance: artilleryAimDistance,
      playerArtilleryAimIssue: artilleryAimIssue,
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
      blueReinforcementWave: this.reinforcementWaveRemaining.blue,
      redReinforcementWave: this.reinforcementWaveRemaining.red,
      screenShake: this.screenShake,
      cameraZoom: this.camera.zoom,
      cameraFollow: this.camera.followPlayer,
      introActive: this.introActive,
      introStage: this.introStage,
      introProgress: this.introProgress,
      noticeText: this.noticeText,
      noticeKind: this.noticeKind,
      noticeVisible: this.noticeTimer > 0,
      playerConstructionWorkType: playerWork?.type ?? null,
      playerConstructionWorkLabel: playerWorkLabel,
      playerConstructionWorkProgress: playerWorkProgress,
      playerConstructionWorkRemaining: playerWorkRemaining,
      contextualHint: this.hintTimer > 0
        ? this.contextualHint
        : nearbyBarracks && this.recruitmentSystem
          ? `${nearbyBarracks.label} · Eで増員メニュー${isRecruitableClass(this.playerFormation.squadClass) ? '' : ''}`
          : nearbyUpgradeFacility
            ? `${nearbyUpgradeFacility.label} · Eで強化メニュー`
            : resourcePrompt,
    };
  }

  drainPresentationEvents(): BattlePresentationEvent[] {
    if (this.presentationEvents.length === 0) return [];
    return this.presentationEvents.splice(0, this.presentationEvents.length);
  }

  applyPresentationEvents(events: BattlePresentationEvent[]): void {
    for (const event of events) {
      if (event.kind === 'volley') {
        const formation = this.formations.find((candidate) => candidate.id === event.formationId);
        if (!formation) continue;
        const alive = formation.aliveSoldiers().slice(0, Math.max(1, event.count));
        for (const soldier of alive) {
          const muzzle = {
            x: soldier.position.x + Math.cos(event.direction) * GAME_CONFIG.musket.muzzleOffset,
            y: soldier.position.y + Math.sin(event.direction) * GAME_CONFIG.musket.muzzleOffset,
          };
          this.muzzleFlashes.push({ position: muzzle, direction: event.direction, life: GAME_CONFIG.effects.flashLifetime });
          this.smoke.push({
            position: { x: muzzle.x + (Math.random() - 0.5) * 6, y: muzzle.y + (Math.random() - 0.5) * 6 },
            velocity: {
              x: Math.cos(event.direction) * (12 + Math.random() * 16) + (Math.random() - 0.5) * 15,
              y: Math.sin(event.direction) * (12 + Math.random() * 16) + (Math.random() - 0.5) * 15,
            },
            age: 0,
            lifetime: GAME_CONFIG.effects.smokeLifetime * (0.8 + Math.random() * 0.4),
            size: 8 + Math.random() * 7,
          });
        }
        if (formation === this.playerFormation || this.distanceToPlayer(formation.center) < 750) {
          this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.screenShake);
        }
        if (this.smoke.length > GAME_CONFIG.effects.maxSmoke) {
          this.smoke.splice(0, this.smoke.length - GAME_CONFIG.effects.maxSmoke);
        }
        continue;
      }
      if (event.kind === 'artillery_fire') {
        const profile = artilleryProfile(event.squadClass);
        const right = { x: -Math.sin(event.direction), y: Math.cos(event.direction) };
        for (let i = 0; i < profile.guns; i += 1) {
          const offset = (i - (profile.guns - 1) / 2) * 20;
          this.smoke.push({
            position: {
              x: event.x + Math.cos(event.direction) * 42 + right.x * offset,
              y: event.y + Math.sin(event.direction) * 42 + right.y * offset,
            },
            velocity: { x: Math.cos(event.direction) * 35, y: Math.sin(event.direction) * 35 },
            age: 0,
            lifetime: GAME_CONFIG.effects.smokeLifetime * (1.25 + profile.smokeScale * 0.5),
            size: 20 + 12 * profile.smokeScale,
          });
        }
        if (Math.hypot(event.x - this.playerFormation.center.x, event.y - this.playerFormation.center.y) < 1100) {
          this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.artilleryShake * profile.shakeScale);
        }
        continue;
      }
      this.spawnCorpse(
        { x: event.x, y: event.y },
        event.team,
        { x: event.impactX, y: event.impactY },
      );
    }
  }

  private queuePresentationEvent(event: BattlePresentationEvent): void {
    if (!this.capturePresentationEvents) return;
    // Presentation events are intentionally bounded. Combat state remains authoritative
    // in snapshots even if a very busy frame drops some cosmetic events.
    if (this.presentationEvents.length >= 160) return;
    this.presentationEvents.push(event);
  }

  canTeamRespawn(team: Team): boolean {
    return this.conquestSystem ? this.conquestSystem.canRespawn(team) : true;
  }

  resourceNodes(): readonly ResourceNodeState[] {
    return this.resourceSystem?.nodes ?? [];
  }

  getFormationResourceTotal(formationId: string): number {
    return this.resourceSystem?.getFormationGatheredTotal(formationId) ?? 0;
  }

  getFormationCombatLootTotal(formationId: string): number {
    return this.resourceSystem?.getFormationCombatLootTotal(formationId) ?? 0;
  }

  playerBarracks(): BarracksState | null {
    return this.recruitmentSystem?.nearestBarracks(this.playerFormation.team, this.playerFormation.center) ?? null;
  }

  playerRecruitmentCost(count: number): { wood: number; iron: number } {
    return recruitmentCost(this.playerFormation.squadClass, count);
  }

  playerCapacityUpgradeCost(): { wood: number; iron: number } {
    return capacityUpgradeCost(this.playerFormation.squadClass, this.playerFormation.maxSoldiers());
  }

  playerUpgradeFacility(): UpgradeFacilityState | null {
    if (!this.modeRules.equipment) return null;
    return nearestUpgradeFacility(this.playerFormation.team, this.playerFormation.squadClass, this.playerFormation.center);
  }

  playerEquipmentUpgradeCost(kind: EquipmentUpgradeKind): ResourceStockpile {
    return upgradeCost(this.playerFormation.squadClass, kind, tierForKind(this.playerFormation.upgradeState(), kind));
  }

  private savedUpgradeState(formationId: string, squadClass: SquadClass): FormationUpgradeState {
    return { ...defaultUpgradeState(), ...(this.formationClassUpgrades.get(formationId)?.[squadClass] ?? {}) };
  }

  private rememberUpgrades(formation: Formation): void {
    let byClass = this.formationClassUpgrades.get(formation.id);
    if (!byClass) {
      byClass = {};
      this.formationClassUpgrades.set(formation.id, byClass);
    }
    byClass[formation.squadClass] = formation.upgradeState();
  }

  private restoreUpgrades(formation: Formation): void {
    formation.setUpgradeState(this.savedUpgradeState(formation.id, formation.squadClass));
  }

  private upgradeEquipment(formation: Formation, kind: EquipmentUpgradeKind): boolean {
    if (!this.modeRules.equipment || !this.resourceSystem || this.winner) return false;
    if (formation.aliveCount() <= 0 || (formation.mode !== 'line' && formation.mode !== 'reforming')) return false;
    if (!validUpgradeKinds(formation.squadClass).includes(kind)) return false;
    const facility = nearestUpgradeFacility(formation.team, formation.squadClass, formation.center);
    if (!facility) return false;
    const current = tierForKind(formation.upgradeState(), kind);
    if (current >= 3) return false;
    const cost = upgradeCost(formation.squadClass, kind, current);
    if (!this.resourceSystem.consume(formation.team, cost)) return false;
    const next = (current + 1) as 2 | 3;
    formation.setUpgradeState(withUpgradeTier(formation.upgradeState(), kind, next));
    this.rememberUpgrades(formation);
    if (formation === this.playerFormation) {
      this.setNotice(`${upgradeKindLabel(kind)}強化 — TIER ${next}`, 'success', 3);
    }
    return true;
  }

  private savedCapacity(formationId: string, squadClass: SquadClass): number {
    const byClass = this.formationClassCapacities.get(formationId);
    return Math.max(standardStrength(squadClass), byClass?.[squadClass] ?? standardStrength(squadClass));
  }

  private rememberCapacity(formation: Formation): void {
    let byClass = this.formationClassCapacities.get(formation.id);
    if (!byClass) {
      byClass = {};
      this.formationClassCapacities.set(formation.id, byClass);
    }
    byClass[formation.squadClass] = formation.maxSoldiers();
  }

  private upgradeFormationCapacity(formation: Formation, ai: boolean): boolean {
    if (!this.recruitmentSystem || !this.resourceSystem || !isRecruitableClass(formation.squadClass)) return false;
    if (formation.aliveCount() <= 0 || (formation.mode !== 'line' && formation.mode !== 'reforming')) return false;
    const barracks = this.recruitmentSystem.nearestBarracks(formation.team, formation.center);
    if (!barracks) return false;
    const next = nextGrowthCapacity(formation.squadClass, formation.maxSoldiers());
    if (next === null) return false;
    const cost = capacityUpgradeCost(formation.squadClass, formation.maxSoldiers());
    const consumed = ai
      ? this.resourceSystem.consumeWithReserve(formation.team, cost, AI_RECRUIT_RESOURCE_RESERVE)
      : this.resourceSystem.consume(formation.team, cost);
    if (!consumed) return false;
    formation.setMaxSoldiers(next);
    this.rememberCapacity(formation);
    if (ai) {
      this.aiGrowthCooldowns.set(formation.id, AI_GROWTH_UPGRADE_COOLDOWN);
      this.aiGrowthFillTargets.set(formation.id, next);
    }
    if (formation === this.playerFormation) {
      this.setNotice(`兵員上限拡張 — ${next}人まで編成可能`, 'success', 3);
    }
    return true;
  }

  private combatLootFor(target: Formation): Partial<ResourceStockpile> {
    const standard = Math.max(1, standardStrength(target.squadClass));
    const growthRatio = Math.max(1, target.maxSoldiers() / standard);
    // Bigger formations already drop more loot because they contain more soldiers.
    // Keep the per-soldier growth bonus mild so combat income supplements, rather
    // than replaces, dedicated resource gathering.
    const growthMultiplier = Math.min(1.4, 1 + (growthRatio - 1) * 0.10);
    const mounted = target.squadClass === 'dragoon' || isChargeCavalryClass(target.squadClass);
    const elite = target.squadClass === 'grenadier' || target.squadClass === 'sharpshooter' || target.squadClass === 'cuirassier';
    const artillery = isArtilleryClass(target.squadClass);
    const state = target.upgradeState();
    const upgradeValue = artillery
      ? (state.artilleryPerformanceTier - 1) * 0.14 + (state.artilleryBatteryTier - 1) * 0.20
      : (state.weaponTier - 1) * 0.10 + (state.armorTier - 1) * 0.12;
    const equipmentMultiplier = Math.min(1.65, 1 + upgradeValue);
    return {
      wood: (artillery ? 1.20 : mounted ? 0.90 : 0.70) * growthMultiplier * equipmentMultiplier,
      iron: (artillery ? 2.00 : mounted ? 1.45 : elite ? 1.35 : 1.00) * growthMultiplier * equipmentMultiplier,
      gunpowder: (artillery ? 1.00 : canVolleyClass(target.squadClass) ? 0.48 : 0.18) * growthMultiplier * equipmentMultiplier,
    };
  }

  createResourceNetworkState(): ResourceNetworkState | null {
    return this.resourceSystem?.createNetworkState() ?? null;
  }

  applyResourceNetworkState(state: ResourceNetworkState): void {
    this.resourceSystem?.applyNetworkState(state);
  }

  constructionPlacementPreview(kind: ConstructionBlockKind, target: Vec2): { position: Vec2; valid: boolean; cooldown: boolean } {
    const formation = this.playerFormation;
    const cell = worldToConstructionCell(target);
    const center = constructionCellCenter(cell.col, cell.row);
    const key = constructionCellKey(cell.col, cell.row);
    const cooldown = this.constructionCooldowns.has(key);
    const terrain = BATTLEFIELD_MAP.terrainAt(center);
    const terrainValid = kind === 'bridgeTile' ? terrain === 'river' || terrain === 'ford' : kind === 'roadTile' ? terrain !== 'mountain' && terrain !== 'river' : terrain !== 'mountain' && terrain !== 'river';
    const valid = this.constructionEnabled
      && !!this.conquestSystem
      && !!this.resourceSystem
      && formation.aliveCount() > 0
      && !this.winner
      && this.distance(formation.center, center) <= CONSTRUCTION_PLACE_RANGE
      && terrainValid
      && !cooldown
      && !this.constructionBlocks.some((block) => block.active && block.cellKey === key)
      && this.distance(center, this.blueBanner.position) >= 150
      && this.distance(center, this.redBanner.position) >= 150
      && !MAP_SITES.some((site) => site.kind === 'facility' && this.distance(center, site.position) < 125)
      && !BATTLEFIELD_MAP.inSpawnArea('blue', center, -Math.min(360, BATTLEFIELD_MAP.spawnArea('blue', 0).radiusX * 0.45))
      && !BATTLEFIELD_MAP.inSpawnArea('red', center, -Math.min(360, BATTLEFIELD_MAP.spawnArea('red', 0).radiusX * 0.45))
      && this.resourceSystem.canAfford(formation.team, CONSTRUCTION_COSTS[kind]);
    return { position: center, valid, cooldown };
  }

  createConstructionNetworkState(): ConstructionNetworkState {
    return {
      blocks: this.constructionBlocks.filter((block) => block.active).map((block) => ({
        id: block.id, team: block.team, kind: block.kind, col: block.col, row: block.row,
        direction: block.direction, hp: block.hp, maxHp: block.maxHp,
      })),
      cooldowns: [...this.constructionCooldowns.entries()].map(([cellKey, until]) => ({
        cellKey, remaining: Math.max(0, until - this.time),
      })),
    };
  }

  applyConstructionNetworkState(state: ConstructionNetworkState): void {
    this.constructionBlocks.length = 0;
    for (const net of state.blocks) {
      this.constructionBlocks.push(new ConstructionBlock(net.id, net.team, net.kind, net.col, net.row, net.direction, net.hp));
    }
    this.constructionCooldowns.clear();
    for (const cooldown of state.cooldowns) this.constructionCooldowns.set(cooldown.cellKey, this.time + Math.max(0, cooldown.remaining));
  }

  constructionStateDirty(): boolean { return this.constructionDirty; }
  consumeConstructionStateDirty(): boolean {
    const dirty = this.constructionDirty;
    this.constructionDirty = false;
    return dirty;
  }

  resourceStateDirty(): boolean {
    return this.resourceSystem?.isDirty() ?? false;
  }

  consumeResourceStateDirty(): boolean {
    return this.resourceSystem?.consumeDirty() ?? false;
  }

  hasActiveResourceGathering(): boolean {
    return this.resourceSystem?.hasActiveGathering() ?? false;
  }

  createNetworkSnapshot(): BattleNetSnapshot {
    const formations = this.formations.map((formation) => ({
      id: formation.id,
      team: formation.team,
      x: formation.center.x,
      y: formation.center.y,
      direction: formation.direction,
      squadClass: formation.squadClass,
      maxSoldiers: formation.maxSoldiers(),
      weaponTier: formation.weaponTier,
      armorTier: formation.armorTier,
      artilleryPerformanceTier: formation.artilleryPerformanceTier,
      artilleryBatteryTier: formation.artilleryBatteryTier,
      formationShape: formation.formationShape,
      mode: formation.mode,
      weapon: formation.weapon,
      reloadTimer: formation.reloadTimer,
      reloadDuration: formation.reloadDuration,
      spawnProtectionTimer: formation.spawnProtectionTimer,
      artilleryDeployTimer: formation.artilleryDeployTimer,
      artilleryDeployed: formation.artilleryDeployed,
      chargeMomentum: formation.chargeMomentum,
      morale: formation.morale,
      bannerTargetTeam: formation.bannerTargetTeam,
      respawnRemaining: this.respawnTimers.get(formation.id) ?? null,
      plannedClass: this.plannedRespawnClasses.get(formation.id) ?? null,
      plannedSpawnIndex: this.plannedRespawnAreas.get(formation.id) ?? null,
      spawnAreaIndex: this.formationSpawnAreas.get(formation.id) ?? 0,
      forcedMarch: formation.forcedMarch,
      fieldworkKits: formation.fieldworkKits,
      grenadeCooldown: formation.grenadeCooldown,
      baseRecoveryRemaining: this.baseRecoveryTimers.has(formation.id)
        ? Math.max(0, GAME_CONFIG.army.baseRecoverySeconds - (this.baseRecoveryTimers.get(formation.id) ?? 0))
        : null,
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
      conquest: this.conquestSystem?.createNetworkState() ?? null,
      blueBannerHp: this.blueBanner.hp,
      redBannerHp: this.redBanner.hp,
      blueBannerUnderAttack: this.blueBanner.underAttackTimer,
      redBannerUnderAttack: this.redBanner.underAttackTimer,
      blueReinforcementWave: this.reinforcementWaveRemaining.blue,
      redReinforcementWave: this.reinforcementWaveRemaining.red,
      stats: [...this.combatStats.entries()].map(([formationId, stats]) => ({ formationId, ...stats })),
      formations,
      projectiles: this.projectiles.map((projectile) => ({
        team: projectile.team,
        sourceFormationId: projectile.sourceFormationId,
        x: projectile.position.x,
        y: projectile.position.y,
        vx: projectile.velocity.x,
        vy: projectile.velocity.y,
        life: projectile.life,
        damage: projectile.damage,
        moraleDamage: projectile.moraleDamage,
      })),
      shells: this.artilleryShells.map((shell) => ({
        team: shell.team,
        sourceFormationId: shell.sourceFormationId,
        x: shell.position.x,
        y: shell.position.y,
        targetX: shell.target.x,
        targetY: shell.target.y,
        vx: shell.velocity.x,
        vy: shell.velocity.y,
        active: shell.active,
        sourceClass: shell.sourceClass,
        blastRadius: shell.blastRadius,
        blastDamage: shell.blastDamage,
        edgeDamage: shell.edgeDamage,
        moraleDamage: shell.moraleDamage,
      })),
      fieldworks: this.fieldworks.filter((fieldwork) => fieldwork.active).map((fieldwork) => ({ id: fieldwork.id, team: fieldwork.team, sourceFormationId: fieldwork.sourceFormationId, x: fieldwork.position.x, y: fieldwork.position.y, direction: fieldwork.direction, hp: fieldwork.hp, maxHp: fieldwork.maxHp })),
      recruitments: this.recruitmentSystem?.createNetworkState() ?? [],
      constructionWork: [...this.pendingConstructionWork.values()].map((work) => ({ formationId: work.formationId, type: work.type, startedAt: work.startedAt, completeAt: work.completeAt, kind: work.kind, blockId: work.blockId })),
    };
  }

  applyNetworkSnapshot(snapshot: BattleNetSnapshot): void {
    if (snapshot.seq < this.networkSnapshotSeq) return;
    this.networkSnapshotSeq = snapshot.seq;
    this.time = snapshot.time;
    this.winner = snapshot.winner;
    if (snapshot.conquest && this.conquestSystem) this.conquestSystem.applyNetworkState(snapshot.conquest);
    this.blueBanner.hp = snapshot.blueBannerHp;
    this.redBanner.hp = snapshot.redBannerHp;
    this.blueBanner.underAttackTimer = snapshot.blueBannerUnderAttack;
    this.redBanner.underAttackTimer = snapshot.redBannerUnderAttack;
    this.reinforcementWaveRemaining.blue = snapshot.blueReinforcementWave;
    this.reinforcementWaveRemaining.red = snapshot.redReinforcementWave;
    for (const net of snapshot.stats ?? []) {
      this.combatStats.set(net.formationId, { kills: net.kills, losses: net.losses, bannerDamage: net.bannerDamage });
    }
    this.recruitmentSystem?.applyNetworkState(snapshot.recruitments ?? []);
    this.networkConstructionWork.clear();
    for (const work of snapshot.constructionWork ?? []) this.networkConstructionWork.set(work.formationId, work);

    const firstSnapshot = !this.hasNetworkSnapshot;
    const teleportDistance = 520;
    const arrivedAt = performance.now() / 1000;
    const rawInterval = this.lastNetworkSnapshotArrivedAt > 0 ? arrivedAt - this.lastNetworkSnapshotArrivedAt : 0.1;
    this.lastNetworkSnapshotArrivedAt = arrivedAt;
    // Render remote squads across roughly one snapshot interval. A tiny amount of
    // intentional visual delay is preferable to the old ease-to-target / pause cycle.
    const interpolationDuration = Math.max(0.085, Math.min(0.14, rawInterval * 1.08));

    for (const net of snapshot.formations) {
      const formation = this.formations.find((candidate) => candidate.id === net.id);
      if (!formation) continue;

      const classChanged = formation.squadClass !== net.squadClass;
      if (classChanged) formation.setClass(net.squadClass);
      const capacityChanged = formation.maxSoldiers() !== net.maxSoldiers;
      if (capacityChanged) formation.setMaxSoldiers(net.maxSoldiers);
      formation.setUpgradeState({
        weaponTier: net.weaponTier,
        armorTier: net.armorTier,
        artilleryPerformanceTier: net.artilleryPerformanceTier,
        artilleryBatteryTier: net.artilleryBatteryTier,
      });
      formation.setFormationShape(net.formationShape ?? 'line');
      formation.syncSoldierPoolSize(net.soldiers.length);
      if (formation === this.playerFormation && (firstSnapshot || classChanged)) {
        this.cancelChargeAim();
        this.selectedWeapon = canBannerAttackClass(net.squadClass) ? net.weapon : canVolleyClass(net.squadClass) ? 'musket' : 'bayonet';
        this.humanWeapons.set(formation.id, this.selectedWeapon);
      }

      const distanceToAuthoritative = Math.hypot(formation.center.x - net.x, formation.center.y - net.y);
      const snapImmediately = firstSnapshot || classChanged || capacityChanged || distanceToAuthoritative >= teleportDistance;

      formation.mode = net.mode;
      // Keep local weapon feedback immediate while the authoritative acknowledgement
      // is in flight. Other states remain server-owned.
      formation.weapon = formation === this.playerFormation
        && canBannerAttackClass(formation.squadClass)
        && (net.mode === 'line' || net.mode === 'reforming')
        ? this.selectedWeapon
        : net.weapon;
      formation.reloadTimer = net.reloadTimer;
      formation.reloadDuration = net.reloadDuration;
      formation.spawnProtectionTimer = net.spawnProtectionTimer;
      formation.artilleryDeployTimer = net.artilleryDeployTimer;
      formation.artilleryDeployed = net.artilleryDeployed;
      formation.chargeMomentum = net.chargeMomentum;
      formation.morale = net.morale;
      formation.bannerTargetTeam = net.bannerTargetTeam;
      if (net.respawnRemaining === null) this.respawnTimers.delete(formation.id);
      else this.respawnTimers.set(formation.id, net.respawnRemaining);
      if (net.plannedClass === null) this.plannedRespawnClasses.delete(formation.id);
      else this.plannedRespawnClasses.set(formation.id, net.plannedClass);
      if (net.plannedSpawnIndex === null) this.plannedRespawnAreas.delete(formation.id);
      else this.plannedRespawnAreas.set(formation.id, net.plannedSpawnIndex);
      this.formationSpawnAreas.set(formation.id, net.spawnAreaIndex);
      formation.forcedMarch = net.forcedMarch;
      formation.fieldworkKits = net.fieldworkKits;
      formation.grenadeCooldown = net.grenadeCooldown;
      if (net.baseRecoveryRemaining === null) this.baseRecoveryTimers.delete(formation.id);
      else this.baseRecoveryTimers.set(formation.id, Math.max(0, GAME_CONFIG.army.baseRecoverySeconds - net.baseRecoveryRemaining));

      const soldiers: NetworkSoldierTarget[] = [];
      for (let i = 0; i < formation.soldiers.length; i += 1) {
        const soldier = formation.soldiers[i];
        const state = net.soldiers[i];
        if (!state) continue;
        const meleeStarted = !state.dead && state.stab > 0.025 && state.stab > soldier.meleeStabTimer + 0.025;
        if (meleeStarted) {
          this.meleeStrikes.push({
            start: {
              x: soldier.position.x + Math.cos(state.direction) * 9,
              y: soldier.position.y + Math.sin(state.direction) * 9,
            },
            end: {
              x: soldier.position.x + Math.cos(state.direction) * 34,
              y: soldier.position.y + Math.sin(state.direction) * 34,
            },
            team: formation.team,
            life: GAME_CONFIG.effects.meleeStrikeLifetime,
          });
        }
        soldier.hp = state.hp;
        soldier.dead = state.dead;
        soldier.hitFlashTimer = Math.max(soldier.hitFlashTimer, state.hit);
        soldier.meleeStabTimer = Math.max(soldier.meleeStabTimer, state.stab);
        soldiers.push({
          fromX: soldier.position.x,
          fromY: soldier.position.y,
          fromDirection: soldier.direction,
          x: state.x,
          y: state.y,
          direction: state.direction,
        });
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
        fromX: formation.center.x,
        fromY: formation.center.y,
        fromDirection: formation.direction,
        x: net.x,
        y: net.y,
        direction: net.direction,
        elapsed: snapImmediately ? interpolationDuration : 0,
        duration: interpolationDuration,
        soldiers,
      });
    }

    this.hasNetworkSnapshot = true;

    // Projectiles/shells remain server-authored but are locally advanced between
    // snapshots for smooth visuals.
    this.projectiles.length = 0;
    for (const net of snapshot.projectiles) {
      this.projectiles.push(new Projectile(net.team, { x: net.x, y: net.y }, { x: net.vx, y: net.vy }, net.life, net.damage, net.moraleDamage, net.sourceFormationId));
    }
    this.artilleryShells.length = 0;
    for (const net of snapshot.shells) {
      const speed = Math.hypot(net.vx, net.vy);
      const shell = new ArtilleryShell(
        net.team,
        { x: net.x, y: net.y },
        { x: net.targetX, y: net.targetY },
        speed,
        net.sourceClass,
        net.blastRadius,
        net.blastDamage,
        net.edgeDamage,
        net.moraleDamage,
        net.sourceFormationId,
      );
      shell.active = net.active;
      this.artilleryShells.push(shell);
    }
    this.fieldworks.length = 0;
    for (const net of snapshot.fieldworks ?? []) {
      const fieldwork = new Fieldwork(net.id, net.team, { x: net.x, y: net.y }, net.direction, net.sourceFormationId, net.maxHp);
      fieldwork.hp = net.hp;
      fieldwork.active = net.hp > 0;
      this.fieldworks.push(fieldwork);
    }
  }

  smoothNetworkState(dt: number): void {
    if (!this.hasNetworkSnapshot || dt <= 0) return;

    const localBlend = 1 - Math.exp(-10 * dt);
    const localSoldierBlend = 1 - Math.exp(-14 * dt);

    for (const formation of this.formations) {
      const target = this.networkTargets.get(formation.id);
      if (!target) continue;
      if (formation === this.playerFormation) {
        // Local WASD is predicted immediately. Ignore the normal ~1 snapshot of
        // latency error and only reconcile meaningful divergence (collision, rout, etc.).
        const localError = Math.hypot(target.x - formation.center.x, target.y - formation.center.y);
        if (localError > 28) {
          formation.center.x += (target.x - formation.center.x) * localBlend;
          formation.center.y += (target.y - formation.center.y) * localBlend;
        }
        formation.direction = this.lerpAngle(formation.direction, target.direction, localBlend);
        const count = Math.min(formation.soldiers.length, target.soldiers.length);
        for (let i = 0; i < count; i += 1) {
          const soldier = formation.soldiers[i];
          const state = target.soldiers[i];
          const soldierError = Math.hypot(state.x - soldier.position.x, state.y - soldier.position.y);
          if (soldierError > 34) {
            soldier.position.x += (state.x - soldier.position.x) * localSoldierBlend;
            soldier.position.y += (state.y - soldier.position.y) * localSoldierBlend;
          }
          soldier.direction = this.lerpAngle(soldier.direction, state.direction, localSoldierBlend);
        }
        continue;
      }

      target.elapsed += dt;
      const amount = target.duration <= 0 ? 1 : Math.max(0, Math.min(1, target.elapsed / target.duration));
      formation.center.x = target.fromX + (target.x - target.fromX) * amount;
      formation.center.y = target.fromY + (target.y - target.fromY) * amount;
      formation.direction = this.lerpAngle(target.fromDirection, target.direction, amount);
      const count = Math.min(formation.soldiers.length, target.soldiers.length);
      for (let i = 0; i < count; i += 1) {
        const soldier = formation.soldiers[i];
        const state = target.soldiers[i];
        soldier.position.x = state.fromX + (state.x - state.fromX) * amount;
        soldier.position.y = state.fromY + (state.y - state.fromY) * amount;
        soldier.direction = this.lerpAngle(state.fromDirection, state.direction, amount);
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
        const squadClass = this.initialClassForFormation(id, i, count);
        const areaIndex = this.initialSpawnAreas[id] ?? (i % 3);
        this.formationSpawnAreas.set(id, areaIndex);
        formations.push(new Formation(
          id,
          team,
          this.initialSpawnFor(team, i, areaIndex),
          team === 'blue' ? 0 : Math.PI,
          isPlayer,
          squadClass,
        ));
      }
    }
    return formations;
  }


  private initialClassForFormation(id: string, index: number, count: number): SquadClass {
    return this.initialClasses[id] ?? this.initialClassFor(index, count);
  }

  private initialClassFor(index: number, count: number): SquadClass {
    const mixedIndex = count > 1 ? (index * 7) % count : 0;
    const ratio = (mixedIndex + 0.5) / count;
    if (ratio < 0.30) return 'infantry';
    if (ratio < 0.39) return 'lightInfantry';
    if (ratio < 0.48) return 'grenadier';
    if (ratio < 0.54) return 'sharpshooter';
    if (ratio < 0.61) return 'engineer';
    if (ratio < 0.69) return 'dragoon';
    if (ratio < 0.77) return 'cavalry';
    if (ratio < 0.83) return 'hussar';
    if (ratio < 0.88) return 'cuirassier';
    if (ratio < 0.93) return 'artillery';
    if (ratio < 0.96) return 'heavyArtillery';
    return 'horseArtillery';
  }

  private initialSpawnFor(team: Team, index: number, areaIndex = index % 3): Vec2 {
    return this.clampFormationPoint(BATTLEFIELD_MAP.spawnPoint(team, areaIndex, index * 5 + areaIndex));
  }

  private respawnFor(team: Team, index: number, areaIndex?: number): Vec2 {
    const id = `${team === 'blue' ? 'B' : 'R'}${String(index + 1).padStart(2, '0')}`;
    const selectedArea = areaIndex ?? this.plannedRespawnAreas.get(id) ?? this.formationSpawnAreas.get(id) ?? (index % 3);
    const serial = this.respawnSerial.get(id) ?? 0;
    return this.clampFormationPoint(BATTLEFIELD_MAP.spawnPoint(team, selectedArea, index * 7 + serial * 11 + selectedArea));
  }

  private nextRespawnPoint(formation: Formation, areaIndex: number): Vec2 {
    const index = this.teamIndexOf(formation);
    const serial = (this.respawnSerial.get(formation.id) ?? 0) + 1;
    this.respawnSerial.set(formation.id, serial);
    this.formationSpawnAreas.set(formation.id, areaIndex);
    return this.clampFormationPoint(BATTLEFIELD_MAP.spawnPoint(formation.team, areaIndex, index * 7 + serial * 11 + areaIndex));
  }

  private updateIntro(rawDt: number): void {
    this.introElapsed += rawDt;
    const ownEnd = GAME_CONFIG.intro.ownHold;
    const panEnd = ownEnd + GAME_CONFIG.intro.panToEnemy;
    const enemyEnd = panEnd + GAME_CONFIG.intro.enemyHold;
    const returnEnd = enemyEnd + GAME_CONFIG.intro.panBack;
    const conquestStart = this.conquestSystem?.points[0]?.position ?? this.blueBanner.position;
    const conquestEnd = this.conquestSystem?.points[2]?.position ?? this.redBanner.position;
    const firstFocus = this.conquestSystem ? conquestStart : this.blueBanner.position;
    const secondFocus = this.conquestSystem ? conquestEnd : this.redBanner.position;

    if (this.introElapsed < ownEnd) {
      this.introStage = 'own-banner';
      this.introProgress = this.introElapsed / ownEnd;
      this.camera.setCinematic(firstFocus, this.conquestSystem ? 0.64 : 0.76);
      return;
    }

    if (this.introElapsed < panEnd) {
      this.introStage = 'pan-enemy';
      const t = this.smoothstep((this.introElapsed - ownEnd) / GAME_CONFIG.intro.panToEnemy);
      this.introProgress = t;
      this.camera.setCinematic(this.lerpPoint(firstFocus, secondFocus, t), this.conquestSystem ? 0.48 : 0.66);
      return;
    }

    if (this.introElapsed < enemyEnd) {
      this.introStage = 'enemy-banner';
      this.introProgress = (this.introElapsed - panEnd) / GAME_CONFIG.intro.enemyHold;
      this.camera.setCinematic(secondFocus, this.conquestSystem ? 0.64 : 0.76);
      return;
    }

    if (this.introElapsed < returnEnd) {
      this.introStage = 'return-player';
      const t = this.smoothstep((this.introElapsed - enemyEnd) / GAME_CONFIG.intro.panBack);
      this.introProgress = t;
      this.camera.setCinematic(this.lerpPoint(secondFocus, this.playerFormation.center, t), 0.64);
      return;
    }

    this.introActive = false;
    this.introStage = 'done';
    this.introProgress = 1;
    this.camera.centerOn(this.playerFormation.center);
    this.setHint(
      this.conquestSystem
        ? 'CONQUEST: A/B/Cの旗を奪取 · 2拠点以上で敵Ticket減少 · 部隊壊滅でもTicket -1'
        : 'BATTLE: 敵Bannerは歩兵系の斧のみで破壊可能 · 1 MUSKET · 2 BAYONET · 3 AXE',
      8,
    );
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
        this.setHint('FREE CAMERA · SPACE で自部隊追従へ戻る', 2.5);
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

    if (formation.mode === 'line' && this.input.consumePressed('4')) {
      if (formation.squadClass === 'grenadier') this.performGrenadeThrow(formation, pointer);
      else this.setHint('4番スロットは擲弾兵専用：手榴弾', 1.8);
    }
    if ((formation.mode === 'line' || formation.mode === 'reforming') && this.input.consumePressed('6')) {
      const next = nextFormationShape(formation.squadClass, formation.formationShape);
      if (formation.setFormationShape(next)) this.setHint(`隊列を ${formationShapeLabel(next)} に変更`, 1.8);
    }

    if (formation.mode === 'routed') {
      this.cancelChargeAim();
      this.setHint('ROUTING — 士気が回復するまで操作不能', 1.2);
      this.input.clearActionInputs();
      return;
    }

    if (this.input.consumeReform()) {
      this.cancelChargeAim();
      if (formation.mode === 'bannerAttack') formation.cancelBannerAttack();
      const center = formation.averageAlivePosition();
      const direction = Math.atan2(pointer.y - center.y, pointer.x - center.x);
      formation.weapon = canBannerAttackClass(formation.squadClass)
        ? this.selectedWeapon
        : canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
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

    if (isArtilleryClass(formation.squadClass)) {
      this.cancelChargeAim();
      this.movePlayerFormation(dt);
      const profile = artilleryProfile(formation.squadClass, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
      if (primaryClick) {
        if (!formation.artilleryDeployed) {
          this.setHint(`${this.classLabel(formation.squadClass)} — 停止して展開完了を待つ`, 2.2);
        } else if (formation.reloadTimer > 0) {
          this.setHint(`CANNON RELOAD ${formation.reloadTimer.toFixed(1)}s`, 1.4);
        } else {
          const issue = artilleryTargetIssue(formation.squadClass, this.playerArtilleryRangeOrigin(), pointer, 0, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
          if (issue === 'too-far') {
            this.setHint(`射程外です — 最大射程 ${Math.round(profile.range).toLocaleString()}`, 1.8);
          } else if (issue === 'too-close') {
            this.setHint(`近すぎます — 最低射程 ${Math.round(profile.minRange).toLocaleString()}`, 1.8);
          } else if (this.predictArtilleryShots) {
            this.performArtilleryShot(formation, pointer, profile.playerReload);
          }
        }
      }
      return;
    }

    if (isChargeCavalryClass(formation.squadClass)) {
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
      if (primaryClick) this.setHint(`${this.classLabel(formation.squadClass)} — 射撃不可。右クリックで突撃`, 2.4);
      return;
    }

    if (formation.squadClass === 'dragoon') {
      this.cancelChargeAim();
      formation.weapon = 'musket';
      this.movePlayerFormation(dt);
      if (primaryClick && formation.canVolley()) this.performVolley(formation, volleyProfile('dragoon', formation.weaponTier).playerReload);
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
      if (this.conquestSystem) {
        this.setHint('コンクエストでは本陣旗は破壊目標ではありません', 2.4);
        return;
      }
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
        this.performVolley(formation, volleyProfile(formation.squadClass, formation.weaponTier).playerReload);
      } else if (primaryClick && this.selectedWeapon !== 'musket') {
        this.setHint(this.selectedWeapon === 'bayonet'
          ? '銃剣：右クリック長押し → 離して突撃'
          : '斧：敵旗を右クリックして破壊命令', 2.2);
      }
    }
  }


  private updateBaseRecovery(dt: number): void {
    for (const formation of this.formations) {
      if (formation.aliveCount() === 0) {
        this.baseRecoveryTimers.delete(formation.id);
        continue;
      }
      const conquestRecovery = !!this.recruitmentSystem;
      const needsRecovery = conquestRecovery
        ? formation.morale < GAME_CONFIG.morale.max - 0.1
          || formation.fieldworkKits < this.maxFieldworkKits(formation.squadClass)
        : formation.aliveCount() < formation.maxSoldiers()
          || formation.morale < GAME_CONFIG.morale.max - 0.1
          || formation.fieldworkKits < this.maxFieldworkKits(formation.squadClass);
      if (!needsRecovery) {
        this.baseRecoveryTimers.delete(formation.id);
        continue;
      }
      const areaIndex = BATTLEFIELD_MAP.nearestSpawnAreaIndex(formation.team, formation.center);
      const inRecoveryZone = BATTLEFIELD_MAP.inSpawnArea(formation.team, formation.center, GAME_CONFIG.army.baseRecoveryRadius);
      const stable = formation.mode === 'line' || formation.mode === 'reforming';
      const waiting = !formation.movedRecently() && !formation.forcedMarch;
      if (!inRecoveryZone || !stable || !waiting || formation.moraleShockTimer > 0) {
        this.baseRecoveryTimers.delete(formation.id);
        continue;
      }
      const elapsed = (this.baseRecoveryTimers.get(formation.id) ?? 0) + dt;
      this.baseRecoveryTimers.set(formation.id, elapsed);
      formation.debugIntent = conquestRecovery ? 'RECOVER' : 'REINFORCE';
      if (formation === this.playerFormation) {
        const remaining = Math.max(0, GAME_CONFIG.army.baseRecoverySeconds - elapsed);
        this.setHint(conquestRecovery ? `拠点で士気回復中... ${remaining.toFixed(1)}秒` : `拠点で補充中... ${remaining.toFixed(1)}秒`, 0.4);
      }
      if (elapsed < GAME_CONFIG.army.baseRecoverySeconds) continue;

      this.formationSpawnAreas.set(formation.id, areaIndex);
      if (conquestRecovery) {
        // CONQUEST never restores lost soldiers for free. Existing soldiers keep
        // their HP; the base only restores morale and fieldwork supplies.
        formation.morale = GAME_CONFIG.morale.max;
        formation.fieldworkKits = this.maxFieldworkKits(formation.squadClass);
      } else {
        const preservedWeapon = canBannerAttackClass(formation.squadClass)
          ? this.weaponForFormation(formation)
          : canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
        const recoveryCenter = { ...formation.center };
        const recoveryDirection = formation.direction;
        formation.reset(recoveryCenter, recoveryDirection, formation.squadClass);
        formation.weapon = preservedWeapon;
        this.humanWeapons.set(formation.id, preservedWeapon);
        if (formation === this.playerFormation) this.selectedWeapon = preservedWeapon;
      }
      this.baseRecoveryTimers.delete(formation.id);
      if (formation === this.playerFormation) {
        this.setNotice(conquestRecovery ? '回復完了 — 士気・資材を回復' : '補充完了 — 兵員・士気・資材を回復', 'success', 3);
      }
    }
  }

  claimHumanFormation(
    formationId: string,
    squadClass?: SquadClass,
    spawnAreaIndex?: number,
    resetForDeployment = false,
    clearStats = false,
  ): boolean {
    const formation = this.formations.find((candidate) => candidate.id === formationId);
    if (!formation) return false;
    this.humanFormationIds.add(formationId);
    formation.isPlayerControlled = true;
    this.remoteControls.delete(formationId);
    if (clearStats) {
      this.combatStats.set(formationId, { kills: 0, losses: 0, bannerDamage: 0 });
      this.resourceSystem?.resetFormationStats(formationId);
    } else {
      this.resourceSystem?.clearFormation(formationId);
    }
    this.recruitmentSystem?.clearFormation(formationId);
    if (resetForDeployment) {
      const area = Math.max(0, Math.min(2, Math.floor(spawnAreaIndex ?? this.teamIndexOf(formation) % 3)));
      const selectedClass = squadClass ?? formation.squadClass;
      formation.reset(this.nextRespawnPoint(formation, area), formation.team === 'blue' ? 0 : Math.PI, selectedClass);
      this.restoreUpgrades(formation);
      const capacity = this.savedCapacity(formation.id, selectedClass);
      formation.setMaxSoldiers(capacity);
      if (this.recruitmentSystem && isRecruitableClass(selectedClass)) {
        formation.setActiveStrength(standardStrength(selectedClass), true);
        formation.trimInactiveSoldiers(standardStrength(selectedClass));
      }
      this.respawnTimers.delete(formationId);
      this.deferredRespawns.delete(formationId);
      this.conquestWipeCounted.delete(formationId);
      this.plannedRespawnClasses.delete(formationId);
      this.plannedRespawnAreas.delete(formationId);
    }
    const weapon: WeaponType = canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
    formation.weapon = weapon;
    this.humanWeapons.set(formationId, weapon);
    this.aiSystem.reset(this.formations);
    return true;
  }

  releaseHumanFormation(formationId: string): void {
    this.humanFormationIds.delete(formationId);
    this.remoteControls.delete(formationId);
    this.humanWeapons.delete(formationId);
    this.baseRecoveryTimers.delete(formationId);
    this.resourceSystem?.clearFormation(formationId);
    this.recruitmentSystem?.clearFormation(formationId);
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
    if (action.type === 'spawn') {
      const spawnIndex = Math.max(0, Math.min(2, Math.floor(action.spawnIndex)));
      this.plannedRespawnAreas.set(formation.id, spawnIndex);
      return;
    }
    if (action.type === 'recruit_cancel') {
      this.recruitmentSystem?.cancel(formation.id);
      return;
    }
    if (action.type === 'recruit') {
      if (!this.recruitmentSystem || !this.resourceSystem || this.winner) return;
      this.recruitmentSystem.start(formation, action.count, this.resourceSystem);
      return;
    }
    if (action.type === 'upgrade_capacity') {
      if (!this.recruitmentSystem || !this.resourceSystem || this.winner) return;
      this.upgradeFormationCapacity(formation, false);
      return;
    }
    if (action.type === 'equipment_upgrade') {
      this.upgradeEquipment(formation, action.upgrade);
      return;
    }
    if (action.type === 'formation_shape') {
      if (formation.aliveCount() === 0 || this.winner) return;
      if (formation.mode !== 'line' && formation.mode !== 'reforming') return;
      formation.setFormationShape(action.shape);
      return;
    }
    if (action.type === 'construction_place') {
      this.beginConstructionPlace(formation, action.kind, action.target, action.direction);
      return;
    }
    if (action.type === 'construction_attack') {
      this.attackConstructionBlockWithAxe(formation, action.blockId);
      return;
    }
    if (action.type === 'construction_dismantle') {
      this.beginConstructionDismantle(formation, action.blockId);
      return;
    }
    if (formation.aliveCount() === 0 || this.winner) return;

    if (action.type !== 'weapon') {
      this.resourceSystem?.interrupt(formation.id, true);
      this.recruitmentSystem?.cancel(formation.id);
    }

    if (action.type === 'weapon') {
      if (!canBannerAttackClass(formation.squadClass)) return;
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
    const utilityReady = formation.mode === 'line' || formation.mode === 'reforming';
    if (action.type === 'grenade') {
      if (utilityReady) this.performGrenadeThrow(formation, action.target);
      return;
    }

    if (formation.mode !== 'line') return;

    if (action.type === 'fire') {
      if (isArtilleryClass(formation.squadClass)) {
        this.performArtilleryShot(formation, action.target, artilleryProfile(formation.squadClass, formation.artilleryPerformanceTier, formation.artilleryBatteryTier).playerReload);
      } else if (canVolleyClass(formation.squadClass) && this.weaponForFormation(formation) === 'musket' && formation.canVolley()) {
        this.performVolley(formation, volleyProfile(formation.squadClass, formation.weaponTier).playerReload);
      }
      return;
    }
    if (action.type === 'charge') {
      if (isArtilleryClass(formation.squadClass) || formation.squadClass === 'dragoon') return;
      if (canBannerAttackClass(formation.squadClass) && this.weaponForFormation(formation) !== 'bayonet') return;
      const target = this.clampChargeTarget(formation, action.target);
      formation.beginCharge(target);
      return;
    }
    if (action.type === 'banner-attack') {
      if (this.conquestSystem) return;
      if (!canBannerAttackClass(formation.squadClass) || this.weaponForFormation(formation) !== 'axe') return;
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
      if (canBannerAttackClass(formation.squadClass)) formation.weapon = this.weaponForFormation(formation);
      else if (canVolleyClass(formation.squadClass)) formation.weapon = 'musket';
      else formation.weapon = 'bayonet';
      const length = Math.hypot(control.moveX, control.moveY);
      formation.forcedMarch = control.forcedMarch
        && length > 0.001
        && formation.morale > GAME_CONFIG.army.forcedMarchMoraleFloor
        && formation.mode === 'line';
      if (length > 0.001) {
        const multiplier = formation.forcedMarch ? formation.forcedMarchMultiplier() : 1;
        const speed = formation.movementSpeed(true) * multiplier * dt;
        const moved = this.moveFormationWithTerrain(formation, control.moveX, control.moveY, speed);
        if (moved && formation.forcedMarch) formation.applyForcedMarch(dt);
      } else formation.forcedMarch = false;
    }
  }

  private weaponForFormation(formation: Formation): WeaponType {
    return this.humanWeapons.get(formation.id) ?? (formation === this.playerFormation ? this.selectedWeapon : formation.weapon);
  }

  private selectPlayerWeapon(weapon: WeaponType): void {
    if (!canBannerAttackClass(this.playerFormation.squadClass)) return;
    this.selectedWeapon = weapon;
    this.humanWeapons.set(this.playerFormation.id, weapon);
    if (this.playerFormation.aliveCount() === 0) return;
    if (this.playerFormation.mode === 'bannerAttack' && weapon !== 'axe') this.playerFormation.cancelBannerAttack();
    if (this.playerFormation.mode === 'line' || this.playerFormation.mode === 'reforming') this.playerFormation.weapon = weapon;
    const label = weapon === 'musket' ? 'MUSKET — 左クリックで一斉射撃'
      : weapon === 'bayonet' ? 'BAYONET — 右クリックで突撃'
        : 'AXE — 敵旗を右クリックして破壊';
    this.setHint(label, 2.5);
  }

  private applyAiCommands(dt: number): void {
    if (this.winner) return;
    const commands = this.aiSystem.update(this.formations, this.banners, dt);
    for (const command of commands) {
      const formation = command.formation;
      if (formation.aliveCount() === 0 || formation.mode === 'bannerAttack' || formation.mode === 'routed') continue;

      if (this.handleAiResourceGathering(formation, dt)) continue;
      if (this.handleAiEquipmentUpgrade(formation, dt)) continue;
      if (this.handleAiRecruitment(formation, dt)) continue;
      if (this.handleAiConquestObjective(formation, dt)) continue;

      if (formation.mode === 'line' && formation.squadClass === 'grenadier' && formation.grenadeCooldown <= 0) {
        const target = this.nearestEnemyFormation(formation);
        if (target && this.distance(formation.center, target.center) <= GAME_CONFIG.grenade.range && Math.random() < Math.min(0.45, dt * 2.2)) {
          this.performGrenadeThrow(formation, target.center);
        }
      }

      if (command.faceAngle !== null && formation.mode === 'line') formation.direction = command.faceAngle;

      if (!this.conquestSystem && command.bannerAttackTarget && formation.mode === 'line') {
        formation.beginBannerAttack(command.bannerAttackTarget.team, command.bannerAttackTarget.position);
        continue;
      }

      if (command.reform && formation.mode === 'line') {
        formation.weapon = canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
        formation.beginReform(command.faceAngle ?? formation.direction, undefined, GAME_CONFIG.reform.reloadPenalty);
        continue;
      }

      if (command.breakOffTarget) {
        this.orderBreakOff(formation, command.breakOffTarget);
        continue;
      }

      if (command.volley && formation.mode === 'line' && formation.canVolley()) {
        formation.weapon = 'musket';
        const profile = volleyProfile(formation.squadClass, formation.weaponTier);
        const reload = profile.aiReloadMin + Math.random() * (profile.aiReloadMax - profile.aiReloadMin);
        this.performVolley(formation, reload);
      }

      if (command.artilleryTarget && formation.mode === 'line' && formation.canArtilleryFire()) {
        const profile = artilleryProfile(formation.squadClass, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
        const reload = profile.aiReloadMin + Math.random() * (profile.aiReloadMax - profile.aiReloadMin);
        this.performArtilleryShot(formation, command.artilleryTarget, reload);
        continue;
      }

      if (command.chargeTarget && formation.mode === 'line') {
        const target = this.clampChargeTarget(formation, command.chargeTarget);
        formation.beginCharge(target);
        continue;
      }

      if (formation.mode === 'line') {
        if (canVolleyClass(formation.squadClass)) formation.weapon = 'musket';
        else formation.weapon = 'bayonet';
        const length = Math.hypot(command.move.x, command.move.y);
        if (length > 0.001) {
          const wantsForcedMarch = formation.morale > 68
            && (formation.debugIntent === 'ADVANCE' || formation.debugIntent === 'BREAKTHROUGH')
            && this.distanceToNearestEnemy(formation) > 950;
          formation.forcedMarch = wantsForcedMarch;
          const multiplier = wantsForcedMarch ? formation.forcedMarchMultiplier() : 1;
          const speed = formation.movementSpeed(false, formation.debugIntent === 'RETREAT') * multiplier * dt;
          const moved = this.moveFormationWithTerrain(formation, command.move.x, command.move.y, speed);
          if (moved && wantsForcedMarch) formation.applyForcedMarch(dt);
        } else formation.forcedMarch = false;
      }
    }
  }

  private handleAiConquestObjective(formation: Formation, dt: number): boolean {
    if (!this.conquestSystem || formation.isPlayerControlled || formation.aliveCount() <= 0 || formation.mode !== 'line') return false;
    if (isArtilleryClass(formation.squadClass)) return false;
    // Nearby enemies always take precedence. Conquest only replaces the old
    // long-distance march toward the enemy Banner when the squad is between fights.
    if (this.distanceToNearestEnemy(formation) <= 1050) return false;
    const point = this.conquestSystem.objectiveFor(formation.team, formation.id);
    const distance = this.distance(formation.center, point.position);
    formation.forcedMarch = false;
    formation.weapon = canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
    formation.debugIntent = `CAPTURE ${point.id}`;
    formation.debugTargetId = `POINT-${point.id}`;
    if (distance <= 300) {
      formation.direction = formation.team === 'blue' ? -Math.PI / 4 : Math.PI * 3 / 4;
      return true;
    }
    const move = this.aiSystem.navigateToObjective(formation, point.position, dt, `POINT-${point.id}`);
    const length = Math.hypot(move.x, move.y);
    if (length <= 0.001) return true;
    formation.direction = Math.atan2(move.y, move.x);
    const wantsForcedMarch = formation.morale > 72 && distance > 1200;
    formation.forcedMarch = wantsForcedMarch;
    const speed = formation.movementSpeed(false) * (wantsForcedMarch ? formation.forcedMarchMultiplier() : 1) * dt;
    const moved = this.moveFormationWithTerrain(formation, move.x, move.y, speed);
    if (moved && wantsForcedMarch) formation.applyForcedMarch(dt);
    return true;
  }

  private cancelThreatenedAiRecruitment(): void {
    if (!this.recruitmentSystem) return;
    for (const formation of this.formations) {
      if (formation.isPlayerControlled || !this.recruitmentSystem.stateFor(formation.id)) continue;
      if (formation.aliveCount() <= 0 || formation.mode === 'routed' || this.distanceToNearestEnemy(formation) <= AI_RECRUIT_THREAT_RANGE) {
        this.recruitmentSystem.cancel(formation.id);
      }
    }
  }

  private handleAiEquipmentUpgrade(formation: Formation, dt: number): boolean {
    if (!this.modeRules.equipment || !this.resourceSystem || formation.isPlayerControlled) return false;
    if (formation.aliveCount() <= 0 || formation.mode !== 'line' || this.aiEquipmentCooldowns.has(formation.id)) return false;
    if (formation.aliveCount() / Math.max(1, formation.maxSoldiers()) < 0.85) return false;
    if (this.distanceToNearestEnemy(formation) <= AI_EQUIPMENT_THREAT_RANGE) return false;
    if (!this.isAiEquipmentCandidate(formation)) return false;

    const state = formation.upgradeState();
    const kinds = validUpgradeKinds(formation.squadClass);
    const kind = kinds
      .filter((candidate) => tierForKind(state, candidate) < 3)
      .sort((a, b) => tierForKind(state, a) - tierForKind(state, b))[0];
    if (!kind) return false;
    const currentTier = tierForKind(state, kind);
    const cost = upgradeCost(formation.squadClass, kind, currentTier);
    if (!this.resourceSystem.canAffordWithReserve(formation.team, cost, AI_RECRUIT_RESOURCE_RESERVE)) return false;

    const facility = closestUpgradeFacility(formation.team, formation.squadClass, formation.center);
    if (!facility) return false;
    const distanceToFacility = this.distance(formation.center, facility.position);
    formation.forcedMarch = false;
    formation.debugIntent = `UPGRADE ${upgradeKindLabel(kind)}`;
    formation.debugTargetId = facility.id;
    if (distanceToFacility <= 270) {
      if (!this.resourceSystem.consumeWithReserve(formation.team, cost, AI_RECRUIT_RESOURCE_RESERVE)) return false;
      const next = (currentTier + 1) as 2 | 3;
      formation.setUpgradeState(withUpgradeTier(state, kind, next));
      this.rememberUpgrades(formation);
      this.aiEquipmentCooldowns.set(formation.id, AI_EQUIPMENT_UPGRADE_COOLDOWN);
      return true;
    }

    formation.weapon = canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
    const move = this.aiSystem.navigateToObjective(formation, facility.position, dt, `UPGRADE-${facility.id}`);
    const length = Math.hypot(move.x, move.y);
    if (length <= 0.001) return true;
    formation.direction = Math.atan2(move.y, move.x);
    const speed = formation.movementSpeed(false, true) * dt;
    this.moveFormationWithTerrain(formation, move.x, move.y, speed);
    return true;
  }

  private isAiEquipmentCandidate(formation: Formation): boolean {
    const candidates = this.formations
      .filter((candidate) => candidate.team === formation.team
        && !candidate.isPlayerControlled
        && candidate.aliveCount() > 0
        && candidate.mode === 'line'
        && !this.aiEconomicWorkers.has(candidate.id)
        && !this.recruitmentSystem?.stateFor(candidate.id)
        && !this.aiEquipmentCooldowns.has(candidate.id)
        && validUpgradeKinds(candidate.squadClass).some((kind) => tierForKind(candidate.upgradeState(), kind) < 3))
      .sort((a, b) => {
        const totalTier = (candidate: Formation): number => validUpgradeKinds(candidate.squadClass)
          .reduce((sum, kind) => sum + tierForKind(candidate.upgradeState(), kind), 0);
        const tierDelta = totalTier(a) - totalTier(b);
        if (tierDelta !== 0) return tierDelta;
        return this.teamIndexOf(a) - this.teamIndexOf(b);
      });
    return candidates[0]?.id === formation.id;
  }

  private handleAiRecruitment(formation: Formation, dt: number): boolean {
    if (!this.recruitmentSystem || !this.resourceSystem || formation.isPlayerControlled) return false;
    if (!isRecruitableClass(formation.squadClass) || formation.aliveCount() <= 0) return false;

    const active = this.recruitmentSystem.stateFor(formation.id);
    if (active) {
      formation.forcedMarch = false;
      formation.debugIntent = 'RECRUIT';
      formation.debugTargetId = active.barracksId;
      return true;
    }

    if (formation.mode !== 'line') return false;
    if (this.distanceToNearestEnemy(formation) <= AI_RECRUIT_THREAT_RANGE) return false;

    const maxSoldiers = Math.max(1, formation.maxSoldiers());
    const alive = formation.aliveCount();
    const fillTarget = this.aiGrowthFillTargets.get(formation.id);
    if (fillTarget !== undefined && alive >= Math.min(fillTarget, maxSoldiers)) this.aiGrowthFillTargets.delete(formation.id);
    const mustFillGrowth = fillTarget !== undefined && alive < Math.min(fillTarget, maxSoldiers);
    const nextCapacity = nextGrowthCapacity(formation.squadClass, maxSoldiers);
    const canConsiderGrowth = alive >= maxSoldiers
      && nextCapacity !== null
      && !this.aiGrowthCooldowns.has(formation.id)
      && this.isAiGrowthCandidate(formation);

    let wantsGrowth = false;
    if (canConsiderGrowth) {
      const cost = capacityUpgradeCost(formation.squadClass, maxSoldiers);
      wantsGrowth = this.resourceSystem.canAffordWithReserve(formation.team, cost, AI_RECRUIT_RESOURCE_RESERVE);
    }

    const strengthRatio = alive / maxSoldiers;
    const missing = Math.max(0, maxSoldiers - alive);
    let recruitCount = 0;
    if (!wantsGrowth && (mustFillGrowth || strengthRatio <= AI_RECRUIT_TRIGGER_RATIO) && missing > 0) {
      recruitCount = Math.min(AI_RECRUIT_BATCH_SIZE, missing);
      while (recruitCount > 0) {
        const cost = recruitmentCost(formation.squadClass, recruitCount);
        if (this.resourceSystem.canAffordWithReserve(formation.team, cost, AI_RECRUIT_RESOURCE_RESERVE)) break;
        recruitCount -= 1;
      }
    }
    if (!wantsGrowth && recruitCount <= 0) return false;

    const barracks = this.recruitmentSystem.closestBarracks(formation.team, formation.center);
    if (!barracks) return false;
    const distanceToBarracks = this.distance(formation.center, barracks.position);
    if (distanceToBarracks <= RECRUITMENT_INTERACTION_RANGE) {
      formation.forcedMarch = false;
      formation.debugIntent = wantsGrowth ? 'UPGRADE' : 'RECRUIT';
      formation.debugTargetId = barracks.id;
      if (wantsGrowth) return this.upgradeFormationCapacity(formation, true);
      return this.recruitmentSystem.start(formation, recruitCount, this.resourceSystem, {
        ai: true,
        reserveRatio: AI_RECRUIT_RESOURCE_RESERVE,
      });
    }

    formation.debugIntent = wantsGrowth ? 'UPGRADE' : 'RECRUIT';
    formation.debugTargetId = barracks.id;
    const move = this.aiSystem.navigateToObjective(formation, barracks.position, dt, `BARRACKS-${formation.team.toUpperCase()}`);
    const length = Math.hypot(move.x, move.y);
    if (length <= 0.001) return true;
    formation.forcedMarch = false;
    formation.weapon = canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
    formation.direction = Math.atan2(move.y, move.x);
    const speed = formation.movementSpeed(false, true) * dt;
    this.moveFormationWithTerrain(formation, move.x, move.y, speed);
    return true;
  }

  private isAiGrowthCandidate(formation: Formation): boolean {
    const candidates = this.formations
      .filter((candidate) => candidate.team === formation.team
        && !candidate.isPlayerControlled
        && !this.aiEconomicWorkers.has(candidate.id)
        && candidate.aliveCount() > 0
        && candidate.mode === 'line'
        && isRecruitableClass(candidate.squadClass)
        && candidate.aliveCount() >= candidate.maxSoldiers()
        && nextGrowthCapacity(candidate.squadClass, candidate.maxSoldiers()) !== null
        && !this.aiGrowthCooldowns.has(candidate.id))
      .sort((a, b) => {
        const aRatio = a.maxSoldiers() / Math.max(1, growthLimit(a.squadClass));
        const bRatio = b.maxSoldiers() / Math.max(1, growthLimit(b.squadClass));
        if (Math.abs(aRatio - bRatio) > 0.001) return aRatio - bRatio;
        return this.teamIndexOf(a) - this.teamIndexOf(b);
      });
    return candidates[0]?.id === formation.id;
  }

  private economicStockTargets(team: Team): ResourceStockpile {
    const recruitableSquads = this.formations.filter((formation) => formation.team === team && isRecruitableClass(formation.squadClass)).length;
    const equipmentFactor = this.modeRules.equipment ? Math.max(1, recruitableSquads) : 0;
    return {
      wood: Math.max(160, 100 + recruitableSquads * 32),
      iron: Math.max(220, 145 + recruitableSquads * 46),
      gunpowder: this.modeRules.equipment ? Math.max(160, 80 + equipmentFactor * 28) : 0,
      alloy: this.modeRules.equipment ? Math.max(45, 20 + Math.ceil(equipmentFactor * 4.5)) : 0,
    };
  }

  private refreshAiEconomicWorkers(dt: number): void {
    if (!this.resourceSystem || !this.recruitmentSystem) {
      this.aiEconomicWorkers.clear();
      return;
    }
    this.aiEconomicRoleTimer -= dt;
    if (this.aiEconomicRoleTimer > 0) return;
    this.aiEconomicRoleTimer = AI_ECONOMY_ROLE_REFRESH_SECONDS;

    const nextWorkers = new Set<string>();
    const resourceOrder: ResourceType[] = this.modeRules.equipment ? ['wood', 'iron', 'gunpowder', 'alloy'] : ['wood', 'iron'];
    for (const team of ['blue', 'red'] as const) {
      const stockpile = this.resourceSystem.getStockpile(team);
      const targets = this.economicStockTargets(team);
      const hadWorkers = this.formations.some((formation) => formation.team === team && this.aiEconomicWorkers.has(formation.id));
      const threshold = hadWorkers ? 1.05 : 0.78;
      const needsSupply = resourceOrder.some((resource) => stockpile[resource] < targets[resource] * threshold);
      if (!needsSupply) continue;

      const candidates = this.formations
        .filter((formation) => formation.team === team
          && !formation.isPlayerControlled
          && formation.aliveCount() > 0
          && isRecruitableClass(formation.squadClass)
          && !this.aiGrowthFillTargets.has(formation.id)
          && !this.recruitmentSystem!.stateFor(formation.id))
        .sort((a, b) => {
          const priority = (formation: Formation): number => formation.squadClass === 'engineer' ? 0
            : formation.squadClass === 'lightInfantry' ? 1
              : formation.squadClass === 'infantry' ? 2
                : formation.squadClass === 'grenadier' ? 3
                  : 4;
          const classDelta = priority(a) - priority(b);
          if (classDelta !== 0) return classDelta;
          return this.teamIndexOf(a) - this.teamIndexOf(b);
        });
      if (candidates.length === 0) continue;
      const desiredWorkers = Math.min(AI_ECONOMY_MAX_WORKERS, Math.floor(candidates.length * AI_ECONOMY_WORKER_RATIO));
      if (desiredWorkers <= 0) continue;
      const assignedCounts: Record<ResourceType, number> = { wood: 0, iron: 0, gunpowder: 0, alloy: 0 };
      for (let i = 0; i < desiredWorkers && i < candidates.length; i += 1) {
        const worker = candidates[i];
        const existing = this.aiEconomicAssignments.get(worker.id);
        const existingStillNeeded = existing && resourceOrder.includes(existing)
          ? stockpile[existing] < targets[existing] * 1.05
          : false;
        let resource: ResourceType;
        if (existingStillNeeded && existing) resource = existing;
        else {
          resource = [...resourceOrder].sort((a, b) => {
            const aPressure = stockpile[a] / Math.max(1, targets[a]) + assignedCounts[a] / Math.max(1, desiredWorkers);
            const bPressure = stockpile[b] / Math.max(1, targets[b]) + assignedCounts[b] / Math.max(1, desiredWorkers);
            return aPressure - bPressure;
          })[0];
        }
        nextWorkers.add(worker.id);
        this.aiEconomicAssignments.set(worker.id, resource);
        assignedCounts[resource] += 1;
      }
    }

    for (const formationId of this.aiEconomicWorkers) {
      if (!nextWorkers.has(formationId)) {
        this.resourceSystem.setAiGatherTarget(formationId, null);
        this.aiEconomicAssignments.delete(formationId);
      }
    }
    this.aiEconomicWorkers.clear();
    for (const formationId of nextWorkers) this.aiEconomicWorkers.add(formationId);
  }

  private handleAiResourceGathering(formation: Formation, dt: number): boolean {
    if (!this.resourceSystem || !this.recruitmentSystem || formation.isPlayerControlled || !isRecruitableClass(formation.squadClass)) return false;
    if (!this.aiEconomicWorkers.has(formation.id)) {
      this.resourceSystem.setAiGatherTarget(formation.id, null);
      return false;
    }
    if (formation.aliveCount() <= 0 || formation.mode !== 'line' || this.distanceToNearestEnemy(formation) <= AI_ECONOMY_THREAT_RANGE) {
      this.resourceSystem.setAiGatherTarget(formation.id, null);
      return false;
    }

    const assigned = this.aiEconomicAssignments.get(formation.id) ?? 'wood';
    let node = this.resourceSystem.bestNodeFor(formation.team, assigned, formation.center);
    if (!node) {
      const fallback: ResourceType = assigned === 'wood' ? 'iron' : 'wood';
      node = this.resourceSystem.bestNodeFor(formation.team, fallback, formation.center);
      if (node) this.aiEconomicAssignments.set(formation.id, fallback);
    }
    if (!node) {
      this.resourceSystem.setAiGatherTarget(formation.id, null);
      return false;
    }

    const distanceToNode = this.distance(formation.center, node.position);
    formation.forcedMarch = false;
    formation.weapon = canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
    formation.debugIntent = `GATHER ${RESOURCE_LABELS[node.resource]}`;
    formation.debugTargetId = node.id;

    if (distanceToNode <= RESOURCE_INTERACTION_RANGE) {
      this.resourceSystem.setAiGatherTarget(formation.id, node.id);
      formation.direction = this.angleTo(formation.center, node.position);
      return true;
    }

    this.resourceSystem.setAiGatherTarget(formation.id, null);
    const move = this.aiSystem.navigateToObjective(formation, node.position, dt, `RESOURCE-${RESOURCE_LABELS[node.resource]}`);
    const length = Math.hypot(move.x, move.y);
    if (length <= 0.001) return true;
    formation.direction = Math.atan2(move.y, move.x);
    const speed = formation.movementSpeed(false) * dt;
    this.moveFormationWithTerrain(formation, move.x, move.y, speed);
    return true;
  }

  private movePlayerFormation(dt: number): void {
    let x = 0;
    let y = 0;
    if (this.input.isDown('a')) x -= 1;
    if (this.input.isDown('d')) x += 1;
    if (this.input.isDown('w')) y -= 1;
    if (this.input.isDown('s')) y += 1;
    const length = Math.hypot(x, y);
    const formation = this.playerFormation;
    formation.forcedMarch = length > 0
      && this.input.isForcedMarchHeld()
      && formation.morale > GAME_CONFIG.army.forcedMarchMoraleFloor
      && formation.mode === 'line';
    if (length > 0) {
      const multiplier = formation.forcedMarch ? formation.forcedMarchMultiplier() : 1;
      const speed = formation.movementSpeed(true) * multiplier * dt;
      const moved = this.moveFormationWithTerrain(formation, x, y, speed);
      if (moved && formation.forcedMarch) formation.applyForcedMarch(dt);
    }
  }

  private updateCharges(dt: number): void {
    for (const charger of this.formations) {
      if (charger.mode !== 'charging' || charger.aliveCount() === 0) continue;
      if (isChargeCavalryClass(charger.squadClass) && BATTLEFIELD_MAP.isWater(charger.center) && !BATTLEFIELD_MAP.isBridge(charger.center)) {
        charger.chargeMomentum = 0;
        charger.beginReform(charger.direction, this.clampFormationPoint(charger.center), GAME_CONFIG.charge.postChargeReloadPenalty);
        if (charger === this.playerFormation) this.setNotice('渡河中は騎兵突撃できません', 'warning', 2);
        continue;
      }
      const beforeCharge = { ...charger.center };
      const terrainMultiplier = Math.max(0.28, BATTLEFIELD_MAP.movementMultiplier(charger.center, charger.squadClass));
      const reached = charger.advanceCharge(dt * terrainMultiplier);
      const constructionWall = this.constructionBlocks.find((block) => block.active && constructionBlocksMovement(block.kind) && !(block.kind === 'door' && block.team === charger.team) && pointInsideConstructionBlock(charger.center, block, 34));
      if (constructionWall) {
        if (constructionWall.team !== charger.team) {
          const damage = isChargeCavalryClass(charger.squadClass)
            ? (constructionWall.kind === 'ironWall' ? 155 : 235)
            : (constructionWall.kind === 'ironWall' ? 34 : 52);
          constructionWall.takeDamage(damage);
          this.constructionDirty = true;
          if (!constructionWall.active) this.handleDestroyedConstructionBlocks();
        }
        charger.center = beforeCharge;
        charger.applyMoraleDamage(isChargeCavalryClass(charger.squadClass) ? 9 : 4);
        charger.chargeMomentum = 0;
        charger.beginReform(charger.direction, this.clampFormationPoint(charger.center), GAME_CONFIG.charge.postChargeReloadPenalty);
        if (charger === this.playerFormation) this.setNotice('突撃阻止 — 防壁！', 'warning', 2);
        continue;
      }
      if (!BATTLEFIELD_MAP.isPassable(charger.center)) {
        charger.center = beforeCharge;
        charger.chargeMomentum = 0;
        charger.beginReform(charger.direction, this.clampFormationPoint(charger.center), GAME_CONFIG.charge.postChargeReloadPenalty);
        continue;
      }
      if (isChargeCavalryClass(charger.squadClass) && BATTLEFIELD_MAP.isWater(charger.center) && !BATTLEFIELD_MAP.isBridge(charger.center)) {
        charger.chargeMomentum = 0;
        charger.beginReform(charger.direction, this.clampFormationPoint(charger.center), GAME_CONFIG.charge.postChargeReloadPenalty);
        if (charger === this.playerFormation) this.setNotice('渡河で突撃が止まりました', 'warning', 2);
        continue;
      }
      this.clampFormationCenter(charger);
      const enemies = this.formations.filter((formation) => formation.team !== charger.team && formation.aliveCount() > 0);

      if (isChargeCavalryClass(charger.squadClass)) {
        const profile = chargeProfile(charger.squadClass, charger.weaponTier);
        const blocking = this.fieldworks.find((fieldwork) => fieldwork.active
          && fieldwork.team !== charger.team
          && this.distancePointToFieldwork(charger.center, fieldwork) <= 38);
        if (blocking) {
          blocking.takeDamage(GAME_CONFIG.fieldworks.chargeDamage);
          charger.applyMoraleDamage(GAME_CONFIG.fieldworks.chargeMoraleDamage);
          charger.chargeMomentum = 0;
          charger.beginReform(charger.direction, this.clampFormationPoint(charger.center), GAME_CONFIG.charge.postChargeReloadPenalty);
          if (charger === this.playerFormation) this.setNotice('突撃阻止 — 馬防柵！', 'warning', 2);
          continue;
        }
        this.resolveCavalryRoadkill(charger, enemies);
        if (charger.chargeMomentum <= profile.minMomentum || reached) {
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
    const profile = chargeProfile(charger.squadClass, charger.weaponTier);
    const radiusSq = profile.roadkillRadius * profile.roadkillRadius;
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
        const killed = target.takeDamage(profile.roadkillDamage * Math.max(0.55, charger.chargeMomentum) * armorDamageMultiplier(enemy.squadClass, enemy.armorTier, 'charge'));
        enemy.applyMoraleDamage(profile.roadkillMoraleDamage + (killed ? 4 : 0));
        target.knockback.x += impact.x * 220;
        target.knockback.y += impact.y * 220;
        target.position.x += impact.x * 18;
        target.position.y += impact.y * 18;
        charger.chargeMomentum = Math.max(0, charger.chargeMomentum - profile.momentumPerHit);
        hitSomething = true;
        if (killed) this.recordDeath(target.position, target.team, impact, charger.id, enemy.id);
      }
    }
    if (hitSomething && (charger.isPlayerControlled || this.distanceToPlayer(charger.center) < 760)) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.cavalryChargeShake);
    }
  }

  private updateBannerAttacks(dt: number): void {
    if (this.conquestSystem) return;
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
        this.moveFormationWithTerrain(formation, mdx, mdy, step);
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
      const engineerMultiplier = formation.squadClass === 'engineer' ? 2.4 : 1;
      const axeMultiplier = weaponTierMultipliers(formation.squadClass, formation.weaponTier).axe;
      const dealtBannerDamage = banner.takeDamage(attackers * GAME_CONFIG.banner.axeDamagePerSoldier * engineerMultiplier * axeMultiplier);
      const attackerStats = this.getFormationStats(formation.id);
      attackerStats.bannerDamage += dealtBannerDamage;
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

  private updateMoraleAndRouts(dt: number): void {
    if (this.winner) return;
    for (const formation of this.formations) {
      if (formation.aliveCount() === 0) continue;
      if (formation.shouldRout()) {
        const distance = GAME_CONFIG.morale.routedDistance;
        const target = this.clampFormationPoint({
          x: formation.center.x + (formation.team === 'blue' ? -distance : distance),
          y: formation.center.y + (Math.random() - 0.5) * 180,
        });
        if (formation.beginRout(target)) {
          this.applyNearbyMoraleShock(formation, 5.5, 430);
          if (formation.isPlayerControlled) this.setNotice('MORALE BROKEN — ROUT!', 'warning', 3.2);
        }
      }
      if (formation.mode !== 'routed') continue;
      const reached = formation.advanceRout(dt);
      this.clampFormationCenter(formation);
      if ((formation.morale >= GAME_CONFIG.morale.reformThreshold && formation.routTravelled >= GAME_CONFIG.morale.routedDistance * 0.55) || reached) {
        const direction = this.angleTo(formation.center, this.enemyDirectionPoint(formation.team));
        formation.morale = Math.max(formation.morale, GAME_CONFIG.morale.reformThreshold);
        formation.beginPostRoutRecovery();
        formation.beginReform(direction, formation.center, GAME_CONFIG.reform.breakOffReloadPenalty);
        formation.debugIntent = 'RALLY';
        if (formation.isPlayerControlled) this.setNotice('SQUAD RALLIED', 'success', 2.4);
      }
    }
  }

  private applyNearbyMoraleShock(source: Formation, amount: number, radius: number = GAME_CONFIG.morale.nearbyWipeRadius): void {
    for (const ally of this.formations) {
      if (ally === source || ally.team !== source.team || ally.aliveCount() === 0) continue;
      if (this.distance(ally.center, source.center) <= radius) ally.applyMoraleDamage(amount);
    }
  }

  private updateRespawns(dt: number): void {
    if (this.winner) return;

    for (const team of ['blue', 'red'] as const) {
      const dead = this.formations.filter((formation) => formation.team === team && formation.aliveCount() === 0);
      if (dead.length === 0) {
        this.reinforcementWaveRemaining[team] = this.respawnSeconds;
        continue;
      }

      if (this.conquestSystem) {
        for (const formation of dead) {
          if (this.conquestWipeCounted.has(formation.id)) continue;
          this.conquestWipeCounted.add(formation.id);
          this.conquestSystem.onSquadWiped(team);
          if (formation === this.playerFormation) this.setNotice(`部隊壊滅 — ${team.toUpperCase()} TICKETS ${this.conquestSystem.tickets[team]}`, 'warning', 3.5);
        }
        if (!this.conquestSystem.canRespawn(team)) {
          this.reinforcementWaveRemaining[team] = 0;
          for (const formation of dead) {
            this.remoteControls.delete(formation.id);
            this.recruitmentSystem?.clearFormation(formation.id);
            this.respawnTimers.delete(formation.id);
            this.deferredRespawns.delete(formation.id);
            this.baseRecoveryTimers.delete(formation.id);
          }
          if (this.playerFormation.team === team && this.playerFormation.aliveCount() === 0) {
            this.cancelChargeAim();
            this.setHint('増援枯渇 — 生存中の味方部隊が最後の戦力です', 0.5);
          }
          continue;
        }
      }

      for (const formation of dead) {
        if (this.respawnTimers.has(formation.id)) continue;
        // Never carry the last non-zero network control through a death/respawn.
        // The client must send a fresh movement state after redeployment.
        this.remoteControls.delete(formation.id);
        this.recruitmentSystem?.clearFormation(formation.id);
        const lateForWave = this.reinforcementWaveRemaining[team] < Math.min(
          GAME_CONFIG.army.respawnJoinCutoffSeconds,
          this.respawnSeconds * 0.35,
        );
        if (lateForWave) this.deferredRespawns.add(formation.id);
        const initialWait = this.reinforcementWaveRemaining[team] + (lateForWave ? this.respawnSeconds : 0);
        this.respawnTimers.set(formation.id, initialWait);
        this.applyNearbyMoraleShock(formation, GAME_CONFIG.morale.nearbyWipeDamage);
        this.baseRecoveryTimers.delete(formation.id);
        if (formation.isPlayerControlled) {
          const planned = this.plannedRespawnClasses.get(formation.id) ?? formation.squadClass;
          this.plannedRespawnClasses.set(formation.id, planned);
          const plannedArea = this.plannedRespawnAreas.get(formation.id) ?? this.formationSpawnAreas.get(formation.id) ?? (this.teamIndexOf(formation) % 3);
          this.plannedRespawnAreas.set(formation.id, plannedArea);
          if (formation === this.playerFormation) {
            this.cancelChargeAim();
            this.setNotice(
              lateForWave ? 'SQUAD WIPED — QUEUED FOR THE FOLLOWING WAVE' : 'YOUR SQUAD WAS WIPED — NEXT REINFORCEMENT WAVE',
              'warning',
              4,
            );
          }
        } else {
          const chosen = this.aiSystem.chooseRespawnClass(formation, this.formations, this.banners, this.plannedRespawnClasses);
          this.plannedRespawnClasses.set(formation.id, chosen);
        }
      }

      this.reinforcementWaveRemaining[team] = Math.max(0, this.reinforcementWaveRemaining[team] - dt);
      for (const formation of dead) {
        const wait = this.reinforcementWaveRemaining[team] + (this.deferredRespawns.has(formation.id) ? this.respawnSeconds : 0);
        this.respawnTimers.set(formation.id, wait);
      }
      if (this.reinforcementWaveRemaining[team] > 0) continue;

      for (const formation of dead) {
        if (this.deferredRespawns.has(formation.id)) continue;
        let chosenClass = this.plannedRespawnClasses.get(formation.id) ?? formation.squadClass;
        if (!formation.isPlayerControlled) {
          this.plannedRespawnClasses.delete(formation.id);
          chosenClass = this.aiSystem.chooseRespawnClass(formation, this.formations, this.banners, this.plannedRespawnClasses);
        }
        const index = this.teamIndexOf(formation);
        const chosenArea = formation.isPlayerControlled
          ? (this.plannedRespawnAreas.get(formation.id) ?? this.formationSpawnAreas.get(formation.id) ?? (index % 3))
          : (index % 3);
        formation.reset(this.nextRespawnPoint(formation, chosenArea), formation.team === 'blue' ? 0 : Math.PI, chosenClass);
        this.restoreUpgrades(formation);
        if (this.recruitmentSystem && isRecruitableClass(chosenClass)) {
          const capacity = this.savedCapacity(formation.id, chosenClass);
          formation.setMaxSoldiers(capacity);
          formation.setActiveStrength(standardStrength(chosenClass), true);
          formation.trimInactiveSoldiers(standardStrength(chosenClass));
          if (!formation.isPlayerControlled && capacity > standardStrength(chosenClass)) this.aiGrowthFillTargets.set(formation.id, capacity);
        }
        this.remoteControls.delete(formation.id);
        this.respawnTimers.delete(formation.id);
        this.conquestWipeCounted.delete(formation.id);
        this.plannedRespawnClasses.delete(formation.id);
        this.plannedRespawnAreas.delete(formation.id);
        if (formation.isPlayerControlled) {
          const nextWeapon: WeaponType = canVolleyClass(chosenClass) ? 'musket' : 'bayonet';
          this.humanWeapons.set(formation.id, nextWeapon);
          formation.weapon = nextWeapon;
          if (formation === this.playerFormation) {
            this.selectedWeapon = nextWeapon;
            this.camera.centerOn(formation.center);
            this.setNotice(`${this.classLabel(chosenClass)} REDEPLOYED — REINFORCEMENT WAVE`, 'success', 3.2);
          }
        }
      }

      // Squads destroyed in the final seconds of a wave must wait for the next
      // full wave instead of appearing again almost immediately.
      for (const formation of dead) {
        if (!this.deferredRespawns.has(formation.id)) continue;
        this.deferredRespawns.delete(formation.id);
        if (formation.aliveCount() === 0) this.respawnTimers.set(formation.id, this.respawnSeconds);
      }
      this.reinforcementWaveRemaining[team] = this.respawnSeconds;
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
        formation.weapon = canVolleyClass(formation.squadClass)
          ? (canBannerAttackClass(formation.squadClass) && formation.isPlayerControlled ? this.weaponForFormation(formation) : 'musket')
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
    formation.weapon = canVolleyClass(formation.squadClass)
      ? (canBannerAttackClass(formation.squadClass) && formation.isPlayerControlled ? this.weaponForFormation(formation) : 'musket')
      : 'bayonet';
    formation.beginReform(facing, target, GAME_CONFIG.reform.breakOffReloadPenalty);
    if (formation.isPlayerControlled) this.screenShake = Math.max(this.screenShake, 1.4);
  }

  private rescueFormationsFromMountains(): void {
    for (const formation of this.formations) {
      if (formation.aliveCount() <= 0) continue;
      this.rescueFormationFromMountain(formation);
    }
  }

  private rescueFormationFromMountain(formation: Formation): void {
    if (BATTLEFIELD_MAP.isPassable(formation.center)) return;
    const safe = BATTLEFIELD_MAP.nearestPassablePoint(formation.center);
    if (!BATTLEFIELD_MAP.isPassable(safe)) return;
    const dx = safe.x - formation.center.x;
    const dy = safe.y - formation.center.y;
    formation.center.x = safe.x;
    formation.center.y = safe.y;
    for (const soldier of formation.soldiers) {
      if (soldier.dead) continue;
      soldier.position.x += dx;
      soldier.position.y += dy;
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
    this.queuePresentationEvent({
      kind: 'volley',
      formationId: formation.id,
      team: formation.team,
      x: formation.center.x,
      y: formation.center.y,
      direction: formation.direction,
      count: Math.max(1, formation.aliveCount()),
    });
    formation.beginReload(reloadSeconds);
    if (formation.isPlayerControlled || this.distanceToPlayer(formation.center) < 750) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.screenShake);
    }
    if (this.smoke.length > GAME_CONFIG.effects.maxSmoke) {
      this.smoke.splice(0, this.smoke.length - GAME_CONFIG.effects.maxSmoke);
    }
  }

  setLocalFormationShape(shape: FormationShape): boolean {
    const formation = this.playerFormation;
    if (formation.aliveCount() === 0 || (formation.mode !== 'line' && formation.mode !== 'reforming')) return false;
    const changed = formation.setFormationShape(shape);
    if (changed) this.setHint(`隊列: ${formationShapeLabel(shape)}`, 1.8);
    return changed;
  }

  playerArtilleryRangeOrigin(): Vec2 {
    const target = this.networkTargets.get(this.playerFormation.id);
    if (target) return { x: target.x, y: target.y };
    return { ...this.playerFormation.center };
  }

  private performArtilleryShot(formation: Formation, desiredTarget: Vec2, reloadSeconds: number): void {
    if (!formation.canArtilleryFire()) return;
    const profile = artilleryProfile(formation.squadClass, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
    const dx = desiredTarget.x - formation.center.x;
    const dy = desiredTarget.y - formation.center.y;
    const issue = artilleryTargetIssue(formation.squadClass, formation.center, desiredTarget, 48, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
    if (issue === 'too-far') {
      if (formation === this.playerFormation) this.setHint(`射程外です — 最大射程 ${Math.round(profile.range).toLocaleString()}`, 1.8);
      return;
    }
    if (issue === 'too-close') {
      if (formation === this.playerFormation) this.setHint(`近すぎます — 最低射程 ${Math.round(profile.minRange).toLocaleString()}`, 1.8);
      return;
    }
    formation.direction = Math.atan2(dy, dx);
    this.queuePresentationEvent({
      kind: 'artillery_fire',
      formationId: formation.id,
      team: formation.team,
      squadClass: formation.squadClass,
      x: formation.center.x,
      y: formation.center.y,
      direction: formation.direction,
    });
    this.artilleryShells.push(...createArtilleryShells(formation, desiredTarget));
    formation.beginReload(reloadSeconds);
    const forward = { x: Math.cos(formation.direction), y: Math.sin(formation.direction) };
    const right = { x: -forward.y, y: forward.x };
    for (let i = 0; i < profile.guns; i += 1) {
      const offset = artilleryGunLocalOffset(formation.formationShape, i, profile.guns, 34, 42);
      this.smoke.push({
        position: {
          x: formation.center.x + forward.x * (42 + offset.forward) + right.x * offset.lateral,
          y: formation.center.y + forward.y * (42 + offset.forward) + right.y * offset.lateral,
        },
        velocity: { x: Math.cos(formation.direction) * 35, y: Math.sin(formation.direction) * 35 },
        age: 0,
        lifetime: GAME_CONFIG.effects.smokeLifetime * (1.25 + profile.smokeScale * 0.5),
        size: 20 + 12 * profile.smokeScale,
      });
    }
    if (formation.isPlayerControlled || this.distanceToPlayer(formation.center) < 1100) {
      this.screenShake = Math.max(this.screenShake, GAME_CONFIG.effects.artilleryShake * profile.shakeScale);
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

  getFormationStats(formationId: string): FormationCombatStats {
    let stats = this.combatStats.get(formationId);
    if (!stats) {
      stats = { kills: 0, losses: 0, bannerDamage: 0 };
      this.combatStats.set(formationId, stats);
    }
    return stats;
  }

  getCombatStatsEntries(): Array<{ formationId: string } & FormationCombatStats> {
    return [...this.combatStats.entries()].map(([formationId, stats]) => ({ formationId, ...stats }));
  }

  private recordDeath(
    position: Vec2,
    team: Team,
    impactDirection: Vec2,
    sourceFormationId: string,
    targetFormationId: string,
  ): void {
    this.spawnCorpse(position, team, impactDirection);
    this.queuePresentationEvent({
      kind: 'death',
      team,
      x: position.x,
      y: position.y,
      impactX: impactDirection.x,
      impactY: impactDirection.y,
    });
    if (targetFormationId) this.getFormationStats(targetFormationId).losses += 1;
    if (sourceFormationId && sourceFormationId !== targetFormationId) {
      this.getFormationStats(sourceFormationId).kills += 1;
      if (this.resourceSystem) {
        const source = this.formations.find((formation) => formation.id === sourceFormationId);
        const target = this.formations.find((formation) => formation.id === targetFormationId);
        if (source && target && source.team !== target.team) {
          this.resourceSystem.grantCombatLoot(source.id, source.team, this.combatLootFor(target));
        }
      }
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
    if (this.conquestSystem) {
      const blueOut = this.conquestSystem.tickets.blue <= 0 && this.aliveSquads('blue') <= 0;
      const redOut = this.conquestSystem.tickets.red <= 0 && this.aliveSquads('red') <= 0;
      if (blueOut && redOut) {
        const blueAlive = this.formations.filter((formation) => formation.team === 'blue').reduce((sum, formation) => sum + formation.aliveCount(), 0);
        const redAlive = this.formations.filter((formation) => formation.team === 'red').reduce((sum, formation) => sum + formation.aliveCount(), 0);
        this.winner = blueAlive >= redAlive ? 'blue' : 'red';
      } else if (blueOut) this.winner = 'red';
      else if (redOut) this.winner = 'blue';
      if (this.winner) this.setNotice(`${this.winner.toUpperCase()} VICTORY — ENEMY REINFORCEMENTS EXHAUSTED`, 'success', 7);
      return;
    }
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
    const counts = Object.fromEntries(SQUAD_CLASSES.map((value) => [value, 0])) as ClassCounts;
    for (const formation of this.formations) {
      if (formation.team === team && formation.aliveCount() > 0) counts[formation.squadClass] += 1;
    }
    return counts;
  }


  private moveFormationWithTerrain(formation: Formation, dx: number, dy: number, baseDistance: number): boolean {
    const length = Math.hypot(dx, dy);
    if (length <= 0.0001 || baseDistance <= 0) return false;
    this.rescueFormationFromMountain(formation);
    const terrainMultiplier = BATTLEFIELD_MAP.movementMultiplier(formation.center, formation.squadClass);
    if (terrainMultiplier <= 0) return false;
    const floorMultiplier = this.constructionFloorMovementMultiplier(formation);
    const next = BATTLEFIELD_MAP.resolveStep(
      formation.center,
      { x: dx / length, y: dy / length },
      baseDistance * terrainMultiplier * floorMultiplier,
    );
    const constructionBlocked = (point: Vec2): boolean => this.constructionBlocks.some((block) => block.active
      && constructionBlocksMovement(block.kind)
      && !(block.kind === 'door' && block.team === formation.team)
      && pointInsideConstructionBlock(point, block, CONSTRUCTION_MOVEMENT_PADDING));
    let resolved = next;
    if (constructionBlocked(resolved)) {
      // Construction uses the same 64px navigation grid as A*.  Keep the center collider
      // narrow enough that a grid-width corridor which A* considers open is physically
      // traversable, then slide along wall faces/corners instead of stopping dead.
      const baseAngle = Math.atan2(dy, dx);
      const offsets = [Math.PI / 12, -Math.PI / 12, Math.PI / 6, -Math.PI / 6, Math.PI / 4, -Math.PI / 4, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2];
      let found: Vec2 | null = null;
      for (const offset of offsets) {
        const candidate = BATTLEFIELD_MAP.resolveStep(formation.center, { x: Math.cos(baseAngle + offset), y: Math.sin(baseAngle + offset) }, baseDistance * terrainMultiplier * floorMultiplier);
        if (!constructionBlocked(candidate) && Math.hypot(candidate.x - formation.center.x, candidate.y - formation.center.y) > 0.05) { found = candidate; break; }
      }
      if (!found) return false;
      resolved = found;
    }
    const moved = Math.hypot(resolved.x - formation.center.x, resolved.y - formation.center.y) > 0.05;
    if (!moved) return false;
    formation.center.x = resolved.x;
    formation.center.y = resolved.y;
    formation.markMoved();
    this.clampFormationCenter(formation);
    return true;
  }

  private constructionFloorMovementMultiplier(formation: Formation): number {
    const cell = worldToConstructionCell(formation.center);
    const floor = this.constructionBlocks.find((block) => block.active && block.col === cell.col && block.row === cell.row && (block.kind === 'roadTile' || block.kind === 'bridgeTile'));
    if (!floor) return 1;
    if (floor.kind === 'roadTile') return CONSTRUCTION_ROAD_SPEED_MULTIPLIER;
    const terrain = BATTLEFIELD_MAP.terrainAt(formation.center);
    if (terrain === 'river' || terrain === 'ford') {
      const raw = BATTLEFIELD_MAP.movementMultiplier(formation.center, formation.squadClass);
      return raw > 0 ? Math.max(1, 1 / raw) : 1;
    }
    return 1;
  }

  private distancePointToFieldwork(point: Vec2, fieldwork: Fieldwork): number {
    const { a, b } = fieldwork.endpoints();
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const wx = point.x - a.x;
    const wy = point.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 <= 0.0001) return this.distance(point, a);
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
    return Math.hypot(point.x - (a.x + vx * t), point.y - (a.y + vy * t));
  }

  private maxFieldworkKits(squadClass: SquadClass): number {
    return fieldworkKitCapacity(squadClass);
  }

  private distanceToNearestEnemy(formation: Formation): number {
    let best = Number.POSITIVE_INFINITY;
    for (const enemy of this.formations) {
      if (enemy.team === formation.team || enemy.aliveCount() === 0) continue;
      best = Math.min(best, this.distance(formation.center, enemy.center));
    }
    return best;
  }

  private performGrenadeThrow(formation: Formation, desiredTarget: Vec2): boolean {
    if (formation.squadClass !== 'grenadier' || (formation.mode !== 'line' && formation.mode !== 'reforming') || formation.grenadeCooldown > 0 || formation.aliveCount() === 0) return false;
    let dx = desiredTarget.x - formation.center.x;
    let dy = desiredTarget.y - formation.center.y;
    let distance = Math.hypot(dx, dy);
    if (distance < 20) {
      dx = Math.cos(formation.direction) * 170;
      dy = Math.sin(formation.direction) * 170;
      distance = 170;
    }
    const scale = Math.min(1, GAME_CONFIG.grenade.range / distance);
    const target = { x: formation.center.x + dx * scale, y: formation.center.y + dy * scale };
    formation.direction = Math.atan2(target.y - formation.center.y, target.x - formation.center.x);
    const count = Math.min(GAME_CONFIG.grenade.count, formation.aliveCount());
    for (let i = 0; i < count; i += 1) {
      const jitter = GAME_CONFIG.grenade.targetJitter;
      const adjusted = { x: target.x + (Math.random() - 0.5) * jitter, y: target.y + (Math.random() - 0.5) * jitter };
      const grenadeMultiplier = weaponTierMultipliers(formation.squadClass, formation.weaponTier).grenade;
      this.artilleryShells.push(new ArtilleryShell(
        formation.team,
        { x: formation.center.x + (Math.random() - 0.5) * 26, y: formation.center.y + (Math.random() - 0.5) * 26 },
        adjusted, GAME_CONFIG.grenade.shellSpeed, 'grenadier', GAME_CONFIG.grenade.blastRadius * Math.sqrt(grenadeMultiplier),
        GAME_CONFIG.grenade.blastDamage * grenadeMultiplier, GAME_CONFIG.grenade.edgeDamage * grenadeMultiplier, GAME_CONFIG.grenade.moraleDamage * grenadeMultiplier, formation.id,
      ));
    }
    formation.grenadeCooldown = GAME_CONFIG.grenade.cooldownSeconds;
    if (formation === this.playerFormation) this.setNotice('手榴弾投擲！', 'info', 1.2);
    return true;
  }

  private beginConstructionPlace(formation: Formation, kind: ConstructionBlockKind, desiredTarget: Vec2, direction: number): boolean {
    if (!this.constructionEnabled || !this.conquestSystem || !this.resourceSystem) return false;
    if (formation.aliveCount() === 0 || this.winner || (formation.mode !== 'line' && formation.mode !== 'reforming')) return false;
    if (!this.isConstructionPlacementValid(formation, kind, desiredTarget, false)) return false;
    const workSeconds = constructionWorkSecondsForClass(formation.squadClass);
    this.pendingConstructionWork.set(formation.id, { type: 'place', formationId: formation.id, kind, target: { ...desiredTarget }, direction, startedAt: this.time, completeAt: this.time + workSeconds });
    if (formation === this.playerFormation) this.setNotice(`${CONSTRUCTION_DEFINITIONS[kind].label}を建築中…`, 'info', workSeconds);
    return true;
  }

  private isConstructionPlacementValid(formation: Formation, kind: ConstructionBlockKind, desiredTarget: Vec2, ignoreCost: boolean): boolean {
    if (!this.constructionEnabled || !this.conquestSystem || !this.resourceSystem || !(kind in CONSTRUCTION_COSTS)) return false;
    const cell = worldToConstructionCell(desiredTarget);
    const key = constructionCellKey(cell.col, cell.row);
    const center = constructionCellCenter(cell.col, cell.row);
    if (this.distance(formation.center, center) > CONSTRUCTION_PLACE_RANGE) return false;
    const terrain = BATTLEFIELD_MAP.terrainAt(center);
    if (kind === 'bridgeTile') {
      if (terrain !== 'river' && terrain !== 'ford') return false;
    } else if (terrain === 'mountain' || terrain === 'river') return false;
    if (this.constructionCooldowns.has(key)) return false;
    if (this.constructionBlocks.some((block) => block.active && block.cellKey === key)) return false;
    if (this.distance(center, this.blueBanner.position) < 150 || this.distance(center, this.redBanner.position) < 150) return false;
    if (MAP_SITES.some((site) => site.kind === 'facility' && this.distance(center, site.position) < 125)) return false;
    if (BATTLEFIELD_MAP.inSpawnArea('blue', center, -Math.min(360, BATTLEFIELD_MAP.spawnArea('blue', 0).radiusX * 0.45))
      || BATTLEFIELD_MAP.inSpawnArea('red', center, -Math.min(360, BATTLEFIELD_MAP.spawnArea('red', 0).radiusX * 0.45))) return false;
    return ignoreCost || this.resourceSystem.canAfford(formation.team, CONSTRUCTION_COSTS[kind]);
  }

  private completeConstructionPlace(work: PendingConstructionWork): void {
    const formation = this.formations.find((f) => f.id === work.formationId);
    if (!formation || !work.kind || !work.target || formation.aliveCount() === 0 || !this.resourceSystem) return;
    if (!this.isConstructionPlacementValid(formation, work.kind, work.target, false)) return;
    const cell = worldToConstructionCell(work.target);
    const cost = CONSTRUCTION_COSTS[work.kind];
    if (!this.resourceSystem.consume(formation.team, cost)) return;
    const block = new ConstructionBlock(`CB-${Math.floor(this.time * 1000)}-${Math.random().toString(36).slice(2, 7)}`, formation.team, work.kind, cell.col, cell.row, work.direction ?? 0);
    this.constructionBlocks.push(block);
    this.constructionDirty = true;
    if (constructionBlocksMovement(block.kind)) this.aiSystem.invalidateNavigation();
    if (formation === this.playerFormation) this.setNotice(`${CONSTRUCTION_DEFINITIONS[work.kind].label}を建築`, 'success', 1.4);
  }

  private beginConstructionDismantle(formation: Formation, blockId: string): boolean {
    if (!this.constructionEnabled || formation.aliveCount() === 0) return false;
    const block = this.constructionBlocks.find((candidate) => candidate.id === blockId && candidate.active && candidate.team === formation.team);
    if (!block || this.distance(formation.center, block.position) > CONSTRUCTION_PLACE_RANGE) return false;
    const workSeconds = constructionWorkSecondsForClass(formation.squadClass);
    this.pendingConstructionWork.set(formation.id, { type: 'dismantle', formationId: formation.id, blockId, startedAt: this.time, completeAt: this.time + workSeconds });
    if (formation === this.playerFormation) this.setNotice(`${CONSTRUCTION_DEFINITIONS[block.kind].label}を撤去中…`, 'info', workSeconds);
    return true;
  }

  private updatePendingConstructionWork(): void {
    for (const [formationId, work] of [...this.pendingConstructionWork.entries()]) {
      if (work.completeAt > this.time) continue;
      this.pendingConstructionWork.delete(formationId);
      if (work.type === 'place') this.completeConstructionPlace(work);
      else if (work.blockId) {
        const formation = this.formations.find((f) => f.id === formationId);
        const block = this.constructionBlocks.find((candidate) => candidate.id === work.blockId && candidate.active && formation && candidate.team === formation.team);
        if (!formation || !block || formation.aliveCount() === 0 || this.distance(formation.center, block.position) > CONSTRUCTION_PLACE_RANGE) continue;
        const index = this.constructionBlocks.indexOf(block);
        if (index >= 0) this.constructionBlocks.splice(index, 1);
        this.constructionDirty = true;
        this.aiSystem.invalidateNavigation();
        if (formation === this.playerFormation) this.setNotice('ブロックを撤去', 'success', 1.2);
      }
    }
  }

  private updateAiConstruction(dt: number): void {
    if (!this.constructionEnabled || !this.resourceSystem || !this.conquestSystem) return;
    this.aiConstructionTimer -= dt;
    if (this.aiConstructionTimer > 0) return;
    this.aiConstructionTimer = 1.25;
    const humans = this.formations.filter((f) => this.humanFormationIds.has(f.id) && f.aliveCount() > 0);
    const builders = this.formations.filter((f) => !this.humanFormationIds.has(f.id) && f.aliveCount() > 0 && (f.squadClass === 'engineer' || isArtilleryClass(f.squadClass)));
    for (const formation of builders) {
      if (this.pendingConstructionWork.has(formation.id)) continue;
      if (humans.some((h) => this.distance(h.center, formation.center) <= CONSTRUCTION_PLACE_RANGE * 1.35)) continue;
      const nearbyOwn = this.constructionBlocks.filter((b) => b.active && b.team === formation.team && this.distance(b.position, formation.center) < 320).length;
      if (nearbyOwn >= (isArtilleryClass(formation.squadClass) ? 5 : 3)) continue;
      const forward = { x: Math.cos(formation.direction), y: Math.sin(formation.direction) };
      const right = { x: -forward.y, y: forward.x };
      const pattern = isArtilleryClass(formation.squadClass)
        ? [{ f: 150, r: -90 }, { f: 150, r: 0 }, { f: 150, r: 90 }, { f: 80, r: -150 }, { f: 80, r: 150 }]
        : [{ f: 150, r: -64 }, { f: 150, r: 0 }, { f: 150, r: 64 }];
      for (const slot of pattern) {
        const target = { x: formation.center.x + forward.x * slot.f + right.x * slot.r, y: formation.center.y + forward.y * slot.f + right.y * slot.r };
        const kind: ConstructionBlockKind = isArtilleryClass(formation.squadClass) ? 'woodWall' : (nearbyOwn % 3 === 2 ? 'loophole' : 'woodWall');
        if (this.isConstructionPlacementValid(formation, kind, target, false)) {
          this.pendingConstructionWork.set(formation.id, { type: 'place', formationId: formation.id, kind, target, direction: Math.round((formation.direction + Math.PI / 2) / (Math.PI / 2)), startedAt: this.time, completeAt: this.time + constructionWorkSecondsForClass(formation.squadClass) });
          break;
        }
      }
    }
  }

  private attackConstructionBlockWithAxe(formation: Formation, blockId: string): boolean {
    if (!canBannerAttackClass(formation.squadClass) || this.weaponForFormation(formation) !== 'axe' || formation.aliveCount() === 0) return false;
    const block = this.constructionBlocks.find((candidate) => candidate.id === blockId && candidate.active && candidate.team !== formation.team);
    if (!block || this.distance(formation.center, block.position) > 170) return false;
    const readyAt = this.constructionAxeReadyAt.get(formation.id) ?? 0;
    if (this.time < readyAt) return false;
    const damage = formation.squadClass === 'engineer' ? 125 : 72;
    block.takeDamage(damage);
    this.constructionAxeReadyAt.set(formation.id, this.time + 0.72);
    this.constructionDirty = true;
    if (!block.active) this.handleDestroyedConstructionBlocks();
    return true;
  }

  private handleDestroyedConstructionBlocks(addCooldown = true): void {
    let destroyed = false;
    for (const block of this.constructionBlocks) {
      if (block.active) continue;
      const key = block.cellKey;
      if (addCooldown && !this.constructionCooldowns.has(key)) {
        this.constructionCooldowns.set(key, this.time + CONSTRUCTION_REBUILD_COOLDOWN_SECONDS);
        destroyed = true;
      } else if (!addCooldown) destroyed = true;
    }
    if (destroyed) this.aiSystem.invalidateNavigation();
    const before = this.constructionBlocks.length;
    for (let i = this.constructionBlocks.length - 1; i >= 0; i -= 1) if (!this.constructionBlocks[i].active) this.constructionBlocks.splice(i, 1);
    if (this.constructionBlocks.length !== before) this.constructionDirty = true;
  }

  private classLabel(squadClass: SquadClass): string {
    return squadClassLabel(squadClass);
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
    const rect = minimapRect(this.minimapPosition);
    if (
      point.x < rect.x || point.x > rect.x + rect.width
      || point.y < rect.y || point.y > rect.y + rect.height
    ) return null;
    return {
      x: ((point.x - rect.x) / rect.width) * GAME_CONFIG.world.width,
      y: ((point.y - rect.y) / rect.height) * GAME_CONFIG.world.height,
    };
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
