import type { GameSnapshot } from '../game/game';
import { canBannerAttackClass, classLabel as squadClassLabel, isArtilleryClass, isChargeCavalryClass, type SquadClass } from '../game/types';
import { fieldworkKitCapacity } from '../game/classProfiles';

export class Hud {
  private readonly slots: HTMLElement[];
  private readonly classCards: HTMLElement[];
  private readonly spawnButtons: HTMLButtonElement[];
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
    this.spawnButtons = Array.from(classSelector.querySelectorAll<HTMLButtonElement>('[data-respawn-spawn]'));
  }

  update(snapshot: GameSnapshot): void {
    this.lastSnapshot = snapshot;
    const ready = snapshot.playerReload <= 0;
    this.statusElement.textContent = snapshot.paused
      ? 'PAUSED'
      : snapshot.winner
        ? snapshot.winner === 'blue' ? 'BLUE VICTORY' : 'RED VICTORY'
        : snapshot.playerRespawn !== null
          ? '兵科選択'
          : snapshot.playerBaseRecoveryRemaining !== null
              ? '補充中'
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
                      ? '敗走中'
                      : snapshot.playerForcedMarch
                        ? '強行軍'
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

    document.title = `Bannerfall V4.0.4 — BLUE ${bluePercent}% | RED ${redPercent}%`;
  }

  private updatePlayerPanel(snapshot: GameSnapshot, ready: boolean): void {
    const className = this.classLabel(snapshot.playerClass);
    if (snapshot.playerRespawn !== null) {
      this.playerState.textContent = `部隊壊滅 · 次回 ${this.classLabel(snapshot.playerNextClass)} / Spawn ${String.fromCharCode(65 + snapshot.playerNextSpawn)}`;
      this.playerDetail.textContent = `援軍到着まで ${snapshot.playerRespawn.toFixed(1)}秒`;
      return;
    }
    if (snapshot.playerBaseRecoveryRemaining !== null) {
      this.playerState.textContent = `${className} · 補充中`;
      this.playerDetail.textContent = `兵員・士気・資材回復まで ${snapshot.playerBaseRecoveryRemaining.toFixed(1)}秒`;
      return;
    }

    const mode = snapshot.playerMode === 'bannerAttack'
      ? snapshot.playerBannerInRange ? 'DESTROYING BANNER' : 'TO BANNER'
      : snapshot.playerMode.toUpperCase();
    this.playerState.textContent = `${className} · ${snapshot.playerAlive}/${snapshot.playerMaxSoldiers} · ${mode} · 士気 ${Math.round(snapshot.playerMorale)}`;
    if (snapshot.playerForcedMarch) this.playerDetail.textContent = `SHIFT 強行軍 · 士気を消費中（最低1）`;

    if (snapshot.playerForcedMarch) {
      this.playerDetail.textContent = 'SHIFT 強行軍 · 士気を消費して高速移動（士気1で停止）';
      return;
    }
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
      this.configureSlot(0, '1', '━', 'マスケット', snapshot.selectedWeapon === 'musket', snapshot.playerReloadProgress, snapshot.playerReload <= 0 ? 'READY' : 'RELOAD');
      this.configureSlot(1, '2', '†', '銃剣', snapshot.selectedWeapon === 'bayonet');
      this.configureSlot(2, '3', '⌁', '斧', snapshot.selectedWeapon === 'axe');
    } else if (snapshot.playerClass === 'sharpshooter') {
      this.configureSlot(0, 'LMB', '━', '狙撃銃', true, snapshot.playerReloadProgress, snapshot.playerReload <= 0 ? 'READY' : 'RELOAD');
      this.configureSlot(1, 'F', '↶', '再整列', snapshot.playerMode === 'reforming');
    } else if (snapshot.playerClass === 'dragoon') {
      this.configureSlot(0, 'LMB', '━', 'カービン', true, snapshot.playerReloadProgress, snapshot.playerReload <= 0 ? 'READY' : 'RELOAD');
      this.configureSlot(1, '—', '↯', '機動射撃', false);
      this.configureSlot(2, 'F', '↶', '再整列', snapshot.playerMode === 'reforming');
    } else if (isChargeCavalryClass(snapshot.playerClass)) {
      this.configureSlot(0, 'RMB', '➤', snapshot.playerClass === 'hussar' ? '衝撃突撃' : '突撃', snapshot.chargeAiming || snapshot.playerMode === 'charging');
      this.configureSlot(1, 'F', '↶', '再整列', snapshot.playerMode === 'reforming');
      this.configureSlot(2, '—', '†', 'サーベル', snapshot.playerMode === 'melee');
    } else {
      const cannonProgress = snapshot.playerArtilleryDeployed ? snapshot.playerReloadProgress : snapshot.playerArtilleryDeployProgress;
      const cannonState = snapshot.playerArtilleryDeployed ? snapshot.playerReload <= 0 ? 'READY' : 'RELOAD' : '展開';
      const cannonLabel = snapshot.playerClass === 'heavyArtillery' ? '重砲' : snapshot.playerClass === 'horseArtillery' ? '3門砲' : '2門砲';
      this.configureSlot(0, 'LMB', '●', cannonLabel, snapshot.playerArtilleryDeployed && snapshot.playerReload <= 0, cannonProgress, cannonState);
      this.configureSlot(1, 'AUTO', '⌛', snapshot.playerArtilleryDeployed ? '展開済' : '展開', !snapshot.playerArtilleryDeployed);
      this.configureSlot(2, 'F', '↶', '再整列', snapshot.playerMode === 'reforming');
    }

    if (snapshot.playerClass === 'grenadier') {
      const grenadeProgress = snapshot.playerGrenadeCooldown <= 0 ? 1 : Math.max(0, 1 - snapshot.playerGrenadeCooldown / 12);
      this.configureSlot(3, '4', '●', '手榴弾', snapshot.playerGrenadeCooldown <= 0, grenadeProgress, snapshot.playerGrenadeCooldown <= 0 ? '使用可' : '再使用待ち');
    }
    if (fieldworkKitCapacity(snapshot.playerClass) > 0) {
      this.configureSlot(4, '5', '╳', `馬防柵 ×${snapshot.playerFieldworkKits}`, snapshot.playerFieldworkKits > 0);
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
    this.reserveClassToggle.textContent = `次回出撃 · ${this.classLabel(snapshot.playerNextClass)} / Spawn ${String.fromCharCode(65 + snapshot.playerNextSpawn)} [N]`;
    this.reserveClassToggle.disabled = !!snapshot.winner;

    if (!active) return;
    this.classSelectorTitle.textContent = dead ? '次の出撃を選択' : '次回出撃を予約';
    this.classSelectorDescription.textContent = dead && snapshot.playerRespawn !== null
      ? `援軍到着まで ${snapshot.playerRespawn.toFixed(1)}秒 · 兵科とSpawnを選択`
      : '次に部隊が全滅した際の兵科とSpawnを予約します · Nで閉じる';
    this.armyComposition.textContent = `BLUE · 戦列${snapshot.blueClasses.infantry} 軽歩${snapshot.blueClasses.lightInfantry} 擲弾${snapshot.blueClasses.grenadier} 狙撃${snapshot.blueClasses.sharpshooter} 工兵${snapshot.blueClasses.engineer} 竜騎${snapshot.blueClasses.dragoon} 騎兵${snapshot.blueClasses.cavalry} フッサー${snapshot.blueClasses.hussar} 胸甲${snapshot.blueClasses.cuirassier} 野砲${snapshot.blueClasses.artillery} 重砲${snapshot.blueClasses.heavyArtillery} 騎砲${snapshot.blueClasses.horseArtillery}`;
    this.classRecommendation.textContent = `推奨 · ${this.classLabel(snapshot.playerRecommendedClass)}`;
    for (const card of this.classCards) {
      const value = card.dataset.class as SquadClass | undefined;
      card.classList.toggle('selected', value === snapshot.playerNextClass);
      card.classList.toggle('recommended', value === snapshot.playerRecommendedClass);
    }
    for (const button of this.spawnButtons) {
      const value = Number(button.dataset.respawnSpawn);
      button.classList.toggle('selected', value === snapshot.playerNextSpawn);
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
