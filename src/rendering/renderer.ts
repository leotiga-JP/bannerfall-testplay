import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { Unit } from '../entities/unit';
import { GAME_CONFIG } from '../game/config';
import type { GameSnapshot } from '../game/game';
import type { CorpseParticle, MuzzleFlash, SmokeParticle } from '../systems/combatSystem';

export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(
    player: Formation,
    enemy: Formation,
    projectiles: Projectile[],
    smoke: SmokeParticle[],
    flashes: MuzzleFlash[],
    corpses: CorpseParticle[],
    snapshot: GameSnapshot,
  ): void {
    const shakeX = snapshot.screenShake > 0 ? (Math.random() - 0.5) * snapshot.screenShake * 2 : 0;
    const shakeY = snapshot.screenShake > 0 ? (Math.random() - 0.5) * snapshot.screenShake * 2 : 0;

    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);
    this.drawBackground();
    this.drawRangeHint(player, enemy);
    this.drawCorpses(corpses);
    this.drawFormation(enemy);
    this.drawFormation(player);
    this.drawProjectiles(projectiles);
    this.drawMuzzleFlashes(flashes);
    this.drawSmoke(smoke);
    this.drawResult(snapshot);
    this.ctx.restore();
  }

  private drawBackground(): void {
    const { ctx } = this;
    ctx.fillStyle = '#455b39';
    ctx.fillRect(-20, -20, GAME_CONFIG.width + 40, GAME_CONFIG.height + 40);

    ctx.strokeStyle = 'rgba(25, 42, 24, 0.20)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GAME_CONFIG.width; x += GAME_CONFIG.backgroundGrid) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, GAME_CONFIG.height);
      ctx.stroke();
    }
    for (let y = 0; y <= GAME_CONFIG.height; y += GAME_CONFIG.backgroundGrid) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(GAME_CONFIG.width, y + 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(242, 225, 178, 0.05)';
    for (let i = 0; i < 70; i += 1) {
      const x = (i * 149) % GAME_CONFIG.width;
      const y = (i * 83) % GAME_CONFIG.height;
      ctx.fillRect(x, y, 2, 2);
    }

    ctx.strokeStyle = '#8e8060';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, GAME_CONFIG.width - 4, GAME_CONFIG.height - 4);
  }

  private drawFormation(formation: Formation): void {
    for (const soldier of formation.soldiers) {
      if (!soldier.dead) this.drawSoldier(soldier);
    }
    this.drawFormationMarker(formation);
  }

  private drawSoldier(unit: Unit): void {
    const { ctx } = this;
    const player = unit.team === 'player';
    const coat = player ? '#315c9e' : '#aa2f35';
    const trim = player ? '#d7e4f5' : '#f3d6b5';
    const hat = '#1b1c1d';

    ctx.save();
    ctx.translate(unit.position.x, unit.position.y);
    ctx.rotate(unit.direction);

    if (unit.hitFlashTimer > 0) {
      ctx.shadowColor = '#fff7d2';
      ctx.shadowBlur = 12;
    }

    ctx.fillStyle = '#2b241d';
    ctx.fillRect(-7, -8, 13, 16);
    ctx.fillStyle = coat;
    ctx.fillRect(-5, -7, 10, 14);
    ctx.fillStyle = trim;
    ctx.fillRect(0, -7, 2, 14);

    ctx.fillStyle = '#d7b58a';
    ctx.fillRect(4, -4, 5, 8);
    ctx.fillStyle = hat;
    ctx.fillRect(2, -6, 6, 12);

    ctx.fillStyle = '#4c3a25';
    ctx.fillRect(5, -1, 21, 2);
    ctx.fillStyle = '#c0b7a2';
    ctx.fillRect(21, -1, 8, 1);
    ctx.restore();
  }

  private drawFormationMarker(formation: Formation): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(formation.center.x, formation.center.y);
    ctx.rotate(formation.direction);
    ctx.strokeStyle = formation.team === 'player' ? 'rgba(160,202,255,0.32)' : 'rgba(255,175,175,0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(0, -178);
    ctx.lineTo(0, 178);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawProjectiles(projectiles: Projectile[]): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const projectile of projectiles) {
      if (projectile.life <= 0) continue;
      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1;
      const nx = projectile.velocity.x / speed;
      const ny = projectile.velocity.y / speed;
      ctx.strokeStyle = 'rgba(255, 237, 174, 0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(projectile.position.x - nx * 11, projectile.position.y - ny * 11);
      ctx.lineTo(projectile.position.x + nx * 2, projectile.position.y + ny * 2);
      ctx.stroke();
    }
  }

  private drawMuzzleFlashes(flashes: MuzzleFlash[]): void {
    const { ctx } = this;
    for (const flash of flashes) {
      const ratio = flash.life / GAME_CONFIG.effects.flashLifetime;
      ctx.save();
      ctx.translate(flash.position.x, flash.position.y);
      ctx.rotate(flash.direction);
      ctx.globalAlpha = Math.max(0, ratio);
      ctx.fillStyle = '#ffd35a';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(20, -6);
      ctx.lineTo(13, 0);
      ctx.lineTo(20, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSmoke(smoke: SmokeParticle[]): void {
    const { ctx } = this;
    for (const particle of smoke) {
      const t = Math.min(1, particle.age / particle.lifetime);
      const radius = particle.size * (0.65 + t * 1.7);
      ctx.fillStyle = `rgba(224, 224, 213, ${0.28 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(particle.position.x, particle.position.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCorpses(corpses: CorpseParticle[]): void {
    const { ctx } = this;
    for (const corpse of corpses) {
      const alpha = Math.min(1, corpse.life / 0.55, corpse.life / corpse.maxLife + 0.25);
      ctx.save();
      ctx.translate(corpse.position.x, corpse.position.y);
      ctx.rotate(corpse.angle);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = corpse.team === 'player' ? '#233e68' : '#742226';
      ctx.fillRect(-10, -5, 20, 10);
      ctx.restore();
    }
  }

  private drawRangeHint(player: Formation, enemy: Formation): void {
    const { ctx } = this;
    const distance = Math.hypot(enemy.center.x - player.center.x, enemy.center.y - player.center.y);
    ctx.fillStyle = 'rgba(245, 237, 211, 0.78)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LINE DISTANCE ${distance.toFixed(0)}px`, GAME_CONFIG.width / 2, 22);
  }

  private drawResult(snapshot: GameSnapshot): void {
    if (!snapshot.winner) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.58)';
    ctx.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5ead0';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(snapshot.winner === 'player' ? 'THE BLUE LINE HOLDS' : 'THE RED LINE PREVAILS', GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 10);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#d6c8aa';
    ctx.fillText('R で再戦', GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 + 24);
  }
}
