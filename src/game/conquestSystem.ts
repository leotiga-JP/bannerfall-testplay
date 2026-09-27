import type { Formation } from '../entities/formation';
import { BATTLEFIELD_MAP } from './battlefieldMap';
import type { Team, Vec2 } from './types';

export interface CapturePointState {
  id: 'A' | 'B' | 'C';
  label: string;
  position: Vec2;
  owner: Team | null;
  captureTeam: Team | null;
  progress: number;
  contested: boolean;
  bluePresence: number;
  redPresence: number;
}

export interface ConquestNetState {
  initialTickets: number;
  tickets: Record<Team, number>;
  points: CapturePointState[];
}

const CAPTURE_RADIUS = 430;
const CAPTURE_SECONDS_NEUTRAL_TO_FULL = 7;
const CAPTURE_RATE = 1 / CAPTURE_SECONDS_NEUTRAL_TO_FULL;
const MAJORITY_BLEED_SECONDS = 5;
const TOTAL_CONTROL_BLEED_SECONDS = 2.5;

const RAW_POINTS: Array<Pick<CapturePointState, 'id' | 'label' | 'position'>> = [
  { id: 'A', label: '西部拠点', position: { x: 5840, y: 5200 } },
  { id: 'B', label: '中央拠点', position: { x: 8704, y: 4960 } },
  { id: 'C', label: '東部拠点', position: { x: 11560, y: 4780 } },
];

function clonePoint(point: CapturePointState): CapturePointState {
  return { ...point, position: { ...point.position } };
}

export class ConquestSystem {
  initialTickets: number;
  readonly points: CapturePointState[];
  readonly tickets: Record<Team, number>;
  private bleedAccumulator: Record<Team, number> = { blue: 0, red: 0 };

  constructor(blueSquads: number, redSquads: number, configuredTickets?: number) {
    const largestArmy = Math.max(1, blueSquads, redSquads);
    const fallbackTickets = Math.max(100, Math.min(400, largestArmy * 8));
    this.initialTickets = Math.max(1, Math.min(9999, Math.floor(configuredTickets ?? fallbackTickets)));
    this.tickets = { blue: this.initialTickets, red: this.initialTickets };
    this.points = RAW_POINTS.map((raw) => ({
      ...raw,
      position: BATTLEFIELD_MAP.nearestPassablePoint(raw.position, 12),
      owner: null,
      captureTeam: null,
      progress: 0,
      contested: false,
      bluePresence: 0,
      redPresence: 0,
    }));
  }

  reset(): void {
    this.tickets.blue = this.initialTickets;
    this.tickets.red = this.initialTickets;
    this.bleedAccumulator.blue = 0;
    this.bleedAccumulator.red = 0;
    for (const point of this.points) {
      point.owner = null;
      point.captureTeam = null;
      point.progress = 0;
      point.contested = false;
      point.bluePresence = 0;
      point.redPresence = 0;
    }
  }

  update(dt: number, formations: readonly Formation[]): void {
    for (const point of this.points) {
      let blue = 0;
      let red = 0;
      for (const formation of formations) {
        if (formation.aliveCount() <= 0 || formation.mode === 'routed') continue;
        if (Math.hypot(formation.center.x - point.position.x, formation.center.y - point.position.y) > CAPTURE_RADIUS) continue;
        if (formation.team === 'blue') blue += 1;
        else red += 1;
      }
      point.bluePresence = blue;
      point.redPresence = red;
      point.contested = blue > 0 && blue === red;
      if (blue === red) {
        if (blue === 0 && point.owner) point.captureTeam = null;
        continue;
      }
      const presentTeam: Team = blue > red ? 'blue' : 'red';
      const advantage = Math.abs(blue - red);
      const speedMultiplier = Math.min(2.5, 1 + Math.max(0, advantage - 1) * 0.25);
      this.advanceCapture(point, presentTeam, dt * speedMultiplier);
    }

    const blueOwned = this.ownedCount('blue');
    const redOwned = this.ownedCount('red');
    if (blueOwned >= 2 && blueOwned > redOwned) this.applyBleed('red', blueOwned === 3 ? TOTAL_CONTROL_BLEED_SECONDS : MAJORITY_BLEED_SECONDS, dt);
    else this.bleedAccumulator.red = 0;
    if (redOwned >= 2 && redOwned > blueOwned) this.applyBleed('blue', redOwned === 3 ? TOTAL_CONTROL_BLEED_SECONDS : MAJORITY_BLEED_SECONDS, dt);
    else this.bleedAccumulator.blue = 0;
  }

