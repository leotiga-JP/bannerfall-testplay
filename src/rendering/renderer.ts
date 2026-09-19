import { Unit } from '../entities/unit';
import { GAME_CONFIG } from '../game/config';
import type { GameSnapshot } from '../game/game';

export class Renderer {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  render(player: Unit, enemy: Unit, snapshot: GameSnapshot): void {
    this.drawBackground();
    this.drawArenaBorder();
    this.drawUnit(enemy, 'enemy');
    this.drawUnit(player, 'player');
    this.drawCenterHint(player, enemy);
    this.drawResult(snapshot);
  }

  private drawBackground(): void {
    const { ctx } = this;
    ctx.fillStyle = '#132019';
    ctx.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);

    ctx.strokeStyle = '#20322a';
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
  }

  private drawArenaBorder(): void {
    const { ctx } = this;
    ctx.strokeStyle = '#65756b';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, GAME_CONFIG.width - 2, GAME_CONFIG.height - 2);
  }

  private drawUnit(unit: Unit, type: 'player' | 'enemy'): void {
    const { ctx } = this;
    const r = unit.config.radius;
    const body = type === 'player' ? '#7db7ff' : '#ff8585';
    const dark = type === 'player' ? '#25476b' : '#672929';

    ctx.save();
    ctx.translate(unit.position.x, unit.position.y);
    ctx.rotate(unit.direction);

    if (unit.dead) {
      ctx.globalAlpha = 0.35;
    }

    ctx.fillStyle = dark;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.fillStyle = body;
    ctx.fillRect(-r + 3, -r + 3, (r * 2) - 6, (r * 2) - 6);

    ctx.fillStyle = '#f5f7f8';
    ctx.fillRect(r - 4, -3, 7, 6);
    ctx.restore();

    this.drawHealthBar(unit);
    this.drawAttackArc(unit, type);
    this.drawState(unit);
  }

  private drawHealthBar(unit: Unit): void {
    const { ctx } = this;
    const width = 54;
    const height = 6;
    const x = unit.position.x - width / 2;
    const y = unit.position.y - unit.config.radius - 13;
    const ratio = Math.max(0, unit.hp / unit.config.maxHp);

    ctx.fillStyle = '#0a0d0f';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = unit.team === 'player' ? '#8fc2ff' : '#ff9b9b';
    ctx.fillRect(x + 1, y + 1, (width - 2) * ratio, height - 2);
  }

  private drawAttackArc(unit: Unit, type: 'player' | 'enemy'): void {
    if (unit.dead) return;
    const { ctx } = this;
    const alpha = unit.attackTimer > 0 ? 0.035 : 0.11;
    ctx.save();
    ctx.translate(unit.position.x, unit.position.y);
    ctx.rotate(unit.direction);
    ctx.fillStyle = type === 'player' ? `rgba(143,194,255,${alpha})` : `rgba(255,155,155,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, unit.config.attackRange, -(unit.config.attackAngleDeg * Math.PI) / 360, (unit.config.attackAngleDeg * Math.PI) / 360);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawState(unit: Unit): void {
    if (unit.team === 'player' || unit.dead) return;
    const { ctx } = this;
    ctx.fillStyle = '#c8d2d8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(unit.aiState, unit.position.x, unit.position.y + unit.config.radius + 17);
  }

  private drawCenterHint(player: Unit, enemy: Unit): void {
    const { ctx } = this;
    if (player.dead || enemy.dead) return;
    const distance = Math.hypot(player.position.x - enemy.position.x, player.position.y - enemy.position.y);
    ctx.fillStyle = '#a8b7ad';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Distance ${distance.toFixed(0)}px`, GAME_CONFIG.width / 2, 24);
  }

  private drawResult(snapshot: GameSnapshot): void {
    const { ctx } = this;
    if (!snapshot.winner) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8edf2';
    ctx.font = 'bold 30px monospace';
    ctx.fillText(snapshot.winner === 'player' ? 'PLAYER WINS' : 'AI WINS', GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 - 8);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#b7c0c6';
    ctx.fillText('R でリスタート', GAME_CONFIG.width / 2, GAME_CONFIG.height / 2 + 20);
    ctx.restore();
  }
}
