import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { Camera } from '../game/camera';
import { GAME_CONFIG } from '../game/config';
import type { GameSnapshot } from '../game/game';
import type { Vec2 } from '../game/types';
import type { CorpseParticle, MuzzleFlash, SmokeParticle } from '../systems/combatSystem';
import type { MeleeStrike } from '../systems/meleeSystem';

export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(
    formations: Formation[],
    projectiles: Projectile[],
    smoke: SmokeParticle[],
    flashes: MuzzleFlash[],
    corpses: CorpseParticle[],
    strikes: MeleeStrike[],
    snapshot: GameSnapshot,
    camera: Camera,
  ): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);
    ctx.fillStyle = '#192014';
    ctx.fillRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);

    const shake = snapshot.screenShake;
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    camera.applyTransform(ctx);
    this.drawBattlefield(camera);
    this.drawCorpses(corpses, camera);
    this.drawSmoke(smoke, camera);
    this.drawProjectiles(projectiles, camera);
    this.drawFormations(formations, camera);
    this.drawMuzzleFlashes(flashes, camera);
    this.drawMeleeStrikes(strikes, camera);
    if (snapshot.chargeAiming && snapshot.chargeAimTarget) {
      const player = formations.find((formation) => formation.isPlayerControlled);
      if (player) this.drawChargeArrow(player.center, snapshot.chargeAimTarget);
    }
    if (snapshot.debugAi) this.drawAiDebug(formations, camera);
    ctx.restore();

    this.drawMinimap(formations, camera);
    this.drawPlayerMode(snapshot);
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

    ctx.fillStyle = 'rgba(35, 48, 29, 0.32)';
    ctx.font = `${34 / camera.zoom}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText('THE OPEN FIELD', GAME_CONFIG.world.width / 2, GAME_CONFIG.world.height / 2);
  }

  private drawFormations(formations: Formation[], camera: Camera): void {
    for (const formation of formations) {
      if (formation.aliveCount() === 0 || !this.pointVisible(formation.center, camera, 260)) continue;
      if (formation.isPlayerControlled) this.drawPlayerSelection(formation, camera);
      for (const soldier of formation.soldiers) {
        if (!soldier.dead) this.drawSoldier(soldier.position, soldier.direction, soldier.team, soldier.hitFlashTimer, soldier.meleeStabTimer, camera);
      }
      this.drawFormationLabel(formation, camera);
    }
  }

  private drawSoldier(
    position: Vec2,
    direction: number,
    team: 'blue' | 'red',
    hitFlashTimer: number,
    stabTimer: number,
    camera: Camera,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(direction);

    const body = hitFlashTimer > 0
      ? '#fff1c6'
      : team === 'blue' ? '#315f99' : '#a43d3d';
    ctx.fillStyle = body;
    ctx.fillRect(
      -GAME_CONFIG.soldier.bodyLength / 2,
      -GAME_CONFIG.soldier.bodyWidth / 2,
      GAME_CONFIG.soldier.bodyLength,
      GAME_CONFIG.soldier.bodyWidth,
    );

    ctx.fillStyle = '#e4d2aa';
    ctx.beginPath();
    ctx.arc(3, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();

    const stabExtension = stabTimer > 0 ? 8 : 0;
    ctx.strokeStyle = '#342c21';
    ctx.lineWidth = 2 / Math.max(0.72, camera.zoom);
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(17 + stabExtension, -2);
    ctx.stroke();
    ctx.strokeStyle = '#d8d7ca';
    ctx.lineWidth = 1.2 / Math.max(0.72, camera.zoom);
    ctx.beginPath();
    ctx.moveTo(17 + stabExtension, -2);
    ctx.lineTo(24 + stabExtension, -2);
    ctx.stroke();
    ctx.restore();
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

  private drawFormationLabel(formation: Formation, camera: Camera): void {
    const { ctx } = this;
    const size = Math.max(11, 14 / camera.zoom);
    ctx.textAlign = 'center';
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    ctx.fillStyle = formation.isPlayerControlled
      ? '#ffe18a'
      : formation.team === 'blue' ? '#a9cfff' : '#ffb0b0';
    const suffix = formation.isPlayerControlled ? ' · YOU' : '';
    ctx.fillText(`${formation.id}${suffix}  ${formation.aliveCount()}`, formation.center.x, formation.center.y - 48);
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
      const width = 145 / camera.zoom;
      const height = 34 / camera.zoom;
      ctx.fillRect(formation.center.x - width / 2, formation.center.y + 52, width, height);
      ctx.fillStyle = '#f1e6c9';
      ctx.font = `${11 / camera.zoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(
        `${formation.debugIntent} → ${formation.debugTargetId ?? '-'}`,
        formation.center.x,
        formation.center.y + 73 / camera.zoom,
      );
    }
  }

  private drawMinimap(formations: Formation[], camera: Camera): void {
    const { ctx } = this;
    const width = 214;
    const height = 138;
    const x = GAME_CONFIG.viewport.width - width - 18;
    const y = GAME_CONFIG.viewport.height - height - 18;
    const sx = width / GAME_CONFIG.world.width;
    const sy = height / GAME_CONFIG.world.height;

    ctx.save();
    ctx.fillStyle = 'rgba(19, 20, 15, 0.78)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = 'rgba(224, 211, 170, 0.65)';
    ctx.strokeRect(x, y, width, height);

    for (const formation of formations) {
      if (formation.aliveCount() === 0) continue;
      ctx.fillStyle = formation.isPlayerControlled
        ? '#ffe073'
        : formation.team === 'blue' ? '#78aef1' : '#e46e6e';
      const px = x + formation.center.x * sx;
      const py = y + formation.center.y * sy;
      const size = formation.isPlayerControlled ? 5 : 3;
      ctx.fillRect(px - size / 2, py - size / 2, size, size);
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
    ctx.fillText('TACTICAL MAP', x + 7, y + 12);
    ctx.restore();
  }

  private drawPlayerMode(snapshot: GameSnapshot): void {
    let text = '';
    if (snapshot.chargeAiming) text = 'CHARGE VECTOR — RELEASE TO COMMIT';
    else if (snapshot.playerMode === 'charging') text = 'PLAYER SQUAD — CHARGING';
    else if (snapshot.playerMode === 'melee') text = 'PLAYER SQUAD — BAYONET MELEE';
    else if (snapshot.playerMode === 'reforming') text = 'PLAYER SQUAD — REFORMING';
    if (!text) return;

    const { ctx } = this;
    ctx.fillStyle = 'rgba(25, 20, 14, 0.72)';
    ctx.fillRect(GAME_CONFIG.viewport.width / 2 - 190, 16, 380, 34);
    ctx.strokeStyle = 'rgba(232, 210, 160, 0.72)';
    ctx.strokeRect(GAME_CONFIG.viewport.width / 2 - 190, 16, 380, 34);
    ctx.fillStyle = '#f4ddb0';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, GAME_CONFIG.viewport.width / 2, 38);
  }

  private drawResult(snapshot: GameSnapshot): void {
    if (!snapshot.winner) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.64)';
    ctx.fillRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5ead0';
    ctx.font = 'bold 38px Georgia, serif';
    ctx.fillText(
      snapshot.winner === 'blue' ? 'BLUE ARMY VICTORIOUS' : 'RED ARMY VICTORIOUS',
      GAME_CONFIG.viewport.width / 2,
      GAME_CONFIG.viewport.height / 2 - 12,
    );
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#d6c8aa';
    ctx.fillText('R で戦場を再生成', GAME_CONFIG.viewport.width / 2, GAME_CONFIG.viewport.height / 2 + 26);
  }

  private pointVisible(point: Vec2, camera: Camera, margin: number): boolean {
    const bounds = camera.visibleBounds(margin);
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
  }
}
