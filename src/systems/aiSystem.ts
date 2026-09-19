import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';
import type { Vec2 } from '../game/types';

export type AiIntent = 'advance' | 'hold' | 'volley' | 'flank' | 'retreat' | 'charge' | 'melee' | 'reform';

export interface AiCommand {
  formation: Formation;
  move: Vec2;
  faceAngle: number | null;
  volley: boolean;
  chargeTarget: Vec2 | null;
  reform: boolean;
  breakOffTarget: Formation | null;
}

interface Controller {
  thinkTimer: number;
  targetId: string | null;
  intent: AiIntent;
  aggression: number;
  caution: number;
  flankPreference: number;
  preferredRange: number;
  retreatRange: number;
  flankOffset: number;
  flankSign: number;
  meleeTime: number;
  reformCooldown: number;
}

export class BattleAiSystem {
  private readonly controllers = new Map<string, Controller>();

  reset(formations: Formation[]): void {
    this.controllers.clear();
    for (const formation of formations) {
      if (formation.isPlayerControlled) continue;
      this.controllers.set(formation.id, this.createController());
    }
  }

  update(formations: Formation[], dt: number): AiCommand[] {
    const aliveById = new Map(formations.filter((f) => f.aliveCount() > 0).map((f) => [f.id, f]));
    const locks = new Map<string, number>();
    for (const controller of this.controllers.values()) {
      if (!controller.targetId || !aliveById.has(controller.targetId)) continue;
      locks.set(controller.targetId, (locks.get(controller.targetId) ?? 0) + 1);
    }

    const commands: AiCommand[] = [];
    for (const formation of formations) {
      if (formation.isPlayerControlled || formation.aliveCount() === 0) continue;
      const controller = this.controllers.get(formation.id) ?? this.createController();
      this.controllers.set(formation.id, controller);
      controller.thinkTimer -= dt;
      controller.reformCooldown = Math.max(0, controller.reformCooldown - dt);

      const enemies = formations.filter((candidate) => candidate.team !== formation.team && candidate.aliveCount() > 0);
      let target = controller.targetId ? aliveById.get(controller.targetId) ?? null : null;
      if (!target || target.team === formation.team) {
        controller.targetId = null;
        target = this.selectTarget(formation, enemies, locks);
        if (target) {
          controller.targetId = target.id;
          locks.set(target.id, (locks.get(target.id) ?? 0) + 1);
        }
      }

      const command: AiCommand = {
        formation,
        move: { x: 0, y: 0 },
        faceAngle: target ? Math.atan2(target.center.y - formation.center.y, target.center.x - formation.center.x) : null,
        volley: false,
        chargeTarget: null,
        reform: false,
        breakOffTarget: null,
      };

      if (!target) {
        controller.intent = 'hold';
        this.writeDebug(formation, controller);
        commands.push(command);
        continue;
      }

      if (formation.mode === 'charging') {
        controller.intent = 'charge';
        controller.meleeTime = 0;
        this.writeDebug(formation, controller);
        commands.push(command);
        continue;
      }

      if (formation.mode === 'reforming') {
        controller.intent = 'reform';
        controller.meleeTime = 0;
        this.writeDebug(formation, controller);
        commands.push(command);
        continue;
      }

      if (formation.mode === 'melee') {
        controller.intent = 'melee';
        controller.meleeTime += dt;
        if (controller.thinkTimer <= 0) {
          controller.thinkTimer = this.nextThink();
          const ratio = formation.aliveCount() / Math.max(1, target.aliveCount());
          const breakScore = controller.caution * 0.55
            + (ratio < 0.72 ? 0.35 : 0)
            + (formation.aliveCount() <= 7 ? 0.3 : 0)
            + (controller.meleeTime > 5 ? 0.12 : 0)
            - controller.aggression * 0.25;
          if (controller.meleeTime > 2.2 && breakScore > 0.62 && Math.random() < breakScore) {
            command.breakOffTarget = target;
            controller.intent = 'reform';
            controller.meleeTime = 0;
            controller.reformCooldown = GAME_CONFIG.ai.reformCooldown;
          }
        }
        this.writeDebug(formation, controller);
        commands.push(command);
        continue;
      }

      controller.meleeTime = 0;
      if (controller.thinkTimer <= 0) {
        controller.thinkTimer = this.nextThink();
        if (Math.random() < GAME_CONFIG.ai.retargetChance) {
          const retarget = this.selectTarget(formation, enemies, locks);
          if (retarget && retarget.id !== controller.targetId) {
            if (controller.targetId) {
              locks.set(controller.targetId, Math.max(0, (locks.get(controller.targetId) ?? 1) - 1));
            }
            target = retarget;
            controller.targetId = retarget.id;
            locks.set(retarget.id, (locks.get(retarget.id) ?? 0) + 1);
            command.faceAngle = Math.atan2(retarget.center.y - formation.center.y, retarget.center.x - formation.center.x);
          }
        }

        const distance = Math.hypot(target.center.x - formation.center.x, target.center.y - formation.center.y);
        const ownRatio = formation.aliveCount() / Math.max(1, target.aliveCount());
        const targetLocks = locks.get(target.id) ?? 0;

        if (
          formation.needsReform()
          && controller.reformCooldown <= 0
          && distance > GAME_CONFIG.musket.effectiveRange + 70
          && Math.random() < 0.25 + controller.caution * 0.45
        ) {
          command.reform = true;
          controller.intent = 'reform';
          controller.reformCooldown = GAME_CONFIG.ai.reformCooldown;
        } else if (formation.canVolley() && distance <= GAME_CONFIG.musket.effectiveRange) {
          const targetInFriendlyMelee = target.mode === 'melee';
          const holdFireChance = targetInFriendlyMelee ? controller.caution * 0.55 : 0;
          if (Math.random() >= holdFireChance) {
            command.volley = true;
            controller.intent = 'volley';
          } else {
            controller.intent = 'flank';
          }
        } else {
          const reloadOpportunity = target.reloadTimer > 1.6;
          const chargeScore = controller.aggression * 0.5
            + Math.max(-0.25, Math.min(0.35, (ownRatio - 1) * 0.45))
            + (reloadOpportunity ? 0.28 : 0)
            + (target.mode === 'reforming' ? 0.18 : 0)
            - controller.caution * 0.18
            - Math.max(0, targetLocks - 1) * 0.08;

          if (
            distance >= GAME_CONFIG.charge.aiMinDistance
            && distance <= GAME_CONFIG.charge.aiMaxDistance
            && chargeScore > 0.58
            && Math.random() < Math.min(0.88, chargeScore)
          ) {
            command.chargeTarget = this.leadChargeTarget(formation, target);
            controller.intent = 'charge';
          } else if (distance < controller.retreatRange && controller.caution > controller.aggression * 0.7) {
            controller.intent = 'retreat';
          } else if (
            distance > controller.preferredRange
            && (controller.flankPreference > 0.55 || targetLocks >= 2)
            && Math.random() < 0.35 + controller.flankPreference * 0.4
          ) {
            controller.intent = 'flank';
          } else if (distance > controller.preferredRange) {
            controller.intent = 'advance';
          } else {
            controller.intent = 'hold';
          }
        }
      }

      if (!command.reform && !command.chargeTarget) {
        command.move = this.movementForIntent(formation, target, controller);
      }

      this.writeDebug(formation, controller);
      commands.push(command);
    }

    return commands;
  }

