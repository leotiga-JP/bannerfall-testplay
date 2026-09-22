import { GAME_CONFIG } from './config';
import { isArtilleryClass, isMountedClass, type SquadClass, type Team, type Vec2 } from './types';

export type TerrainType = 'plain' | 'road' | 'forest' | 'mountain' | 'river' | 'ford' | 'bridge';

const TERRAIN_CODE: Record<TerrainType, number> = {
  plain: 0,
  road: 1,
  forest: 2,
  mountain: 3,
  river: 4,
  ford: 5,
  bridge: 6,
};

const TERRAIN_FROM_CODE: TerrainType[] = ['plain', 'road', 'forest', 'mountain', 'river', 'ford', 'bridge'];

export interface MapSite {
  id: string;
  label: string;
  shortLabel: string;
  position: Vec2;
  team?: Team;
  kind: 'facility' | 'resource';
  resource?: 'wood' | 'iron' | 'powder' | 'alloy';
}

export interface CrossingSite {
  id: string;
  label: string;
  x: number;
  kind: 'bridge' | 'ford';
}

export interface SpawnArea {
  index: number;
  label: string;
  shortLabel: string;
  center: Vec2;
  radiusX: number;
  radiusY: number;
}

export const SPAWN_AREA_COUNT = 3;

const BLUE_SPAWN_AREAS: readonly SpawnArea[] = [
  { index: 0, label: 'A 後方営地', shortLabel: 'A', center: { x: 1450, y: 8850 }, radiusX: 760, radiusY: 520 },
  { index: 1, label: 'B 西部営地', shortLabel: 'B', center: { x: 2600, y: 7700 }, radiusX: 760, radiusY: 520 },
  { index: 2, label: 'C 東部営地', shortLabel: 'C', center: { x: 3800, y: 8700 }, radiusX: 760, radiusY: 520 },
];

const RED_SPAWN_AREAS: readonly SpawnArea[] = BLUE_SPAWN_AREAS.map((area) => ({
  ...area,
  center: {
    x: GAME_CONFIG.world.width - area.center.x,
    y: GAME_CONFIG.world.height - area.center.y,
  },
}));

const SPAWN_ANCHOR_OFFSETS: readonly Vec2[] = [
  { x: -520, y: -300 }, { x: -260, y: -300 }, { x: 0, y: -300 }, { x: 260, y: -300 }, { x: 520, y: -300 },
  { x: -520, y: 0 }, { x: -260, y: 0 }, { x: 0, y: 0 }, { x: 260, y: 0 }, { x: 520, y: 0 },
  { x: -520, y: 300 }, { x: -260, y: 300 }, { x: 0, y: 300 }, { x: 260, y: 300 }, { x: 520, y: 300 },
];

const TILE = GAME_CONFIG.world.grid;
const COLS = Math.ceil(GAME_CONFIG.world.width / TILE);
const ROWS = Math.ceil(GAME_CONFIG.world.height / TILE);

const BLUE_SPAWN: Vec2 = { x: GAME_CONFIG.army.blueSpawnX, y: GAME_CONFIG.army.blueSpawnY };
const RED_SPAWN: Vec2 = { x: GAME_CONFIG.army.redSpawnX, y: GAME_CONFIG.army.redSpawnY };
const BLUE_BANNER: Vec2 = { x: GAME_CONFIG.banner.blueX, y: GAME_CONFIG.banner.blueY };
const RED_BANNER: Vec2 = { x: GAME_CONFIG.banner.redX, y: GAME_CONFIG.banner.redY };
const CENTER: Vec2 = { x: GAME_CONFIG.world.width / 2, y: GAME_CONFIG.world.height / 2 };

export const CROSSINGS: CrossingSite[] = [
  { id: 'west-ford', label: '西浅瀬', x: 2880, kind: 'ford' },
  { id: 'west-bridge', label: '西橋', x: 5840, kind: 'bridge' },
  { id: 'central-bridge', label: '中央石橋', x: CENTER.x, kind: 'bridge' },
  { id: 'east-bridge', label: '東橋', x: 11560, kind: 'bridge' },
  { id: 'east-ford', label: '東浅瀬', x: 14520, kind: 'ford' },
];

