import { GAME_CONFIG } from './config';
import { BATTLEFIELD_MAP, type BattlefieldMap, type TerrainType } from './battlefieldMap';
import { isArtilleryClass, isMountedClass, type SquadClass, type Vec2 } from './types';

export type DestructibleTerrainType = 'forest' | 'mountain';

export interface TerrainCellNetState {
  col: number;
  row: number;
  terrain: DestructibleTerrainType;
  hp: number;
  maxHp: number;
  destroyed: boolean;
}

interface TerrainCellState extends TerrainCellNetState {}

const FOREST_HP = 2600;
const MOUNTAIN_HP = 9500;
const TILE = GAME_CONFIG.world.grid;

export class TerrainDamageSystem {
  constructor(private readonly map: BattlefieldMap = BATTLEFIELD_MAP) {}
  private readonly cells = new Map<string, TerrainCellState>();
  private dirty = false;

  key(col: number, row: number): string { return `${col},${row}`; }

  baseTerrainAtTile(col: number, row: number): TerrainType {
    return this.map.terrainAtTile(col, row);
  }

  stateAtTile(col: number, row: number): TerrainCellState | null {
    const base = this.baseTerrainAtTile(col, row);
    if (base !== 'forest' && base !== 'mountain') return null;
    const key = this.key(col, row);
    const existing = this.cells.get(key);
    if (existing) return existing;
    const maxHp = base === 'mountain' ? MOUNTAIN_HP : FOREST_HP;
    const state: TerrainCellState = { col, row, terrain: base, hp: maxHp, maxHp, destroyed: false };
    this.cells.set(key, state);
    return state;
  }

  effectiveTerrainAtTile(col: number, row: number): TerrainType {
    const base = this.baseTerrainAtTile(col, row);
    if (base !== 'forest' && base !== 'mountain') return base;
    const state = this.cells.get(this.key(col, row));
    return state?.destroyed ? 'plain' : base;
  }

  effectiveTerrainAt(point: Vec2): TerrainType {
    const col = Math.floor(point.x / TILE);
    const row = Math.floor(point.y / TILE);
    return this.effectiveTerrainAtTile(col, row);
  }

  isPassable(point: Vec2): boolean { return this.effectiveTerrainAt(point) !== 'mountain'; }

  movementMultiplier(point: Vec2, squadClass: SquadClass): number {
    const terrain = this.effectiveTerrainAt(point);
    if (terrain === 'mountain') return 0;
    if (terrain === 'road') return isArtilleryClass(squadClass) ? 1.18 : 1.10;
    if (terrain === 'forest') {
      if (isArtilleryClass(squadClass)) return 0.52;
      if (isMountedClass(squadClass)) return 0.75;
      return 0.76;
    }
    if (terrain === 'river') {
      if (isArtilleryClass(squadClass)) return 0.22;
      if (isMountedClass(squadClass)) return 0.30;
      return 0.38;
    }
    if (terrain === 'ford') {
      if (isArtilleryClass(squadClass)) return 0.42;
      if (isMountedClass(squadClass)) return 0.50;
      return 0.62;
    }
    return 1;
  }

  resolveStep(from: Vec2, direction: Vec2, distance: number): Vec2 {
    const length = Math.hypot(direction.x, direction.y) || 1;
    const nx = direction.x / length;
    const ny = direction.y / length;
    const baseAngle = Math.atan2(ny, nx);
    const offsets = [0, Math.PI / 12, -Math.PI / 12, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2];
    for (const offset of offsets) {
      const angle = baseAngle + offset;
      const candidate = {
        x: Math.max(GAME_CONFIG.world.padding, Math.min(GAME_CONFIG.world.width - GAME_CONFIG.world.padding, from.x + Math.cos(angle) * distance)),
        y: Math.max(GAME_CONFIG.world.padding, Math.min(GAME_CONFIG.world.height - GAME_CONFIG.world.padding, from.y + Math.sin(angle) * distance)),
      };
      if (this.isPassable(candidate)) return candidate;
    }
    return { ...from };
  }

  segmentHitsMountain(from: Vec2, to: Vec2, step = TILE * 0.28): Vec2 | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(8, step)));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const point = { x: from.x + dx * t, y: from.y + dy * t };
      if (this.effectiveTerrainAt(point) === 'mountain') return point;
    }
    return null;
  }

  damageAt(point: Vec2, amount: number, tool: 'bullet' | 'artillery' | 'explosion' | 'axe' | 'pickaxe'): TerrainCellNetState | null {
    const col = Math.floor(point.x / TILE);
    const row = Math.floor(point.y / TILE);
    const state = this.stateAtTile(col, row);
    if (!state || state.destroyed || amount <= 0) return null;
    let multiplier = 1;
    if (state.terrain === 'forest') {
      if (tool === 'axe') multiplier = 4.0;
      else if (tool === 'pickaxe') multiplier = 0.45;
      else if (tool === 'bullet') multiplier = 0.035;
      else if (tool === 'artillery') multiplier = 1.5;
      else multiplier = 0.9;
    } else {
      if (tool === 'pickaxe') multiplier = 4.5;
      else if (tool === 'axe') multiplier = 0.15;
      else if (tool === 'bullet') multiplier = 0.012;
      else if (tool === 'artillery') multiplier = 1.25;
      else multiplier = 0.65;
    }
    state.hp = Math.max(0, state.hp - amount * multiplier);
    if (state.hp <= 0) state.destroyed = true;
    this.dirty = true;
    return { ...state };
  }

  applyNetworkState(states: TerrainCellNetState[]): void {
    this.cells.clear();
    for (const state of states) this.cells.set(this.key(state.col, state.row), { ...state });
    this.dirty = false;
  }

  networkState(): TerrainCellNetState[] {
    return [...this.cells.values()].filter((state) => state.hp < state.maxHp || state.destroyed).map((state) => ({ ...state }));
  }

  destroyedMountainCells(): ReadonlySet<string> {
    const result = new Set<string>();
    for (const [key, state] of this.cells) if (state.terrain === 'mountain' && state.destroyed) result.add(key);
    return result;
  }

  isDirty(): boolean { return this.dirty; }
  consumeDirty(): boolean { const value = this.dirty; this.dirty = false; return value; }
}
