import { Banner } from '../entities/banner';
import { Formation } from '../entities/formation';
import { GAME_CONFIG } from '../game/config';
import { artilleryProfile, chargeProfile, volleyProfile } from '../game/classProfiles';
import {
  SQUAD_CLASSES,
  canBannerAttackClass,
  isArtilleryClass,
  isChargeCavalryClass,
  type SquadClass,
  type Team,
  type Vec2,
} from '../game/types';

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
  | 'deploy'
  | 'rout'
  | 'breakthrough';

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

function zeroScores(): Record<SquadClass, number> {
  return Object.fromEntries(SQUAD_CLASSES.map((value) => [value, 0])) as Record<SquadClass, number>;
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
      if (formation.mode !== 'bannerAttack' || formation.aliveCount() === 0) continue;
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
      if (!target || target.team === formation.team || target.mode === 'routed') {
        controller.targetId = null;
        target = this.selectTarget(formation, enemies, locks);
        if (target) this.lockTarget(controller, target, locks);
      }
      const command = this.emptyCommand(formation, target);

      if (formation.mode === 'routed') {
        controller.intent = 'rout';
        controller.targetId = null;
        this.writeDebug(formation, controller);
        commands.push(command);
        continue;
      }
      if (formation.mode === 'bannerAttack') {
        controller.intent = 'attack-banner';
        this.writeDebug(formation, controller, `FLAG-${formation.bannerTargetTeam?.toUpperCase() ?? '?'}`);
        commands.push(command);
        continue;
      }
      if (formation.mode === 'charging') {
        controller.intent = 'charge';
        this.writeDebug(formation, controller);
        commands.push(command);
        continue;
      }
      if (formation.mode === 'reforming') {
        controller.intent = 'reform';
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
          const moralePressure = formation.morale < 42 ? 0.35 : formation.morale < 60 ? 0.15 : 0;
          const breakScore = controller.caution * 0.48
            + (ratio < 0.7 ? 0.35 : 0)
            + moralePressure
            + (controller.meleeTime > 5 ? 0.12 : 0)
            - controller.aggression * 0.22;
          if (controller.meleeTime > 1.8 && breakScore > 0.58 && Math.random() < breakScore) {
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

        if (isArtilleryClass(formation.squadClass)) {
          this.decideArtillery(formation, target, enemies, controller, command, locks);
        } else if (isChargeCavalryClass(formation.squadClass)) {
          if (!canRespondToBanner && Math.random() < GAME_CONFIG.ai.retargetChance + 0.16) {
            const retarget = this.selectTarget(formation, enemies, locks);
            if (retarget) {
              target = retarget;
              this.lockTarget(controller, target, locks);
              command.faceAngle = this.angleTo(formation.center, target.center);
            }
          }
          if (target) this.decideCavalry(formation, target, controller, command, locks);
          else controller.intent = 'advance';
        } else if (formation.squadClass === 'dragoon') {
          this.decideDragoon(formation, target, controller, command);
        } else {
          this.decideFootInfantry(
            formation,
            target,
            enemies,
            allies,
            ownBanner,
            enemyBanner,
            controller,
            command,
            activeBannerAttackers,
            canRespondToBanner,
          );
        }
      }

      if (target && !command.reform && !command.chargeTarget && !command.bannerAttackTarget && !command.artilleryTarget) {
        command.move = this.movementForIntent(formation, target, controller, enemyBanner.position);
      } else if (!target && (controller.intent === 'advance' || controller.intent === 'breakthrough')) {
        command.move = this.toward(formation.center, enemyBanner.position);
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
    scores.cavalry += controller.aggression * 10 + controller.flankPreference * 9;
    scores.hussar += controller.aggression * 11 + controller.flankPreference * 14;
    scores.dragoon += controller.flankPreference * 9 + controller.caution * 5;
    scores.artillery += controller.caution * 8;
    scores.heavyArtillery += controller.caution * 11;
    scores.horseArtillery += controller.flankPreference * 6 + controller.aggression * 4;
    scores.infantry += controller.objectiveCommitment * 11;
    scores.grenadier += controller.aggression * 7 + controller.objectiveCommitment * 7;
    scores.sharpshooter += controller.caution * 8;
    scores.engineer += controller.objectiveCommitment * 13;
    scores.cuirassier += controller.aggression * 8 + controller.caution * 5;
    for (const value of SQUAD_CLASSES) scores[value] += (Math.random() - 0.5) * 10;
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
    const counts = zeroScores();
    const enemyCounts = zeroScores();
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
    const enemyArtillery = enemyCounts.artillery + enemyCounts.heavyArtillery + enemyCounts.horseArtillery;
    const enemyMounted = enemyCounts.cavalry + enemyCounts.hussar + enemyCounts.cuirassier + enemyCounts.dragoon;
    const enemyFoot = enemyCounts.infantry + enemyCounts.lightInfantry + enemyCounts.grenadier + enemyCounts.sharpshooter + enemyCounts.engineer;
    const friendlyNearEnemyBanner = formations.filter((formation) => formation.team === team && formation.aliveCount() > 0 && this.distance(formation.center, enemyBanner.position) < 1100).length;
    const enemyNearOwnBanner = formations.filter((formation) => formation.team !== team && formation.aliveCount() > 0 && this.distance(formation.center, ownBanner.position) < 1200).length;
    const avgEnemyMorale = this.averageMorale(formations.filter((formation) => formation.team !== team && formation.aliveCount() > 0));
    const avgFriendlyMorale = this.averageMorale(formations.filter((formation) => formation.team === team && formation.aliveCount() > 0));

    const scores = zeroScores();
    Object.assign(scores, {
      infantry: 58,
      lightInfantry: 30,
      grenadier: 34,
      sharpshooter: 18,
      engineer: 24,
      dragoon: 30,
      cavalry: 30,
      hussar: 24,
      cuirassier: 22,
      artillery: 28,
      heavyArtillery: 18,
      horseArtillery: 24,
    });

    scores.infantry += Math.max(0, 8 - counts.infantry) * 4 + friendlyNearEnemyBanner * 5 + enemyNearOwnBanner * 4;
    scores.lightInfantry += enemyArtillery * 5 + Math.max(0, 2 - counts.lightInfantry) * 8;
    scores.grenadier += avgEnemyMorale < 55 ? 24 : 4;
    scores.grenadier += friendlyNearEnemyBanner * 5;
    scores.sharpshooter += enemyMounted * 12 + Math.max(0, 2 - counts.sharpshooter) * 5;
    scores.engineer += friendlyNearEnemyBanner * 11 + enemyNearOwnBanner * 7 + Math.max(0, 2 - counts.engineer) * 5;
    scores.dragoon += enemyNearOwnBanner * 3 + Math.max(0, 2 - counts.dragoon) * 7;
    scores.cavalry += enemyArtillery * 13 + Math.max(0, 3 - counts.cavalry) * 6;
    scores.hussar += enemyArtillery * 6 + (avgEnemyMorale < 62 ? 30 : 4) + Math.max(0, 2 - counts.hussar) * 6;
    scores.cuirassier += enemyFoot * 1.2 + (avgFriendlyMorale < 55 ? 10 : 0) + Math.max(0, 2 - counts.cuirassier) * 5;
    scores.artillery += enemyFoot * 2.8 + Math.max(0, 2 - counts.artillery) * 10;
    scores.heavyArtillery += enemyFoot * 2.3 + (avgEnemyMorale > 60 ? 12 : 0);
    scores.horseArtillery += enemyFoot * 1.6 + (avgFriendlyMorale > 55 ? 6 : 0) + Math.max(0, 2 - counts.horseArtillery) * 7;

    if (enemyBanner.ratio < 0.4) {
      scores.infantry += 34;
      scores.grenadier += 24;
      scores.engineer += 38;
      scores.lightInfantry += 12;
      scores.heavyArtillery -= 15;
    }
    if (enemyBanner.ratio < 0.2) {
      scores.infantry += 38;
      scores.grenadier += 32;
      scores.engineer += 52;
      scores.cavalry -= 10;
      scores.heavyArtillery -= 18;
    }
    if (ownBanner.underAttackTimer > 0 || ownBanner.ratio < 0.35) {
      scores.infantry += 32;
      scores.grenadier += 28;
      scores.engineer += 26;
      scores.dragoon += 20;
      scores.artillery -= 18;
      scores.heavyArtillery -= 34;
    }
    scores.artillery -= enemyMounted * 3.5;
    scores.heavyArtillery -= enemyMounted * 6;

    const caps: Record<SquadClass, number> = {
      infantry: GAME_CONFIG.ai.classSoftCapInfantry,
      lightInfantry: GAME_CONFIG.ai.classSoftCapLightInfantry,
      grenadier: GAME_CONFIG.ai.classSoftCapGrenadier,
      sharpshooter: GAME_CONFIG.ai.classSoftCapSharpshooter,
      engineer: GAME_CONFIG.ai.classSoftCapEngineer,
      dragoon: GAME_CONFIG.ai.classSoftCapDragoon,
      cavalry: GAME_CONFIG.ai.classSoftCapCavalry,
      hussar: GAME_CONFIG.ai.classSoftCapHussar,
      cuirassier: GAME_CONFIG.ai.classSoftCapCuirassier,
      artillery: GAME_CONFIG.ai.classSoftCapArtillery,
      heavyArtillery: GAME_CONFIG.ai.classSoftCapHeavyArtillery,
      horseArtillery: GAME_CONFIG.ai.classSoftCapHorseArtillery,
    };
    for (const value of SQUAD_CLASSES) {
      if (counts[value] > caps[value]) scores[value] -= (counts[value] - caps[value]) * (value.includes('Artillery') || value === 'artillery' ? 28 : 17);
    }
    return scores;
  }

  private decideFootInfantry(
    formation: Formation,
    initialTarget: Formation | null,
    enemies: Formation[],
    allies: Formation[],
    ownBanner: Banner,
    enemyBanner: Banner,
    controller: Controller,
    command: AiCommand,
    activeBannerAttackers: Map<Team, number>,
    alreadyDefending: boolean,
  ): void {
    let target = initialTarget;
    if (!alreadyDefending && canBannerAttackClass(formation.squadClass)) {
      const defenders = enemies.filter((enemy) => this.distance(enemy.center, enemyBanner.position) <= GAME_CONFIG.banner.aiDefenseRadius && enemy.mode !== 'routed');
      const localAllies = allies.filter((ally) => this.distance(ally.center, enemyBanner.position) <= GAME_CONFIG.banner.aiDefenseRadius + 150);
      const distanceToEnemyBanner = this.distance(formation.center, enemyBanner.position);
      const attackers = activeBannerAttackers.get(formation.team) ?? 0;
      const flagOpen = defenders.length === 0 || localAllies.length >= defenders.length + 1;
      if (!enemyBanner.destroyed
        && formation.aliveCount() >= Math.max(5, Math.ceil(formation.maxSoldiers() * 0.38))
        && distanceToEnemyBanner <= GAME_CONFIG.banner.aiAttackTriggerDistance
        && attackers < GAME_CONFIG.banner.aiMaxAttackers
        && flagOpen
        && controller.objectiveCommitment > 0.42) {
        command.bannerAttackTarget = enemyBanner;
        command.faceAngle = this.angleTo(formation.center, enemyBanner.position);
        controller.intent = 'attack-banner';
        activeBannerAttackers.set(formation.team, attackers + 1);
        return;
      }
    }

    if (!target) {
      controller.intent = ownBanner.underAttackTimer > 0 ? 'defend' : 'advance';
      command.move = this.toward(formation.center, enemyBanner.position);
      return;
    }

    const distance = this.distance(formation.center, target.center);
    const volley = volleyProfile(formation.squadClass);
    const routedOrBroken = target.mode === 'routed' || target.morale <= GAME_CONFIG.morale.breakthroughMoraleThreshold;
    if (routedOrBroken && formation.morale > 45) {
      controller.intent = 'breakthrough';
      command.move = this.toward(formation.center, enemyBanner.position);
      return;
    }

    const nearbyBreakthrough = !alreadyDefending && allies.some((ally) =>
      ally !== formation
      && ally.aliveCount() > 0
      && ally.debugIntent === 'BREAKTHROUGH'
      && this.distance(ally.center, formation.center) <= 560
    );
    if (nearbyBreakthrough && formation.morale > 52 && distance > volley.defensiveRange) {
      controller.intent = 'breakthrough';
      command.move = this.toward(formation.center, enemyBanner.position);
      return;
    }

    if (formation.needsReform() && controller.reformCooldown <= 0 && distance > volley.effectiveRange + 80 && Math.random() < 0.28 + controller.caution * 0.4) {
      command.reform = true;
      controller.intent = 'reform';
      controller.reformCooldown = GAME_CONFIG.ai.reformCooldown;
      return;
    }

    if (formation.canVolley() && distance <= volley.effectiveRange) {
      command.volley = true;
      controller.intent = 'volley';
      return;
    }

    const ownRatio = formation.aliveCount() / Math.max(1, target.aliveCount());
    if (formation.morale < 42 || (distance < controller.retreatRange && ownRatio < 0.72 && controller.caution > 0.5)) {
      controller.intent = 'retreat';
      return;
    }

    if (formation.squadClass !== 'lightInfantry'
      && distance >= GAME_CONFIG.charge.aiMinDistance
      && distance <= GAME_CONFIG.charge.aiMaxDistance
      && formation.morale > 58
      && (target.reloadTimer > 0.9 || target.morale < 52)
      && Math.random() < 0.18 + controller.aggression * 0.42) {
      command.chargeTarget = this.leadChargeTarget(formation, target, 70);
      controller.intent = 'charge';
      return;
    }

    if (distance > volley.effectiveRange * 0.88) controller.intent = controller.flankPreference > 0.62 ? 'flank' : 'advance';
    else controller.intent = 'hold';
  }

  private decideDragoon(
    formation: Formation,
    target: Formation | null,
    controller: Controller,
    command: AiCommand,
  ): void {
    if (!target) {
      controller.intent = 'advance';
      return;
    }
    const profile = volleyProfile('dragoon');
    const distance = this.distance(formation.center, target.center);
    if (formation.canVolley() && distance <= profile.effectiveRange) {
      command.volley = true;
      controller.intent = 'volley';
      return;
    }
    if (distance < 270 || formation.morale < 40) {
      controller.intent = 'retreat';
      return;
    }
    controller.intent = distance > profile.effectiveRange * 0.92 ? 'advance' : 'flank';
  }

  private decideCavalry(
    formation: Formation,
    target: Formation,
    controller: Controller,
    command: AiCommand,
    locks: Map<string, number>,
  ): void {
    const profile = chargeProfile(formation.squadClass);
    const distance = this.distance(formation.center, target.center);
    const targetLocks = locks.get(target.id) ?? 0;
    if (formation.morale < 38) {
      controller.intent = 'retreat';
      return;
    }
    if (distance >= profile.aiMinDistance && distance <= profile.aiMaxDistance
      && formation.reloadTimer <= 0
      && Math.random() < 0.34 + controller.aggression * 0.42) {
      command.chargeTarget = this.leadChargeTarget(formation, target, formation.squadClass === 'hussar' ? 120 : 90);
      controller.intent = 'charge';
      return;
    }
    const artilleryVictim = isArtilleryClass(target.squadClass);
    const brokenVictim = target.mode === 'routed' || target.morale < 45;
    controller.intent = artilleryVictim || brokenVictim || targetLocks >= 2 ? 'flank' : 'advance';
  }

  private decideArtillery(
    formation: Formation,
    target: Formation | null,
    enemies: Formation[],
    controller: Controller,
    command: AiCommand,
    locks: Map<string, number>,
  ): void {
    const profile = artilleryProfile(formation.squadClass);
    const mountedThreat = this.nearestToPoint(
      enemies.filter((enemy) => (isChargeCavalryClass(enemy.squadClass) || enemy.squadClass === 'dragoon')
        && this.distance(enemy.center, formation.center) <= profile.threatRetreatRange),
      formation.center,
    );
    if (mountedThreat) {
      this.lockTarget(controller, mountedThreat, locks);
      command.faceAngle = this.angleTo(formation.center, mountedThreat.center);
      controller.intent = 'retreat';
      command.move = this.awayFrom(formation.center, mountedThreat.center);
      return;
    }

    const bestTarget = this.selectArtilleryTarget(formation, enemies) ?? target;
    if (!bestTarget) {
      controller.intent = 'advance';
      return;
    }
    this.lockTarget(controller, bestTarget, locks);
    command.faceAngle = this.angleTo(formation.center, bestTarget.center);
    const distance = this.distance(formation.center, bestTarget.center);
    if (distance > profile.range * 0.97) {
      controller.intent = 'advance';
      command.move = this.toward(formation.center, bestTarget.center);
      return;
    }
    if (distance < profile.minRange) {
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
        x: bestTarget.center.x + (Math.random() - 0.5) * profile.targetJitter,
        y: bestTarget.center.y + (Math.random() - 0.5) * profile.targetJitter,
      };
      controller.intent = 'bombard';
      return;
    }
    controller.intent = 'hold';
  }

  private movementForIntent(formation: Formation, target: Formation, controller: Controller, enemyBanner: Vec2): Vec2 {
    if (formation.mode !== 'line') return { x: 0, y: 0 };
    if (controller.intent === 'breakthrough') return this.toward(formation.center, enemyBanner);
    const toward = this.toward(formation.center, target.center);
    if (controller.intent === 'advance' || controller.intent === 'defend' || controller.intent === 'escort') return toward;
    if (controller.intent === 'retreat') return { x: -toward.x, y: -toward.y };
    if (controller.intent === 'flank') {
      const rightX = -toward.y * controller.flankSign;
      const rightY = toward.x * controller.flankSign;
      const desiredRange = isChargeCavalryClass(formation.squadClass) ? 390
        : formation.squadClass === 'dragoon' ? 470
          : controller.preferredRange * 0.78;
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
      if (enemy.mode === 'routed' && !isChargeCavalryClass(formation.squadClass)) continue;
      const distance = this.distance(enemy.center, formation.center);
      const crowded = locks.get(enemy.id) ?? 0;
      const weakness = enemy.maxSoldiers() - enemy.aliveCount();
      const lanePenalty = Math.abs(enemy.center.y - formation.center.y) * 0.07;
      const objectiveBonus = enemy.mode === 'bannerAttack' ? -280 : 0;
      let classBonus = 0;
      if (isChargeCavalryClass(formation.squadClass) && isArtilleryClass(enemy.squadClass)) classBonus -= 640;
      if (formation.squadClass === 'hussar' && enemy.morale < 55) classBonus -= 280;
      if (isArtilleryClass(formation.squadClass) && canBannerAttackClass(enemy.squadClass)) classBonus -= 180;
      if (isArtilleryClass(formation.squadClass) && isChargeCavalryClass(enemy.squadClass)) classBonus += 260;
      if (formation.squadClass === 'lightInfantry' && isArtilleryClass(enemy.squadClass)) classBonus -= 180;
      if (formation.squadClass === 'sharpshooter' && (isChargeCavalryClass(enemy.squadClass) || enemy.squadClass === 'dragoon')) classBonus -= 520;
      if (formation.squadClass === 'cuirassier' && canBannerAttackClass(enemy.squadClass)) classBonus -= 120;
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
    const profile = artilleryProfile(formation.squadClass);
    let best: Formation | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of enemies) {
      const distance = this.distance(formation.center, enemy.center);
      if (distance > profile.range || distance < profile.minRange || enemy.mode === 'routed') continue;
      let nearbyFormations = 0;
      let nearbySoldiers = 0;
      for (const other of enemies) {
        if (this.distance(enemy.center, other.center) <= profile.blastRadius * 2.8 + 120) {
          nearbyFormations += 1;
          nearbySoldiers += other.aliveCount();
        }
      }
      const classScore = canBannerAttackClass(enemy.squadClass) ? -380 : isArtilleryClass(enemy.squadClass) ? -90 : 170;
      const densityBonus = -(nearbyFormations - 1) * 130 - nearbySoldiers * 5.2;
      const rangeScore = Math.abs(distance - profile.preferredRange) * 0.16;
      const objectiveBonus = enemy.mode === 'bannerAttack' ? -300 : 0;
      const moraleBonus = enemy.morale < 55 ? -90 : 0;
      const score = rangeScore + classScore + densityBonus + objectiveBonus + moraleBonus + Math.random() * 90;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  private selectBannerThreat(formation: Formation, enemies: Formation[], banner: Banner): Formation | null {
    const threats = enemies.filter((enemy) => enemy.mode !== 'routed' && (
      (enemy.mode === 'bannerAttack' && enemy.bannerTargetTeam === banner.team)
      || this.distance(enemy.center, banner.position) <= GAME_CONFIG.banner.aiDefenseRadius
    ));
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
    const lead = Math.min(extraLead, distance * 0.22);
    return { x: target.center.x + (dx / distance) * lead, y: target.center.y + (dy / distance) * lead };
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
      objectiveCommitment: GAME_CONFIG.ai.objectiveCommitmentMin + Math.random() * (GAME_CONFIG.ai.objectiveCommitmentMax - GAME_CONFIG.ai.objectiveCommitmentMin),
      preferredRange: GAME_CONFIG.ai.preferredRangeMin + Math.random() * (GAME_CONFIG.ai.preferredRangeMax - GAME_CONFIG.ai.preferredRangeMin),
      retreatRange: GAME_CONFIG.ai.retreatRangeMin + Math.random() * (GAME_CONFIG.ai.retreatRangeMax - GAME_CONFIG.ai.retreatRangeMin),
      flankOffset: GAME_CONFIG.ai.flankOffsetMin + Math.random() * (GAME_CONFIG.ai.flankOffsetMax - GAME_CONFIG.ai.flankOffsetMin),
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
    for (const squadClass of SQUAD_CLASSES) if (scores[squadClass] > scores[best]) best = squadClass;
    return best;
  }

  private averageMorale(formations: Formation[]): number {
    if (formations.length === 0) return 100;
    return formations.reduce((sum, formation) => sum + formation.morale, 0) / formations.length;
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
