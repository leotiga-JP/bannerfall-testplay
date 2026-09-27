import { GAME_CONFIG } from '../game/config';
import { Game } from '../game/game';
import { canBannerAttackClass, classLabel, formationShapeLabel, isArtilleryClass, isChargeCavalryClass, isSquadClass, nextFormationShape, type Team, type Vec2, type WeaponType } from '../game/types';
import { minimapRect, type MinimapPosition } from '../game/minimapLayout';
import { artilleryTargetIssue } from '../game/classProfiles';
import { InputManager } from '../input/inputManager';
import { Renderer } from '../rendering/renderer';
import { Hud } from '../ui/hud';
import { AudioManager } from '../audio/audioManager';
import { NetworkClient } from './networkClient';
import type { MatchStartPayload, PlayerAction, RoomState } from './protocol';
import { factionShortLabel } from '../game/factionBanners';
import { artilleryGunCount, type EquipmentUpgradeKind } from '../game/upgradeSystem';
import type { ConstructionBlockKind } from '../entities/constructionBlock';
import { CONSTRUCTION_COSTS, constructionWorkSecondsForClass } from '../game/constructionSystem';

export class MultiplayerBattle {
  private readonly input: InputManager;
  private readonly game: Game;
  private readonly renderer: Renderer;
  private readonly hud: Hud;
  private readonly audio: AudioManager;
  private readonly labels = new Map<string, string>();
  private readonly localFormationId: string;
  private room: RoomState;
  private readonly scoreboard: HTMLElement;
  private readonly scoreboardBody: HTMLElement;
  private running = true;
  private previousTime = performance.now();
  private snapshotAccumulator = 0;
  private controlAccumulator = 0;
  private audioAccumulator = 0;
  private movementInputLocked = false;
  private readonly cleanup: Array<() => void> = [];
  private constructionPlacementArmed = false;
  private constructionKind: ConstructionBlockKind = 'woodWall';
  private constructionDirection = 0;
  private settingsOpen = false;
  private minimapPosition: MinimapPosition = 'bottom-right';
  private recruitmentPanelOpen = false;
  private recruitmentPanel: HTMLElement | null = null;
  private upgradePanelOpen = false;
  private upgradePanel: HTMLElement | null = null;

