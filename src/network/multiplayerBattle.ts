import { GAME_CONFIG } from '../game/config';
import { Game } from '../game/game';
import type { SquadClass, Team, Vec2, WeaponType } from '../game/types';
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
        if (value === 'infantry' || value === 'cavalry' || value === 'artillery') this.input.queueClassSelection(value);
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
    this.hud = this.createHud();

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
    requestAnimationFrame((now) => this.frame(now));
  }

  updateRoom(room: RoomState): void {
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

  private createHud(): Hud {
    const get = <T extends HTMLElement>(id: string): T => {
      const element = document.querySelector<T>(`#${id}`);
      if (!element) throw new Error(`Missing HUD element #${id}`);
      return element;
    };
    return new Hud(
      get('status'), get('pause-overlay'), get('camera-status'),
      get('blue-banner-card'), get('red-banner-card'), get('blue-banner-hp'), get('red-banner-hp'),
      get('blue-banner-bar'), get('red-banner-bar'), get('player-state'), get('player-detail'),
      get('notice'), get('objective-progress'), get('context-hint'), get('hotbar'),
      get('class-selector'), get('respawn-countdown'), get('army-composition'), get('class-recommendation'),
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
    requestAnimationFrame((time) => this.frame(time));
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
    const weapon: WeaponType = formation.squadClass === 'infantry' ? formation.weapon : 'bayonet';
    this.network.sendControl({ formationId: formation.id, moveX, moveY, aim, weapon });
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
      const y = GAME_CONFIG.viewport.height - GAME_CONFIG.minimap.height - GAME_CONFIG.minimap.margin;
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
      } else if (event.button === 2 && formation.squadClass === 'infantry' && formation.weapon === 'axe') {
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
      if (formation.squadClass === 'artillery' || (formation.squadClass === 'infantry' && formation.weapon !== 'bayonet')) return;
      send({ type: 'charge', formationId: formation.id, target: worldAtEvent(event) });
    };
    const keyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      const formation = this.game.playerFormation;
      const key = event.key.toLowerCase();
      if (key === 'f') send({ type: 'reform', formationId: formation.id });
      if (key === '1' || key === '2' || key === '3') {
        if (formation.aliveCount() === 0) {
          const squadClass: SquadClass = key === '1' ? 'infantry' : key === '2' ? 'cavalry' : 'artillery';
          send({ type: 'class', formationId: formation.id, squadClass });
        } else if (formation.squadClass === 'infantry') {
          const weapon: WeaponType = key === '1' ? 'musket' : key === '2' ? 'bayonet' : 'axe';
          send({ type: 'weapon', formationId: formation.id, weapon });
        }
      }
    };
    const keyUp = (event: KeyboardEvent): void => {
      if (event.key !== ' ') return;
      const formation = this.game.playerFormation;
      if (formation.squadClass === 'artillery' || (formation.squadClass === 'infantry' && formation.weapon !== 'bayonet')) return;
      const target = this.game.camera.screenToWorld(this.input.getPointer());
      send({ type: 'charge', formationId: formation.id, target });
    };

    this.canvas.addEventListener('mousedown', mouseDown);
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    this.cleanup.push(() => this.canvas.removeEventListener('mousedown', mouseDown));
    this.cleanup.push(() => window.removeEventListener('mouseup', mouseUp));
    this.cleanup.push(() => window.removeEventListener('keydown', keyDown));
    this.cleanup.push(() => window.removeEventListener('keyup', keyUp));

    for (const card of document.querySelectorAll<HTMLElement>('.class-card[data-class]')) {
      const click = (): void => {
        const value = card.dataset.class;
        if (value !== 'infantry' && value !== 'cavalry' && value !== 'artillery') return;
        const formation = this.game.playerFormation;
        send({ type: 'class', formationId: formation.id, squadClass: value });
      };
      card.addEventListener('click', click);
      this.cleanup.push(() => card.removeEventListener('click', click));
    }
  }
}
