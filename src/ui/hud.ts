import type { GameSnapshot } from '../game/game';
import type { WeaponType } from '../game/types';

export class Hud {
  private readonly slots: HTMLElement[];

  constructor(
    private readonly statusElement: HTMLElement,
    private readonly pauseOverlay: HTMLElement,
    private readonly cameraElement: HTMLElement,
    private readonly blueBannerCard: HTMLElement,
    private readonly redBannerCard: HTMLElement,
    private readonly blueBannerHp: HTMLElement,
    private readonly redBannerHp: HTMLElement,
    private readonly blueBannerBar: HTMLElement,
    private readonly redBannerBar: HTMLElement,
    private readonly playerState: HTMLElement,
    private readonly playerDetail: HTMLElement,
    private readonly notice: HTMLElement,
    private readonly objectiveProgress: HTMLElement,
    private readonly contextHint: HTMLElement,
    hotbar: HTMLElement,
  ) {
    this.slots = Array.from(hotbar.querySelectorAll<HTMLElement>('.slot[data-weapon]'));
  }

  update(snapshot: GameSnapshot): void {
    const ready = snapshot.playerReload <= 0;
    this.statusElement.textContent = snapshot.paused
      ? 'PAUSED'
      : snapshot.winner
        ? snapshot.winner === 'blue' ? 'BLUE VICTORY' : 'RED VICTORY'
        : snapshot.playerRespawn !== null
          ? 'RESPAWNING'
          : snapshot.playerMode === 'bannerAttack'
            ? snapshot.playerBannerInRange ? 'AXE ATTACK' : 'OBJECTIVE MOVE'
            : snapshot.chargeAiming
              ? 'AIM CHARGE'
              : snapshot.playerMode === 'charging'
                ? 'CHARGING'
                : snapshot.playerMode === 'melee'
                  ? 'MELEE'
                  : snapshot.playerMode === 'reforming'
                    ? 'REFORMING'
                    : ready ? 'READY' : 'RELOADING';

    this.pauseOverlay.classList.toggle('hidden', !snapshot.paused);
    this.cameraElement.textContent = `CAM ${snapshot.cameraFollow ? 'FOLLOW' : 'FREE'} · ${snapshot.cameraZoom.toFixed(2)}x · TIME ${snapshot.timeScale.toFixed(1)}x${snapshot.debugAi ? ' · AI DEBUG' : ''}`;

    const bluePercent = Math.max(0, Math.round((snapshot.blueBannerHp / snapshot.bannerMaxHp) * 100));
    const redPercent = Math.max(0, Math.round((snapshot.redBannerHp / snapshot.bannerMaxHp) * 100));
    this.blueBannerHp.textContent = `${bluePercent}%`;
    this.redBannerHp.textContent = `${redPercent}%`;
    this.blueBannerBar.style.width = `${bluePercent}%`;
    this.redBannerBar.style.width = `${redPercent}%`;
    this.blueBannerCard.classList.toggle('under-attack', snapshot.blueBannerUnderAttack);
    this.redBannerCard.classList.toggle('under-attack', snapshot.redBannerUnderAttack);

    this.updatePlayerPanel(snapshot, ready);
    this.updateHotbar(snapshot.selectedWeapon);

    this.notice.textContent = snapshot.noticeText;
    this.notice.className = `notice ${snapshot.noticeKind}${snapshot.noticeVisible ? '' : ' hidden'}`;

    if (snapshot.playerMode === 'bannerAttack' && snapshot.playerBannerTargetTeam) {
      const progress = snapshot.playerBannerTargetTeam === 'red' ? redPercent : bluePercent;
      this.objectiveProgress.textContent = snapshot.playerBannerInRange
        ? `DESTROYING ${snapshot.playerBannerTargetTeam.toUpperCase()} BANNER · ${progress}%`
        : `MOVING TO ${snapshot.playerBannerTargetTeam.toUpperCase()} BANNER`;
      this.objectiveProgress.classList.remove('hidden');
    } else {
      this.objectiveProgress.classList.add('hidden');
    }

    this.contextHint.textContent = snapshot.contextualHint;
    this.contextHint.classList.toggle('hidden', !snapshot.contextualHint || snapshot.introActive);

    document.title = `Bannerfall P3 — Blue ${bluePercent}% | Red ${redPercent}%`;
  }

  private updatePlayerPanel(snapshot: GameSnapshot, ready: boolean): void {
    if (snapshot.playerRespawn !== null) {
      this.playerState.textContent = `B10 · SQUAD WIPED`;
      this.playerDetail.textContent = `RESPAWN ${snapshot.playerRespawn.toFixed(1)}s`;
      return;
    }

    const mode = snapshot.playerMode === 'bannerAttack'
      ? snapshot.playerBannerInRange ? 'DESTROYING BANNER' : 'TO BANNER'
      : snapshot.playerMode.toUpperCase();
    this.playerState.textContent = `B10 · ${snapshot.playerAlive}/20 · ${mode}`;

    if (snapshot.selectedWeapon === 'musket') {
      this.playerDetail.textContent = ready ? 'MUSKET · READY' : `MUSKET · RELOAD ${snapshot.playerReload.toFixed(1)}s`;
    } else if (snapshot.selectedWeapon === 'bayonet') {
      this.playerDetail.textContent = 'BAYONET · CHARGE / MELEE';
    } else {
      this.playerDetail.textContent = 'AXE · OBJECTIVE DAMAGE';
    }
  }

  private updateHotbar(selected: WeaponType): void {
    for (const slot of this.slots) {
      slot.classList.toggle('selected', slot.dataset.weapon === selected);
    }
  }
}