  onSquadWiped(team: Team): void {
    this.tickets[team] = Math.max(0, this.tickets[team] - 1);
  }

  canRespawn(team: Team): boolean {
    return this.tickets[team] > 0;
  }

  ownedCount(team: Team): number {
    return this.points.reduce((sum, point) => sum + (point.owner === team && point.progress >= 0.999 ? 1 : 0), 0);
  }

  objectiveFor(team: Team, formationId: string): CapturePointState {
    const preferredIndex = Math.abs(Number.parseInt(formationId.slice(1), 10) || 0) % this.points.length;
    const preferred = this.points[preferredIndex];
    if (preferred.owner !== team || preferred.progress < 0.999) return preferred;
    const alternatives = this.points.filter((point) => point.owner !== team || point.progress < 0.999);
    if (alternatives.length === 0) return preferred;
    return alternatives.reduce((best, point) => {
      const bestPriority = best.owner === null ? 0 : 1;
      const priority = point.owner === null ? 0 : 1;
      if (priority !== bestPriority) return priority < bestPriority ? point : best;
      return point.id < best.id ? point : best;
    });
  }

  createNetworkState(): ConquestNetState {
    return {
      initialTickets: this.initialTickets,
      tickets: { ...this.tickets },
      points: this.points.map(clonePoint),
    };
  }

  applyNetworkState(state: ConquestNetState): void {
    this.initialTickets = Math.max(1, Math.min(9999, Math.floor(state.initialTickets)));
    this.tickets.blue = Math.max(0, state.tickets.blue);
    this.tickets.red = Math.max(0, state.tickets.red);
    const byId = new Map(state.points.map((point) => [point.id, point]));
    for (const point of this.points) {
      const incoming = byId.get(point.id);
      if (!incoming) continue;
      point.owner = incoming.owner;
      point.captureTeam = incoming.captureTeam;
      point.progress = Math.max(0, Math.min(1, incoming.progress));
      point.contested = incoming.contested;
      point.bluePresence = incoming.bluePresence;
      point.redPresence = incoming.redPresence;
      point.position = { ...incoming.position };
    }
  }

  private advanceCapture(point: CapturePointState, presentTeam: Team, dt: number): void {
    const step = CAPTURE_RATE * dt;
    if (point.owner) {
      if (point.owner === presentTeam) {
        point.captureTeam = null;
        point.progress = Math.min(1, point.progress + step);
        return;
      }
      point.captureTeam = presentTeam;
      point.progress = Math.max(0, point.progress - step);
      if (point.progress <= 0.0001) {
        point.owner = null;
        point.captureTeam = presentTeam;
        point.progress = 0;
      }
      return;
    }

    if (!point.captureTeam) point.captureTeam = presentTeam;
    if (point.captureTeam !== presentTeam) {
      point.progress = Math.max(0, point.progress - step);
      if (point.progress <= 0.0001) {
        point.captureTeam = presentTeam;
        point.progress = 0;
      }
      return;
    }

    point.progress = Math.min(1, point.progress + step);
    if (point.progress >= 0.999) {
      point.progress = 1;
      point.owner = presentTeam;
      point.captureTeam = null;
    }
  }

  private applyBleed(team: Team, interval: number, dt: number): void {
    if (this.tickets[team] <= 0) return;
    this.bleedAccumulator[team] += dt;
    while (this.bleedAccumulator[team] >= interval && this.tickets[team] > 0) {
      this.bleedAccumulator[team] -= interval;
      this.tickets[team] = Math.max(0, this.tickets[team] - 1);
    }
  }
}

export const CONQUEST_CAPTURE_RADIUS = CAPTURE_RADIUS;