export const MAP_SITES: MapSite[] = [
  { id: 'blue-barracks', label: 'BLUE 兵舎予定地', shortLabel: '兵舎', team: 'blue', kind: 'facility', position: { x: 2550, y: 8120 } },
  { id: 'blue-workshop', label: 'BLUE 工房予定地', shortLabel: '工房', team: 'blue', kind: 'facility', position: { x: 3340, y: 7700 } },
  { id: 'blue-foundry', label: 'BLUE 砲兵工廠予定地', shortLabel: '砲兵工廠', team: 'blue', kind: 'facility', position: { x: 3950, y: 8380 } },
  { id: 'red-barracks', label: 'RED 兵舎予定地', shortLabel: '兵舎', team: 'red', kind: 'facility', position: { x: GAME_CONFIG.world.width - 2550, y: GAME_CONFIG.world.height - 8120 } },
  { id: 'red-workshop', label: 'RED 工房予定地', shortLabel: '工房', team: 'red', kind: 'facility', position: { x: GAME_CONFIG.world.width - 3340, y: GAME_CONFIG.world.height - 7700 } },
  { id: 'red-foundry', label: 'RED 砲兵工廠予定地', shortLabel: '砲兵工廠', team: 'red', kind: 'facility', position: { x: GAME_CONFIG.world.width - 3950, y: GAME_CONFIG.world.height - 8380 } },

  { id: 'blue-wood', label: '木材予定地', shortLabel: '木材', team: 'blue', kind: 'resource', resource: 'wood', position: { x: 2050, y: 6960 } },
  { id: 'blue-iron', label: '鉄鉱予定地', shortLabel: '鉄', team: 'blue', kind: 'resource', resource: 'iron', position: { x: 4700, y: 8500 } },
  { id: 'blue-powder', label: '火薬予定地', shortLabel: '火薬', team: 'blue', kind: 'resource', resource: 'powder', position: { x: 1660, y: 8960 } },
  { id: 'red-wood', label: '木材予定地', shortLabel: '木材', team: 'red', kind: 'resource', resource: 'wood', position: { x: GAME_CONFIG.world.width - 2050, y: GAME_CONFIG.world.height - 6960 } },
  { id: 'red-iron', label: '鉄鉱予定地', shortLabel: '鉄', team: 'red', kind: 'resource', resource: 'iron', position: { x: GAME_CONFIG.world.width - 4700, y: GAME_CONFIG.world.height - 8500 } },
  { id: 'red-powder', label: '火薬予定地', shortLabel: '火薬', team: 'red', kind: 'resource', resource: 'powder', position: { x: GAME_CONFIG.world.width - 1660, y: GAME_CONFIG.world.height - 8960 } },

  { id: 'central-alloy', label: '中央合金鉱区（Version 4.1予定）', shortLabel: '合金', kind: 'resource', resource: 'alloy', position: { ...CENTER } },
  { id: 'west-iron', label: '前線鉄鉱予定地', shortLabel: '鉄+', kind: 'resource', resource: 'iron', position: { x: 6600, y: 3300 } },
  { id: 'east-powder', label: '前線火薬予定地', shortLabel: '火薬+', kind: 'resource', resource: 'powder', position: { x: GAME_CONFIG.world.width - 6600, y: GAME_CONFIG.world.height - 3300 } },
];

function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = point.x - a.x;
  const wy = point.y - a.y;
  const lengthSq = vx * vx + vy * vy;
  const t = lengthSq <= 0.0001 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSq));
  const px = a.x + vx * t;
  const py = a.y + vy * t;
  return Math.hypot(point.x - px, point.y - py);
}

function riverCenterY(x: number): number {
  const u = x / GAME_CONFIG.world.width;
  return GAME_CONFIG.world.height * 0.5
    + Math.sin(u * Math.PI * 2 - 0.55) * 285
    + Math.sin(u * Math.PI * 6 + 0.8) * 72;
}

function inEllipse(point: Vec2, center: Vec2, radiusX: number, radiusY: number): boolean {
  const dx = (point.x - center.x) / radiusX;
  const dy = (point.y - center.y) / radiusY;
  return dx * dx + dy * dy <= 1;
}

