import type { GameSnapshot } from '../game/game';
import { canBannerAttackClass, classLabel as squadClassLabel, isArtilleryClass, isChargeCavalryClass, type SquadClass } from '../game/types';

export class Hud {
  private readonly slots: HTMLElement[];
  private readonly classCards: HTMLElement[];
  private reservationOpen = false;
  private lastSnapshot: GameSnapshot | null = null;

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
    private readonly playerStats: HTMLElement,
    private readonly notice: HTMLElement,
    private readonly objectiveProgress: HTMLElement,
    private readonly contextHint: HTMLElement,
    hotbar: HTMLElement,
    private readonly classSelector: HTMLElement,
    private readonly classSelectorTitle: HTMLElement,
    private readonly classSelectorDescription: HTMLElement,
    private readonly reserveClassToggle: HTMLButtonElement,
    private readonly armyComposition: HTMLElement,
    private readonly classRecommendation: HTMLElement,
  ) {
    this.slots = Array.from(hotbar.querySelectorAll<HTMLElement>('.slot[data-slot]'));
    this.classCards = Array.from(classSelector.querySelectorAll<HTMLElement>('.class-card[data-class]'));
  }

  update(snapshot: GameSnapshot): void {
    this.lastSnapshot = snapshot;
    const ready = snapshot.playerReload <= 0;
    this.statusElement.textContent = snapshot.paused
      ? 'PAUSED'
      : snapshot.winner
        ? snapshot.winner === 'blue' ? 'BLUE VICTORY' : 'RED VICTORY'
        : snapshot.playerRespawn !== null
          ? 'CHOOSE CLASS'
          : snapshot.playerRecallRemaining !== null
            ? 'RECALLING'
            : snapshot.playerBaseRecoveryRemaining !== null
              ? 'REINFORCING'
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
                    : snapshot.playerMode === 'routed'
                      ? 'ROUTING'
                      : isArtilleryClass(snapshot.playerClass) && !snapshot.playerArtilleryDeployed
                        ? 'BATTLE'
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
    this.playerStats.textContent = `KILLS ${snapshot.playerKills} · DEATHS ${snapshot.playerLosses} · BANNER DMG ${Math.round(snapshot.playerBannerDamage)}`;
    this.updateHotbar(snapshot);
    this.updateClassSelector(snapshot);

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

    document.title = `Bannerfall P3.9.4.2 — Blue ${bluePercent}% | Red ${redPercent}%`;
  }

  private updatePlayerPanel(snapshot: GameSnapshot, ready: boolean): void {
    const className = this.classLabel(snapshot.playerClass);
    if (snapshot.playerRespawn !== null) {
      this.playerState.textContent = `SQUAD WIPED · NEXT ${this.classLabel(snapshot.playerNextClass)}`;
      this.playerDetail.textContent = `REINFORCEMENT WAVE ${snapshot.playerRespawn.toFixed(1)}s`;
      return;
    }
    if (snapshot.playerRecallRemaining !== null) {
      this.playerState.textContent = `${className} · RECALLING`;
      this.playerDetail.textContent = `RETURN TO SPAWN ${snapshot.playerRecallRemaining.toFixed(1)}s · MOVE/ATTACK TO CANCEL`;
      return;
    }
    if (snapshot.playerBaseRecoveryRemaining !== null) {
      this.playerState.textContent = `${className} · REINFORCING`;
      this.playerDetail.textContent = `MEN & MORALE RESTORE IN ${snapshot.playerBaseRecoveryRemaining.toFixed(1)}s`;
      return;
    }

    const mode = snapshot.playerMode === 'bannerAttack'
      ? snapshot.playerBannerInRange ? 'DESTROYING BANNER' : 'TO BANNER'
      : snapshot.playerMode.toUpperCase();
    this.playerState.textContent = `${className} · ${snapshot.playerAlive}/${snapshot.playerMaxSoldiers} · ${mode} · MORALE ${Math.round(snapshot.playerMorale)}`;

    if (isChargeCavalryClass(snapshot.playerClass)) {
      this.playerDetail.textContent = snapshot.playerMode === 'charging' ? 'MOMENTUM CHARGE' : snapshot.playerClass === 'hussar' ? 'MORALE SHOCK · RMB TO CHARGE' : 'SABRE · RMB TO CHARGE';
      return;
    }
    if (snapshot.playerClass === 'dragoon') {
      this.playerDetail.textContent = ready ? 'CARBINE · READY · MOBILE FIRE' : `CARBINE · RELOAD ${snapshot.playerReload.toFixed(1)}s`;
      return;
    }
    if (isArtilleryClass(snapshot.playerClass)) {
      if (!snapshot.playerArtilleryDeployed) this.playerDetail.textContent = `CANNON · DEPLOY ${Math.round(snapshot.playerArtilleryDeployProgress * 100)}%`;
      else this.playerDetail.textContent = ready ? 'CANNON · READY' : `CANNON · RELOAD ${snapshot.playerReload.toFixed(1)}s`;
      return;
    }

    if (snapshot.selectedWeapon === 'musket') this.playerDetail.textContent = ready ? 'MUSKET · READY' : `MUSKET · RELOAD ${snapshot.playerReload.toFixed(1)}s`;
    else if (snapshot.selectedWeapon === 'bayonet') this.playerDetail.textContent = 'BAYONET · CHARGE / MELEE';
    else this.playerDetail.textContent = 'AXE · OBJECTIVE DAMAGE';
  }

  private updateHotbar(snapshot: GameSnapshot): void {
    for (const slot of this.slots) this.clearSlot(slot);
    if (canBannerAttackClass(snapshot.playerClass)) {
      this.configureSlot(0, '1', '━', 'MUSKET', snapshot.selectedWeapon === 'musket', snapshot.playerReloadProgress, snapshot.playerReload <= 0 ? 'READY' : 'RELOAD');
      this.configureSlot(1, '2', '†', 'BAYONET', snapshot.selectedWeapon === 'bayonet');
      this.configureSlot(2, '3', '⌁', 'AXE', snapshot.selectedWeapon === 'axe');
    } else if (snapshot.playerClass === 'dragoon') {
      this.configureSlot(0, 'LMB', '━', 'CARBINE', true, snapshot.playerReloadProgress, snapshot.playerReload <= 0 ? 'READY' : 'RELOAD');
      this.configureSlot(1, '—', '↯', 'MOBILE', false);
      this.configureSlot(2, 'F', '↶', 'REFORM', snapshot.playerMode === 'reforming');
    } else if (isChargeCavalryClass(snapshot.playerClass)) {
      this.configureSlot(0, 'RMB', '➤', snapshot.playerClass === 'hussar' ? 'SHOCK' : 'CHARGE', snapshot.chargeAiming || snapshot.playerMode === 'charging');
      this.configureSlot(1, 'F', '↶', 'REFORM', snapshot.playerMode === 'reforming');
      this.configureSlot(2, '—', '†', 'SABRE', snapshot.playerMode === 'melee');
    } else {
      const cannonProgress = snapshot.playerArtilleryDeployed ? snapshot.playerReloadProgress : snapshot.playerArtilleryDeployProgress;
      const cannonState = snapshot.playerArtilleryDeployed ? snapshot.playerReload <= 0 ? 'READY' : 'RELOAD' : 'DEPLOY';
      const cannonLabel = snapshot.playerClass === 'heavyArtillery' ? 'HEAVY GUN' : snapshot.playerClass === 'horseArtillery' ? '3 GUNS' : '2 GUNS';
      this.configureSlot(0, 'LMB', '●', cannonLabel, snapshot.playerArtilleryDeployed && snapshot.playerReload <= 0, cannonProgress, cannonState);
      this.configureSlot(1, 'AUTO', '⌛', snapshot.playerArtilleryDeployed ? 'DEPLOYED' : 'DEPLOY', !snapshot.playerArtilleryDeployed);
      this.configureSlot(2, 'F', '↶', 'REFORM', snapshot.playerMode === 'reforming');
    }
  }

  toggleClassReservation(): void {
    if (!this.lastSnapshot || this.lastSnapshot.winner || this.lastSnapshot.playerRespawn !== null) return;
    this.reservationOpen = !this.reservationOpen;
    this.updateClassSelector(this.lastSnapshot);
  }

  closeClassReservation(): void {
    if (!this.reservationOpen) return;
    this.reservationOpen = false;
    if (this.lastSnapshot) this.updateClassSelector(this.lastSnapshot);
  }

  private updateClassSelector(snapshot: GameSnapshot): void {
    const dead = snapshot.playerRespawn !== null && !snapshot.winner;
    const active = dead || (this.reservationOpen && !snapshot.winner);
    this.classSelector.classList.toggle('hidden', !active);

    this.reserveClassToggle.classList.toggle('reserved', snapshot.playerHasReservedClass);
    this.reserveClassToggle.textContent = `NEXT CLASS · ${this.classLabel(snapshot.playerNextClass).toUpperCase()} [N]`;
    this.reserveClassToggle.disabled = !!snapshot.winner;

    if (!active) return;
    this.classSelectorTitle.textContent = dead ? 'CHOOSE NEXT FORMATION' : 'RESERVE NEXT FORMATION';
    this.classSelectorDescription.textContent = dead && snapshot.playerRespawn !== null
      ? `Respawn in ${snapshot.playerRespawn.toFixed(1)}s · カードをクリック、または1〜9`
      : '次に部隊が全滅した際の兵科を予約します · カードをクリック · Nで閉じる';
    this.armyComposition.textContent = `BLUE · INF ${snapshot.blueClasses.infantry} LGT ${snapshot.blueClasses.lightInfantry} GRN ${snapshot.blueClasses.grenadier} DRG ${snapshot.blueClasses.dragoon} CAV ${snapshot.blueClasses.cavalry} HUS ${snapshot.blueClasses.hussar} ART ${snapshot.blueClasses.artillery} H-A ${snapshot.blueClasses.heavyArtillery} HRS ${snapshot.blueClasses.horseArtillery}`;
    this.classRecommendation.textContent = `RECOMMENDED · ${this.classLabel(snapshot.playerRecommendedClass)}`;
    for (const card of this.classCards) {
      const value = card.dataset.class as SquadClass | undefined;
      card.classList.toggle('selected', value === snapshot.playerNextClass);
      card.classList.toggle('recommended', value === snapshot.playerRecommendedClass);
    }
  }

  private configureSlot(
    index: number,
    key: string,
    icon: string,
    label: string,
    selected: boolean,
    progress: number | null = null,
    progressLabel = '',
  ): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.classList.remove('empty');
    slot.classList.toggle('selected', selected);
    const keyElement = slot.querySelector<HTMLElement>('.key');
    const iconElement = slot.querySelector<HTMLElement>('.icon');
    const labelElement = slot.querySelector<HTMLElement>('small');
    if (keyElement) keyElement.textContent = key;
    if (iconElement) iconElement.textContent = icon;
    if (labelElement) labelElement.textContent = label;
    this.setSlotProgress(slot, progress, progressLabel);
  }

  private setSlotProgress(slot: HTMLElement, progress: number | null, label: string): void {
    let meter = slot.querySelector<HTMLElement>('.slot-meter');
    if (!meter) {
      meter = document.createElement('div');
      meter.className = 'slot-meter hidden';
      const fill = document.createElement('span');
      fill.className = 'slot-meter-fill';
      meter.appendChild(fill);
      slot.appendChild(meter);
    }
    const fill = meter.querySelector<HTMLElement>('.slot-meter-fill');
    const normalized = progress === null ? 0 : Math.max(0, Math.min(1, progress));
    meter.classList.toggle('hidden', progress === null);
    meter.dataset.state = label;
    if (fill) fill.style.width = `${Math.round(normalized * 100)}%`;
  }

  private clearSlot(slot: HTMLElement): void {
    slot.classList.add('empty');
    slot.classList.remove('selected');
    const keyElement = slot.querySelector<HTMLElement>('.key');
    const iconElement = slot.querySelector<HTMLElement>('.icon');
    const labelElement = slot.querySelector<HTMLElement>('small');
    if (keyElement) keyElement.textContent = '';
    if (iconElement) iconElement.textContent = '';
    if (labelElement) labelElement.textContent = '';
    this.setSlotProgress(slot, null, '');
  }

  private classLabel(squadClass: SquadClass): string {
    return squadClassLabel(squadClass);
  }
}