  constructor(
    private readonly network: NetworkClient,
    payload: MatchStartPayload,
    private readonly canvas: HTMLCanvasElement,
  ) {
    const local = payload.room.players.find((player) => player.id === network.clientId);
    if (!local?.formationId) throw new Error('Local formation was not assigned.');
    this.localFormationId = local.formationId;
    this.room = payload.room;
    const scoreboard = document.querySelector<HTMLElement>('#scoreboard');
    const scoreboardBody = document.querySelector<HTMLElement>('#scoreboard-body');
    if (!scoreboard || !scoreboardBody) throw new Error('Missing battle scoreboard elements.');
    this.scoreboard = scoreboard;
    this.scoreboardBody = scoreboardBody;
    this.scoreboard.classList.toggle('total-war', payload.room.settings.gameMode === 'CONQUEST');
    const humanIds = payload.room.players.flatMap((player) => player.formationId ? [player.formationId] : []);
    const initialClasses = Object.fromEntries(
      payload.room.players.flatMap((player) => player.formationId ? [[player.formationId, player.squadClass]] : []),
    );
    const initialSpawnAreas = Object.fromEntries(
      payload.room.players.flatMap((player) => player.formationId && player.spawnIndex !== null ? [[player.formationId, player.spawnIndex]] : []),
    );
    for (const player of payload.room.players) {
      if (player.formationId) this.labels.set(player.formationId, `★ ${player.name}`);
    }

    this.input = new InputManager(canvas);
    this.game = new Game(this.input, {
      blueSquads: payload.room.settings.blueSquads,
      redSquads: payload.room.settings.redSquads,
      respawnSeconds: payload.room.settings.respawnSeconds,
      conquestTickets: payload.room.settings.conquestTickets,
      gameMode: payload.room.settings.gameMode,
      localFormationId: this.localFormationId,
      humanFormationIds: humanIds,
      initialClasses,
      initialSpawnAreas,
      introEnabled: payload.room.settings.introEnabled && !payload.joinInProgress,
      constructionEnabled: payload.room.settings.constructionEnabled,
      // Cannon fire is confirmed by the authoritative server before shells/audio appear.
      predictArtilleryShots: false,
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available.');
    ctx.imageSmoothingEnabled = false;
    canvas.width = GAME_CONFIG.viewport.width;
    canvas.height = GAME_CONFIG.viewport.height;
    this.renderer = new Renderer(ctx, payload.room.settings.blueFaction, payload.room.settings.redFaction);
    this.audio = new AudioManager();
    this.installMapAndAudioControls();
    this.installAudioUnlock();
    this.hud = this.createHud();
    const reserveToggle = document.querySelector<HTMLButtonElement>('#reserve-class-toggle');
    if (reserveToggle) {
      const click = (): void => this.hud.toggleClassReservation();
      reserveToggle.addEventListener('click', click);
      this.cleanup.push(() => reserveToggle.removeEventListener('click', click));
    }

    this.network.onRemoteControl = (_playerId, control) => {
      if (this.network.isAuthority) this.game.setRemoteControl(control);
    };
    this.network.onRemoteAction = (_playerId, action) => {
      if (this.network.isAuthority) this.game.applyRemoteAction(action);
    };
    this.network.onBattleSnapshot = (snapshot) => {
      if (!this.network.isAuthority) this.game.applyNetworkSnapshot(snapshot);
    };
    this.network.onBattleEvents = (events) => {
      if (this.network.isAuthority) return;
      this.game.applyPresentationEvents(events);
      this.audio.handlePresentationEvents(events, this.game);
    };
    this.network.onResourceState = (state) => {
      this.game.applyResourceNetworkState(state);
    };
    this.network.onConstructionState = (state) => {
      this.game.applyConstructionNetworkState(state);
    };

    this.installNetworkInputEvents();
    this.installRecruitmentControls();
    this.installUpgradeControls();
    this.installScoreboardEvents();
    requestAnimationFrame((now) => this.frame(now));
  }

  updateRoom(room: RoomState): void {
    this.room = room;
    this.labels.clear();
    for (const player of room.players) {
      if (player.formationId) this.labels.set(player.formationId, `★ ${player.name}`);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const dispose of this.cleanup) dispose();
    this.input.destroy();
    this.audio.stop();
  }

  private installMapAndAudioControls(): void {
    const slider = document.querySelector<HTMLInputElement>('#minimap-opacity');
    const value = document.querySelector<HTMLElement>('#minimap-opacity-value');
    const sfxSlider = document.querySelector<HTMLInputElement>('#sfx-volume');
    const sfxValue = document.querySelector<HTMLElement>('#sfx-volume-value');
    const overlay = document.querySelector<HTMLElement>('#settings-overlay');
    const closeButton = document.querySelector<HTMLButtonElement>('#settings-close');
    const positionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-map-position]'));
    if (!slider || !value || !sfxSlider || !sfxValue || !overlay || !closeButton) return;

    const storedOpacity = Number(localStorage.getItem('bannerfall.minimapOpacity') ?? '86');
    const opacity = Number.isFinite(storedOpacity) ? Math.max(20, Math.min(100, storedOpacity)) : 86;
    slider.value = String(opacity);

    const storedPosition = localStorage.getItem('bannerfall.minimapPosition');
    this.minimapPosition = storedPosition === 'top-left' ? 'top-left' : 'bottom-right';

    const applyOpacity = (): void => {
      const percent = Math.max(20, Math.min(100, Number(slider.value) || 86));
      this.renderer.setMinimapOpacity(percent / 100);
      value.textContent = `${Math.round(percent)}%`;
      localStorage.setItem('bannerfall.minimapOpacity', String(percent));
    };
    const applyPosition = (position: MinimapPosition): void => {
      this.minimapPosition = position;
      this.renderer.setMinimapPosition(position);
      this.game.setMinimapPosition(position);
      document.querySelector<HTMLElement>('#battle-chat')?.classList.toggle('minimap-top-left', position === 'top-left');
      localStorage.setItem('bannerfall.minimapPosition', position);
      for (const button of positionButtons) button.classList.toggle('selected', button.dataset.mapPosition === position);
    };
    const applySfx = (): void => {
      const percent = Math.max(0, Math.min(100, Number(sfxSlider.value) || 0));
      this.audio.setVolume(percent);
      sfxValue.textContent = `${Math.round(percent)}%`;
    };
    const setSettingsOpen = (open: boolean): void => {
      this.settingsOpen = open;
      overlay.classList.toggle('hidden', !open);
      this.input.setBlocked(open);
      if (open) {
        this.recruitmentPanelOpen = false;
        this.recruitmentPanel?.classList.add('hidden');
        this.upgradePanelOpen = false;
        this.upgradePanel?.classList.add('hidden');
        this.hud.closeClassReservation();
        this.scoreboard.classList.add('hidden');
        const formation = this.game.playerFormation;
        const weapon: WeaponType = this.game.playerInputWeapon();
        this.network.sendControl({ formationId: formation.id, moveX: 0, moveY: 0, aim: formation.center, weapon, forcedMarch: false, gathering: false });
      }
    };

    applyOpacity();
    sfxSlider.value = String(this.audio.volumePercent);
    applySfx();
    applyPosition(this.minimapPosition);

    const releaseFocus = (event: Event): void => (event.currentTarget as HTMLInputElement | null)?.blur();
    slider.addEventListener('input', applyOpacity);
    slider.addEventListener('change', releaseFocus);
    sfxSlider.addEventListener('input', applySfx);
    sfxSlider.addEventListener('change', releaseFocus);
    const closeSettings = (): void => setSettingsOpen(false);
    closeButton.addEventListener('click', closeSettings);
    for (const button of positionButtons) {
      const click = (): void => applyPosition(button.dataset.mapPosition === 'top-left' ? 'top-left' : 'bottom-right');
      button.addEventListener('click', click);
      this.cleanup.push(() => button.removeEventListener('click', click));
    }
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      setSettingsOpen(!this.settingsOpen);
    };
    window.addEventListener('keydown', keyDown);
    this.cleanup.push(() => slider.removeEventListener('input', applyOpacity));
    this.cleanup.push(() => slider.removeEventListener('change', releaseFocus));
    this.cleanup.push(() => sfxSlider.removeEventListener('input', applySfx));
    this.cleanup.push(() => sfxSlider.removeEventListener('change', releaseFocus));
    this.cleanup.push(() => closeButton.removeEventListener('click', closeSettings));
    this.cleanup.push(() => window.removeEventListener('keydown', keyDown));
    this.cleanup.push(() => { overlay.classList.add('hidden'); this.input.setBlocked(false); });
  }

