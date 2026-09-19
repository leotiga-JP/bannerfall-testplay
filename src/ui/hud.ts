import type { GameSnapshot } from '../game/game';

export class Hud {
  constructor(
    private readonly statusElement: HTMLElement,
    private readonly pauseOverlay: HTMLElement,
    private readonly blueCountElement: HTMLElement,
    private readonly redCountElement: HTMLElement,
    private readonly reloadElement: HTMLElement,
  ) {}

  update(snapshot: GameSnapshot): void {
    const ready = snapshot.playerReload <= 0;
    this.statusElement.textContent = snapshot.paused
      ? 'PAUSED'
      : snapshot.winner
        ? snapshot.winner === 'player' ? 'BLUE VICTORY' : 'RED VICTORY'
        : ready ? 'VOLLEY READY' : 'RELOADING';

    this.pauseOverlay.classList.toggle('hidden', !snapshot.paused);
    this.blueCountElement.textContent = `BLUE ${snapshot.playerAlive}/20`;
    this.redCountElement.textContent = `RED ${snapshot.enemyAlive}/20`;
    this.reloadElement.textContent = ready ? 'READY — FIRE!' : `RELOAD ${snapshot.playerReload.toFixed(1)}s`;
    this.reloadElement.classList.toggle('ready', ready);

    document.title = `Bannerfall P1.5 — Blue ${snapshot.playerAlive} | Red ${snapshot.enemyAlive}`;
  }
}
