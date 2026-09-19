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
        : snapshot.chargeAiming
          ? 'AIM CHARGE'
          : snapshot.playerMode === 'charging'
            ? 'CHARGING'
            : snapshot.playerMode === 'melee'
              ? 'BAYONET MELEE'
              : snapshot.playerMode === 'reforming'
                ? 'REFORMING'
                : ready ? 'VOLLEY READY' : 'RELOADING';

    this.pauseOverlay.classList.toggle('hidden', !snapshot.paused);
    this.blueCountElement.textContent = `BLUE ${snapshot.playerAlive}/20`;
    this.redCountElement.textContent = `RED ${snapshot.enemyAlive}/20`;

    if (snapshot.chargeAiming) {
      this.reloadElement.textContent = 'CHARGE VECTOR — RELEASE TO COMMIT';
      this.reloadElement.classList.add('ready');
    } else if (snapshot.playerMode === 'charging') {
      this.reloadElement.textContent = 'CHARGE — RIGHT CLICK AGAIN TO BREAK OFF';
      this.reloadElement.classList.remove('ready');
    } else if (snapshot.playerMode === 'melee') {
      this.reloadElement.textContent = 'MELEE — RIGHT CLICK: BREAK OFF / F: REFORM HERE';
      this.reloadElement.classList.remove('ready');
    } else if (snapshot.playerMode === 'reforming') {
      this.reloadElement.textContent = 'REFORMING — HOLD FIRE UNTIL THE LINE IS SET';
      this.reloadElement.classList.remove('ready');
    } else {
      this.reloadElement.textContent = ready ? 'READY — FIRE!   F: CLOSE GAPS' : `RELOAD ${snapshot.playerReload.toFixed(1)}s   F: REFORM`;
      this.reloadElement.classList.toggle('ready', ready);
    }

    document.title = `Bannerfall P1.8 — Blue ${snapshot.playerAlive} | Red ${snapshot.enemyAlive}`;
  }
}
