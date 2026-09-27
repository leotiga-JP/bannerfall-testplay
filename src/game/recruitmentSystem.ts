import type { Formation } from '../entities/formation';
import { BATTLEFIELD_MAP, MAP_SITES } from './battlefieldMap';
import { GAME_CONFIG } from './config';
import type { ResourceSystem } from './resourceSystem';
import { isArtilleryClass, type SquadClass, type Team, type Vec2 } from './types';

export interface BarracksState {
  id: string;
  label: string;
  position: Vec2;
  team: Team;
}

export interface RecruitmentCost {
  wood: number;
  iron: number;
}

export interface RecruitmentNetState {
  formationId: string;
  barracksId: string;
  count: number;
  progress: number;
}

interface RecruitmentProgress {
  barracksId: string;
  count: number;
  elapsed: number;
  duration: number;
  reserveRatio: number;
}

interface ControlLike {
  moveX: number;
  moveY: number;
  forcedMarch: boolean;
}

export const RECRUITMENT_INTERACTION_RANGE = 250;
const RECRUIT_DURATION_BASE = 0.08;
const RECRUIT_DURATION_PER_SOLDIER = 0.02;
const AI_RESOURCE_RESERVE_RATIO = 0.25;
const MORALE_GAIN_PER_SOLDIER = 2;
const MORALE_RECRUIT_CAP = 80;

export const BARRACKS: readonly BarracksState[] = MAP_SITES
  .filter((site): site is typeof site & { team: Team } => site.kind === 'facility' && site.shortLabel === '兵舎' && !!site.team)
  .map((site) => ({
    id: site.id,
    label: site.team === 'blue' ? 'BLUE 兵舎' : 'RED 兵舎',
    position: BATTLEFIELD_MAP.nearestPassablePoint(site.position, 18),
    team: site.team,
  }));

const GROWTH_STEPS: Readonly<Record<SquadClass, readonly number[]>> = Object.freeze({
  infantry: Object.freeze([20, 30, 40, 50]),
  lightInfantry: Object.freeze([15, 20, 25, 30]),
  grenadier: Object.freeze([16, 20, 25]),
  sharpshooter: Object.freeze([6, 8, 10]),
  engineer: Object.freeze([12, 16, 20]),
  dragoon: Object.freeze([14, 18, 20]),
  cavalry: Object.freeze([12, 15, 18]),
  hussar: Object.freeze([10, 14, 17]),
  cuirassier: Object.freeze([10, 12, 15]),
  artillery: Object.freeze([6]),
  heavyArtillery: Object.freeze([7]),
  horseArtillery: Object.freeze([6]),
});

const COST_PER_SOLDIER: Readonly<Record<SquadClass, RecruitmentCost>> = Object.freeze({
  infantry: Object.freeze({ wood: 2, iron: 3 }),
  lightInfantry: Object.freeze({ wood: 2, iron: 2 }),
  grenadier: Object.freeze({ wood: 3, iron: 4 }),
  sharpshooter: Object.freeze({ wood: 3, iron: 5 }),
  engineer: Object.freeze({ wood: 3, iron: 3 }),
  // Mounted formations are deliberately expensive in CONQUEST. Their speed lets
  // them choose fights and exploit capture points, so replacing horses/equipment
  // should be a meaningful strategic investment.
  dragoon: Object.freeze({ wood: 6, iron: 8 }),
  cavalry: Object.freeze({ wood: 7, iron: 10 }),
  hussar: Object.freeze({ wood: 6, iron: 9 }),
  cuirassier: Object.freeze({ wood: 8, iron: 14 }),
  artillery: Object.freeze({ wood: 0, iron: 0 }),
  heavyArtillery: Object.freeze({ wood: 0, iron: 0 }),
  horseArtillery: Object.freeze({ wood: 0, iron: 0 }),
});

export function isRecruitableClass(squadClass: SquadClass): boolean {
  return !isArtilleryClass(squadClass);
}

export function standardStrength(squadClass: SquadClass): number {
  return Math.max(1, Math.floor((GAME_CONFIG[squadClass] as { soldiers: number }).soldiers));
}

// Kept as the public respawn helper for compatibility with the 4.2 code path.
// CONQUEST starts at the same standard strength as BATTLE; resources only extend it.
export function starterStrength(squadClass: SquadClass, maxSoldiers: number): number {
  return Math.max(1, Math.min(maxSoldiers, standardStrength(squadClass)));
}

export function growthLimit(squadClass: SquadClass): number {
  const steps = GROWTH_STEPS[squadClass];
  return steps[steps.length - 1] ?? standardStrength(squadClass);
}

export function nextGrowthCapacity(squadClass: SquadClass, currentCapacity: number): number | null {
  if (!isRecruitableClass(squadClass)) return null;
  const current = Math.max(standardStrength(squadClass), Math.floor(currentCapacity));
  for (const step of GROWTH_STEPS[squadClass]) if (step > current) return step;
  return null;
}

export function capacityUpgradeCost(squadClass: SquadClass, currentCapacity: number): RecruitmentCost {
  const next = nextGrowthCapacity(squadClass, currentCapacity);
  if (next === null) return { wood: 0, iron: 0 };
  const steps = GROWTH_STEPS[squadClass];
  const tier = Math.max(0, steps.findIndex((value) => value === next) - 1);
  const addedCapacity = Math.max(1, next - Math.max(standardStrength(squadClass), currentCapacity));
  const per = COST_PER_SOLDIER[squadClass];
  const organizationFactor = 0.8 + tier * 0.35;
  return {
    wood: Math.max(1, Math.round(per.wood * addedCapacity * organizationFactor)),
    iron: Math.max(1, Math.round(per.iron * addedCapacity * organizationFactor)),
  };
}

