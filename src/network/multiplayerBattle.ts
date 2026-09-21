import { GAME_CONFIG } from '../game/config';
import { Game } from '../game/game';
import { SQUAD_CLASSES, canBannerAttackClass, canVolleyClass, classLabel, isArtilleryClass, isSquadClass, type Team, type Vec2, type WeaponType } from '../game/types';
import { InputManager } from '../input/inputManager';
import { Renderer } from '../rendering/renderer';
import { Hud } from '../ui/hud';
import { NetworkClient } from './networkClient';
import type { MatchStartPayload, PlayerAction, RoomState } from './protocol';

export class MultiplayerBattle {
  private readonly input: InputManager;
  private readonly game: Game;
  private readonly renderer: Renderer;
  private readonly hud: Hud;
  private readonly labels = new Map<string, string>();
  private readonly localFormationId: string;
  private room: RoomState;
  private readonly scoreboard: HTMLElement;
  private readonly scoreboardBody: HTMLElement;
  private running = true;
  private previousTime = performance.now();
  private snapshotAccumulator = 0;
  private controlAccumulator = 0;
  private readonly cleanup: Array<() => void> = [];

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
    const humanIds = payload.room.players.flatMap((player) => player.formationId ? [player.formationId] : []);
    const initialClasses = Object.fromEntries(
      payload.room.players.flatMap((player) => player.formationId ? [[player.formationId, player.squadClass]] : []),
    );
    for (const player of payload.room.players) {
      if (player.formationId) this.labels.set(player.formationId, `★ ${player.name}`);
    }

    this.input = new InputManager(canvas);
    for (const card of document.querySelectorAll<HTMLElement>('.class-card[data-class]')) {
      const click = (): void => {
        const value = card.dataset.class;
        if (isSquadClass(value)) this.input.queueClassSelection(value);
      };
      card.addEventListener('click', click);
      this.cleanup.push(() => card.removeEventListener('click', click));
    }
    this.game = new Game(this.input, {
      blueSquads: payload.room.settings.blueSquads,
      redSquads: payload.room.settings.redSquads,
      respawnSeconds: payload.room.settings.respawnSeconds,
      localFormationId: this.localFormationId,
      humanFormationIds: humanIds,
      initialClasses,
      introEnabled: false,
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is not available.');
    ctx.imageSmoothingEnabled = false;
    canvas.width = GAME_CONFIG.viewport.width;
    canvas.height = GAME_CONFIG.viewport.height;
    this.renderer = new Renderer(ctx);
    this.installMinimapOpacityControl();
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

    this.installNetworkInputEvents();
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
  }

  private installMinimapOpacityControl(): void {
    const slider = document.querySelector<HTMLInputElement>('#minimap-opacity');
    const value = document.querySelector<HTMLElement>('#minimap-opacity-value');
    if (!slider || !value) return;

    const stored = Number(localStorage.getItem('bannerfall.minimapOpacity') ?? '86');
    const initial = Number.isFinite(stored) ? Math.max(20, Math.min(100, stored)) : 86;
    slider.value = String(initial);

    const apply = (): void => {
      const percent = Math.max(20, Math.min(100, Number(slider.value) || 86));
      this.renderer.setMinimapOpacity(percent / 100);
      value.textContent = `${Math.round(percent)}%`;
      localStorage.setItem('bannerfall.minimapOpacity', String(percent));
    };

    const releaseSliderFocus = (): void => {
      // Range inputs keep keyboard focus after mouse/touch interaction. That made
      // the global game hotkeys intentionally ignore input until the player
      // clicked elsewhere. Release the focus as soon as the adjustment ends.
      slider.blur();
    };

    apply();
    slider.addEventListener('input', apply);
    slider.addEventListener('change', releaseSliderFocus);
    slider.addEventListener('pointerup', releaseSliderFocus);
    slider.addEventListener('pointercancel', releaseSliderFocus);
    this.cleanup.push(() => slider.removeEventListener('input', apply));
    this.cleanup.push(() => slider.removeEventListener('change', releaseSliderFocus));
    this.cleanup.push(() => slider.removeEventListener('pointerup', releaseSliderFocus));
    this.cleanup.push(() => slider.removeEventListener('pointercancel', releaseSliderFocus));
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
      get('army-composition'), get('class-recommendation'),
    );
  }

