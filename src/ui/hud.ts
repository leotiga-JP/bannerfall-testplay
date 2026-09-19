import type { GameSnapshot } from '../game/game';
import { Unit } from '../entities/unit';

export class Hud {
  constructor(
    private readonly statusElement: HTMLElement,
    private readonly pauseOverlay: HTMLElement,
  ) {}

  update(snapshot: GameSnapshot, player: Unit, enemy: Unit): void {
    this.statusElement.textContent = snapshot.paused ? 'PAUSED' : snapshot.winner ? snapshot.winner === 'player' ? 'PLAYER WINS' : 'AI WINS' : 'BATTLE';
    this.pauseOverlay.classList.toggle('hidden', !snapshot.paused);

    document.title = `Bannerfall — P ${Math.ceil(player.hp)} | AI ${Math.ceil(enemy.hp)}`;
  }
}
