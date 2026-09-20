import { Banner } from '../entities/banner';
import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';
import type { SquadClass, Team, Vec2 } from '../game/types';

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
  | 'escort'
  | 'bombard'
  | 'deploy';

export interface AiCommand {
  formation: Formation;
  move: Vec2;
  faceAngle: number | null;
  volley: boolean;
  artilleryTarget: Vec2 | null;
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

      const command = this.emptyCommand(formation, target);

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
          const cavalryBonus = formation.squadClass === 'cavalry' ? -0.12 : 0;
          const breakScore = controller.caution * 0.55
            + (ratio < 0.72 ? 0.35 : 0)
            + (formation.aliveCount() <= Math.ceil(formation.maxSoldiers() * 0.35) ? 0.3 : 0)
            + (controller.meleeTime > 5 ? 0.12 : 0)
            - controller.aggression * 0.25
            + cavalryBonus;
          if (controller.meleeTime > 2.0 && breakScore > 0.6 && Math.random() < breakScore) {
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
          && defenseTarget !== null
          && this.distance(formation.center, ownBanner.position) <= GAME_CONFIG.banner.aiResponseRadius;

        if (canRespondToBanner && defenseTarget) {
          target = defenseTarget;
          this.lockTarget(controller, target, locks);
          command.faceAngle = this.angleTo(formation.center, target.center);
          controller.intent = 'defend';
        }

        if (formation.squadClass === 'artillery') {
          this.decideArtillery(formation, target, enemies, controller, command, locks);
        } else if (formation.squadClass === 'cavalry') {
          if (!canRespondToBanner && Math.random() < GAME_CONFIG.ai.retargetChance + 0.15) {
            const retarget = this.selectTarget(formation, enemies, locks);
            if (retarget) {
              target = retarget;
              this.lockTarget(controller, target, locks);
              command.faceAngle = this.angleTo(formation.center, target.center);
            }
          }
          if (target) this.decideCavalry(formation, target, controller, command, locks);
          else controller.intent = 'advance';
        } else {
          this.decideInfantry(
            formation,
            target,
            enemies,
            allies,
            ownBanner,
            enemyBanner,
            controller,
            command,
            locks,
            activeBannerAttackers,
            canRespondToBanner,
          );
        }
      }

      if (target && !command.reform && !command.chargeTarget && !command.bannerAttackTarget && !command.artilleryTarget) {
        command.move = this.movementForIntent(formation, target, controller);
      } else if (!target && controller.intent === 'advance') {
        command.move = formation.team === 'blue' ? { x: 1, y: 0 } : { x: -1, y: 0 };
      }