export class BattlefieldMap {
  readonly tileSize = TILE;
  readonly columns = COLS;
  readonly rows = ROWS;
  private readonly terrain = new Uint8Array(COLS * ROWS);

  constructor() {
    this.generate();
  }

  terrainAt(point: Vec2): TerrainType {
    const col = Math.max(0, Math.min(this.columns - 1, Math.floor(point.x / TILE)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor(point.y / TILE)));
    return TERRAIN_FROM_CODE[this.terrain[row * this.columns + col]] ?? 'plain';
  }

  terrainAtTile(col: number, row: number): TerrainType {
    if (col < 0 || row < 0 || col >= this.columns || row >= this.rows) return 'mountain';
    return TERRAIN_FROM_CODE[this.terrain[row * this.columns + col]] ?? 'plain';
  }

  tileCenter(col: number, row: number): Vec2 {
    return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE };
  }

  isPassable(point: Vec2): boolean {
    return this.terrainAt(point) !== 'mountain';
  }

  isWater(point: Vec2): boolean {
    const terrain = this.terrainAt(point);
    return terrain === 'river' || terrain === 'ford';
  }

  isBridge(point: Vec2): boolean {
    return this.terrainAt(point) === 'bridge';
  }

  movementMultiplier(point: Vec2, squadClass: SquadClass): number {
    const terrain = this.terrainAt(point);
    if (terrain === 'mountain') return 0;
    if (terrain === 'road') return isArtilleryClass(squadClass) ? 1.18 : 1.10;
    if (terrain === 'forest') {
      if (isArtilleryClass(squadClass)) return 0.52;
      if (isMountedClass(squadClass)) return 0.62;
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

  spawnAreas(team: Team): readonly SpawnArea[] {
    return team === 'blue' ? BLUE_SPAWN_AREAS : RED_SPAWN_AREAS;
  }

  spawnArea(team: Team, index: number): SpawnArea {
    const areas = this.spawnAreas(team);
    return areas[Math.max(0, Math.min(areas.length - 1, Math.floor(index)))] ?? areas[0];
  }

  spawnPoint(team: Team, areaIndex: number, seed: number): Vec2 {
    const area = this.spawnArea(team, areaIndex);
    const offset = SPAWN_ANCHOR_OFFSETS[Math.abs(Math.floor(seed)) % SPAWN_ANCHOR_OFFSETS.length];
    const rotation = team === 'blue' ? 1 : -1;
    const point = {
      x: area.center.x + offset.x * rotation,
      y: area.center.y + offset.y * rotation,
    };
    return this.nearestPassablePoint(point, 8);
  }

  nearestSpawnAreaIndex(team: Team, point: Vec2): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const area of this.spawnAreas(team)) {
      const dx = (point.x - area.center.x) / area.radiusX;
      const dy = (point.y - area.center.y) / area.radiusY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = area.index;
      }
    }
    return best;
  }

  inSpawnArea(team: Team, point: Vec2, padding = 0): boolean {
    return this.spawnAreas(team).some((area) => inEllipse(
      point,
      area.center,
      area.radiusX + padding,
      area.radiusY + padding,
    ));
  }

  linePassable(from: Vec2, to: Vec2, clearanceTiles = 1): boolean {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return this.isPassable(from);
    const steps = Math.max(1, Math.ceil(distance / (TILE * 0.45)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const point = { x: from.x + dx * t, y: from.y + dy * t };
      const col = Math.floor(point.x / TILE);
      const row = Math.floor(point.y / TILE);
      for (let oy = -clearanceTiles; oy <= clearanceTiles; oy += 1) {
        for (let ox = -clearanceTiles; ox <= clearanceTiles; ox += 1) {
          if (this.terrainAtTile(col + ox, row + oy) === 'mountain') return false;
        }
      }
    }
    return true;
  }

  findPath(from: Vec2, to: Vec2, squadClass: SquadClass, maxExpanded = 14000): Vec2[] {
    const startPoint = this.nearestPassablePoint(from, 10);
    const goalPoint = this.nearestPassablePoint(to, 14);
    const startCol = Math.max(0, Math.min(this.columns - 1, Math.floor(startPoint.x / TILE)));
    const startRow = Math.max(0, Math.min(this.rows - 1, Math.floor(startPoint.y / TILE)));
    const goalCol = Math.max(0, Math.min(this.columns - 1, Math.floor(goalPoint.x / TILE)));
    const goalRow = Math.max(0, Math.min(this.rows - 1, Math.floor(goalPoint.y / TILE)));
    const startIndex = startRow * this.columns + startCol;
    const goalIndex = goalRow * this.columns + goalCol;
    if (startIndex === goalIndex) return [goalPoint];

    const total = this.columns * this.rows;
    const gScore = new Float64Array(total);
    gScore.fill(Number.POSITIVE_INFINITY);
    const cameFrom = new Int32Array(total);
    cameFrom.fill(-1);
    const closed = new Uint8Array(total);
    const heapIndices: number[] = [];
    const heapScores: number[] = [];

    const heuristic = (col: number, row: number): number => Math.hypot(goalCol - col, goalRow - row);
    const push = (index: number, score: number): void => {
      let i = heapIndices.length;
      heapIndices.push(index);
      heapScores.push(score);
      while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        if (heapScores[parent] <= score) break;
        heapIndices[i] = heapIndices[parent];
        heapScores[i] = heapScores[parent];
        i = parent;
      }
      heapIndices[i] = index;
      heapScores[i] = score;
    };
    const pop = (): number | null => {
      if (heapIndices.length === 0) return null;
      const result = heapIndices[0];
      const lastIndex = heapIndices.pop()!;
      const lastScore = heapScores.pop()!;
      if (heapIndices.length > 0) {
        let i = 0;
        while (true) {
          let child = i * 2 + 1;
          if (child >= heapIndices.length) break;
          if (child + 1 < heapIndices.length && heapScores[child + 1] < heapScores[child]) child += 1;
          if (heapScores[child] >= lastScore) break;
          heapIndices[i] = heapIndices[child];
          heapScores[i] = heapScores[child];
          i = child;
        }
        heapIndices[i] = lastIndex;
        heapScores[i] = lastScore;
      }
      return result;
    };

    gScore[startIndex] = 0;
    push(startIndex, heuristic(startCol, startRow));
    const directions = [
      [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
      [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2],
    ] as const;
    let expanded = 0;
    let found = false;

    while (heapIndices.length > 0 && expanded < maxExpanded) {
      const current = pop();
      if (current === null) break;
      if (closed[current]) continue;
      closed[current] = 1;
      if (current === goalIndex) { found = true; break; }
      expanded += 1;
      const row = Math.floor(current / this.columns);
      const col = current - row * this.columns;

      for (const [ox, oy, stepDistance] of directions) {
        const nextCol = col + ox;
        const nextRow = row + oy;
        if (nextCol < 0 || nextRow < 0 || nextCol >= this.columns || nextRow >= this.rows) continue;
        if (this.terrainAtTile(nextCol, nextRow) === 'mountain') continue;
        if (ox !== 0 && oy !== 0 && (this.terrainAtTile(col + ox, row) === 'mountain' || this.terrainAtTile(col, row + oy) === 'mountain')) continue;
        const next = nextRow * this.columns + nextCol;
        if (closed[next]) continue;
        const moveCost = this.navigationCost(nextCol, nextRow, squadClass) * stepDistance;
        const tentative = gScore[current] + moveCost;
        if (tentative >= gScore[next]) continue;
        cameFrom[next] = current;
        gScore[next] = tentative;
        push(next, tentative + heuristic(nextCol, nextRow));
      }
    }

    if (!found) return [];
    const raw: Vec2[] = [goalPoint];
    let current = goalIndex;
    while (current !== startIndex && current >= 0) {
      const row = Math.floor(current / this.columns);
      const col = current - row * this.columns;
      raw.push(this.tileCenter(col, row));
      current = cameFrom[current];
    }
    raw.push(startPoint);
    raw.reverse();

    const smoothed: Vec2[] = [];
    let anchor = 0;
    while (anchor < raw.length - 1) {
      let next = Math.min(raw.length - 1, anchor + 1);
      for (let candidate = Math.min(raw.length - 1, anchor + 12); candidate > next; candidate -= 1) {
        if (this.linePassable(raw[anchor], raw[candidate], 0)) {
          next = candidate;
          break;
        }
      }
      smoothed.push(raw[next]);
      anchor = next;
    }
    return smoothed;
  }

  private navigationCost(col: number, row: number, squadClass: SquadClass): number {
    const terrain = this.terrainAtTile(col, row);
    if (terrain === 'mountain') return Number.POSITIVE_INFINITY;
    let cost = 1;
    if (terrain === 'road') cost = 0.66;
    else if (terrain === 'bridge') cost = 0.72;
    else if (terrain === 'forest') cost = isArtilleryClass(squadClass) ? 2.15 : isMountedClass(squadClass) ? 1.82 : 1.35;
    else if (terrain === 'ford') cost = isArtilleryClass(squadClass) ? 2.8 : isMountedClass(squadClass) ? 2.3 : 1.72;
    else if (terrain === 'river') cost = isArtilleryClass(squadClass) ? 8.0 : isMountedClass(squadClass) ? 6.2 : 4.2;

    let mountainNeighbors = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue;
        if (this.terrainAtTile(col + ox, row + oy) === 'mountain') mountainNeighbors += 1;
      }
    }
    const clearanceWeight = isArtilleryClass(squadClass) ? 0.34 : isMountedClass(squadClass) ? 0.27 : 0.18;
    return cost + mountainNeighbors * clearanceWeight;
  }

  attackLaneTarget(team: Team, formationId: string, from: Vec2, enemyBanner: Vec2): Vec2 {
    const numeric = Number.parseInt(formationId.replace(/\D/g, ''), 10);
    const lane = Number.isFinite(numeric) ? (Math.max(1, numeric) - 1) % 3 : 1;
    const crossing = CROSSINGS[[1, 2, 3][lane]];
    const riverY = riverCenterY(crossing.x);
    const nearSide = team === 'blue' ? riverY + 620 : riverY - 620;
    const farSide = team === 'blue' ? riverY - 620 : riverY + 620;
    const onHomeSide = team === 'blue' ? from.y > riverY + 150 : from.y < riverY - 150;
    const inCrossingBand = Math.abs(from.y - riverY) <= 760;
    if (onHomeSide) return { x: crossing.x, y: nearSide };
    if (inCrossingBand) return { x: crossing.x, y: farSide };
    return { ...enemyBanner };
  }

  resolveStep(from: Vec2, direction: Vec2, distance: number): Vec2 {
    const length = Math.hypot(direction.x, direction.y);
    if (length <= 0.0001 || distance <= 0) return { ...from };
    const baseAngle = Math.atan2(direction.y, direction.x);
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

  nearestPassablePoint(point: Vec2, maxRadiusTiles = 16): Vec2 {
    if (this.isPassable(point)) return { ...point };
    const originCol = Math.max(0, Math.min(this.columns - 1, Math.floor(point.x / TILE)));
    const originRow = Math.max(0, Math.min(this.rows - 1, Math.floor(point.y / TILE)));
    let best: Vec2 | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let radius = 1; radius <= maxRadiusTiles; radius += 1) {
      for (let row = originRow - radius; row <= originRow + radius; row += 1) {
        for (let col = originCol - radius; col <= originCol + radius; col += 1) {
          if (Math.abs(col - originCol) !== radius && Math.abs(row - originRow) !== radius) continue;
          if (this.terrainAtTile(col, row) === 'mountain') continue;
          const candidate = this.tileCenter(col, row);
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
          }
        }
      }
      if (best) return best;
    }
    return { ...point };
  }

  attackLaneDirection(team: Team, formationId: string, from: Vec2, enemyBanner: Vec2): Vec2 {
    const target = this.attackLaneTarget(team, formationId, from, enemyBanner);
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    return { x: dx / distance, y: dy / distance };
  }

  riverY(x: number): number {
    return riverCenterY(x);
  }

  spawnCenter(team: Team): Vec2 {
    return { ...this.spawnArea(team, 0).center };
  }

  private setTile(col: number, row: number, terrain: TerrainType): void {
    if (col < 0 || row < 0 || col >= this.columns || row >= this.rows) return;
    this.terrain[row * this.columns + col] = TERRAIN_CODE[terrain];
  }

  private paintEllipse(center: Vec2, radiusX: number, radiusY: number, terrain: TerrainType): void {
    const minCol = Math.max(0, Math.floor((center.x - radiusX) / TILE));
    const maxCol = Math.min(this.columns - 1, Math.ceil((center.x + radiusX) / TILE));
    const minRow = Math.max(0, Math.floor((center.y - radiusY) / TILE));
    const maxRow = Math.min(this.rows - 1, Math.ceil((center.y + radiusY) / TILE));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const centerPoint = this.tileCenter(col, row);
        if (inEllipse(centerPoint, center, radiusX, radiusY)) this.setTile(col, row, terrain);
      }
    }
  }

  private paintRoad(a: Vec2, b: Vec2, width: number, carveMountains = false): void {
    const minCol = Math.max(0, Math.floor((Math.min(a.x, b.x) - width) / TILE));
    const maxCol = Math.min(this.columns - 1, Math.ceil((Math.max(a.x, b.x) + width) / TILE));
    const minRow = Math.max(0, Math.floor((Math.min(a.y, b.y) - width) / TILE));
    const maxRow = Math.min(this.rows - 1, Math.ceil((Math.max(a.y, b.y) + width) / TILE));
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const point = this.tileCenter(col, row);
        if (distanceToSegment(point, a, b) > width) continue;
        const existing = this.terrainAtTile(col, row);
        if (existing === 'plain' || existing === 'forest' || (carveMountains && existing === 'mountain')) this.setTile(col, row, 'road');
      }
    }
  }

  private paintBaseBasin(team: Team): void {
    const banner = team === 'blue' ? BLUE_BANNER : RED_BANNER;
    const spawn = team === 'blue' ? BLUE_SPAWN : RED_SPAWN;
    const rotation = team === 'blue' ? 1 : -1;

    // Coastal-inspired idea, not a literal copy: the Banner sits inside a mountain basin.
    // The basin has two front gates and one rear logistics gate, so a rush cannot hit the Banner from every angle.
    const ring: Array<[number, number, number, number]> = [
      [-1380, -420, 760, 500],
      [-900, -1120, 820, 430],
      [40, -1370, 900, 420],
      [980, -1040, 760, 430],
      [1420, -250, 520, 720],
      [1180, 760, 720, 470],
      [260, 1280, 880, 420],
      [-840, 1080, 780, 450],
      [-1420, 380, 520, 700],
    ];
    for (const [dx, dy, rx, ry] of ring) {
      this.paintEllipse({ x: banner.x + dx * rotation, y: banner.y + dy * rotation }, rx, ry, 'mountain');
    }

    // Keep the Banner yard and all three spawn areas open. Spawn areas are broad
    // formation-safe zones rather than single points; spawn-killing remains possible.
    this.paintEllipse(banner, 1500, 1120, 'plain');
    for (const area of this.spawnAreas(team)) {
      this.paintEllipse(area.center, area.radiusX + 180, area.radiusY + 180, 'plain');
      this.paintRoad(area.center, banner, 360, true);
    }

    const riverGate = team === 'blue'
      ? { x: CROSSINGS[1].x, y: riverCenterY(CROSSINGS[1].x) + 520 }
      : { x: CROSSINGS[3].x, y: riverCenterY(CROSSINGS[3].x) - 520 };
    const centerGate = { x: CENTER.x, y: CENTER.y };

    // Broad logistics road plus three independent front approaches.
    // The three bridge lanes are deliberately carved through mountain rings so AI armies
    // can split instead of funnelling into a single gate.
    this.paintRoad(spawn, banner, 420, true);
    const laneIndexes = [1, 2, 3];
    for (const laneIndex of laneIndexes) {
      const crossing = CROSSINGS[laneIndex];
      const side = team === 'blue' ? 620 : -620;
      const gate = { x: crossing.x, y: riverCenterY(crossing.x) + side };
      this.paintRoad(banner, gate, laneIndex === 2 ? 430 : 390, true);
    }
    this.paintRoad(banner, riverGate, 390, true);
    this.paintRoad(banner, centerGate, 430, true);
  }

  private generate(): void {
    // The arena is exactly 2x wider and 2x taller than v4.0: ~4x total battlefield area.
    // Terrain is 180-degree rotationally symmetric for the current two-team mode.
    const forests: Array<[Vec2, number, number]> = [
      [{ x: 1800, y: 6800 }, 1250, 920],
      [{ x: 3650, y: 8750 }, 1450, 600],
      [{ x: 6200, y: 7200 }, 1150, 760],
      [{ x: 2350, y: 4200 }, 900, 720],
      [{ x: 5400, y: 5650 }, 780, 640],
    ];
    for (const [center, rx, ry] of forests) {
      this.paintEllipse(center, rx, ry, 'forest');
      this.paintEllipse({ x: GAME_CONFIG.world.width - center.x, y: GAME_CONFIG.world.height - center.y }, rx, ry, 'forest');
    }

    // Strategic ridges outside the bases create lane-like movement without forcing rigid MOBA lanes.
    const mountains: Array<[Vec2, number, number]> = [
      [{ x: 5000, y: 1900 }, 1500, 560],
      [{ x: 6900, y: 1300 }, 1000, 440],
      [{ x: 2500, y: 2250 }, 820, 520],
      [{ x: 7600, y: 3600 }, 720, 520],
    ];
    for (const [center, rx, ry] of mountains) {
      this.paintEllipse(center, rx, ry, 'mountain');
      this.paintEllipse({ x: GAME_CONFIG.world.width - center.x, y: GAME_CONFIG.world.height - center.y }, rx, ry, 'mountain');
    }

    // Mountain basins around both Banners limit invasion angles while preserving wide AI-safe gates.
    this.paintBaseBasin('blue');
    this.paintBaseBasin('red');

    // A continuous meandering river bisects the full map. It is deliberately wider than in v4.0.
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.columns; col += 1) {
        const point = this.tileCenter(col, row);
        const halfWidth = 270 + 42 * Math.sin((point.x / GAME_CONFIG.world.width) * Math.PI * 4);
        if (Math.abs(point.y - riverCenterY(point.x)) <= halfWidth) this.setTile(col, row, 'river');
      }
    }

    // Central island is the future high-value alloy objective.
    this.paintEllipse(CENTER, 650, 360, 'plain');

    for (const crossing of CROSSINGS) {
      const width = crossing.kind === 'bridge' ? 165 : 290;
      const minCol = Math.max(0, Math.floor((crossing.x - width) / TILE));
      const maxCol = Math.min(this.columns - 1, Math.ceil((crossing.x + width) / TILE));
      for (let row = 0; row < this.rows; row += 1) {
        for (let col = minCol; col <= maxCol; col += 1) {
          const point = this.tileCenter(col, row);
          if (Math.abs(point.y - riverCenterY(point.x)) > 460) continue;
          if (this.terrainAtTile(col, row) === 'river') this.setTile(col, row, crossing.kind);
        }
      }
    }

    // Reinforce the readable spawn -> Banner -> three-front-lane flow after river paint.
    for (const area of BLUE_SPAWN_AREAS) {
      this.paintEllipse(area.center, area.radiusX + 180, area.radiusY + 180, 'plain');
      this.paintRoad(area.center, BLUE_BANNER, 360, true);
    }
    for (const area of RED_SPAWN_AREAS) {
      this.paintEllipse(area.center, area.radiusX + 180, area.radiusY + 180, 'plain');
      this.paintRoad(area.center, RED_BANNER, 360, true);
    }
    for (const laneIndex of [1, 2, 3]) {
      const crossing = CROSSINGS[laneIndex];
      const riverY = riverCenterY(crossing.x);
      const width = laneIndex === 2 ? 430 : 390;
      this.paintRoad(BLUE_BANNER, { x: crossing.x, y: riverY + 620 }, width, true);
      this.paintRoad(RED_BANNER, { x: crossing.x, y: riverY - 620 }, width, true);
    }
  }
}

export const BATTLEFIELD_MAP = new BattlefieldMap();
