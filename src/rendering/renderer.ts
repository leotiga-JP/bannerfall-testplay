import { ArtilleryShell } from '../entities/artilleryShell';
import { Banner } from '../entities/banner';
import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { Camera } from '../game/camera';
import { GAME_CONFIG } from '../game/config';
import type { AxeStrike, GameSnapshot } from '../game/game';
import { classShortLabel, isArtilleryClass, isChargeCavalryClass, type SquadClass, type Vec2, type WeaponType } from '../game/types';
import { artilleryProfile } from '../game/classProfiles';
import type { ArtilleryExplosion } from '../systems/artillerySystem';
import type { CorpseParticle, MuzzleFlash, SmokeParticle } from '../systems/combatSystem';
import type { MeleeStrike } from '../systems/meleeSystem';

export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(
    formations: Formation[],
    banners: Banner[],
    projectiles: Projectile[],
    artilleryShells: ArtilleryShell[],
    artilleryExplosions: ArtilleryExplosion[],
    smoke: SmokeParticle[],
    flashes: MuzzleFlash[],
    corpses: CorpseParticle[],
    strikes: MeleeStrike[],
    axeStrikes: AxeStrike[],
    snapshot: GameSnapshot,
    camera: Camera,
    formationLabels: ReadonlyMap<string, string> = new Map(),
    localFormationId: string | null = null,
  ): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);
    ctx.fillStyle = '#192014';
    ctx.fillRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);

    const shake = snapshot.introActive ? 0 : snapshot.screenShake;
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    camera.applyTransform(ctx);
    this.drawBattlefield(camera);
    this.drawBanners(banners, camera, snapshot.selectedWeapon);
    this.drawCorpses(corpses, camera);
    this.drawSmoke(smoke, camera);
    this.drawProjectiles(projectiles, camera);
    this.drawArtilleryShells(artilleryShells, camera);
    this.drawArtilleryExplosions(artilleryExplosions, camera);
    this.drawFormations(formations, camera, formationLabels, localFormationId);
    this.drawMuzzleFlashes(flashes, camera);
    this.drawMeleeStrikes(strikes, camera);
    this.drawAxeStrikes(axeStrikes, camera);
    if (snapshot.chargeAiming && snapshot.chargeAimTarget) {
      const player = formations.find((formation) => formation.isPlayerControlled);
      if (player) this.drawChargeArrow(player.center, snapshot.chargeAimTarget);
    }
    if (snapshot.debugAi) this.drawAiDebug(formations, camera);
    ctx.restore();

    this.drawMinimap(formations, banners, camera, snapshot);
    this.drawPlayerMode(snapshot);
    if (snapshot.introActive) this.drawIntro(snapshot);
    this.drawResult(snapshot);
  }

  private drawBattlefield(camera: Camera): void {
    const { ctx } = this;
    ctx.fillStyle = '#4c623f';
    ctx.fillRect(0, 0, GAME_CONFIG.world.width, GAME_CONFIG.world.height);

    const bounds = camera.visibleBounds(100);
    const grid = GAME_CONFIG.world.grid;
    const startX = Math.max(0, Math.floor(bounds.left / grid) * grid);
    const endX = Math.min(GAME_CONFIG.world.width, Math.ceil(bounds.right / grid) * grid);
    const startY = Math.max(0, Math.floor(bounds.top / grid) * grid);
    const endY = Math.min(GAME_CONFIG.world.height, Math.ceil(bounds.bottom / grid) * grid);

    ctx.strokeStyle = 'rgba(226, 220, 183, 0.07)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let x = startX; x <= endX; x += grid) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += grid) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(235, 221, 176, 0.35)';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.strokeRect(0, 0, GAME_CONFIG.world.width, GAME_CONFIG.world.height);

    this.drawHomeGround('blue', { x: GAME_CONFIG.banner.blueX, y: GAME_CONFIG.banner.y }, camera);
    this.drawHomeGround('red', { x: GAME_CONFIG.banner.redX, y: GAME_CONFIG.banner.y }, camera);

    this.drawSpawnCamp('blue', { x: GAME_CONFIG.army.respawnX + 170, y: GAME_CONFIG.banner.y }, camera);
    this.drawSpawnCamp('red', { x: GAME_CONFIG.world.width - GAME_CONFIG.army.respawnX - 170, y: GAME_CONFIG.banner.y }, camera);

    ctx.fillStyle = 'rgba(35, 48, 29, 0.28)';
    ctx.font = `${32 / camera.zoom}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('THE OPEN FIELD', GAME_CONFIG.world.width / 2, GAME_CONFIG.world.height / 2);
  }

  private drawHomeGround(team: 'blue' | 'red', point: Vec2, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = team === 'blue' ? 'rgba(93, 151, 225, 0.16)' : 'rgba(225, 93, 93, 0.16)';
    ctx.lineWidth = 12 / camera.zoom;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 360, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSpawnCamp(team: 'blue' | 'red', point: Vec2, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = team === 'blue' ? 'rgba(122, 176, 238, 0.34)' : 'rgba(238, 122, 122, 0.34)';
    ctx.fillStyle = team === 'blue' ? 'rgba(49, 88, 133, 0.10)' : 'rgba(140, 54, 54, 0.10)';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.setLineDash([18 / camera.zoom, 12 / camera.zoom]);
    ctx.fillRect(point.x - 330, point.y - 1650, 660, 3300);
    ctx.strokeRect(point.x - 330, point.y - 1650, 660, 3300);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(235, 226, 198, 0.5)';
    ctx.font = `${18 / camera.zoom}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('REINFORCEMENT CAMP', point.x, point.y - 1700);
    ctx.restore();
  }

  private drawBanners(banners: Banner[], camera: Camera, selectedWeapon: WeaponType): void {
    for (const banner of banners) {
      if (!this.pointVisible(banner.position, camera, 180)) continue;
      this.drawBanner(banner, camera, selectedWeapon);
    }
  }

  private drawBanner(banner: Banner, camera: Camera, selectedWeapon: WeaponType): void {
    const { ctx } = this;
    const pulse = banner.underAttackTimer > 0 ? 1 + Math.sin(performance.now() * 0.018) * 0.12 : 1;
    ctx.save();
    ctx.translate(banner.position.x, banner.position.y);

    ctx.fillStyle = banner.team === 'blue' ? 'rgba(69, 125, 205, 0.16)' : 'rgba(196, 69, 69, 0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, GAME_CONFIG.banner.visualRadius * 1.65 * pulse, 0, Math.PI * 2);
    ctx.fill();

    if (selectedWeapon === 'axe' && banner.team === 'red' && !banner.destroyed) {
      ctx.strokeStyle = 'rgba(255, 215, 92, 0.72)';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.setLineDash([11 / camera.zoom, 8 / camera.zoom]);
      ctx.beginPath();
      ctx.arc(0, 0, GAME_CONFIG.banner.clickRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = '#352b1f';
    ctx.lineWidth = 8 / camera.zoom;
    ctx.beginPath();
    ctx.moveTo(0, 52);
    ctx.lineTo(0, -70);
    ctx.stroke();

    if (!banner.destroyed) {
      ctx.fillStyle = banner.team === 'blue' ? '#376eaf' : '#aa3b3b';
      ctx.beginPath();
      ctx.moveTo(4, -67);
      ctx.lineTo(72, -48);
      ctx.lineTo(4, -22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = banner.team === 'blue' ? '#b8d6ff' : '#ffd0c7';
      ctx.lineWidth = 2 / camera.zoom;
      ctx.stroke();
    } else {
      ctx.rotate(0.74);
      ctx.strokeStyle = '#352b1f';
      ctx.lineWidth = 8 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(0, 42);
      ctx.lineTo(0, -66);
      ctx.stroke();
    }

    ctx.fillStyle = '#756349';
    ctx.beginPath();
    ctx.arc(0, 54, 24, 0, Math.PI * 2);
    ctx.fill();

    const barWidth = 120 / camera.zoom;
    const barHeight = 10 / camera.zoom;
    ctx.fillStyle = 'rgba(25, 20, 15, 0.82)';
    ctx.fillRect(-barWidth / 2, -105 / camera.zoom, barWidth, barHeight);
    ctx.fillStyle = banner.team === 'blue' ? '#6ba3e8' : '#e66d6d';
    ctx.fillRect(-barWidth / 2, -105 / camera.zoom, barWidth * banner.ratio, barHeight);
    ctx.strokeStyle = 'rgba(244, 234, 210, 0.75)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.strokeRect(-barWidth / 2, -105 / camera.zoom, barWidth, barHeight);

    ctx.fillStyle = '#f5e8c9';
    ctx.font = `bold ${14 / camera.zoom}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${banner.team.toUpperCase()} BANNER`, 0, -119 / camera.zoom);
    ctx.restore();
  }

  private drawFormations(
    formations: Formation[],
    camera: Camera,
    formationLabels: ReadonlyMap<string, string>,
    localFormationId: string | null,
  ): void {
    for (const formation of formations) {
      if (formation.aliveCount() === 0 || !this.pointVisible(formation.center, camera, 300)) continue;
      if (formation.id === localFormationId) this.drawPlayerSelection(formation, camera);
      if (formation.spawnProtectionTimer > 0) this.drawSpawnProtection(formation, camera);
      if (isArtilleryClass(formation.squadClass)) this.drawCannon(formation, camera, formation.mode === 'routed');
      for (const soldier of formation.soldiers) {
        if (!soldier.dead) {
          this.drawSoldier(
            soldier.position,
            soldier.direction,
            soldier.team,
            soldier.hitFlashTimer,
            soldier.meleeStabTimer,
            formation.squadClass,
            formation.weapon,
            formation.mode === 'bannerAttack',
            formation.mode === 'routed',
            camera,
          );
        }
      }
      this.drawFormationLabel(formation, camera, formationLabels, localFormationId);
    }
  }

  private drawSoldier(
    position: Vec2,
    direction: number,
    team: 'blue' | 'red',
    hitFlashTimer: number,
    stabTimer: number,
    squadClass: SquadClass,
    weapon: WeaponType,
    objectiveAttack: boolean,
    routed: boolean,
    camera: Camera,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(direction);

    const routedBody = '#777b80';
    const routedSkin = '#aaa9a3';
    const teamBody = routed ? routedBody : team === 'blue' ? '#315f99' : '#a43d3d';
    if (isChargeCavalryClass(squadClass) || squadClass === 'dragoon' || squadClass === 'horseArtillery') {
      ctx.fillStyle = hitFlashTimer > 0 ? '#fff1c6' : routed ? '#66686b' : '#5a4633';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hitFlashTimer > 0 ? '#fff1c6' : teamBody;
      ctx.fillRect(-3, -7, 10, 8);
      ctx.fillStyle = routed ? routedSkin : '#e4d2aa';
      ctx.beginPath();
      ctx.arc(6, -5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d8d7ca';
      ctx.lineWidth = 2 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(5, -2);
      ctx.lineTo(24 + (stabTimer > 0 ? 7 : 0), -2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (isArtilleryClass(squadClass)) {
      ctx.fillStyle = hitFlashTimer > 0 ? '#fff1c6' : teamBody;
      ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = routed ? routedSkin : '#e4d2aa';
      ctx.beginPath();
      ctx.arc(4, 0, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const body = hitFlashTimer > 0
      ? '#fff1c6'
      : routed ? routedBody : team === 'blue' ? '#315f99' : '#a43d3d';
    ctx.fillStyle = body;
    ctx.fillRect(
      -GAME_CONFIG.soldier.bodyLength / 2,
      -GAME_CONFIG.soldier.bodyWidth / 2,
      GAME_CONFIG.soldier.bodyLength,
      GAME_CONFIG.soldier.bodyWidth,
    );

    ctx.fillStyle = routed ? routedSkin : '#e4d2aa';
    ctx.beginPath();
    ctx.arc(3, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();

    if (weapon === 'axe' || objectiveAttack) {
      const swing = objectiveAttack ? Math.sin(performance.now() * 0.018 + position.x * 0.03) * 0.35 : 0;
      ctx.rotate(swing);
      ctx.strokeStyle = '#5b4027';
      ctx.lineWidth = 2.4 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(18, -2);
      ctx.stroke();
      ctx.strokeStyle = '#c5c9c6';
      ctx.lineWidth = 4 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(17, -7);
      ctx.lineTo(20, 3);
      ctx.stroke();
    } else {
      const stabExtension = weapon === 'bayonet' && stabTimer > 0 ? 8 : 0;
      ctx.strokeStyle = '#342c21';
      ctx.lineWidth = 2 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(17 + stabExtension, -2);
      ctx.stroke();
      if (weapon === 'bayonet' || stabTimer > 0) {
        ctx.strokeStyle = '#d8d7ca';
        ctx.lineWidth = 1.2 / Math.max(0.72, camera.zoom);
        ctx.beginPath();
        ctx.moveTo(17 + stabExtension, -2);
        ctx.lineTo(24 + stabExtension, -2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawCannon(formation: Formation, camera: Camera, routed = false): void {
    const { ctx } = this;
    const profile = artilleryProfile(formation.squadClass);
    const rightX = -Math.sin(formation.direction);
    const rightY = Math.cos(formation.direction);
    for (let i = 0; i < profile.guns; i += 1) {
      const lateral = (i - (profile.guns - 1) / 2) * 34;
      ctx.save();
      ctx.translate(formation.center.x + rightX * lateral, formation.center.y + rightY * lateral);
      ctx.rotate(formation.direction);
      const heavy = formation.squadClass === 'heavyArtillery';
      const horse = formation.squadClass === 'horseArtillery';
      ctx.strokeStyle = routed ? '#5f6265' : '#2c2923';
      ctx.lineWidth = (heavy ? 10 : horse ? 5 : 7) / Math.max(0.7, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(heavy ? 58 : horse ? 37 : 43, 0);
      ctx.stroke();
      ctx.fillStyle = routed ? '#777a7d' : '#4b4032';
      const wheel = heavy ? 13 : horse ? 8 : 10;
      ctx.beginPath();
      ctx.arc(-5, -10, wheel, 0, Math.PI * 2);
      ctx.arc(-5, 10, wheel, 0, Math.PI * 2);
      ctx.fill();
      if (formation.artilleryDeployed) {
        ctx.strokeStyle = 'rgba(255, 219, 115, 0.75)';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath();
        ctx.arc(0, 0, heavy ? 34 : 28, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawPlayerSelection(formation: Formation, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 108, 0.92)';
    ctx.lineWidth = 3 / camera.zoom;
    ctx.setLineDash([12 / camera.zoom, 8 / camera.zoom]);
    ctx.beginPath();
    ctx.arc(formation.center.x, formation.center.y, 205, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSpawnProtection(formation: Formation, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(242, 235, 184, 0.52)';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.beginPath();
    ctx.arc(formation.center.x, formation.center.y, 196, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawFormationLabel(
    formation: Formation,
    camera: Camera,
    formationLabels: ReadonlyMap<string, string>,
    localFormationId: string | null,
  ): void {
    const { ctx } = this;
    const size = Math.max(11, 14 / camera.zoom);
    ctx.textAlign = 'center';
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    const customLabel = formationLabels.get(formation.id);
    const isLocal = formation.id === localFormationId;
    ctx.fillStyle = formation.mode === 'routed'
      ? '#b9bbbd'
      : customLabel
        ? (isLocal ? '#ffe18a' : '#fff0b8')
        : formation.team === 'blue' ? '#a9cfff' : '#ffb0b0';
    const suffix = isLocal ? ' · YOU' : '';
    const objective = formation.mode === 'bannerAttack' ? ' · AXE' : '';
    const classTag = classShortLabel(formation.squadClass);
    const deploy = isArtilleryClass(formation.squadClass) && formation.artilleryDeployed ? ' · DEPLOYED' : '';
    const rout = formation.mode === 'routed' ? ' · ROUT' : formation.isShaken() ? ' · SHAKEN' : '';
    const name = customLabel ?? formation.id;
    ctx.fillText(`${name} [${classTag}]${suffix}${objective}${deploy}${rout}  ${formation.aliveCount()} · M${Math.round(formation.morale)}`, formation.center.x, formation.center.y - 54);
    const moraleWidth = 78;
    const moraleY = formation.center.y - 44;
    ctx.fillStyle = 'rgba(20,18,14,.72)';
    ctx.fillRect(formation.center.x - moraleWidth / 2, moraleY, moraleWidth, 4 / camera.zoom);
    ctx.fillStyle = formation.mode === 'routed'
      ? '#9a9da1'
      : formation.morale < GAME_CONFIG.morale.routThreshold ? '#d45a55' : formation.morale < GAME_CONFIG.morale.shakenThreshold ? '#d8a64f' : '#7fc48d';
    ctx.fillRect(formation.center.x - moraleWidth / 2, moraleY, moraleWidth * formation.moraleRatio(), 4 / camera.zoom);
  }

  private drawProjectiles(projectiles: Projectile[], camera: Camera): void {
    const { ctx } = this;
    ctx.lineWidth = 1.6 / camera.zoom;
    for (const projectile of projectiles) {
      if (!this.pointVisible(projectile.position, camera, 80)) continue;
      ctx.strokeStyle = projectile.team === 'blue' ? '#e8f2ff' : '#ffe9dc';
      ctx.beginPath();
      const tail = projectile.trail[projectile.trail.length - 1] ?? projectile.position;
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(projectile.position.x, projectile.position.y);
      ctx.stroke();
    }
  }

  private drawArtilleryShells(shells: ArtilleryShell[], camera: Camera): void {
    const { ctx } = this;
    for (const shell of shells) {
      if (!this.pointVisible(shell.position, camera, 80)) continue;
      ctx.fillStyle = '#211d18';
      ctx.beginPath();
      ctx.arc(shell.position.x, shell.position.y, 5 / Math.max(0.7, camera.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawArtilleryExplosions(explosions: ArtilleryExplosion[], camera: Camera): void {
    const { ctx } = this;
    for (const explosion of explosions) {
      if (!this.pointVisible(explosion.position, camera, 180)) continue;
      const t = 1 - explosion.life / explosion.maxLife;
      const radius = (explosion.radius ?? GAME_CONFIG.artillery.blastRadius) * (0.3 + t * 0.9);
      ctx.fillStyle = `rgba(255, 194, 72, ${0.34 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(explosion.position.x, explosion.position.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 231, 172, ${0.65 * (1 - t)})`;
      ctx.lineWidth = 4 / camera.zoom;
      ctx.beginPath();
      ctx.arc(explosion.position.x, explosion.position.y, radius * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawMuzzleFlashes(flashes: MuzzleFlash[], camera: Camera): void {
    const { ctx } = this;
    for (const flash of flashes) {
      if (!this.pointVisible(flash.position, camera, 60)) continue;
      const ratio = flash.life / GAME_CONFIG.effects.flashLifetime;
      ctx.save();
      ctx.translate(flash.position.x, flash.position.y);
      ctx.rotate(flash.direction);
      ctx.globalAlpha = Math.max(0, ratio);
      ctx.fillStyle = '#ffd35a';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(18, -5);
      ctx.lineTo(12, 0);
      ctx.lineTo(18, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSmoke(smoke: SmokeParticle[], camera: Camera): void {
    const { ctx } = this;
    for (const particle of smoke) {
      if (!this.pointVisible(particle.position, camera, 80)) continue;
      const t = Math.min(1, particle.age / particle.lifetime);
      const radius = particle.size * (0.65 + t * 1.55);
      ctx.fillStyle = `rgba(224, 224, 213, ${0.24 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(particle.position.x, particle.position.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCorpses(corpses: CorpseParticle[], camera: Camera): void {
    const { ctx } = this;
    for (const corpse of corpses) {
      if (!this.pointVisible(corpse.position, camera, 60)) continue;
      const alpha = Math.min(1, corpse.life / 0.5, corpse.life / corpse.maxLife + 0.2);
      ctx.save();
      ctx.translate(corpse.position.x, corpse.position.y);
      ctx.rotate(corpse.angle);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = corpse.team === 'blue' ? '#233e68' : '#742226';
      ctx.fillRect(-9, -4.5, 18, 9);
      ctx.restore();
    }
  }

  private drawMeleeStrikes(strikes: MeleeStrike[], camera: Camera): void {
    const { ctx } = this;
    for (const strike of strikes) {
      if (!this.pointVisible(strike.start, camera, 60)) continue;
      const alpha = Math.max(0, strike.life / GAME_CONFIG.effects.meleeStrikeLifetime);
      ctx.strokeStyle = strike.team === 'blue'
        ? `rgba(208, 231, 255, ${alpha})`
        : `rgba(255, 218, 205, ${alpha})`;
      ctx.lineWidth = 2.4 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(strike.start.x, strike.start.y);
      ctx.lineTo(strike.end.x, strike.end.y);
      ctx.stroke();
    }
  }

  private drawAxeStrikes(strikes: AxeStrike[], camera: Camera): void {
    const { ctx } = this;
    for (const strike of strikes) {
      if (!this.pointVisible(strike.start, camera, 80)) continue;
      const alpha = Math.max(0, strike.life / GAME_CONFIG.effects.axeStrikeLifetime);
      ctx.strokeStyle = `rgba(255, 216, 112, ${alpha})`;
      ctx.lineWidth = 4 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(strike.start.x, strike.start.y);
      ctx.lineTo(strike.end.x, strike.end.y);
      ctx.stroke();
    }
  }

  private drawChargeArrow(start: Vec2, end: Vec2): void {
    const { ctx } = this;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    const px = -ny;
    const py = nx;
    const head = 30;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 98, 0.95)';
    ctx.fillStyle = 'rgba(255, 220, 98, 0.95)';
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x - nx * head, end.y - ny * head);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - nx * head + px * 16, end.y - ny * head + py * 16);
    ctx.lineTo(end.x - nx * head - px * 16, end.y - ny * head - py * 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawAiDebug(formations: Formation[], camera: Camera): void {
    const { ctx } = this;
    const byId = new Map(formations.map((formation) => [formation.id, formation]));
    for (const formation of formations) {
      if (formation.aliveCount() === 0 || formation.isPlayerControlled || !this.pointVisible(formation.center, camera, 300)) continue;
      const target = formation.debugTargetId ? byId.get(formation.debugTargetId) : undefined;
      if (target) {
        ctx.strokeStyle = formation.team === 'blue'
          ? 'rgba(123, 182, 255, 0.24)'
          : 'rgba(255, 125, 125, 0.24)';
        ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(formation.center.x, formation.center.y);
        ctx.lineTo(target.center.x, target.center.y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20, 18, 14, 0.78)';
      const width = 164 / camera.zoom;
      const height = 34 / camera.zoom;
      ctx.fillRect(formation.center.x - width / 2, formation.center.y + 52, width, height);
      ctx.fillStyle = '#f1e6c9';
      ctx.font = `${11 / camera.zoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(
        `${formation.squadClass.toUpperCase()} · ${formation.debugIntent} → ${formation.debugTargetId ?? '-'}`,
        formation.center.x,
        formation.center.y + 73 / camera.zoom,
      );
    }
  }

  private drawMinimap(formations: Formation[], banners: Banner[], camera: Camera, snapshot: GameSnapshot): void {
    const { ctx } = this;
    const width = GAME_CONFIG.minimap.width;
    const height = GAME_CONFIG.minimap.height;
    const x = GAME_CONFIG.viewport.width - width - GAME_CONFIG.minimap.margin;
    const y = GAME_CONFIG.viewport.height - height - GAME_CONFIG.minimap.margin;
    const sx = width / GAME_CONFIG.world.width;
    const sy = height / GAME_CONFIG.world.height;

    ctx.save();
    ctx.fillStyle = 'rgba(19, 20, 15, 0.86)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = snapshot.cameraFollow ? 'rgba(224, 211, 170, 0.65)' : 'rgba(255, 218, 115, 0.88)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);

    for (const formation of formations) {
      if (formation.aliveCount() === 0) continue;
      ctx.fillStyle = formation.mode === 'routed'
        ? (formation.isPlayerControlled ? '#c7c9cb' : '#96999d')
        : formation.isPlayerControlled
          ? '#ffe073'
          : formation.team === 'blue' ? '#78aef1' : '#e46e6e';
      const px = x + formation.center.x * sx;
      const py = y + formation.center.y * sy;
      const size = formation.isPlayerControlled ? 7 : formation.mode === 'bannerAttack' ? 6 : 4;
      if (isChargeCavalryClass(formation.squadClass)) {
        ctx.beginPath();
        ctx.moveTo(px + size, py);
        ctx.lineTo(px - size, py - size * 0.8);
        ctx.lineTo(px - size, py + size * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (isArtilleryClass(formation.squadClass)) {
        ctx.beginPath();
        ctx.arc(px, py, size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
    }

    for (const banner of banners) {
      const px = x + banner.position.x * sx;
      const py = y + banner.position.y * sy;
      ctx.fillStyle = banner.destroyed ? '#5b5142' : banner.team === 'blue' ? '#95c5ff' : '#ff9090';
      ctx.beginPath();
      ctx.moveTo(px, py - 7);
      ctx.lineTo(px + 7, py);
      ctx.lineTo(px, py + 7);
      ctx.lineTo(px - 7, py);
      ctx.closePath();
      ctx.fill();
    }

    const bounds = camera.visibleBounds();
    ctx.strokeStyle = '#f4e9c9';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x + bounds.left * sx,
      y + bounds.top * sy,
      (bounds.right - bounds.left) * sx,
      (bounds.bottom - bounds.top) * sy,
    );
    ctx.fillStyle = 'rgba(244, 233, 201, 0.9)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TACTICAL MAP · CLICK TO JUMP', x + 7, y + 12);
    ctx.restore();
  }

  private drawPlayerMode(snapshot: GameSnapshot): void {
    let text = '';
    if (snapshot.chargeAiming) text = snapshot.playerClass === 'cavalry' ? 'CAVALRY CHARGE — RELEASE TO COMMIT' : 'CHARGE VECTOR — RELEASE TO COMMIT';
    else if (snapshot.playerMode === 'charging') text = snapshot.playerClass === 'cavalry' ? 'CAVALRY — FULL CHARGE' : 'PLAYER SQUAD — CHARGING';
    else if (snapshot.playerMode === 'melee') text = 'PLAYER SQUAD — BAYONET MELEE';
    else if (snapshot.playerMode === 'reforming') text = 'PLAYER SQUAD — REFORMING';
    else if (snapshot.playerMode === 'bannerAttack') {
      text = snapshot.playerBannerInRange ? 'DESTROYING ENEMY BANNER' : 'ADVANCING TO ENEMY BANNER';
    }
    if (!text) return;

    const { ctx } = this;
    ctx.fillStyle = 'rgba(25, 20, 14, 0.72)';
    ctx.fillRect(GAME_CONFIG.viewport.width / 2 - 205, 16, 410, 34);
    ctx.strokeStyle = 'rgba(232, 210, 160, 0.72)';
    ctx.strokeRect(GAME_CONFIG.viewport.width / 2 - 205, 16, 410, 34);
    ctx.fillStyle = '#f4ddb0';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, GAME_CONFIG.viewport.width / 2, 38);
  }

  private drawIntro(snapshot: GameSnapshot): void {
    const { ctx } = this;
    if (snapshot.introStage === 'pan-enemy' || snapshot.introStage === 'return-player') return;

    const isEnemy = snapshot.introStage === 'enemy-banner';
    ctx.save();
    const panelWidth = isEnemy ? 560 : 420;
    const panelHeight = isEnemy ? 132 : 82;
    const x = GAME_CONFIG.viewport.width / 2 - panelWidth / 2;
    const y = GAME_CONFIG.viewport.height * 0.68 - panelHeight / 2;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.82)';
    ctx.fillRect(x, y, panelWidth, panelHeight);
    ctx.strokeStyle = 'rgba(236, 218, 174, 0.82)';
    ctx.strokeRect(x, y, panelWidth, panelHeight);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4e7c7';
    ctx.font = 'bold 25px Georgia, serif';
    ctx.fillText(isEnemy ? 'ENEMY BANNER' : 'YOUR BANNER', GAME_CONFIG.viewport.width / 2, y + 35);
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#d7c8a8';
    if (isEnemy) {
      ctx.fillText('この旗を破壊すれば勝利', GAME_CONFIG.viewport.width / 2, y + 66);
      ctx.fillStyle = '#ffe08a';
      ctx.fillText('[3] AXE を選択 → 敵旗を右クリック', GAME_CONFIG.viewport.width / 2, y + 96);
      ctx.fillStyle = '#b7aa91';
      ctx.fillText('敵部隊を退け、旗を壊す時間を作れ', GAME_CONFIG.viewport.width / 2, y + 119);
    } else {
      ctx.fillText('この旗を守り抜け', GAME_CONFIG.viewport.width / 2, y + 63);
    }
    ctx.restore();
  }

  private drawResult(snapshot: GameSnapshot): void {
    if (!snapshot.winner) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.68)';
    ctx.fillRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5ead0';
    ctx.font = 'bold 48px Georgia, serif';
    ctx.fillText('BANNERFALL', GAME_CONFIG.viewport.width / 2, GAME_CONFIG.viewport.height / 2 - 38);
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText(
      snapshot.winner === 'blue' ? 'RED BANNER HAS FALLEN — BLUE VICTORY' : 'BLUE BANNER HAS FALLEN — RED VICTORY',
      GAME_CONFIG.viewport.width / 2,
      GAME_CONFIG.viewport.height / 2 + 4,
    );
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#d6c8aa';
    ctx.fillText('R で再戦', GAME_CONFIG.viewport.width / 2, GAME_CONFIG.viewport.height / 2 + 43);
  }

  private pointVisible(point: Vec2, camera: Camera, margin: number): boolean {
    const bounds = camera.visibleBounds(margin);
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
  }
}