  private movementForIntent(formation: Formation, target: Formation, controller: Controller): Vec2 {
    if (formation.mode !== 'line') return { x: 0, y: 0 };
    const dx = target.center.x - formation.center.x;
    const dy = target.center.y - formation.center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;

    if (controller.intent === 'advance') return { x: nx, y: ny };
    if (controller.intent === 'retreat') return { x: -nx, y: -ny };
    if (controller.intent === 'flank') {
      const rightX = -ny * controller.flankSign;
      const rightY = nx * controller.flankSign;
      const desired = {
        x: target.center.x - nx * controller.preferredRange * 0.78 + rightX * controller.flankOffset,
        y: target.center.y - ny * controller.preferredRange * 0.78 + rightY * controller.flankOffset,
      };
      const mdx = desired.x - formation.center.x;
      const mdy = desired.y - formation.center.y;
      const moveDistance = Math.hypot(mdx, mdy) || 1;
      return { x: mdx / moveDistance, y: mdy / moveDistance };
    }
    return { x: 0, y: 0 };
  }

  private selectTarget(formation: Formation, enemies: Formation[], locks: Map<string, number>): Formation | null {
    let best: Formation | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const distance = Math.hypot(enemy.center.x - formation.center.x, enemy.center.y - formation.center.y);
      const crowded = locks.get(enemy.id) ?? 0;
      const weakness = enemy.soldiers.length - enemy.aliveCount();
      const lanePenalty = Math.abs(enemy.center.y - formation.center.y) * 0.08;
      const score = distance
        + crowded * GAME_CONFIG.ai.targetCrowdPenalty
        + lanePenalty
        - weakness * GAME_CONFIG.ai.weaknessWeight
        + Math.random() * 55;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  private leadChargeTarget(formation: Formation, target: Formation): Vec2 {
    const dx = target.center.x - formation.center.x;
    const dy = target.center.y - formation.center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const lead = Math.min(55, distance * 0.13);
    return {
      x: target.center.x + (dx / distance) * lead,
      y: target.center.y + (dy / distance) * lead,
    };
  }

  private createController(): Controller {
    return {
      thinkTimer: Math.random() * GAME_CONFIG.ai.thinkMax,
      targetId: null,
      intent: 'hold',
      aggression: 0.25 + Math.random() * 0.75,
      caution: 0.2 + Math.random() * 0.8,
      flankPreference: Math.random(),
      preferredRange: GAME_CONFIG.ai.preferredRangeMin
        + Math.random() * (GAME_CONFIG.ai.preferredRangeMax - GAME_CONFIG.ai.preferredRangeMin),
      retreatRange: GAME_CONFIG.ai.retreatRangeMin
        + Math.random() * (GAME_CONFIG.ai.retreatRangeMax - GAME_CONFIG.ai.retreatRangeMin),
      flankOffset: GAME_CONFIG.ai.flankOffsetMin
        + Math.random() * (GAME_CONFIG.ai.flankOffsetMax - GAME_CONFIG.ai.flankOffsetMin),
      flankSign: Math.random() < 0.5 ? -1 : 1,
      meleeTime: 0,
      reformCooldown: Math.random() * 2,
    };
  }

  private nextThink(): number {
    return GAME_CONFIG.ai.thinkMin + Math.random() * (GAME_CONFIG.ai.thinkMax - GAME_CONFIG.ai.thinkMin);
  }

  private writeDebug(formation: Formation, controller: Controller): void {
    formation.debugIntent = controller.intent.toUpperCase();
    formation.debugTargetId = controller.targetId;
  }
}