  private installAudioUnlock(): void {
    const unlock = (): void => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    this.cleanup.push(() => window.removeEventListener('pointerdown', unlock));
    this.cleanup.push(() => window.removeEventListener('keydown', unlock));
  }

  private createHud(): Hud {
    const get = <T extends HTMLElement>(id: string): T => {
      const element = document.querySelector<T>(`#${id}`);
      if (!element) throw new Error(`Missing HUD element #${id}`);
      return element;
    };
    return new Hud(
      get('status'), get('pause-overlay'), get('camera-status'),
      get('blue-banner-card'), get('red-banner-card'), get('blue-banner-hp'), get('red-banner-hp'),
      get('blue-banner-bar'), get('red-banner-bar'), get('player-state'), get('player-detail'), get('player-stats'),
      get('notice'), get('objective-progress'), get('context-hint'), get('hotbar'),
      get('class-selector'), get('class-selector-title'), get('class-selector-description'), get<HTMLButtonElement>('reserve-class-toggle'),
      get('army-composition'), get('class-recommendation'), get('resource-stockpile'), get('resource-gather'),
      factionShortLabel(this.room.settings.blueFaction), factionShortLabel(this.room.settings.redFaction),
    );
  }

  private frame(now: number): void {
    if (!this.running) return;
    const rawDt = Math.min((now - this.previousTime) / 1000, 0.04);
    this.previousTime = now;

    // The server is authoritative. Multiplayer clients only advance presentation
    // state and interpolate snapshots; they do not run AI/pathfinding/combat again.
    if (this.network.isAuthority) this.game.update(rawDt);
    else {
      this.game.updateNetworkPresentation(rawDt);
      this.game.smoothNetworkState(rawDt);
    }

    if (this.network.isAuthority) {
      this.snapshotAccumulator += rawDt;
      if (this.snapshotAccumulator >= 0.1) {
        this.snapshotAccumulator = 0;
        this.network.sendSnapshot(this.game.createNetworkSnapshot());
      }
    } else {
      this.controlAccumulator += rawDt;
      if (this.controlAccumulator >= 0.066) {
        this.controlAccumulator = 0;
        this.sendContinuousControl();
      }
    }

    const snapshot = this.game.snapshot();
    if (this.constructionPlacementArmed) {
      const target = this.game.camera.screenToWorld(this.input.getPointer());
      const preview = this.game.constructionPlacementPreview(this.constructionKind, target);
      this.renderer.setConstructionGhost({ ...preview, kind: this.constructionKind, direction: this.constructionDirection });
    } else {
      this.renderer.setConstructionGhost(null);
    }
    this.audioAccumulator += rawDt;
    if (this.audioAccumulator >= 0.05) {
      this.audioAccumulator = 0;
      this.audio.update(this.game);
    }
    this.renderer.render(
      this.game.formations,
      this.game.banners,
      this.game.projectiles,
      this.game.artilleryShells,
      this.game.artilleryExplosions,
      this.game.fieldworks,
      this.game.constructionBlocks,
      this.game.resourceNodes(),
      this.game.smoke,
      this.game.muzzleFlashes,
      this.game.corpses,
      this.game.meleeStrikes,
      this.game.axeStrikes,
      snapshot,
      this.game.camera,
      this.labels,
      this.localFormationId,
    );
    if (this.constructionPlacementArmed && (snapshot.playerAlive <= 0 || !this.room.settings.constructionEnabled || !snapshot.conquestEnabled)) this.constructionPlacementArmed = false;
    this.hud.setBuilderMode(this.constructionPlacementArmed, this.constructionKind, this.room.settings.constructionEnabled && snapshot.conquestEnabled);
    this.hud.update(snapshot);
    this.renderConstructionWork(snapshot);
    this.renderRecruitmentPanel(snapshot);
    this.renderUpgradePanel(snapshot);
    if (this.constructionPlacementArmed) {
      const hint = document.querySelector<HTMLElement>('#context-hint');
      if (hint) {
        const labels: Record<ConstructionBlockKind, string> = { woodWall: '木製壁', ironWall: '強化壁', loophole: '銃眼', door: '扉', roadTile: '道路', bridgeTile: '橋' };
        const label = labels[this.constructionKind];
        const cost = CONSTRUCTION_COSTS[this.constructionKind];
        hint.textContent = `BUILDER · ${label} · 左クリック建築 · 右クリック味方撤去 · 2〜7 種類 · R 回転 · 1 戦闘へ戻る · 木${cost.wood} 鉄${cost.iron} 合金${cost.alloy}`;
        hint.classList.remove('hidden');
      }
    }
    if (!this.scoreboard.classList.contains('hidden')) this.renderScoreboard();
    requestAnimationFrame((time) => this.frame(time));
  }