      this.writeDebug(formation, controller);
      commands.push(command);
    }
    return commands;
  }

  chooseRespawnClass(
    formation: Formation,
    formations: Formation[],
    banners: Banner[],
    planned: Map<string, SquadClass>,
  ): SquadClass {
    const scores = this.scoreClasses(formation.team, formations, banners, planned);
    const controller = this.controllers.get(formation.id) ?? this.createController();
    this.controllers.set(formation.id, controller);
    scores.cavalry += controller.aggression * 12 + controller.flankPreference * 15;
    scores.artillery += controller.caution * 12;
    scores.infantry += controller.objectiveCommitment * 12;
    scores.infantry += (Math.random() - 0.5) * 8;
    scores.cavalry += (Math.random() - 0.5) * 8;
    scores.artillery += (Math.random() - 0.5) * 8;
    return this.highestClass(scores);
  }

  recommendClass(
    team: Team,
    formations: Formation[],
    banners: Banner[],
    planned: Map<string, SquadClass>,
  ): SquadClass {
    return this.highestClass(this.scoreClasses(team, formations, banners, planned));
  }

  private scoreClasses(
    team: Team,
    formations: Formation[],
    banners: Banner[],
    planned: Map<string, SquadClass>,
  ): Record<SquadClass, number> {
    const counts: Record<SquadClass, number> = { infantry: 0, cavalry: 0, artillery: 0 };
    const enemyCounts: Record<SquadClass, number> = { infantry: 0, cavalry: 0, artillery: 0 };
    for (const formation of formations) {
      if (formation.aliveCount() <= 0) continue;
      (formation.team === team ? counts : enemyCounts)[formation.squadClass] += 1;
    }
    for (const [id, plannedClass] of planned) {
      const formation = formations.find((candidate) => candidate.id === id);
      if (formation?.team === team) counts[plannedClass] += 1;
    }

    const ownBanner = banners.find((banner) => banner.team === team)!;
    const enemyBanner = banners.find((banner) => banner.team !== team)!;
    const friendlyNearEnemyBanner = formations.filter((formation) =>
      formation.team === team && formation.aliveCount() > 0 && this.distance(formation.center, enemyBanner.position) < 1050,
    ).length;
    const enemyNearOwnBanner = formations.filter((formation) =>
      formation.team !== team && formation.aliveCount() > 0 && this.distance(formation.center, ownBanner.position) < 1100,
    ).length;

    const scores: Record<SquadClass, number> = {
      infantry: 62,
      cavalry: 28,
      artillery: 22,
    };

    scores.infantry += Math.max(0, 14 - counts.infantry) * 4.5;
    scores.infantry += counts.artillery * 2.5;
    scores.infantry += friendlyNearEnemyBanner * 5;
    scores.infantry += enemyNearOwnBanner * 4;
    if (enemyBanner.ratio < 0.45) scores.infantry += 38;
    if (enemyBanner.ratio < 0.22) scores.infantry += 38;
    if (ownBanner.underAttackTimer > 0) scores.infantry += 32;

    scores.cavalry += enemyCounts.artillery * 15;
    scores.cavalry += Math.max(0, 4 - counts.cavalry) * 7;
    scores.cavalry += enemyCounts.cavalry < 3 ? 8 : 0;
    scores.cavalry -= enemyNearOwnBanner * 2;
    if (ownBanner.ratio < 0.35) scores.cavalry -= 22;
    if (enemyBanner.ratio < 0.25) scores.cavalry -= 16;

    scores.artillery += enemyCounts.infantry * 3.4;
    scores.artillery += Math.max(0, 2 - counts.artillery) * 12;
    scores.artillery += counts.infantry * 1.2;
    scores.artillery -= enemyCounts.cavalry * 4.5;
    scores.artillery -= enemyNearOwnBanner * 7;
    if (ownBanner.underAttackTimer > 0) scores.artillery -= 30;

    if (counts.infantry > GAME_CONFIG.ai.classSoftCapInfantry) scores.infantry -= (counts.infantry - GAME_CONFIG.ai.classSoftCapInfantry) * 12;
    if (counts.cavalry > GAME_CONFIG.ai.classSoftCapCavalry) scores.cavalry -= (counts.cavalry - GAME_CONFIG.ai.classSoftCapCavalry) * 25;
    if (counts.artillery > GAME_CONFIG.ai.classSoftCapArtillery) scores.artillery -= (counts.artillery - GAME_CONFIG.ai.classSoftCapArtillery) * 30;

    return scores;
  }

  private decideInfantry(
    formation: Formation,
    initialTarget: Formation | null,
    enemies: Formation[],
    allies: Formation[],
    ownBanner: Banner,
    enemyBanner: Banner,
    controller: Controller,
    command: AiCommand,
    locks: Map<string, number>,
    activeBannerAttackers: Map<Team, number>,
    alreadyDefending: boolean,
  ): void {
    let target = initialTarget;
    if (!alreadyDefending) {
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
        return;
      }

      if (alliedAttackers.length > 0 && distanceToEnemyBanner < 1120 && defenders.length > 0) {
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

    if (target) this.decideInfantryCombat(formation, target, controller, command, locks);
    else {
      controller.intent = ownBanner.underAttackTimer > 0 ? 'defend' : 'advance';
      command.move = formation.team === 'blue' ? { x: 1, y: 0 } : { x: -1, y: 0 };
    }
  }

  private decideInfantryCombat(
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
      } else controller.intent = 'flank';
      return;
    }

    const reloadOpportunity = target.reloadTimer > 1.6;
    const chargeScore = controller.aggression * 0.5
      + Math.max(-0.25, Math.min(0.35, (ownRatio - 1) * 0.45))
      + (reloadOpportunity ? 0.28 : 0)
      + (target.mode === 'reforming' || target.mode === 'bannerAttack' || target.squadClass === 'artillery' ? 0.25 : 0)
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
    ) controller.intent = 'flank';
    else if (distance > controller.preferredRange) controller.intent = strategicIntent === 'defend' ? 'defend' : strategicIntent === 'escort' ? 'escort' : 'advance';
    else controller.intent = strategicIntent === 'defend' ? 'defend' : strategicIntent === 'escort' ? 'escort' : 'hold';
  }

  private decideCavalry(
    formation: Formation,
    target: Formation,
    controller: Controller,
    command: AiCommand,
    locks: Map<string, number>,
  ): void {
    const distance = this.distance(formation.center, target.center);
    const targetLocks = locks.get(target.id) ?? 0;
    const targetPriority = target.squadClass === 'artillery' ? 0.28 : target.mode === 'bannerAttack' ? 0.2 : 0;
    const chargeScore = controller.aggression * 0.52
      + controller.flankPreference * 0.2
      + targetPriority
      - Math.max(0, targetLocks - 1) * 0.06;

    if (
      distance >= GAME_CONFIG.cavalry.aiChargeMinDistance
      && distance <= GAME_CONFIG.cavalry.aiChargeMaxDistance
      && chargeScore > 0.48
      && Math.random() < Math.min(0.94, chargeScore)
    ) {
      command.chargeTarget = this.leadChargeTarget(formation, target, 120);
      controller.intent = 'charge';
      return;
    }

    if (distance < 125) {
      command.chargeTarget = this.leadChargeTarget(formation, target, 35);
      controller.intent = 'charge';
      return;
    }

    controller.intent = target.squadClass === 'artillery' || targetLocks >= 2 ? 'flank' : 'advance';
  }

  private decideArtillery(
    formation: Formation,
    target: Formation | null,
    enemies: Formation[],
    controller: Controller,
    command: AiCommand,
    locks: Map<string, number>,
  ): void {
    const cavalryThreat = this.nearestToPoint(
      enemies.filter((enemy) => enemy.squadClass === 'cavalry' && this.distance(enemy.center, formation.center) <= GAME_CONFIG.artillery.threatRetreatRange),
      formation.center,
    );
    if (cavalryThreat) {
      this.lockTarget(controller, cavalryThreat, locks);
      command.faceAngle = this.angleTo(formation.center, cavalryThreat.center);
      controller.intent = 'retreat';
      command.move = this.awayFrom(formation.center, cavalryThreat.center);
      return;
    }

    // Artillery evaluates the whole battlefield instead of inheriting the generic nearest-target choice.
    const bestTarget = this.selectArtilleryTarget(formation, enemies) ?? target;
    if (!bestTarget) {
      controller.intent = 'advance';
      command.move = formation.team === 'blue' ? { x: 1, y: 0 } : { x: -1, y: 0 };
      return;
    }
    this.lockTarget(controller, bestTarget, locks);
    command.faceAngle = this.angleTo(formation.center, bestTarget.center);
    const distance = this.distance(formation.center, bestTarget.center);

    if (distance > GAME_CONFIG.artillery.range * 0.97) {
      controller.intent = 'advance';
      command.move = this.toward(formation.center, bestTarget.center);
      return;
    }
    if (distance < GAME_CONFIG.artillery.minRange) {
      controller.intent = 'retreat';
      command.move = this.awayFrom(formation.center, bestTarget.center);
      return;
    }
    if (!formation.artilleryDeployed) {
      controller.intent = 'deploy';
      return;
    }
    if (formation.canArtilleryFire()) {
      command.artilleryTarget = {
        x: bestTarget.center.x + (Math.random() - 0.5) * GAME_CONFIG.artillery.targetJitter,
        y: bestTarget.center.y + (Math.random() - 0.5) * GAME_CONFIG.artillery.targetJitter,
      };
      controller.intent = 'bombard';
      return;
    }
    controller.intent = 'hold';
  }

  private movementForIntent(formation: Formation, target: Formation, controller: Controller): Vec2 {
    if (formation.mode !== 'line') return { x: 0, y: 0 };
    const toward = this.toward(formation.center, target.center);
    if (controller.intent === 'advance' || controller.intent === 'defend' || controller.intent === 'escort') return toward;
    if (controller.intent === 'retreat') return { x: -toward.x, y: -toward.y };
    if (controller.intent === 'flank') {
      const rightX = -toward.y * controller.flankSign;
      const rightY = toward.x * controller.flankSign;
      const desiredRange = formation.squadClass === 'cavalry' ? 380 : controller.preferredRange * 0.78;
      const desired = {
        x: target.center.x - toward.x * desiredRange + rightX * controller.flankOffset,
        y: target.center.y - toward.y * desiredRange + rightY * controller.flankOffset,
      };
      return this.toward(formation.center, desired);
    }
    return { x: 0, y: 0 };
  }

  private selectTarget(formation: Formation, enemies: Formation[], locks: Map<string, number>): Formation | null {
    let best: Formation | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const distance = this.distance(enemy.center, formation.center);
      const crowded = locks.get(enemy.id) ?? 0;
      const weakness = enemy.maxSoldiers() - enemy.aliveCount();
      const lanePenalty = Math.abs(enemy.center.y - formation.center.y) * 0.07;
      const objectiveBonus = enemy.mode === 'bannerAttack' ? -280 : 0;
      let classBonus = 0;
      if (formation.squadClass === 'cavalry' && enemy.squadClass === 'artillery') classBonus -= 600;
      if (formation.squadClass === 'artillery' && enemy.squadClass === 'infantry') classBonus -= 180;
      if (formation.squadClass === 'artillery' && enemy.squadClass === 'cavalry') classBonus += 230;
      const score = distance
        + crowded * GAME_CONFIG.ai.targetCrowdPenalty
        + lanePenalty
        - weakness * GAME_CONFIG.ai.weaknessWeight
        + objectiveBonus
        + classBonus
        + Math.random() * 55;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  private selectArtilleryTarget(formation: Formation, enemies: Formation[]): Formation | null {
    let best: Formation | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const distance = this.distance(formation.center, enemy.center);
      if (distance > GAME_CONFIG.artillery.range || distance < GAME_CONFIG.artillery.minRange) continue;

      // Prefer dense infantry concentrations. Nearby formations make a target more valuable
      // because one shell can disrupt several squads even when it only directly damages one.
      let nearbyFormations = 0;
      let nearbySoldiers = 0;
      for (const other of enemies) {
        if (this.distance(enemy.center, other.center) <= 430) {
          nearbyFormations += 1;
          nearbySoldiers += other.aliveCount();
        }
      }

      const classScore = enemy.squadClass === 'infantry' ? -420 : enemy.squadClass === 'artillery' ? -100 : 210;
      const densityBonus = -(nearbyFormations - 1) * 135 - nearbySoldiers * 5.5;
      const rangeScore = Math.abs(distance - GAME_CONFIG.artillery.preferredRange) * 0.16;
      const objectiveBonus = enemy.mode === 'bannerAttack' ? -280 : 0;
      const score = rangeScore + classScore + densityBonus + objectiveBonus + Math.random() * 95;
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

  private leadChargeTarget(formation: Formation, target: Formation, extraLead = 55): Vec2 {
    const dx = target.center.x - formation.center.x;
    const dy = target.center.y - formation.center.y;
    const distance = Math.hypot(dx, dy) || 1;
    const lead = Math.min(extraLead, distance * 0.18);
    return {
      x: target.center.x + (dx / distance) * lead,
      y: target.center.y + (dy / distance) * lead,
    };
  }

  private lockTarget(controller: Controller, target: Formation, locks: Map<string, number>): void {
    if (controller.targetId === target.id) return;
    if (controller.targetId) locks.set(controller.targetId, Math.max(0, (locks.get(controller.targetId) ?? 1) - 1));
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

  private emptyCommand(formation: Formation, target: Formation | null): AiCommand {
    return {
      formation,
      move: { x: 0, y: 0 },
      faceAngle: target ? this.angleTo(formation.center, target.center) : null,
      volley: false,
      artilleryTarget: null,
      chargeTarget: null,
      reform: false,
      breakOffTarget: null,
      bannerAttackTarget: null,
    };
  }

  private highestClass(scores: Record<SquadClass, number>): SquadClass {
    let best: SquadClass = 'infantry';
    for (const squadClass of ['cavalry', 'artillery'] as const) {
      if (scores[squadClass] > scores[best]) best = squadClass;
    }
    return best;
  }

  private nextThink(): number {
    return GAME_CONFIG.ai.thinkMin + Math.random() * (GAME_CONFIG.ai.thinkMax - GAME_CONFIG.ai.thinkMin);
  }

  private angleTo(from: Vec2, to: Vec2): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  private toward(from: Vec2, to: Vec2): Vec2 {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
    return { x: dx / distance, y: dy / distance };
  }

  private awayFrom(from: Vec2, threat: Vec2): Vec2 {
    const toward = this.toward(from, threat);
    return { x: -toward.x, y: -toward.y };
  }

  private distance(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private writeDebug(formation: Formation, controller: Controller, targetLabel?: string): void {
    formation.debugIntent = controller.intent.toUpperCase();
    formation.debugTargetId = targetLabel ?? controller.targetId;
  }
}
