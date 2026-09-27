import type { GameSnapshot } from '../game/game';
import { canBannerAttackClass, classLabel as squadClassLabel, formationShapeLabel, isArtilleryClass, isChargeCavalryClass, type SquadClass } from '../game/types';
import { artilleryProfile } from '../game/classProfiles';
import type { ConstructionBlockKind } from '../entities/constructionBlock';
import { CONSTRUCTION_COSTS } from '../game/constructionSystem';

export class Hud {
  private readonly slots: HTMLElement[];
  private readonly classCards: HTMLElement[];
  private readonly spawnButtons: HTMLButtonElement[];
  private reservationOpen = false;
  private lastSnapshot: GameSnapshot | null = null;
  private builderMode = false;
  private builderAvailable = false;
  private builderKind: ConstructionBlockKind = 'woodWall';
  private readonly resourceWood: HTMLElement;
  private readonly resourceIron: HTMLElement;
  private readonly resourceGunpowder: HTMLElement;
  private readonly resourceAlloy: HTMLElement;
  private readonly resourceGatherLabel: HTMLElement;
  private readonly resourceGatherBar: HTMLElement;
  private readonly resourceGatherDetail: HTMLElement;

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
    private readonly resourceStockpile: HTMLElement,
    private readonly resourceGather: HTMLElement,
    private readonly blueFactionName: string = 'BLUE',
    private readonly redFactionName: string = 'RED',
  ) {
    this.slots = Array.from(hotbar.querySelectorAll<HTMLElement>('.slot[data-slot]'));
    this.classCards = Array.from(classSelector.querySelectorAll<HTMLElement>('.class-card[data-class]'));
    this.spawnButtons = Array.from(classSelector.querySelectorAll<HTMLButtonElement>('[data-respawn-spawn]'));
    const requireChild = <T extends HTMLElement>(root: HTMLElement, selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`Missing resource HUD element ${selector}`);
      return element;
    };
    this.resourceWood = requireChild(this.resourceStockpile, '#resource-wood');
    this.resourceIron = requireChild(this.resourceStockpile, '#resource-iron');
    this.resourceGunpowder = requireChild(this.resourceStockpile, '#resource-gunpowder');
    this.resourceAlloy = requireChild(this.resourceStockpile, '#resource-alloy');
    this.resourceGatherLabel = requireChild(this.resourceGather, '#resource-gather-label');
    this.resourceGatherBar = requireChild(this.resourceGather, '#resource-gather-bar');
    this.resourceGatherDetail = requireChild(this.resourceGather, '#resource-gather-detail');
  }

  setBuilderMode(active: boolean, kind: ConstructionBlockKind, available = true): void {
    this.builderMode = active;
    this.builderAvailable = available;
    this.builderKind = kind;
  }

  update(snapshot: GameSnapshot): void {
    this.lastSnapshot = snapshot;
    const ready = snapshot.playerReload <= 0;
    this.statusElement.textContent = snapshot.paused
      ? 'PAUSED'
      : snapshot.winner
        ? snapshot.winner === 'blue' ? `BLUE · ${this.blueFactionName} VICTORY` : `RED · ${this.redFactionName} VICTORY`
        : snapshot.playerRespawn !== null
          ? '兵科選択'
          : snapshot.playerRecruitmentProgress !== null
            ? '増員中'
          : snapshot.playerBaseRecoveryRemaining !== null
              ? snapshot.recruitmentEnabled ? '士気回復中' : '補充中'
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
    const blueLabel = this.blueBannerCard.querySelector<HTMLElement>('.banner-card-head span');
    const redLabel = this.redBannerCard.querySelector<HTMLElement>('.banner-card-head span');
    if (snapshot.conquestEnabled) {
      const initial = Math.max(1, snapshot.conquestInitialTickets);
      if (blueLabel) blueLabel.textContent = `BLUE · ${this.blueFactionName} TICKETS`;
      if (redLabel) redLabel.textContent = `RED · ${this.redFactionName} TICKETS`;
      this.blueBannerHp.textContent = `${snapshot.blueTickets}`;
      this.redBannerHp.textContent = `${snapshot.redTickets}`;
      this.blueBannerBar.style.width = `${Math.max(0, Math.min(100, snapshot.blueTickets / initial * 100))}%`;
      this.redBannerBar.style.width = `${Math.max(0, Math.min(100, snapshot.redTickets / initial * 100))}%`;
      this.blueBannerCard.classList.remove('under-attack');
      this.redBannerCard.classList.remove('under-attack');
    } else {
      if (blueLabel) blueLabel.textContent = `BLUE · ${this.blueFactionName} 旗`;
      if (redLabel) redLabel.textContent = `RED · ${this.redFactionName} 旗`;
      this.blueBannerHp.textContent = `${bluePercent}%`;
      this.redBannerHp.textContent = `${redPercent}%`;
      this.blueBannerBar.style.width = `${bluePercent}%`;
      this.redBannerBar.style.width = `${redPercent}%`;
      this.blueBannerCard.classList.toggle('under-attack', snapshot.blueBannerUnderAttack);
      this.redBannerCard.classList.toggle('under-attack', snapshot.redBannerUnderAttack);
    }

    this.updatePlayerPanel(snapshot, ready);
    this.playerStats.textContent = snapshot.resourcesEnabled
      ? `KILLS ${snapshot.playerKills} · DEATHS ${snapshot.playerLosses} · BANNER DMG ${Math.round(snapshot.playerBannerDamage)} · 採取 ${Math.round(snapshot.playerResourcesGathered)} · 戦利品 ${Math.round(snapshot.playerCombatLoot)}`
      : `KILLS ${snapshot.playerKills} · DEATHS ${snapshot.playerLosses} · BANNER DMG ${Math.round(snapshot.playerBannerDamage)}`;
    this.updateResources(snapshot);
    this.updateHotbar(snapshot);
    this.updateClassSelector(snapshot);

    this.notice.textContent = snapshot.noticeText;
    this.notice.className = `notice ${snapshot.noticeKind}${snapshot.noticeVisible ? '' : ' hidden'}`;

    if (snapshot.conquestEnabled) {
      this.objectiveProgress.textContent = snapshot.capturePoints.map((point) => {
        if (point.contested) return `${point.id}: CONTESTED`;
        if (point.owner && point.captureTeam && point.captureTeam !== point.owner) {
          return `${point.id}: ${point.captureTeam.toUpperCase()} ATTACK ${Math.round((1 - point.progress) * 100)}%`;
        }
        if (point.owner) return `${point.id}: ${point.owner.toUpperCase()}`;
        if (point.captureTeam) return `${point.id}: ${point.captureTeam.toUpperCase()} ${Math.round(point.progress * 100)}%`;
        return `${point.id}: NEUTRAL`;
      }).join('  ·  ');
      this.objectiveProgress.classList.remove('hidden');
    } else if (snapshot.playerMode === 'bannerAttack' && snapshot.playerBannerTargetTeam) {
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

    document.title = snapshot.conquestEnabled
      ? `Bannerfall V4.4.5 — BLUE ${this.blueFactionName} ${snapshot.blueTickets} | RED ${this.redFactionName} ${snapshot.redTickets}`
      : `Bannerfall V4.4.5 — BLUE ${this.blueFactionName} ${bluePercent}% | RED ${this.redFactionName} ${redPercent}%`;
  }

  private updateResources(snapshot: GameSnapshot): void {
    this.resourceStockpile.classList.toggle('hidden', !snapshot.resourcesEnabled);
    if (snapshot.resourcesEnabled) {
      this.resourceWood.textContent = Math.round(snapshot.playerResourceStockpile.wood).toLocaleString();
      this.resourceIron.textContent = Math.round(snapshot.playerResourceStockpile.iron).toLocaleString();
      this.resourceGunpowder.textContent = Math.round(snapshot.playerResourceStockpile.gunpowder).toLocaleString();
      this.resourceAlloy.textContent = Math.round(snapshot.playerResourceStockpile.alloy).toLocaleString();
    }

    const gathering = snapshot.resourcesEnabled && snapshot.resourceGatheringProgress !== null;
    this.resourceGather.classList.toggle('hidden', !gathering);
    if (!gathering) return;
    this.resourceGatherLabel.textContent = snapshot.resourceGatheringLabel;
    this.resourceGatherDetail.textContent = snapshot.resourceGatheringDetail;
    this.resourceGatherBar.style.width = `${Math.round((snapshot.resourceGatheringProgress ?? 0) * 100)}%`;
  }

  private updatePlayerPanel(snapshot: GameSnapshot, ready: boolean): void {
    const className = this.classLabel(snapshot.playerClass);
    if (snapshot.playerReinforcementsExhausted) {
      this.playerState.textContent = `${className} · 部隊壊滅 · 増援枯渇`;
      this.playerDetail.textContent = '味方の残存部隊が最後の戦力です · 観戦しながらFinal Standを見届けてください';
      return;
    }
    if (snapshot.playerRespawn !== null) {
      this.playerState.textContent = `部隊壊滅 · 次回 ${this.classLabel(snapshot.playerNextClass)} / Spawn ${String.fromCharCode(65 + snapshot.playerNextSpawn)}`;
      this.playerDetail.textContent = `援軍到着まで ${snapshot.playerRespawn.toFixed(1)}秒`;
      return;
    }
    if (snapshot.playerRecruitmentProgress !== null) {
      this.playerState.textContent = `${className} · 増員中 +${snapshot.playerRecruitmentCount}人`;
      this.playerDetail.textContent = `兵舎で編成中 ${Math.round(snapshot.playerRecruitmentProgress * 100)}% · 移動すると中断`;
      return;
    }
    if (snapshot.playerBaseRecoveryRemaining !== null) {
      this.playerState.textContent = snapshot.recruitmentEnabled ? `${className} · 士気回復中` : `${className} · 補充中`;
      this.playerDetail.textContent = snapshot.recruitmentEnabled
        ? `士気・資材回復まで ${snapshot.playerBaseRecoveryRemaining.toFixed(1)}秒 · 兵員は兵舎で増員`
        : `兵員・士気・資材回復まで ${snapshot.playerBaseRecoveryRemaining.toFixed(1)}秒`;
      return;
    }

    const mode = snapshot.playerMode === 'bannerAttack'
      ? snapshot.playerBannerInRange ? 'DESTROYING BANNER' : 'TO BANNER'
      : snapshot.playerMode.toUpperCase();
    this.playerState.textContent = `${className} · ${snapshot.playerAlive}/${snapshot.playerMaxSoldiers} · ${formationShapeLabel(snapshot.playerFormationShape)} · ${mode} · 士気 ${Math.round(snapshot.playerMorale)}${snapshot.equipmentEnabled ? ` · ${snapshot.playerEquipmentSummary}` : ''}`;
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
      const profile = artilleryProfile(snapshot.playerClass, snapshot.playerArtilleryPerformanceTier as 1 | 2 | 3, snapshot.playerArtilleryBatteryTier as 1 | 2 | 3);
      const rangeText = `射程 ${Math.round(profile.minRange).toLocaleString()}–${Math.round(profile.range).toLocaleString()}`;
      const aimText = snapshot.playerArtilleryAimDistance === null
        ? ''
        : ` · 照準 ${Math.round(snapshot.playerArtilleryAimDistance).toLocaleString()}${snapshot.playerArtilleryAimIssue ? '（射程外）' : '（射程内）'}`;
      if (!snapshot.playerArtilleryDeployed) this.playerDetail.textContent = `CANNON · DEPLOY ${Math.round(snapshot.playerArtilleryDeployProgress * 100)}% · ${rangeText}${aimText}`;
      else this.playerDetail.textContent = ready ? `CANNON · READY · ${rangeText}${aimText}` : `CANNON · RELOAD ${snapshot.playerReload.toFixed(1)}s · ${rangeText}${aimText}`;
      return;
    }

    if (snapshot.selectedWeapon === 'musket') this.playerDetail.textContent = ready ? 'MUSKET · READY' : `MUSKET · RELOAD ${snapshot.playerReload.toFixed(1)}s`;
    else if (snapshot.selectedWeapon === 'bayonet') this.playerDetail.textContent = 'BAYONET · CHARGE / MELEE';
    else this.playerDetail.textContent = 'AXE · OBJECTIVE DAMAGE';
  }

  private updateHotbar(snapshot: GameSnapshot): void {
    for (const slot of this.slots) this.clearSlot(slot);
    if (this.builderMode && this.builderAvailable && snapshot.conquestEnabled) {
      const entries: Array<{ kind: ConstructionBlockKind; key: string; icon: string; label: string }> = [
        { kind: 'woodWall', key: '2', icon: '▰', label: '木製壁' },
        { kind: 'ironWall', key: '3', icon: '▰', label: '強化壁' },
        { kind: 'loophole', key: '4', icon: '▥', label: '銃眼' },
        { kind: 'door', key: '5', icon: '▯', label: '扉' },
        { kind: 'roadTile', key: '6', icon: '═', label: '道路' },
        { kind: 'bridgeTile', key: '7', icon: '≋', label: '橋' },
      ];
      this.configureSlot(0, '1', '⚔', '戦闘モード', false, null, '戻る');
      entries.forEach((entry, index) => {
        const cost = CONSTRUCTION_COSTS[entry.kind];
        const price = [cost.wood ? `木${cost.wood}` : '', cost.iron ? `鉄${cost.iron}` : '', cost.alloy ? `合${cost.alloy}` : ''].filter(Boolean).join(' ');
        this.configureSlot(index + 1, entry.key, entry.icon, entry.label, this.builderKind === entry.kind, null, price);
      });
      this.configureSlot(7, 'R', '↻', '90°回転', false);
      return;
    }
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
      const cannonProfile = artilleryProfile(snapshot.playerClass, snapshot.playerArtilleryPerformanceTier as 1 | 2 | 3, snapshot.playerArtilleryBatteryTier as 1 | 2 | 3);
      const cannonLabel = snapshot.playerClass === 'heavyArtillery' ? `重砲 ${cannonProfile.guns}門` : snapshot.playerClass === 'horseArtillery' ? `騎砲 ${cannonProfile.guns}門` : `野砲 ${cannonProfile.guns}門`;
      this.configureSlot(0, 'LMB', '●', cannonLabel, snapshot.playerArtilleryDeployed && snapshot.playerReload <= 0, cannonProgress, cannonState);
      this.configureSlot(1, 'AUTO', '⌛', snapshot.playerArtilleryDeployed ? '展開済' : '展開', !snapshot.playerArtilleryDeployed);
      this.configureSlot(2, 'F', '↶', '再整列', snapshot.playerMode === 'reforming');
    }

    if (snapshot.playerClass === 'grenadier') {
      const grenadeProgress = snapshot.playerGrenadeCooldown <= 0 ? 1 : Math.max(0, 1 - snapshot.playerGrenadeCooldown / 12);
      this.configureSlot(3, '4', '●', '手榴弾', snapshot.playerGrenadeCooldown <= 0, grenadeProgress, snapshot.playerGrenadeCooldown <= 0 ? '使用可' : '再使用待ち');
    }
    if (snapshot.conquestEnabled && this.builderAvailable) {
      this.configureSlot(4, '5', '▦', 'Builder Mode', true, null, '5 で切替');
    }
    const shapeIcon = snapshot.playerFormationShape === 'line' ? '━' : snapshot.playerFormationShape === 'column' ? '║' : '▦';
    this.configureSlot(5, '6', shapeIcon, `隊列: ${formationShapeLabel(snapshot.playerFormationShape)}`, true, null, 'CLICK / 6 で切替');
  }

  toggleClassReservation(): void {
    if (!this.lastSnapshot || this.lastSnapshot.winner || this.lastSnapshot.playerRespawn !== null || this.lastSnapshot.playerReinforcementsExhausted) return;
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
    if (snapshot.playerReinforcementsExhausted) this.reservationOpen = false;
    const active = !snapshot.playerReinforcementsExhausted && (dead || (this.reservationOpen && !snapshot.winner));
    this.classSelector.classList.toggle('hidden', !active);

    this.reserveClassToggle.classList.toggle('reserved', snapshot.playerHasReservedClass);
    this.reserveClassToggle.textContent = `次回出撃 · ${this.classLabel(snapshot.playerNextClass)} / Spawn ${String.fromCharCode(65 + snapshot.playerNextSpawn)} [N]`;
    this.reserveClassToggle.disabled = !!snapshot.winner || snapshot.playerReinforcementsExhausted;

    if (!active) return;
    this.classSelectorTitle.textContent = dead ? '次の出撃を選択' : '次回出撃を予約';
    this.classSelectorDescription.textContent = dead && snapshot.playerRespawn !== null
      ? snapshot.recruitmentEnabled
        ? `援軍到着まで ${snapshot.playerRespawn.toFixed(1)}秒 · CONQUESTでは標準編成で再出撃し、資源で上限を拡張できます`
        : `援軍到着まで ${snapshot.playerRespawn.toFixed(1)}秒 · 兵科とSpawnを選択`
      : snapshot.recruitmentEnabled
        ? '次回兵科とSpawnを予約 · CONQUESTも標準編成で出撃します · 兵舎で上限を強化できます · Nで閉じる'
        : '次に部隊が全滅した際の兵科とSpawnを予約します · Nで閉じる';
    this.armyComposition.textContent = `BLUE ${this.blueFactionName} · 戦列${snapshot.blueClasses.infantry} 軽歩${snapshot.blueClasses.lightInfantry} 擲弾${snapshot.blueClasses.grenadier} 狙撃${snapshot.blueClasses.sharpshooter} 工兵${snapshot.blueClasses.engineer} 竜騎${snapshot.blueClasses.dragoon} 騎兵${snapshot.blueClasses.cavalry} フッサー${snapshot.blueClasses.hussar} 胸甲${snapshot.blueClasses.cuirassier} 野砲${snapshot.blueClasses.artillery} 重砲${snapshot.blueClasses.heavyArtillery} 騎砲${snapshot.blueClasses.horseArtillery}`;
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
