import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { Unit } from '../entities/unit';
import { GAME_CONFIG } from '../game/config';
import type { GameSnapshot } from '../game/game';
import type { CorpseParticle, MuzzleFlash, SmokeParticle } from '../systems/combatSystem';
import type { MeleeStrike } from '../systems/meleeSystem';

export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(
    player: Formation,
    enemy: Formation,
    projectiles: Projectile[],
    smoke: SmokeParticle[],
    flashes: MuzzleFlash[],
    corpses: CorpseParticle[],
    meleeStrikes: MeleeStrike[],
    snapshot: GameSnapshot,
  ): void {
    const shakeX = snapshot.screenShake > 0 ? (Math.random() - 0.5) * snapshot.screenShake * 2 : 0;
    const shakeY = snapshot.screenShake > 0 ? (Math.random() - 0.5) * snapshot.screenShake * 2 : 0;

    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);
    this.drawBackground();
    this.drawRangeHint(player, enemy, snapshot);
    this.drawChargeArrow(player, snapshot);
    this.drawCorpses(corpses);
    this.drawFormation(enemy);
    this.drawFormation(player);
    this.drawProjectiles(projectiles);
    this.drawMeleeStrikes(meleeStrikes);
    this.drawMuzzleFlashes(flashes);
    this.drawSmoke(smoke);
    this.drawModeBanner(snapshot);
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
    for (let i = 0; i < 100; i += 1) {
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
    if (formation.mode !== 'melee') this.drawFormationMarker(formation);
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

    const stabExtension = unit.meleeStabTimer > 0 ? 9 : 0;
    ctx.fillStyle = '#4c3a25';
    ctx.fillRect(5, -1, 21 + stabExtension, 2);
    ctx.fillStyle = '#c0b7a2';
    ctx.fillRect(21 + stabExtension, -1, 10, 1);
    ctx.beginPath();
    ctx.moveTo(31 + stabExtension, -2);
    ctx.lineTo(38 + stabExtension, 0);
    ctx.lineTo(31 + stabExtension, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawFormationMarker(formation: Formation): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(formation.center.x, formation.center.y);
    ctx.rotate(formation.direction);
    const charging = formation.mode === 'charging';
    ctx.strokeStyle = formation.team === 'player'
      ? charging ? 'rgba(255, 225, 132, 0.72)' : 'rgba(160,202,255,0.32)'
      : charging ? 'rgba(255, 190, 132, 0.62)' : 'rgba(255,175,175,0.18)';
    ctx.lineWidth = charging ? 2 : 1;
    ctx.setLineDash(charging ? [3, 4] : [5, 6]);
    ctx.beginPath();
    ctx.moveTo(0, -205);
    ctx.lineTo(0, 205);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawChargeArrow(player: Formation, snapshot: GameSnapshot): void {
    if (!snapshot.chargeAiming || !snapshot.chargeAimTarget || player.mode !== 'line') return;
    const { ctx } = this;
    const start = player.center;
    const end = snapshot.chargeAimTarget;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;
    const nx = dx / distance;
    const ny = dy / distance;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 224, 116, 0.92)';
    ctx.fillStyle = 'rgba(255, 224, 116, 0.95)';
    ctx.shadowColor = 'rgba(255, 205, 80, 0.45)';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(start.x + nx * 26, start.y + ny * 26);
    ctx.lineTo(end.x - nx * 17, end.y - ny * 17);
    ctx.stroke();
    ctx.setLineDash([]);

    const sideX = -ny;
    const sideY = nx;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - nx * 28 + sideX * 13, end.y - ny * 28 + sideY * 13);
    ctx.lineTo(end.x - nx * 28 - sideX * 13, end.y - ny * 28 - sideY * 13);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff0b5';
    ctx.fillText('RELEASE TO CHARGE', (start.x + end.x) / 2, (start.y + end.y) / 2 - 13);
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

  private drawMeleeStrikes(strikes: MeleeStrike[]): void {
    const { ctx } = this;
    ctx.lineCap = 'round';
    for (const strike of strikes) {
      const alpha = Math.max(0, strike.life / GAME_CONFIG.effects.meleeStrikeLifetime);
      ctx.strokeStyle = strike.team === 'player'
        ? `rgba(190, 220, 255, ${alpha * 0.85})`
        : `rgba(255, 205, 180, ${alpha * 0.85})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(strike.start.x, strike.start.y);
      ctx.lineTo(strike.end.x, strike.end.y);
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

  private drawRangeHint(player: Formation, enemy: Formation, snapshot: GameSnapshot): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(245, 237, 211, 0.78)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    const distance = Math.hypot(enemy.center.x - player.center.x, enemy.center.y - player.center.y);
    const playerLabel = this.modeLabel(snapshot.playerMode);
    const enemyLabel = this.modeLabel(snapshot.enemyMode);
    ctx.fillText(`LINE DISTANCE ${distance.toFixed(0)}px   BLUE ${playerLabel}   RED ${enemyLabel}`, GAME_CONFIG.width / 2, 23);
  }

  private drawModeBanner(snapshot: GameSnapshot): void {
    if (snapshot.winner || snapshot.chargeAiming) return;
    let text = '';
    if (snapshot.playerMode === 'charging') text = 'FORWARD — CHARGE!';
    else if (snapshot.playerMode === 'melee') text = 'BAYONETS — CLOSE COMBAT!';
    if (!text) return;

    const { ctx } = this;
    const pulse = 0.52 + Math.sin(snapshot.time * 8) * 0.08;
    ctx.fillStyle = `rgba(28, 18, 12, ${pulse})`;
    ctx.fillRect(GAME_CONFIG.width / 2 - 150, 42, 300, 36);
    ctx.strokeStyle = 'rgba(232, 210, 160, 0.75)';
    ctx.strokeRect(GAME_CONFIG.width / 2 - 150, 42, 300, 36);
    ctx.fillStyle = '#f4ddb0';
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px Georgia, serif';
    ctx.fillText(text, GAME_CONFIG.width / 2, 66);
  }

  private drawResult(snapshot: GameSnapshot): void {
    if (!snapshot.winner) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.58)';
    ctx.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5ead0';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText(snapshot.winner === 'player' ? 'THE BLUE LINE HOLDS' : 'THE RED LINE PREVAILS', GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 10);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#d6c8aa';
    ctx.fillText('R で再戦', GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 + 26);
  }

  private modeLabel(mode: GameSnapshot['playerMode']): string {
    if (mode === 'charging') return 'CHARGE';
    if (mode === 'melee') return 'MELEE';
    return 'LINE';
  }
}