  private installRecruitmentControls(): void {
    const panel = document.querySelector<HTMLElement>('#recruitment-panel');
    const close = document.querySelector<HTMLButtonElement>('#recruitment-close');
    const cancel = document.querySelector<HTMLButtonElement>('#recruitment-cancel');
    const upgrade = document.querySelector<HTMLButtonElement>('#recruit-upgrade-cap');
    if (!panel || !close || !cancel || !upgrade) return;
    this.recruitmentPanel = panel;

    const setOpen = (open: boolean): void => {
      this.recruitmentPanelOpen = open && this.game.modeRules.recruitment;
      if (this.recruitmentPanelOpen && this.upgradePanelOpen) {
        this.upgradePanelOpen = false;
        this.upgradePanel?.classList.add('hidden');
      }
      panel.classList.toggle('hidden', !this.recruitmentPanelOpen);
    };
    const closePanel = (): void => setOpen(false);
    close.addEventListener('click', closePanel);
    this.cleanup.push(() => close.removeEventListener('click', closePanel));

    const cancelRecruitment = (): void => {
      this.network.sendAction({ type: 'recruit_cancel', formationId: this.game.playerFormation.id });
    };
    cancel.addEventListener('click', cancelRecruitment);
    this.cleanup.push(() => cancel.removeEventListener('click', cancelRecruitment));

    const upgradeCapacity = (): void => {
      this.network.sendAction({ type: 'upgrade_capacity', formationId: this.game.playerFormation.id });
    };
    upgrade.addEventListener('click', upgradeCapacity);
    this.cleanup.push(() => upgrade.removeEventListener('click', upgradeCapacity));

    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-recruit-count]')) {
      const click = (): void => {
        const count = Number(button.dataset.recruitCount);
        if (!Number.isInteger(count) || count <= 0) return;
        this.network.sendAction({ type: 'recruit', formationId: this.game.playerFormation.id, count });
      };
      button.addEventListener('click', click);
      this.cleanup.push(() => button.removeEventListener('click', click));
    }

    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.key.toLowerCase() !== 'e' || this.settingsOpen || !this.game.modeRules.recruitment) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      const snapshot = this.game.snapshot();
      if (!snapshot.playerNearBarracks || snapshot.playerAlive <= 0) return;
      event.preventDefault();
      setOpen(!this.recruitmentPanelOpen);
    };
    window.addEventListener('keydown', keyDown);
    this.cleanup.push(() => window.removeEventListener('keydown', keyDown));
    this.cleanup.push(() => setOpen(false));
  }

  private renderRecruitmentPanel(snapshot: ReturnType<Game['snapshot']>): void {
    const panel = this.recruitmentPanel;
    if (!panel) return;
    if (!snapshot.recruitmentEnabled) {
      this.recruitmentPanelOpen = false;
      panel.classList.add('hidden');
      return;
    }
    if (this.recruitmentPanelOpen && (!snapshot.playerNearBarracks || snapshot.playerAlive <= 0)) {
      this.recruitmentPanelOpen = false;
    }
    panel.classList.toggle('hidden', !this.recruitmentPanelOpen);
    if (!this.recruitmentPanelOpen) return;

    const title = panel.querySelector<HTMLElement>('#recruitment-title');
    const status = panel.querySelector<HTMLElement>('#recruitment-status');
    const progress = panel.querySelector<HTMLElement>('#recruitment-progress');
    const progressBar = panel.querySelector<HTMLElement>('#recruitment-progress-bar');
    const cancel = panel.querySelector<HTMLButtonElement>('#recruitment-cancel');
    const note = panel.querySelector<HTMLElement>('#recruitment-note');
    const oneCost = panel.querySelector<HTMLElement>('#recruit-cost-1');
    const fiveCost = panel.querySelector<HTMLElement>('#recruit-cost-5');
    const upgrade = panel.querySelector<HTMLButtonElement>('#recruit-upgrade-cap');
    const upgradeCost = panel.querySelector<HTMLElement>('#recruit-upgrade-cost');
    const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-recruit-count]'));

    if (title) title.textContent = `${snapshot.playerBarracksLabel || '兵舎'} · 部隊強化`;
    const missing = Math.max(0, snapshot.playerMaxSoldiers - snapshot.playerAlive);
    if (status) status.textContent = `現在兵力 ${snapshot.playerAlive} / ${snapshot.playerMaxSoldiers} · 標準兵力 ${snapshot.playerStarterStrength} · 最終上限 ${snapshot.playerGrowthLimit}`;

    const active = snapshot.playerRecruitmentProgress !== null;
    progress?.classList.toggle('hidden', !active);
    if (progressBar) progressBar.style.width = `${Math.round((snapshot.playerRecruitmentProgress ?? 0) * 100)}%`;
    cancel?.classList.toggle('hidden', !active);

    const recruitable = snapshot.playerGrowthLimit > snapshot.playerStarterStrength;
    const count1 = Math.min(1, missing);
    const count5 = Math.min(5, missing);
    const cost1 = this.game.playerRecruitmentCost(count1);
    const cost5 = this.game.playerRecruitmentCost(count5);
    if (oneCost) oneCost.textContent = count1 > 0 ? `木材 ${cost1.wood} · 鉄 ${cost1.iron}` : '最大兵力';
    if (fiveCost) fiveCost.textContent = count5 > 0 ? `木材 ${cost5.wood} · 鉄 ${cost5.iron}` : '最大兵力';

    const nextCapacity = snapshot.playerNextGrowthCapacity;
    const upgradeAffordable = snapshot.playerResourceStockpile.wood >= snapshot.playerGrowthUpgradeWood
      && snapshot.playerResourceStockpile.iron >= snapshot.playerGrowthUpgradeIron;
    if (upgrade) {
      upgrade.disabled = active || nextCapacity === null || !upgradeAffordable;
      const strong = upgrade.querySelector<HTMLElement>('strong');
      if (strong) strong.textContent = nextCapacity === null ? '兵員上限 最大' : `兵員上限 ${snapshot.playerMaxSoldiers} → ${nextCapacity}`;
    }
    if (upgradeCost) upgradeCost.textContent = nextCapacity === null
      ? '最大強化済み'
      : `木材 ${snapshot.playerGrowthUpgradeWood} · 鉄 ${snapshot.playerGrowthUpgradeIron}`;

    for (const button of buttons) {
      const requested = Number(button.dataset.recruitCount) || 1;
      const actual = Math.min(requested, missing);
      const cost = this.game.playerRecruitmentCost(actual);
      const affordable = snapshot.playerResourceStockpile.wood >= cost.wood && snapshot.playerResourceStockpile.iron >= cost.iron;
      button.disabled = active || !recruitable || actual <= 0 || !affordable;
      const strong = button.querySelector<HTMLElement>('strong');
      if (strong) strong.textContent = actual > 0 ? `+${actual}人` : '最大兵力';
    }

    if (note) {
      if (!recruitable) note.textContent = '砲兵の成長は将来の砲兵工廠システムで実装します。';
      else if (active) note.textContent = `${snapshot.playerRecruitmentCount}人を増員中… 資源は完了時に消費されます。`;
      else if (missing > 0) note.textContent = '現在の兵員上限まで即時増員できます。上限拡張は別途資源を消費します。';
      else if (nextCapacity !== null) note.textContent = '現在の編成は満員です。兵員上限を拡張すると、さらに増員できます。';
      else note.textContent = 'この兵科は最大成長に到達しています。';
    }
  }

  private installUpgradeControls(): void {
    const panel = document.querySelector<HTMLElement>('#upgrade-panel');
    const close = document.querySelector<HTMLButtonElement>('#upgrade-close');
    if (!panel || !close) return;
    this.upgradePanel = panel;

    const setOpen = (open: boolean): void => {
      this.upgradePanelOpen = open && this.game.modeRules.equipment;
      if (this.upgradePanelOpen && this.recruitmentPanelOpen) {
        this.recruitmentPanelOpen = false;
        this.recruitmentPanel?.classList.add('hidden');
        this.upgradePanelOpen = false;
        this.upgradePanel?.classList.add('hidden');
      }
      panel.classList.toggle('hidden', !this.upgradePanelOpen);
    };
    const closePanel = (): void => setOpen(false);
    close.addEventListener('click', closePanel);
    this.cleanup.push(() => close.removeEventListener('click', closePanel));

    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-equipment-upgrade]')) {
      const click = (): void => {
        const kind = button.dataset.equipmentUpgrade as EquipmentUpgradeKind | undefined;
        if (!kind) return;
        this.network.sendAction({ type: 'equipment_upgrade', formationId: this.game.playerFormation.id, upgrade: kind });
      };
      button.addEventListener('click', click);
      this.cleanup.push(() => button.removeEventListener('click', click));
    }

    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.key.toLowerCase() !== 'e' || this.settingsOpen || !this.game.modeRules.equipment) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      const snapshot = this.game.snapshot();
      if (!snapshot.playerNearUpgradeFacility || snapshot.playerAlive <= 0) return;
      event.preventDefault();
      setOpen(!this.upgradePanelOpen);
    };
    window.addEventListener('keydown', keyDown);
    this.cleanup.push(() => window.removeEventListener('keydown', keyDown));
    this.cleanup.push(() => setOpen(false));
  }

  private renderUpgradePanel(snapshot: ReturnType<Game['snapshot']>): void {
    const panel = this.upgradePanel;
    if (!panel) return;
    if (!snapshot.equipmentEnabled) {
      this.upgradePanelOpen = false;
      panel.classList.add('hidden');
      return;
    }
    if (this.upgradePanelOpen && (!snapshot.playerNearUpgradeFacility || snapshot.playerAlive <= 0)) this.upgradePanelOpen = false;
    panel.classList.toggle('hidden', !this.upgradePanelOpen);
    if (!this.upgradePanelOpen) return;

    const title = panel.querySelector<HTMLElement>('#upgrade-title');
    const status = panel.querySelector<HTMLElement>('#upgrade-status');
    const note = panel.querySelector<HTMLElement>('#upgrade-note');
    if (title) title.textContent = `${snapshot.playerUpgradeFacilityLabel || '工房'} · 装備強化`;
    if (status) status.textContent = snapshot.playerEquipmentSummary;

    const stock = snapshot.playerResourceStockpile;
    const artillery = isArtilleryClass(snapshot.playerClass);
    const configs: Array<{ kind: EquipmentUpgradeKind; tier: number; cost: typeof stock; label: string; detail: string }> = artillery
      ? [
        {
          kind: 'artillery-performance', tier: snapshot.playerArtilleryPerformanceTier,
          cost: snapshot.playerArtilleryPerformanceUpgradeCost, label: '砲性能',
          detail: '射程・装填・精度・威力・爆発性能を強化',
        },
        {
          kind: 'artillery-battery', tier: snapshot.playerArtilleryBatteryTier,
          cost: snapshot.playerArtilleryBatteryUpgradeCost, label: '砲門数',
          detail: `現在 ${artilleryGunCount(snapshot.playerClass, snapshot.playerArtilleryBatteryTier as 1 | 2 | 3)}門`,
        },
      ]
      : [
        {
          kind: 'weapon', tier: snapshot.playerWeaponTier,
          cost: snapshot.playerWeaponUpgradeCost, label: '武器',
          detail: snapshot.playerClass === 'sharpshooter' ? '射程・精度・装填を重点強化'
            : snapshot.playerClass === 'engineer' ? '射撃性能と斧の対目標威力を強化'
              : snapshot.playerClass === 'hussar' ? '白兵・突撃の士気衝撃を重点強化'
                : isChargeCavalryClass(snapshot.playerClass) ? '白兵・突撃性能を強化'
                  : '射撃・装填・白兵性能を強化',
        },
        {
          kind: 'armor', tier: snapshot.playerArmorTier,
          cost: snapshot.playerArmorUpgradeCost, label: '防具',
          detail: '銃弾・白兵・爆発・突撃への耐性を強化',
        },
      ];

    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-equipment-upgrade]')) button.classList.add('hidden');
    for (const config of configs) {
      const button = panel.querySelector<HTMLButtonElement>(`[data-equipment-upgrade="${config.kind}"]`);
      if (!button) continue;
      button.classList.remove('hidden');
      const maxed = config.tier >= 3;
      const affordable = stock.wood >= config.cost.wood && stock.iron >= config.cost.iron
        && stock.gunpowder >= config.cost.gunpowder && stock.alloy >= config.cost.alloy;
      button.disabled = maxed || !affordable;
      const strong = button.querySelector<HTMLElement>('strong');
      const cost = button.querySelector<HTMLElement>('.upgrade-cost');
      const detail = button.querySelector<HTMLElement>('.upgrade-detail');
      if (strong) strong.textContent = maxed ? `${config.label} T3 · 最大` : `${config.label} T${config.tier} → T${config.tier + 1}`;
      if (cost) cost.textContent = maxed ? '最大強化済み' : `木 ${config.cost.wood} · 鉄 ${config.cost.iron} · 火薬 ${config.cost.gunpowder} · 合金 ${config.cost.alloy}`;
      if (detail) detail.textContent = config.detail;
    }
    if (note) note.textContent = artillery
      ? '砲兵は防具ではなく「砲性能」と「砲門数」を強化します。強化はこの兵科に保存されます。'
      : '武器・防具Tierはこの兵科に保存され、全滅後も維持されます。兵科を戻せば以前のTierが復元されます。';
  }

  private installScoreboardEvents(): void {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || this.settingsOpen) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      this.scoreboard.classList.remove('hidden');
      this.renderScoreboard();
    };
    const keyUp = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      this.scoreboard.classList.add('hidden');
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    this.cleanup.push(() => window.removeEventListener('keydown', keyDown));
    this.cleanup.push(() => window.removeEventListener('keyup', keyUp));
    this.cleanup.push(() => this.scoreboard.classList.add('hidden'));
  }

  private renderScoreboard(): void {
    this.scoreboardBody.innerHTML = '';
    const players = [...this.room.players].sort((a, b) => {
      if (a.team !== b.team) return a.team === 'blue' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const player of players) {
      if (!player.formationId) continue;
      const stats = this.game.getFormationStats(player.formationId);
      const formation = this.game.formations.find((candidate) => candidate.id === player.formationId);
      const row = document.createElement('div');
      row.className = `scoreboard-row ${player.team}${player.id === this.network.clientId ? ' local' : ''}`;
      const values = [
        `${player.id === this.network.clientId ? '★ ' : ''}${player.name} · ${player.formationId}`,
        `${player.team.toUpperCase()} · ${factionShortLabel(player.team === 'blue' ? this.room.settings.blueFaction : this.room.settings.redFaction)}`,
        classLabel(formation?.squadClass ?? player.squadClass),
        String(stats.kills),
        String(stats.losses),
        String(Math.round(stats.bannerDamage)),
      ];
      if (this.game.modeRules.resources) {
        values.push(String(Math.round(this.game.getFormationResourceTotal(player.formationId))));
        values.push(String(Math.round(this.game.getFormationCombatLootTotal(player.formationId))));
      }
      for (const value of values) {
        const cell = document.createElement('span');
        cell.textContent = value;
        row.appendChild(cell);
      }
      this.scoreboardBody.appendChild(row);
    }
  }

  private sendContinuousControl(): void {
    const formation = this.game.playerFormation;
    const inputLocked = this.settingsOpen || formation.aliveCount() === 0 || formation.mode === 'routed';
    if (inputLocked && !this.movementInputLocked) {
      this.input.suppressMovementUntilRelease();
      this.movementInputLocked = true;
    } else if (!inputLocked && this.movementInputLocked) {
      // Keys held while dead/routed remain ignored until they are physically released.
      this.input.suppressMovementUntilRelease();
      this.movementInputLocked = false;
    }

    let moveX = 0;
    let moveY = 0;
    if (!inputLocked && this.input.isDown('a')) moveX -= 1;
    if (!inputLocked && this.input.isDown('d')) moveX += 1;
    if (!inputLocked && this.input.isDown('w')) moveY -= 1;
    if (!inputLocked && this.input.isDown('s')) moveY += 1;
    const aim = this.game.camera.screenToWorld(this.input.getPointer());
    const weapon: WeaponType = this.game.playerInputWeapon();
    this.network.sendControl({
      formationId: formation.id,
      moveX,
      moveY,
      aim,
      weapon,
      forcedMarch: !inputLocked && this.input.isForcedMarchHeld(),
      gathering: !inputLocked && !this.recruitmentPanelOpen && !this.upgradePanelOpen && this.game.modeRules.resources && this.input.isDown('e'),
    });
  }


  private nearestFriendlyConstructionBlock(world: Vec2, team: Team): { id: string } | null {
    let best: { id: string } | null = null;
    let bestDistance = 72;
    for (const block of this.game.constructionBlocks) {
      if (!block.active || block.team !== team) continue;
      const d = Math.hypot(block.position.x - world.x, block.position.y - world.y);
      if (d < bestDistance) { bestDistance = d; best = { id: block.id }; }
    }
    return best;
  }

  private nearestEnemyConstructionBlock(point: Vec2, team: Team): { id: string } | null {
    let best: { id: string } | null = null;
    let bestDistance = 92;
    for (const block of this.game.constructionBlocks) {
      if (!block.active || block.team === team) continue;
      const distance = Math.hypot(point.x - block.position.x, point.y - block.position.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { id: block.id };
      }
    }
    return best;
  }

  private renderConstructionWork(snapshot: ReturnType<Game['snapshot']>): void {
    const panel = document.querySelector<HTMLElement>('#construction-work');
    const label = document.querySelector<HTMLElement>('#construction-work-label');
    const time = document.querySelector<HTMLElement>('#construction-work-time');
    const bar = document.querySelector<HTMLElement>('#construction-work-bar');
    if (!panel || !label || !time || !bar) return;
    const active = snapshot.playerConstructionWorkProgress !== null && snapshot.playerConstructionWorkType !== null;
    panel.classList.toggle('hidden', !active);
    if (!active) return;
    label.textContent = snapshot.playerConstructionWorkLabel || (snapshot.playerConstructionWorkType === 'place' ? '建築中' : '撤去中');
    time.textContent = `${(snapshot.playerConstructionWorkRemaining ?? 0).toFixed(1)}秒`;
    bar.style.width = `${Math.round((snapshot.playerConstructionWorkProgress ?? 0) * 100)}%`;
    panel.dataset.work = snapshot.playerConstructionWorkType ?? '';
  }

  private installNetworkInputEvents(): void {
    if (this.network.isAuthority) return;

    const toCanvasPoint = (event: MouseEvent): Vec2 => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
      };
    };
    const onMinimap = (point: Vec2): boolean => {
      const rect = minimapRect(this.minimapPosition);
      return point.x >= rect.x && point.x <= rect.x + rect.width
        && point.y >= rect.y && point.y <= rect.y + rect.height;
    };
    const worldAtEvent = (event: MouseEvent): Vec2 => this.game.camera.screenToWorld(toCanvasPoint(event));
    const send = (action: PlayerAction): void => this.network.sendAction(action);
    const cycleFormationShape = (): void => {
      const formation = this.game.playerFormation;
      if (formation.aliveCount() <= 0 || (formation.mode !== 'line' && formation.mode !== 'reforming')) return;
      const shape = nextFormationShape(formation.squadClass, formation.formationShape);
      if (!this.game.setLocalFormationShape(shape)) return;
      send({ type: 'formation_shape', formationId: formation.id, shape });
      this.game.showClientHint(`隊列変更: ${formationShapeLabel(shape)}`);
    };
    let suppressNextRightRelease = false;

    const mouseDown = (event: MouseEvent): void => {
      if (this.settingsOpen) return;
      const point = toCanvasPoint(event);
      if (onMinimap(point)) return;
      const formation = this.game.playerFormation;
      if (event.button === 0) {
        const world = worldAtEvent(event);
        if (this.constructionPlacementArmed && formation.aliveCount() > 0 && this.game.modeRules.resources) {
          const workSeconds = constructionWorkSecondsForClass(formation.squadClass);
          send({ type: 'construction_place', formationId: formation.id, kind: this.constructionKind, target: world, direction: this.constructionDirection });
          this.game.showClientHint(`建築作業を開始（${workSeconds.toFixed(2).replace(/\.00$/, '')}秒）`);
          event.preventDefault();
          return;
        }
        if (canBannerAttackClass(formation.squadClass) && this.game.playerInputWeapon() === 'axe') {
          const construction = this.nearestEnemyConstructionBlock(world, formation.team);
          if (construction) {
            send({ type: 'construction_attack', formationId: formation.id, blockId: construction.id });
            event.preventDefault();
            return;
          }
        }
        if (isArtilleryClass(formation.squadClass)) {
          const issue = artilleryTargetIssue(formation.squadClass, this.game.playerArtilleryRangeOrigin(), world, 0, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
          // Display, client pre-check and authoritative firing all share artilleryProfile()/artilleryTargetIssue().
          // Game.update() consumes invalid clicks locally so the player receives an immediate range hint.
          if (!formation.artilleryDeployed || formation.reloadTimer > 0 || issue) {
            if (!formation.artilleryDeployed) this.game.showClientHint('砲兵は停止して展開完了を待ってください');
            else if (formation.reloadTimer > 0) this.game.showClientHint(`再装填中 ${formation.reloadTimer.toFixed(1)}秒`);
            else if (issue === 'too-far') this.game.showClientHint('射程外です');
            else if (issue === 'too-close') this.game.showClientHint('近すぎます');
            event.preventDefault();
            return;
          }
        }
        send({ type: 'fire', formationId: formation.id, target: world });
      } else if (event.button === 2 && this.constructionPlacementArmed) {
        suppressNextRightRelease = true;
        const world = worldAtEvent(event);
        const construction = this.nearestFriendlyConstructionBlock(world, formation.team);
        if (construction) {
          const workSeconds = constructionWorkSecondsForClass(formation.squadClass);
          send({ type: 'construction_dismantle', formationId: formation.id, blockId: construction.id });
          this.game.showClientHint(`撤去作業を開始（${workSeconds.toFixed(2).replace(/\.00$/, '')}秒）`);
          event.preventDefault();
          return;
        }
      } else if (event.button === 2 && (formation.mode === 'charging' || formation.mode === 'melee')) {
        suppressNextRightRelease = true;
        send({ type: 'reform', formationId: formation.id });
      } else if (event.button === 2 && canBannerAttackClass(formation.squadClass) && this.game.playerInputWeapon() === 'axe') {
        const targetTeam: Team = formation.team === 'blue' ? 'red' : 'blue';
        const banner = this.game.banners.find((candidate) => candidate.team === targetTeam);
        const world = worldAtEvent(event);
        if (banner && Math.hypot(world.x - banner.position.x, world.y - banner.position.y) <= GAME_CONFIG.banner.clickRadius) {
          send({ type: 'banner-attack', formationId: formation.id, targetTeam });
        }
      }
    };
    const mouseUp = (event: MouseEvent): void => {
      if (this.settingsOpen || event.button !== 2) return;
      if (suppressNextRightRelease) {
        suppressNextRightRelease = false;
        return;
      }
      const formation = this.game.playerFormation;
      if (isArtilleryClass(formation.squadClass) || formation.squadClass === 'dragoon' || (canBannerAttackClass(formation.squadClass) && this.game.playerInputWeapon() !== 'bayonet')) return;
      send({ type: 'charge', formationId: formation.id, target: worldAtEvent(event) });
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if (this.settingsOpen) return;
      const formation = this.game.playerFormation;
      const key = event.key.toLowerCase();
      if (this.constructionPlacementArmed) {
        const builderKeys: Partial<Record<string, ConstructionBlockKind>> = {
          '2': 'woodWall', '3': 'ironWall', '4': 'loophole', '5': 'door', '6': 'roadTile', '7': 'bridgeTile',
        };
        if (key === '1' || key === 'escape') {
          this.constructionPlacementArmed = false;
          this.game.showClientHint('戦闘モードへ復帰');
          event.preventDefault();
          return;
        }
        const selected = builderKeys[key];
        if (selected) {
          this.constructionKind = selected;
          event.preventDefault();
          return;
        }
        if (key === 'r') {
          this.constructionDirection = (this.constructionDirection + 1) % 4;
          event.preventDefault();
          return;
        }
      }
      if (key === 'f') send({ type: 'reform', formationId: formation.id });
      if (key === 'n') this.hud.toggleClassReservation();
      if (key === '4' && formation.aliveCount() > 0 && formation.squadClass === 'grenadier') {
        const pointerTarget = this.game.camera.screenToWorld(this.input.getPointer());
        const dx = pointerTarget.x - formation.center.x;
        const dy = pointerTarget.y - formation.center.y;
        const distance = Math.hypot(dx, dy);
        const target = distance >= 20
          ? pointerTarget
          : { x: formation.center.x + Math.cos(formation.direction) * 170, y: formation.center.y + Math.sin(formation.direction) * 170 };
        send({ type: 'grenade', formationId: formation.id, target });
        event.preventDefault();
      }
      if (key === '5' && formation.aliveCount() > 0 && this.game.modeRules.resources && this.room.settings.constructionEnabled) {
        this.constructionPlacementArmed = true;
        this.game.showClientHint('Builder Mode · 2〜7で建築物選択 · 1で戦闘へ戻る');
        event.preventDefault();
        return;
      }
      if (key === '6' && formation.aliveCount() > 0) {
        cycleFormationShape();
        event.preventDefault();
      }
      if (formation.aliveCount() > 0 && canBannerAttackClass(formation.squadClass) && (key === '1' || key === '2' || key === '3')) {
        const weapon: WeaponType = key === '1' ? 'musket' : key === '2' ? 'bayonet' : 'axe';
        this.game.setLocalWeaponSelection(weapon);
        send({ type: 'weapon', formationId: formation.id, weapon });
      }
    };

    this.canvas.addEventListener('mousedown', mouseDown);
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('keydown', keyDown);
    this.cleanup.push(() => this.canvas.removeEventListener('mousedown', mouseDown));
    this.cleanup.push(() => window.removeEventListener('mouseup', mouseUp));
    this.cleanup.push(() => window.removeEventListener('keydown', keyDown));

    const formationSlot = document.querySelector<HTMLElement>('#hotbar .slot[data-slot="6"]');
    if (formationSlot) {
      const click = (): void => { if (!this.constructionPlacementArmed) cycleFormationShape(); };
      formationSlot.addEventListener('click', click);
      this.cleanup.push(() => formationSlot.removeEventListener('click', click));
    }

    for (const card of document.querySelectorAll<HTMLElement>('.class-card[data-class]')) {
      const click = (): void => {
        const value = card.dataset.class;
        if (!isSquadClass(value)) return;
        const formation = this.game.playerFormation;
        send({ type: 'class', formationId: formation.id, squadClass: value });
      };
      card.addEventListener('click', click);
      this.cleanup.push(() => card.removeEventListener('click', click));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-respawn-spawn]')) {
      const click = (): void => {
        const spawnIndex = Number(button.dataset.respawnSpawn);
        if (!Number.isInteger(spawnIndex) || spawnIndex < 0 || spawnIndex > 2) return;
        send({ type: 'spawn', formationId: this.game.playerFormation.id, spawnIndex });
      };
      button.addEventListener('click', click);
      this.cleanup.push(() => button.removeEventListener('click', click));
    }
  }
}
