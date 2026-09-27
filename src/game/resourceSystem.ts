import type { Formation } from '../entities/formation';
import { BATTLEFIELD_MAP, MAP_SITES } from './battlefieldMap';
import type { Team, Vec2 } from './types';

export const RESOURCE_TYPES = ['wood', 'iron', 'gunpowder', 'alloy'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_LABELS: Readonly<Record<ResourceType, string>> = Object.freeze({
  wood: '木材',
  iron: '鉄',
  gunpowder: '火薬',
  alloy: '合金',
});

export interface ResourceStockpile {
  wood: number;
  iron: number;
  gunpowder: number;
  alloy: number;
}

export interface ResourceNodeState {
  id: string;
  resource: ResourceType;
  label: string;
  shortLabel: string;
  position: Vec2;
  team: Team | null;
  rich: boolean;
  amount: number;
  maxAmount: number;
}

export interface ResourceGatherState {
  formationId: string;
  nodeId: string;
  progress: number;
}

export interface ResourceNetworkState {
  stockpiles: Record<Team, ResourceStockpile>;
  nodes: ResourceNodeState[];
  gatheredTotals: Array<{ formationId: string; total: number }>;
  combatLootTotals: Array<{ formationId: string; total: number }>;
  gathering: ResourceGatherState[];
}

interface GatherProgress {
  nodeId: string;
  elapsed: number;
}

interface ControlLike {
  moveX: number;
  moveY: number;
  forcedMarch: boolean;
  gathering: boolean;
}

interface ResourceDefinition {
  maxAmount: number;
  cycleSeconds: number;
  yieldAmount: number;
  depletedDelay: number;
  regenPerSecond: number;
}

const RESOURCE_DEFINITIONS: Readonly<Record<ResourceType, ResourceDefinition>> = Object.freeze({
  // Regeneration is intentionally strong enough that one dedicated gatherer can
  // work a node continuously without exhausting it. Multiple squads can still
  // outpace regeneration and temporarily drain a contested resource site.
  wood: Object.freeze({ maxAmount: 500, cycleSeconds: 1.1, yieldAmount: 10, depletedDelay: 0, regenPerSecond: 16 }),
  iron: Object.freeze({ maxAmount: 350, cycleSeconds: 1.5, yieldAmount: 8, depletedDelay: 0, regenPerSecond: 9 }),
  gunpowder: Object.freeze({ maxAmount: 250, cycleSeconds: 1.8, yieldAmount: 6, depletedDelay: 0, regenPerSecond: 6 }),
  alloy: Object.freeze({ maxAmount: 100, cycleSeconds: 2.5, yieldAmount: 3, depletedDelay: 0, regenPerSecond: 2.2 }),
});

export const RESOURCE_INTERACTION_RANGE = 230;
const RICH_YIELD_MULTIPLIER = 1.5;
const RICH_CAPACITY_MULTIPLIER = 1.3;
const ENGINEER_GATHER_SPEED = 1.6;

function emptyStockpile(): ResourceStockpile {
  return { wood: 0, iron: 0, gunpowder: 0, alloy: 0 };
}

function copyStockpile(stockpile: ResourceStockpile): ResourceStockpile {
  return { ...stockpile };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class ResourceSystem {
  readonly nodes: ResourceNodeState[];
  readonly stockpiles: Record<Team, ResourceStockpile> = {
    blue: emptyStockpile(),
    red: emptyStockpile(),
  };

  private readonly peakStockpiles: Record<Team, ResourceStockpile> = {
    blue: emptyStockpile(),
    red: emptyStockpile(),
  };

  private readonly gatheredTotals = new Map<string, number>();
  private readonly combatLootTotals = new Map<string, number>();
  private readonly gathering = new Map<string, GatherProgress>();
  private readonly depletedSeconds = new Map<string, number>();
  private readonly requireGatherRelease = new Set<string>();
  private readonly aiGatherTargets = new Map<string, string>();
  private regenAccumulator = 0;
  private dirty = true;

  constructor() {
    this.nodes = MAP_SITES
      .filter((site): site is typeof site & { resource: ResourceType } => site.kind === 'resource' && !!site.resource)
      .map((site) => {
        const definition = RESOURCE_DEFINITIONS[site.resource];
        const rich = !site.team;
        const maxAmount = Math.round(definition.maxAmount * (rich ? RICH_CAPACITY_MULTIPLIER : 1));
        return {
          id: site.id,
          resource: site.resource,
          label: site.label,
          shortLabel: site.shortLabel,
          position: BATTLEFIELD_MAP.nearestPassablePoint(site.position, 18),
          team: site.team ?? null,
          rich,
          amount: maxAmount,
          maxAmount,
        };
      });
  }

  reset(): void {
    this.stockpiles.blue = emptyStockpile();
    this.stockpiles.red = emptyStockpile();
    this.peakStockpiles.blue = emptyStockpile();
    this.peakStockpiles.red = emptyStockpile();
    for (const node of this.nodes) node.amount = node.maxAmount;
    this.gatheredTotals.clear();
    this.combatLootTotals.clear();
    this.gathering.clear();
    this.depletedSeconds.clear();
    this.requireGatherRelease.clear();
    this.aiGatherTargets.clear();
    this.regenAccumulator = 0;
    this.dirty = true;
  }

  update(dt: number, formations: readonly Formation[], controls: ReadonlyMap<string, ControlLike>): void {
    for (const formation of formations) {
      const control = controls.get(formation.id);
      let node: ResourceNodeState | null = null;

      if (formation.isPlayerControlled) {
        const gatherHeld = control?.gathering === true;
        if (!gatherHeld) {
          this.requireGatherRelease.delete(formation.id);
          if (this.gathering.delete(formation.id)) this.dirty = true;
          continue;
        }
        if (this.requireGatherRelease.has(formation.id)) {
          if (this.gathering.delete(formation.id)) this.dirty = true;
          continue;
        }
        const moving = !!control && (Math.hypot(control.moveX, control.moveY) > 0.05 || control.forcedMarch);
        if (moving) {
          if (this.gathering.delete(formation.id)) this.dirty = true;
          continue;
        }
        node = this.nearestAvailableNode(formation.center, RESOURCE_INTERACTION_RANGE);
      } else {
        const nodeId = this.aiGatherTargets.get(formation.id);
        if (!nodeId) {
          if (this.gathering.delete(formation.id)) this.dirty = true;
          continue;
        }
        const assigned = this.nodes.find((candidate) => candidate.id === nodeId) ?? null;
        if (assigned && assigned.amount > 0 && distance(formation.center, assigned.position) <= RESOURCE_INTERACTION_RANGE) node = assigned;
      }

      const canGather = formation.aliveCount() > 0 && formation.mode === 'line';
      if (!canGather || !node) {
        if (this.gathering.delete(formation.id)) this.dirty = true;
        continue;
      }

      const current = this.gathering.get(formation.id);
      const progress: GatherProgress = current?.nodeId === node.id
        ? current
        : { nodeId: node.id, elapsed: 0 };
      const speed = formation.squadClass === 'engineer' ? ENGINEER_GATHER_SPEED : 1;
      progress.elapsed += dt * speed;
      if (!current || current.nodeId !== node.id) this.dirty = true;
      this.gathering.set(formation.id, progress);

      const definition = RESOURCE_DEFINITIONS[node.resource];
      while (progress.elapsed >= definition.cycleSeconds && node.amount > 0) {
        progress.elapsed -= definition.cycleSeconds;
        const baseYield = definition.yieldAmount * (node.rich ? RICH_YIELD_MULTIPLIER : 1);
        const gathered = Math.min(node.amount, Math.max(1, Math.round(baseYield)));
        node.amount -= gathered;
        this.stockpiles[formation.team][node.resource] += gathered;
        this.noteStockpilePeak(formation.team);
        this.gatheredTotals.set(formation.id, (this.gatheredTotals.get(formation.id) ?? 0) + gathered);
        this.dirty = true;
        if (node.amount <= 0) {
          node.amount = 0;
          this.depletedSeconds.set(node.id, 0);
          progress.elapsed = 0;
          break;
        }
      }
    }

    this.regenAccumulator += dt;
    if (this.regenAccumulator >= 1) {
      const wholeSeconds = Math.floor(this.regenAccumulator);
      this.regenAccumulator -= wholeSeconds;
      for (const node of this.nodes) {
        if (node.amount >= node.maxAmount) {
          this.depletedSeconds.delete(node.id);
          continue;
        }
        const definition = RESOURCE_DEFINITIONS[node.resource];
        const before = node.amount;
        // Rich front-line deposits yield 1.5x resources and regenerate at the same
        // multiplier. One engineer therefore sustains a node; two or more squads can
        // still drain it and create a temporary local shortage.
        const regenMultiplier = node.rich ? RICH_YIELD_MULTIPLIER : 1;
        node.amount = Math.min(node.maxAmount, node.amount + definition.regenPerSecond * regenMultiplier * wholeSeconds);
        if (node.amount !== before) this.dirty = true;
        if (node.amount >= node.maxAmount) this.depletedSeconds.delete(node.id);
      }
    }
  }

  setAiGatherTarget(formationId: string, nodeId: string | null): void {
    if (!nodeId) {
      this.aiGatherTargets.delete(formationId);
      if (this.gathering.delete(formationId)) this.dirty = true;
      return;
    }
    const node = this.nodes.find((candidate) => candidate.id === nodeId);
    if (!node || node.amount <= 0) {
      this.aiGatherTargets.delete(formationId);
      if (this.gathering.delete(formationId)) this.dirty = true;
      return;
    }
    this.aiGatherTargets.set(formationId, nodeId);
  }

  aiGatherTarget(formationId: string): ResourceNodeState | null {
    const nodeId = this.aiGatherTargets.get(formationId);
    if (!nodeId) return null;
    return this.nodes.find((candidate) => candidate.id === nodeId) ?? null;
  }

  bestNodeFor(team: Team, resource: ResourceType, point: Vec2): ResourceNodeState | null {
    let best: ResourceNodeState | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const node of this.nodes) {
      if (node.resource !== resource || node.amount <= 0) continue;
      if (node.team !== null && node.team !== team) continue;
      const d = distance(point, node.position);
      // Prefer the safe home node while it has stock; neutral rich nodes remain a
      // fallback once the rear resource has been depleted.
      const territoryPenalty = node.team === team ? 0 : 2600;
      const depletionPenalty = (1 - node.amount / Math.max(1, node.maxAmount)) * 450;
      const score = d + territoryPenalty + depletionPenalty;
      if (score >= bestScore) continue;
      bestScore = score;
      best = node;
    }
    return best;
  }

  interrupt(formationId: string, requireRelease = true): void {
    if (this.gathering.delete(formationId)) this.dirty = true;
    if (requireRelease) this.requireGatherRelease.add(formationId);
  }

  clearFormation(formationId: string): void {
    if (this.gathering.delete(formationId)) this.dirty = true;
    this.requireGatherRelease.delete(formationId);
    this.aiGatherTargets.delete(formationId);
  }

  resetFormationStats(formationId: string): void {
    this.gatheredTotals.set(formationId, 0);
    this.combatLootTotals.set(formationId, 0);
    this.clearFormation(formationId);
    this.dirty = true;
  }

  getFormationGatheredTotal(formationId: string): number {
    return this.gatheredTotals.get(formationId) ?? 0;
  }

  getFormationCombatLootTotal(formationId: string): number {
    return this.combatLootTotals.get(formationId) ?? 0;
  }

  grantCombatLoot(formationId: string, team: Team, loot: Partial<ResourceStockpile>): number {
    const stockpile = this.stockpiles[team];
    let total = 0;
    for (const resource of RESOURCE_TYPES) {
      const amount = Math.max(0, loot[resource] ?? 0);
      if (amount <= 0) continue;
      stockpile[resource] += amount;
      total += amount;
    }
    if (total > 0) {
      this.combatLootTotals.set(formationId, (this.combatLootTotals.get(formationId) ?? 0) + total);
      this.noteStockpilePeak(team);
      this.dirty = true;
    }
    return total;
  }

  getStockpile(team: Team): ResourceStockpile {
    return copyStockpile(this.stockpiles[team]);
  }

  canAfford(team: Team, cost: Partial<ResourceStockpile>): boolean {
    const stockpile = this.stockpiles[team];
    return (stockpile.wood >= (cost.wood ?? 0))
      && (stockpile.iron >= (cost.iron ?? 0))
      && (stockpile.gunpowder >= (cost.gunpowder ?? 0))
      && (stockpile.alloy >= (cost.alloy ?? 0));
  }

  consume(team: Team, cost: Partial<ResourceStockpile>): boolean {
    if (!this.canAfford(team, cost)) return false;
    const stockpile = this.stockpiles[team];
    stockpile.wood -= cost.wood ?? 0;
    stockpile.iron -= cost.iron ?? 0;
    stockpile.gunpowder -= cost.gunpowder ?? 0;
    stockpile.alloy -= cost.alloy ?? 0;
    this.dirty = true;
    return true;
  }

  canAffordWithReserve(team: Team, cost: Partial<ResourceStockpile>, reserveRatio: number): boolean {
    const ratio = Math.max(0, Math.min(0.9, reserveRatio));
    const stockpile = this.stockpiles[team];
    const peak = this.peakStockpiles[team];
    for (const resource of RESOURCE_TYPES) {
      const spend = cost[resource] ?? 0;
      if (spend <= 0) continue;
      const reserveFloor = peak[resource] * ratio;
      if (stockpile[resource] - spend < reserveFloor - 1e-6) return false;
    }
    return true;
  }

  consumeWithReserve(team: Team, cost: Partial<ResourceStockpile>, reserveRatio: number): boolean {
    if (!this.canAffordWithReserve(team, cost, reserveRatio)) return false;
    return this.consume(team, cost);
  }

  nearestNode(point: Vec2, maxDistance = RESOURCE_INTERACTION_RANGE): ResourceNodeState | null {
    let best: ResourceNodeState | null = null;
    let bestDistance = maxDistance;
    for (const node of this.nodes) {
      const d = distance(point, node.position);
      if (d > bestDistance) continue;
      bestDistance = d;
      best = node;
    }
    return best;
  }

  gatheringState(formationId: string): { node: ResourceNodeState; progress: number } | null {
    const state = this.gathering.get(formationId);
    if (!state) return null;
    const node = this.nodes.find((candidate) => candidate.id === state.nodeId);
    if (!node) return null;
    const cycle = RESOURCE_DEFINITIONS[node.resource].cycleSeconds;
    return { node, progress: Math.max(0, Math.min(1, state.elapsed / cycle)) };
  }

  createNetworkState(): ResourceNetworkState {
    return {
      stockpiles: {
        blue: copyStockpile(this.stockpiles.blue),
        red: copyStockpile(this.stockpiles.red),
      },
      nodes: this.nodes.map((node) => ({ ...node, position: { ...node.position } })),
      gatheredTotals: [...this.gatheredTotals.entries()].map(([formationId, total]) => ({ formationId, total })),
      combatLootTotals: [...this.combatLootTotals.entries()].map(([formationId, total]) => ({ formationId, total })),
      gathering: [...this.gathering.entries()].flatMap(([formationId, progress]) => {
        const node = this.nodes.find((candidate) => candidate.id === progress.nodeId);
        if (!node) return [];
        const cycle = RESOURCE_DEFINITIONS[node.resource].cycleSeconds;
        return [{ formationId, nodeId: progress.nodeId, progress: Math.max(0, Math.min(1, progress.elapsed / cycle)) }];
      }),
    };
  }

  applyNetworkState(state: ResourceNetworkState): void {
    this.stockpiles.blue = copyStockpile(state.stockpiles.blue);
    this.stockpiles.red = copyStockpile(state.stockpiles.red);
    this.noteStockpilePeak('blue');
    this.noteStockpilePeak('red');
    const byId = new Map(state.nodes.map((node) => [node.id, node]));
    for (const node of this.nodes) {
      const incoming = byId.get(node.id);
      if (!incoming) continue;
      node.amount = incoming.amount;
      node.maxAmount = incoming.maxAmount;
      node.position = { ...incoming.position };
    }
    this.gatheredTotals.clear();
    for (const entry of state.gatheredTotals) this.gatheredTotals.set(entry.formationId, entry.total);
    this.combatLootTotals.clear();
    for (const entry of state.combatLootTotals ?? []) this.combatLootTotals.set(entry.formationId, entry.total);
    this.gathering.clear();
    for (const entry of state.gathering) {
      const node = this.nodes.find((candidate) => candidate.id === entry.nodeId);
      if (!node) continue;
      const cycle = RESOURCE_DEFINITIONS[node.resource].cycleSeconds;
      this.gathering.set(entry.formationId, { nodeId: entry.nodeId, elapsed: Math.max(0, Math.min(1, entry.progress)) * cycle });
    }
  }

  isDirty(): boolean {
    return this.dirty;
  }

  consumeDirty(): boolean {
    const value = this.dirty;
    this.dirty = false;
    return value;
  }

  hasActiveGathering(): boolean {
    return this.gathering.size > 0;
  }


  private noteStockpilePeak(team: Team): void {
    const current = this.stockpiles[team];
    const peak = this.peakStockpiles[team];
    for (const resource of RESOURCE_TYPES) peak[resource] = Math.max(peak[resource], current[resource]);
  }

  private nearestAvailableNode(point: Vec2, maxDistance: number): ResourceNodeState | null {
    let best: ResourceNodeState | null = null;
    let bestDistance = maxDistance;
    for (const node of this.nodes) {
      if (node.amount <= 0) continue;
      const d = distance(point, node.position);
      if (d > bestDistance) continue;
      bestDistance = d;
      best = node;
    }
    return best;
  }
}
