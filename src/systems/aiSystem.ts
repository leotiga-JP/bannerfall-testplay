import { Banner } from '../entities/banner';
import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';
import type { Team, Vec2 } from '../game/types';

export type AiIntent =
  | 'advance'
  | 'hold'
  | 'volley'
  | 'flank'
  | 'retreat'
  | 'charge'
  | 'melee'
  | 'reform'
  | 'attack-banner'
  | 'defend'
  | 'escort';

export interface AiCommand {
  formation: Formation;
  move: Vec2;
  faceAngle: number | null;
  volley: boolean;
  chargeTarget: Vec2 | null;
  reform: boolean;
  breakOffTarget: Formation | null;
  bannerAttackTarget: Banner | null;
}

interface Controller {
  thinkTimer: number;
  targetId: string | null;
  intent: AiIntent;
  aggression: number;
  caution: number;
  flankPreference: number;
  objectiveCommitment: number;
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

  update(formations: Formation[], banners: Banner[], dt: number): AiCommand[] {
    const aliveById = new Map(formations.filter((f) => f.aliveCount() > 0).map((f) => [f.id, f]));
    const locks = new Map<string, number>();
    for (const controller of this.controllers.values()) {
      if (!controller.targetId || !aliveById.has(controller.targetId)) continue;
      locks.set(controller.targetId, (locks.get(controller.targetId) ?? 0) + 1);
    }

    const activeBannerAttackers = new Map<Team, number>([['blue', 0], ['red', 0]]);
    for (const formation of formations) {
      if (formation.mode !== 'bannerAttack' || !formation.bannerTargetTeam || formation.aliveCount() === 0) continue;
      activeBannerAttackers.set(formation.team, (activeBannerAttackers.get(formation.team) ?? 0) + 1);
    }

    const commands: AiCommand[] = [];
    for (const formation of formations) {
      if (formation.isPlayerControlled || formation.aliveCount() === 0) continue;
      const controller = this.controllers.get(formation.id) ?? this.createController();
      this.controllers.set(formation.id, controller);
      controller.thinkTimer -= dt;
      controller.reformCooldown = Math.max(0, controller.reformCooldown - dt);

      const enemies = formations.filter((candidate) => candidate.team !== formation.team && candidate.aliveCount() > 0);
      const allies = formations.filter((candidate) => candidate.team === formation.team && candidate.aliveCount() > 0);
      const ownBanner = banners.find((banner) => banner.team === formation.team)!;
      const enemyBanner = banners.find((banner) => banner.team !== formation.team)!;

      let target = controller.targetId ? aliveById.get(controller.targetId) ?? null : null;
      if (!target || target.team === formation.team) {
        controller.targetId = null;
        target = this.selectTarget(formation, enemies, locks);
        if (target) this.lockTarget(controller, target, locks);
      }

      const command: AiCommand = {
        formation,
        move: { x: 0, y: 0 },
        faceAngle: target ? this.angleTo(formation.center, target.center) : null,
        volley: false,
        chargeTarget: null,
        reform: false,
        breakOffTarget: null,
        bannerAttackTarget: null,
      };

      if (formation.mode === 'bannerAttack') {
        controller.intent = 'attack-banner';
        controller.meleeTime = 0;
        this.writeDebug(formation, controller, `FLAG-${formation.bannerTargetTeam?.toUpperCase() ?? '?'}`);
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
        if (target && controller.thinkTimer <= 0) {
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

        const defenseTarget = this.selectBannerThreat(formation, enemies, ownBanner);
        const canRespondToBanner = ownBanner.underAttackTimer > 0
          && defenseTarget
          && this.distance(formation.center, ownBanner.position) <= GAME_CONFIG.banner.aiResponseRadius;

        if (canRespondToBanner && defenseTarget) {
          target = defenseTarget;
          this.lockTarget(controller, target, locks);
          command.faceAngle = this.angleTo(formation.center, target.center);
          controller.intent = 'defend';
        } else {
          const alliedAttackers = allies.filter((ally) => ally.mode === 'bannerAttack' && ally.bannerTargetTeam === enemyBanner.team);
          const defenders = enemies.filter((enemy) => this.distance(enemy.center, enemyBanner.position) <= GAME_CONFIG.banner.aiDefenseRadius);
          const localAllies = allies.filter((ally) => this.distance(ally.center, enemyBanner.position) <= GAME_CONFIG.banner.aiDefenseRadius + 120);
          const distanceToEnemyBanner = this.distance(formation.center, enemyBanner.position);
          const attackers = activeBannerAttackers.get(formation.team) ?? 0;
          const flagOpen = defenders.length === 0 || localAllies.length >= defenders.length + 1;
          const shouldAttackBanner = !enemyBanner.destroyed
            && formation.aliveCount() >= 7
            && distanceToEnemyBanner <= GAME_CONFIG.banner.aiAttackTriggerDistance
            && attackers < GAME_CONFIG.banner.aiMaxAttackers
            && flagOpen
            && (controller.objectiveCommitment > 0.5 || Math.random() < controller.objectiveCommitment * 0.45);

          if (shouldAttackBanner) {
            command.bannerAttackTarget = enemyBanner;
            command.faceAngle = this.angleTo(formation.center, enemyBanner.position);
            controller.intent = 'attack-banner';
            activeBannerAttackers.set(formation.team, attackers + 1);
            this.writeDebug(formation, controller, `FLAG-${enemyBanner.team.toUpperCase()}`);
            commands.push(command);
            continue;
          }

          if (alliedAttackers.length > 0 && distanceToEnemyBanner < 1050 && defenders.length > 0) {
            target = this.nearestToPoint(defenders, enemyBanner.position);
            if (target) {
              this.lockTarget(controller, target, locks);
              command.faceAngle = this.angleTo(formation.center, target.center);
              controller.intent = 'escort';
            }
          } else if (Math.random() < GAME_CONFIG.ai.retargetChance) {
            const retarget = this.selectTarget(formation, enemies, locks);
            if (retarget && retarget.id !== controller.targetId) {
              target = retarget;
              this.lockTarget(controller, retarget, locks);
              command.faceAngle = this.angleTo(formation.center, retarget.center);
            }
          }
        }

        if (target) {
          this.decideCombatAction(formation, target, controller, command, locks);
        } else {
          controller.intent = 'hold';
        }
      }

      if (target && !command.reform && !command.chargeTarget && !command.bannerAttackTarget) {
        command.move = this.movementForIntent(formation, target, controller);
      }

      this.writeDebug(formation, controller);
      commands.push(command);
    }

    return commands;
  }

  private decideCombatAction(
    formation: Formation,
    target: Formation,
    controller: Controller,
    command: AiCommand,
    locks: Map<string, number>,
  ): void {
    const distance = this.distance(formation.center, target.center);
    const ownRatio = formation.aliveCount() / Math.max(1, target.aliveCount());
    const targetLocks = locks.get(target.id) ?? 0;
    const strategicIntent = controller.intent;

    if (
      formation.needsReform()
      && controller.reformCooldown <= 0
      && distance > GAME_CONFIG.musket.effectiveRange + 70
      && Math.random() < 0.25 + controller.caution * 0.45
    ) {
      command.reform = true;
      controller.intent = 'reform';
      controller.reformCooldown = GAME_CONFIG.ai.reformCooldown;
      return;
    }

    if (formation.canVolley() && distance <= GAME_CONFIG.musket.effectiveRange) {
      const targetInFriendlyMelee = target.mode === 'melee';
      const holdFireChance = targetInFriendlyMelee ? controller.caution * 0.55 : 0;
      if (Math.random() >= holdFireChance) {
        command.volley = true;
        controller.intent = strategicIntent === 'defend' ? 'defend' : strategicIntent === 'escort' ? 'escort' : 'volley';
      } else {
        controller.intent = 'flank';
      }
      return;
    }

    const reloadOpportunity = target.reloadTimer > 1.6;
    const chargeScore = controller.aggression * 0.5
      + Math.max(-0.25, Math.min(0.35, (ownRatio - 1) * 0.45))
      + (reloadOpportunity ? 0.28 : 0)
      + (target.mode === 'reforming' || target.mode === 'bannerAttack' ? 0.22 : 0)
      - controller.caution * 0.18
      - Math.max(0, targetLocks - 1) * 0.08
      + (strategicIntent === 'defend' ? 0.18 : 0);

    if (
      distance >= GAME_CONFIG.charge.aiMinDistance
      && distance <= GAME_CONFIG.charge.aiMaxDistance
      && chargeScore > 0.58
      && Math.random() < Math.min(0.88, chargeScore)
    ) {
      command.chargeTarget = this.leadChargeTarget(formation, target);
      controller.intent = strategicIntent === 'defend' ? 'defend' : 'charge';
    } else if (distance < controller.retreatRange && controller.caution > controller.aggression * 0.7 && strategicIntent !== 'defend') {
      controller.intent = 'retreat';
    } else if (
      strategicIntent !== 'defend'
      && strategicIntent !== 'escort'
      && distance > controller.preferredRange
      && (controller.flankPreference > 0.55 || targetLocks >= 2)
      && Math.random() < 0.35 + controller.flankPreference * 0.4
    ) {
      controller.intent = 'flank';
    } else if (distance > controller.preferredRange) {
      controller.intent = strategicIntent === 'defend' ? 'defend' : strategicIntent === 'escort' ? 'escort' : 'advance';
    } else {
      controller.intent = strategicIntent === 'defend' ? 'defend' : strategicIntent === 'escort' ? 'escort' : 'hold';
    }
  }

  private movementForIntent(formation: Formation, target: Formation, controller: Controller): Vec2 {
    if (formation.mode !== 'line') return { x: 0, y: 0 };
    const dx = target.center.x - formation.center.x;
    const dy = target.center.y - formation.center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;

    if (controller.intent === 'advance' || controller.intent === 'defend' || controller.intent === 'escort') return { x: nx, y: ny };
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
      const distance = this.distance(enemy.center, formation.center);
      const crowded = locks.get(enemy.id) ?? 0;
      const weakness = enemy.soldiers.length - enemy.aliveCount();
      const lanePenalty = Math.abs(enemy.center.y - formation.center.y) * 0.08;
      const objectiveBonus = enemy.mode === 'bannerAttack' ? -260 : 0;
      const score = distance
        + crowded * GAME_CONFIG.ai.targetCrowdPenalty
        + lanePenalty
        - weakness * GAME_CONFIG.ai.weaknessWeight
        + objectiveBonus
        + Math.random() * 55;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  private selectBannerThreat(formation: Formation, enemies: Formation[], banner: Banner): Formation | null {
    const threats = enemies.filter((enemy) =>
      (enemy.mode === 'bannerAttack' && enemy.bannerTargetTeam === banner.team)
      || this.distance(enemy.center, banner.position) <= GAME_CONFIG.banner.aiDefenseRadius,
    );
    if (threats.length === 0) return null;
    return this.nearestToPoint(threats, banner.position) ?? this.nearestToPoint(threats, formation.center);
  }

  private nearestToPoint(formations: Formation[], point: Vec2): Formation | null {
    let best: Formation | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const formation of formations) {
      const distance = this.distance(formation.center, point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = formation;
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

  private lockTarget(controller: Controller, target: Formation, locks: Map<string, number>): void {
    if (controller.targetId === target.id) return;
    if (controller.targetId) {
      locks.set(controller.targetId, Math.max(0, (locks.get(controller.targetId) ?? 1) - 1));
    }
    controller.targetId = target.id;
    locks.set(target.id, (locks.get(target.id) ?? 0) + 1);
  }

  private createController(): Controller {
    return {
      thinkTimer: Math.random() * GAME_CONFIG.ai.thinkMax,
      targetId: null,
      intent: 'hold',
      aggression: 0.25 + Math.random() * 0.75,
      caution: 0.2 + Math.random() * 0.8,
      flankPreference: Math.random(),
      objectiveCommitment: GAME_CONFIG.ai.objectiveCommitmentMin
        + Math.random() * (GAME_CONFIG.ai.objectiveCommitmentMax - GAME_CONFIG.ai.objectiveCommitmentMin),
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

  private angleTo(from: Vec2, to: Vec2): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  private distance(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private writeDebug(formation: Formation, controller: Controller, targetLabel?: string): void {
    formation.debugIntent = controller.intent.toUpperCase();
    formation.debugTargetId = targetLabel ?? controller.targetId;
  }
}
