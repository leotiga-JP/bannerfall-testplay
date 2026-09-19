import type { GameSnapshot } from '../game/game';

export class Hud {
  constructor(
    private readonly statusElement: HTMLElement,
    private readonly pauseOverlay: HTMLElement,
    private readonly blueCountElement: HTMLElement,
    private readonly redCountElement: HTMLElement,
    private readonly reloadElement: HTMLElement,
    private readonly cameraElement: HTMLElement,
  ) {}

  update(snapshot: GameSnapshot): void {
    const ready = snapshot.playerReload <= 0;
    this.statusElement.textContent = snapshot.paused
      ? 'PAUSED'
      : snapshot.winner
        ? snapshot.winner === 'blue' ? 'BLUE VICTORY' : 'RED VICTORY'
        : snapshot.chargeAiming
          ? 'AIM CHARGE'
          : snapshot.playerMode === 'charging'
            ? 'CHARGING'
            : snapshot.playerMode === 'melee'
              ? 'MELEE'
              : snapshot.playerMode === 'reforming'
                ? 'REFORMING'
                : ready ? 'VOLLEY READY' : 'RELOADING';

    this.pauseOverlay.classList.toggle('hidden', !snapshot.paused);
    this.blueCountElement.textContent = `BLUE ${snapshot.blueSquads}/20 · ${snapshot.blueSoldiers} MEN`;
    this.redCountElement.textContent = `RED ${snapshot.redSquads}/20 · ${snapshot.redSoldiers} MEN`;

    if (snapshot.chargeAiming) {
      this.reloadElement.textContent = 'CHARGE VECTOR — RELEASE TO COMMIT';
      this.reloadElement.classList.add('ready');
    } else if (snapshot.playerMode === 'charging') {
      this.reloadElement.textContent = `YOU ${snapshot.playerAlive}/20 · CHARGE · RIGHT CLICK TO BREAK OFF`;
      this.reloadElement.classList.remove('ready');
    } else if (snapshot.playerMode === 'melee') {
      this.reloadElement.textContent = `YOU ${snapshot.playerAlive}/20 · MELEE · RIGHT CLICK TO BREAK OFF`;
      this.reloadElement.classList.remove('ready');
    } else if (snapshot.playerMode === 'reforming') {
      this.reloadElement.textContent = `YOU ${snapshot.playerAlive}/20 · REFORMING`;
      this.reloadElement.classList.remove('ready');
    } else {
      this.reloadElement.textContent = ready
        ? `YOU ${snapshot.playerAlive}/20 · READY — FIRE!`
        : `YOU ${snapshot.playerAlive}/20 · RELOAD ${snapshot.playerReload.toFixed(1)}s`;
      this.reloadElement.classList.toggle('ready', ready);
    }

    this.cameraElement.textContent = `CAM ${snapshot.cameraFollow ? 'FOLLOW' : 'FREE'} · ${snapshot.cameraZoom.toFixed(2)}x · TIME ${snapshot.timeScale.toFixed(1)}x${snapshot.debugAi ? ' · AI DEBUG' : ''}`;
    document.title = `Bannerfall P2 — Blue ${snapshot.blueSquads} | Red ${snapshot.redSquads}`;
  }
}
