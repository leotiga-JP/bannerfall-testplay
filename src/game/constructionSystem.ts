import type { ConstructionBlock, ConstructionBlockKind } from '../entities/constructionBlock';
import { GAME_CONFIG } from './config';
import type { ResourceStockpile } from './resourceSystem';
import { isMountedClass, type SquadClass, type Team, type Vec2 } from './types';

export const CONSTRUCTION_REBUILD_COOLDOWN_SECONDS = 12;
export const CONSTRUCTION_PLACE_RANGE = 205;
export const CONSTRUCTION_WORK_SECONDS = 1.5;
export const CONSTRUCTION_NON_ENGINEER_MULTIPLIER = 2;
export const CONSTRUCTION_MOUNTED_MULTIPLIER = 2.5;

export function constructionWorkSecondsForClass(squadClass: SquadClass): number {
  if (squadClass === 'engineer') return CONSTRUCTION_WORK_SECONDS;
  if (isMountedClass(squadClass)) return CONSTRUCTION_WORK_SECONDS * CONSTRUCTION_MOUNTED_MULTIPLIER;
  return CONSTRUCTION_WORK_SECONDS * CONSTRUCTION_NON_ENGINEER_MULTIPLIER;
}
export const CONSTRUCTION_ROAD_SPEED_MULTIPLIER = 1.18;
export const CONSTRUCTION_MOVEMENT_PADDING = 8;
export const LOOPHOLE_ENEMY_PASS_CHANCE = 0.35;

export const CONSTRUCTION_COSTS: Readonly<Record<ConstructionBlockKind, ResourceStockpile>> = Object.freeze({
  woodWall: Object.freeze({ wood: 45, iron: 0, gunpowder: 0, alloy: 0 }),
  ironWall: Object.freeze({ wood: 20, iron: 55, gunpowder: 0, alloy: 4 }),
  loophole: Object.freeze({ wood: 35, iron: 18, gunpowder: 0, alloy: 0 }),
  door: Object.freeze({ wood: 42, iron: 12, gunpowder: 0, alloy: 0 }),
  roadTile: Object.freeze({ wood: 18, iron: 0, gunpowder: 0, alloy: 0 }),
  bridgeTile: Object.freeze({ wood: 34, iron: 0, gunpowder: 0, alloy: 0 }),
});

export interface ConstructionWorkNetState {
  formationId: string;
  type: 'place' | 'dismantle';
  startedAt: number;
  completeAt: number;
  kind?: ConstructionBlockKind;
  blockId?: string;
}
export interface ConstructionCooldownNetState { cellKey: string; remaining: number }
export interface ConstructionBlockNetState {
  id: string;
  team: Team;
  kind: ConstructionBlockKind;
  col: number;
  row: number;
  direction: number;
  hp: number;
  maxHp: number;
}
export interface ConstructionNetworkState {
  blocks: ConstructionBlockNetState[];
  cooldowns: ConstructionCooldownNetState[];
}

export function constructionCellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function worldToConstructionCell(point: Vec2): { col: number; row: number } {
  const grid = GAME_CONFIG.world.grid;
  return {
    col: Math.max(0, Math.min(Math.ceil(GAME_CONFIG.world.width / grid) - 1, Math.floor(point.x / grid))),
    row: Math.max(0, Math.min(Math.ceil(GAME_CONFIG.world.height / grid) - 1, Math.floor(point.y / grid))),
  };
}

export function constructionCellCenter(col: number, row: number): Vec2 {
  const grid = GAME_CONFIG.world.grid;
  return { x: (col + 0.5) * grid, y: (row + 0.5) * grid };
}

export function pointInsideConstructionBlock(point: Vec2, block: ConstructionBlock, padding = 0): boolean {
  const half = GAME_CONFIG.world.grid / 2 + padding;
  const center = block.position;
  return Math.abs(point.x - center.x) <= half && Math.abs(point.y - center.y) <= half;
}

export function segmentIntersectsConstructionBlock(start: Vec2, end: Vec2, block: ConstructionBlock, padding = 0): boolean {
  const center = block.position;
  const half = GAME_CONFIG.world.grid / 2 + padding;
  let t0 = 0;
  let t1 = 1;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, start.x - (center.x - half))
    && clip(dx, (center.x + half) - start.x)
    && clip(-dy, start.y - (center.y - half))
    && clip(dy, (center.y + half) - start.y);
}

export function isLoopholeFriendlyShot(block: ConstructionBlock, projectileTeam: Team, velocity: Vec2): boolean {
  if (block.kind !== 'loophole' || block.team !== projectileTeam) return false;
  const outwardAngle = block.direction * Math.PI / 2;
  const outward = { x: Math.cos(outwardAngle), y: Math.sin(outwardAngle) };
  return velocity.x * outward.x + velocity.y * outward.y > 0;
}

export function constructionBlocksMovement(kind: ConstructionBlockKind): boolean {
  return kind === 'woodWall' || kind === 'ironWall' || kind === 'loophole' || kind === 'door';
}

export function constructionBlocksProjectiles(kind: ConstructionBlockKind): boolean {
  return kind === 'woodWall' || kind === 'ironWall' || kind === 'loophole' || kind === 'door';
}