  private frame(now: number): void {
    if (!this.running) return;
    const rawDt = Math.min((now - this.previousTime) / 1000, 0.04);
    this.previousTime = now;

    // Clients keep short local prediction for responsive controls, then reconcile
    // toward the latest authoritative server snapshot over several render frames.
    this.game.update(rawDt);
    if (!this.network.isAuthority) this.game.smoothNetworkState(rawDt);

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
    this.renderer.render(
      this.game.formations,
      this.game.banners,
      this.game.projectiles,
      this.game.artilleryShells,
      this.game.artilleryExplosions,
      this.game.fieldworks,
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
    this.hud.update(snapshot);
    if (!this.scoreboard.classList.contains('hidden')) this.renderScoreboard();
    requestAnimationFrame((time) => this.frame(time));
  }

  private installScoreboardEvents(): void {
    const keyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
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
        player.team.toUpperCase(),
        classLabel(formation?.squadClass ?? player.squadClass),
        String(stats.kills),
        String(stats.losses),
        String(Math.round(stats.bannerDamage)),
      ];
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
    let moveX = 0;
    let moveY = 0;
    if (this.input.isDown('a')) moveX -= 1;
    if (this.input.isDown('d')) moveX += 1;
    if (this.input.isDown('w')) moveY -= 1;
    if (this.input.isDown('s')) moveY += 1;
    const aim = this.game.camera.screenToWorld(this.input.getPointer());
    const weapon: WeaponType = canBannerAttackClass(formation.squadClass)
      ? formation.weapon
      : canVolleyClass(formation.squadClass) ? 'musket' : 'bayonet';
    this.network.sendControl({ formationId: formation.id, moveX, moveY, aim, weapon, forcedMarch: this.input.isForcedMarchHeld() });
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
      const x = GAME_CONFIG.viewport.width - GAME_CONFIG.minimap.width - GAME_CONFIG.minimap.margin;
      const y = GAME_CONFIG.viewport.height - GAME_CONFIG.minimap.height - GAME_CONFIG.minimap.margin - GAME_CONFIG.minimap.controlHeight - GAME_CONFIG.minimap.controlGap;
      return point.x >= x && point.x <= x + GAME_CONFIG.minimap.width
        && point.y >= y && point.y <= y + GAME_CONFIG.minimap.height;
    };
    const worldAtEvent = (event: MouseEvent): Vec2 => this.game.camera.screenToWorld(toCanvasPoint(event));
    const send = (action: PlayerAction): void => this.network.sendAction(action);
    let suppressNextRightRelease = false;

    const mouseDown = (event: MouseEvent): void => {
      const point = toCanvasPoint(event);
      if (onMinimap(point)) return;
      const formation = this.game.playerFormation;
      if (event.button === 0) {
        send({ type: 'fire', formationId: formation.id, target: worldAtEvent(event) });
      } else if (event.button === 2 && (formation.mode === 'charging' || formation.mode === 'melee')) {
        suppressNextRightRelease = true;
        send({ type: 'reform', formationId: formation.id });
      } else if (event.button === 2 && canBannerAttackClass(formation.squadClass) && formation.weapon === 'axe') {
        const targetTeam: Team = formation.team === 'blue' ? 'red' : 'blue';
        const banner = this.game.banners.find((candidate) => candidate.team === targetTeam);
        const world = worldAtEvent(event);
        if (banner && Math.hypot(world.x - banner.position.x, world.y - banner.position.y) <= GAME_CONFIG.banner.clickRadius) {
          send({ type: 'banner-attack', formationId: formation.id, targetTeam });
        }
      }
    };
    const mouseUp = (event: MouseEvent): void => {
      if (event.button !== 2) return;
      if (suppressNextRightRelease) {
        suppressNextRightRelease = false;
        return;
      }
      const formation = this.game.playerFormation;
      if (isArtilleryClass(formation.squadClass) || formation.squadClass === 'dragoon' || (canBannerAttackClass(formation.squadClass) && formation.weapon !== 'bayonet')) return;
      send({ type: 'charge', formationId: formation.id, target: worldAtEvent(event) });
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      const formation = this.game.playerFormation;
      const key = event.key.toLowerCase();
      if (key === 'f') send({ type: 'reform', formationId: formation.id });
      if (key === 'n') this.hud.toggleClassReservation();
      if (key === '4' && formation.aliveCount() > 0 && formation.squadClass === 'grenadier') {
        send({ type: 'grenade', formationId: formation.id, target: this.game.camera.screenToWorld(this.input.getPointer()) });
      }
      if (key === '5' && formation.aliveCount() > 0 && formation.fieldworkKits > 0) {
        const target = this.game.camera.screenToWorld(this.input.getPointer());
        const direction = Math.atan2(target.y - formation.center.y, target.x - formation.center.x) + Math.PI / 2;
        send({ type: 'fieldwork', formationId: formation.id, target, direction });
      }
      if (key >= '1' && key <= '9') {
        if (formation.aliveCount() === 0) {
          const squadClass = SQUAD_CLASSES[Number(key) - 1];
          if (squadClass) send({ type: 'class', formationId: formation.id, squadClass });
        } else if (canBannerAttackClass(formation.squadClass) && (key === '1' || key === '2' || key === '3')) {
          const weapon: WeaponType = key === '1' ? 'musket' : key === '2' ? 'bayonet' : 'axe';
          send({ type: 'weapon', formationId: formation.id, weapon });
        }
      }
    };

    this.canvas.addEventListener('mousedown', mouseDown);
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('keydown', keyDown);
    this.cleanup.push(() => this.canvas.removeEventListener('mousedown', mouseDown));
    this.cleanup.push(() => window.removeEventListener('mouseup', mouseUp));
    this.cleanup.push(() => window.removeEventListener('keydown', keyDown));

    for (const card of document.querySelectorAll<HTMLElement>('.class-card[data-class]')) {
      const click = (): void => {
        const value = card.dataset.class;
        if (!isSquadClass(value)) return;
        const formation = this.game.playerFormation;
        send({ type: 'class', formationId: formation.id, squadClass: value });
        if (formation.aliveCount() > 0) this.hud.closeClassReservation();
      };
      card.addEventListener('click', click);
      this.cleanup.push(() => card.removeEventListener('click', click));
    }
  }
}