export function recruitmentCost(squadClass: SquadClass, count: number): RecruitmentCost {
  const amount = Math.max(0, Math.floor(count));
  const per = COST_PER_SOLDIER[squadClass];
  return { wood: per.wood * amount, iron: per.iron * amount };
}

export function recruitmentDuration(count: number): number {
  return RECRUIT_DURATION_BASE + Math.max(1, Math.floor(count)) * RECRUIT_DURATION_PER_SOLDIER;
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class RecruitmentSystem {
  private readonly active = new Map<string, RecruitmentProgress>();

  nearestBarracks(team: Team, point: Vec2, maxDistance = RECRUITMENT_INTERACTION_RANGE): BarracksState | null {
    let best: BarracksState | null = null;
    let bestDistance = maxDistance;
    for (const barracks of BARRACKS) {
      if (barracks.team !== team) continue;
      const d = distance(point, barracks.position);
      if (d > bestDistance) continue;
      best = barracks;
      bestDistance = d;
    }
    return best;
  }

  closestBarracks(team: Team, point: Vec2): BarracksState | null {
    let best: BarracksState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const barracks of BARRACKS) {
      if (barracks.team !== team) continue;
      const d = distance(point, barracks.position);
      if (d >= bestDistance) continue;
      best = barracks;
      bestDistance = d;
    }
    return best;
  }

  start(
    formation: Formation,
    requestedCount: number,
    resources: ResourceSystem,
    options: { ai?: boolean; reserveRatio?: number } = {},
  ): boolean {
    if (formation.aliveCount() <= 0) return false;
    if (!isRecruitableClass(formation.squadClass)) return false;
    if (formation.mode !== 'line' && formation.mode !== 'reforming') return false;
    const barracks = this.nearestBarracks(formation.team, formation.center);
    if (!barracks) return false;
    const missing = Math.max(0, formation.maxSoldiers() - formation.aliveCount());
    if (missing <= 0) return false;
    const count = Math.max(1, Math.min(missing, Math.floor(requestedCount)));
    const cost = recruitmentCost(formation.squadClass, count);
    const reserveRatio = options.ai ? Math.max(0, Math.min(0.9, options.reserveRatio ?? AI_RESOURCE_RESERVE_RATIO)) : 0;
    const affordable = reserveRatio > 0
      ? resources.canAffordWithReserve(formation.team, cost, reserveRatio)
      : resources.canAfford(formation.team, cost);
    if (!affordable) return false;
    this.active.set(formation.id, {
      barracksId: barracks.id,
      count,
      elapsed: 0,
      duration: recruitmentDuration(count),
      reserveRatio,
    });
    resources.interrupt(formation.id, true);
    return true;
  }

  cancel(formationId: string): void {
    this.active.delete(formationId);
  }

  clearFormation(formationId: string): void {
    this.active.delete(formationId);
  }

  update(
    dt: number,
    formations: readonly Formation[],
    controls: ReadonlyMap<string, ControlLike>,
    resources: ResourceSystem,
  ): void {
    for (const [formationId, progress] of [...this.active.entries()]) {
      const formation = formations.find((candidate) => candidate.id === formationId);
      if (!formation || formation.aliveCount() <= 0 || !isRecruitableClass(formation.squadClass)) {
        this.active.delete(formationId);
        continue;
      }
      const barracks = BARRACKS.find((candidate) => candidate.id === progress.barracksId);
      const control = controls.get(formationId);
      const moving = !!control && (Math.hypot(control.moveX, control.moveY) > 0.05 || control.forcedMarch);
      const stable = formation.mode === 'line' || formation.mode === 'reforming';
      if (!barracks || distance(formation.center, barracks.position) > RECRUITMENT_INTERACTION_RANGE || moving || !stable || formation.moraleShockTimer > 0) {
        this.active.delete(formationId);
        continue;
      }

      const missing = Math.max(0, formation.maxSoldiers() - formation.aliveCount());
      if (missing <= 0) {
        this.active.delete(formationId);
        continue;
      }
      progress.count = Math.min(progress.count, missing);
      progress.elapsed += dt;
      if (progress.elapsed < progress.duration) continue;

      const cost = recruitmentCost(formation.squadClass, progress.count);
      const consumed = progress.reserveRatio > 0
        ? resources.consumeWithReserve(formation.team, cost, progress.reserveRatio)
        : resources.consume(formation.team, cost);
      if (!consumed) {
        this.active.delete(formationId);
        continue;
      }
      formation.addReinforcements(progress.count, MORALE_GAIN_PER_SOLDIER, MORALE_RECRUIT_CAP);
      this.active.delete(formationId);
    }
  }

  stateFor(formationId: string): RecruitmentNetState | null {
    const state = this.active.get(formationId);
    if (!state) return null;
    return {
      formationId,
      barracksId: state.barracksId,
      count: state.count,
      progress: state.duration <= 0 ? 1 : Math.max(0, Math.min(1, state.elapsed / state.duration)),
    };
  }

  createNetworkState(): RecruitmentNetState[] {
    return [...this.active.entries()].map(([formationId, state]) => ({
      formationId,
      barracksId: state.barracksId,
      count: state.count,
      progress: state.duration <= 0 ? 1 : Math.max(0, Math.min(1, state.elapsed / state.duration)),
    }));
  }

  applyNetworkState(states: readonly RecruitmentNetState[]): void {
    this.active.clear();
    for (const state of states) {
      const count = Math.max(1, Math.floor(state.count));
      const duration = recruitmentDuration(count);
      this.active.set(state.formationId, {
        barracksId: state.barracksId,
        count,
        duration,
        elapsed: Math.max(0, Math.min(1, state.progress)) * duration,
        reserveRatio: 0,
      });
    }
  }
}
