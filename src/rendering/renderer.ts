import { ArtilleryShell } from '../entities/artilleryShell';
import { Banner } from '../entities/banner';
import { Formation } from '../entities/formation';
import { Projectile } from '../entities/projectile';
import { Fieldwork } from '../entities/fieldwork';
import { ConstructionBlock } from '../entities/constructionBlock';
import { Camera } from '../game/camera';
import { GAME_CONFIG } from '../game/config';
import { minimapRect, type MinimapPosition } from '../game/minimapLayout';
import { BATTLEFIELD_MAP, CROSSINGS, type BattlefieldMap, type TerrainType } from '../game/battlefieldMap';
import { RESOURCE_LABELS, type ResourceNodeState } from '../game/resourceSystem';
import { BARRACKS } from '../game/recruitmentSystem';
import { UPGRADE_FACILITIES } from '../game/upgradeSystem';
import type { AxeStrike, GameSnapshot } from '../game/game';
import type { TerrainDamageSystem } from '../game/terrainDamageSystem';
import { classShortLabel, isArtilleryClass, isChargeCavalryClass, teamDisplayColor, type SquadClass, type Team, type Vec2, type WeaponType } from '../game/types';
import { artilleryProfile } from '../game/classProfiles';
import { artilleryGunLocalOffset } from '../game/formationSystem';
import { DEFAULT_BLUE_FACTION, DEFAULT_RED_FACTION, DEFAULT_YELLOW_FACTION, DEFAULT_GREEN_FACTION, factionShortLabel, type FactionId } from '../game/factionBanners';
import type { ArtilleryExplosion } from '../systems/artillerySystem';
import type { CorpseParticle, MuzzleFlash, SmokeParticle } from '../systems/combatSystem';
import type { MeleeStrike } from '../systems/meleeSystem';

export class Renderer {
  private minimapOpacity = 0.86;
  private minimapPosition: MinimapPosition = 'bottom-right';
  private minimapTerrainCache: HTMLCanvasElement | null = null;
  private constructionGhost: { position: Vec2; kind: ConstructionBlock['kind']; direction: number; valid: boolean; cooldown: boolean } | null = null;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    private readonly blueFaction: FactionId = DEFAULT_BLUE_FACTION,
    private readonly redFaction: FactionId = DEFAULT_RED_FACTION,
    private readonly yellowFaction: FactionId = DEFAULT_YELLOW_FACTION,
    private readonly greenFaction: FactionId = DEFAULT_GREEN_FACTION,
  ) {}

  setMinimapOpacity(value: number): void {
    this.minimapOpacity = Math.max(0.2, Math.min(1, value));
  }

  setMinimapPosition(value: MinimapPosition): void {
    this.minimapPosition = value;
  }

  setConstructionGhost(ghost: { position: Vec2; kind: ConstructionBlock['kind']; direction: number; valid: boolean; cooldown: boolean } | null): void {
    this.constructionGhost = ghost;
  }

  private factionForTeam(team: Team): FactionId {
    if (team === 'blue') return this.blueFaction;
    if (team === 'red') return this.redFaction;
    if (team === 'yellow') return this.yellowFaction;
    return this.greenFaction;
  }

  private teamRgba(team: Team, alpha: number): string {
    const rgb: Record<Team, [number, number, number]> = {
      blue: [95, 157, 232], red: [220, 102, 102], yellow: [210, 173, 61], green: [88, 173, 114],
    };
    const [r, g, b] = rgb[team];
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private teamLightColor(team: Team): string {
    if (team === 'blue') return '#a9cfff';
    if (team === 'red') return '#ffb0b0';
    if (team === 'yellow') return '#f2dc79';
    return '#9ce0af';
  }

  private teamDarkColor(team: Team): string {
    if (team === 'blue') return '#233e68';
    if (team === 'red') return '#742226';
    if (team === 'yellow') return '#6f5b16';
    return '#225c36';
  }

  private drawFactionFlag(faction: FactionId, x: number, y: number, width: number, height: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    if (faction === 'FRENCH') {
      ctx.fillStyle = '#1f4f9a';
      ctx.fillRect(x, y, width / 3, height);
      ctx.fillStyle = '#eee9dc';
      ctx.fillRect(x + width / 3, y, width / 3, height);
      ctx.fillStyle = '#b73238';
      ctx.fillRect(x + width * 2 / 3, y, width / 3, height);
    } else if (faction === 'PRUSSIAN') {
      ctx.fillStyle = '#eeeade';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#171717';
      ctx.fillRect(x + width * 0.44, y, width * 0.12, height);
      ctx.fillRect(x, y + height * 0.40, width, height * 0.20);
      ctx.fillStyle = '#c6a94f';
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y + height * 0.5, Math.min(width, height) * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#171717';
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y + height * 0.5, Math.min(width, height) * 0.065, 0, Math.PI * 2);
      ctx.fill();
    } else if (faction === 'BRITISH') {
      ctx.fillStyle = '#26477d';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#f0eadc';
      ctx.lineWidth = Math.max(2, height * 0.22);
      ctx.beginPath();
      ctx.moveTo(x - width * 0.05, y);
      ctx.lineTo(x + width * 1.05, y + height);
      ctx.moveTo(x + width * 1.05, y);
      ctx.lineTo(x - width * 0.05, y + height);
      ctx.stroke();
      ctx.strokeStyle = '#c53d42';
      ctx.lineWidth = Math.max(1, height * 0.09);
      ctx.beginPath();
      ctx.moveTo(x - width * 0.05, y);
      ctx.lineTo(x + width * 1.05, y + height);
      ctx.moveTo(x + width * 1.05, y);
      ctx.lineTo(x - width * 0.05, y + height);
      ctx.stroke();
      ctx.fillStyle = '#f0eadc';
      ctx.fillRect(x + width * 0.39, y, width * 0.22, height);
      ctx.fillRect(x, y + height * 0.34, width, height * 0.32);
      ctx.fillStyle = '#c53d42';
      ctx.fillRect(x + width * 0.44, y, width * 0.12, height);
      ctx.fillRect(x, y + height * 0.41, width, height * 0.18);
    } else {
      ctx.fillStyle = '#eee9dc';
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#2e674c';
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + width * 0.34, y); ctx.lineTo(x, y + height * 0.34); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + width, y); ctx.lineTo(x + width * 0.66, y); ctx.lineTo(x + width, y + height * 0.34); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y + height); ctx.lineTo(x + width * 0.34, y + height); ctx.lineTo(x, y + height * 0.66); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + width, y + height); ctx.lineTo(x + width * 0.66, y + height); ctx.lineTo(x + width, y + height * 0.66); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8a84d';
      ctx.beginPath();
      ctx.moveTo(x + width * 0.5, y + height * 0.20);
      ctx.lineTo(x + width * 0.68, y + height * 0.50);
      ctx.lineTo(x + width * 0.5, y + height * 0.80);
      ctx.lineTo(x + width * 0.32, y + height * 0.50);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#282820';
      ctx.beginPath();
      ctx.arc(x + width * 0.5, y + height * 0.5, Math.min(width, height) * 0.085, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 232, 190, 0.92)';
    ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.045);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }

  private routedPalette(team: Team): { body: string; skin: string; dark: string; label: string; morale: string; minimap: string; minimapLocal: string } {
    const base = teamDisplayColor(team);
    return {
      body: team === 'blue' ? '#687b91' : team === 'red' ? '#8b6b70' : team === 'yellow' ? '#8b825e' : '#5f806a',
      skin: '#b6afa2',
      dark: team === 'blue' ? '#526578' : team === 'red' ? '#73565b' : team === 'yellow' ? '#716a4d' : '#4b6855',
      label: base,
      morale: base,
      minimap: base,
      minimapLocal: base,
    };
  }


  render(
    formations: Formation[],
    banners: Banner[],
    projectiles: Projectile[],
    artilleryShells: ArtilleryShell[],
    artilleryExplosions: ArtilleryExplosion[],
    fieldworks: Fieldwork[],
    constructionBlocks: ConstructionBlock[],
    terrainDamage: TerrainDamageSystem,
    battlefieldMap: BattlefieldMap,
    resourceNodes: readonly ResourceNodeState[],
    smoke: SmokeParticle[],
    flashes: MuzzleFlash[],
    corpses: CorpseParticle[],
    strikes: MeleeStrike[],
    axeStrikes: AxeStrike[],
    snapshot: GameSnapshot,
    camera: Camera,
    formationLabels: ReadonlyMap<string, string> = new Map(),
    localFormationId: string | null = null,
  ): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);
    ctx.fillStyle = '#192014';
    ctx.fillRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);

    const shake = snapshot.introActive ? 0 : snapshot.screenShake;
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake * 2 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    camera.applyTransform(ctx);
    this.drawBattlefield(camera, snapshot, resourceNodes, terrainDamage, battlefieldMap);
    this.drawCapturePoints(snapshot, camera);
    const localTeam = localFormationId ? formations.find((formation) => formation.id === localFormationId)?.team ?? null : null;
    this.drawBanners(banners, camera, snapshot.selectedWeapon, localTeam);
    this.drawCorpses(corpses, camera);
    this.drawSmoke(smoke, camera);
    this.drawProjectiles(projectiles, camera);
    this.drawArtilleryShells(artilleryShells, camera);
    this.drawArtilleryExplosions(artilleryExplosions, camera);
    this.drawFieldworks(fieldworks, camera);
    this.drawConstructionBlocks(constructionBlocks, camera);
    this.drawConstructionGhost();
    this.drawPlayerArtilleryRange(formations, snapshot, camera, localFormationId);
    this.drawFormations(formations, camera, formationLabels, localFormationId);
    this.drawMuzzleFlashes(flashes, camera);
    this.drawMeleeStrikes(strikes, camera);
    this.drawAxeStrikes(axeStrikes, camera);
    if (snapshot.chargeAiming && snapshot.chargeAimTarget) {
      // Every human squad is marked as player-controlled in multiplayer.
      // Bind the local charge preview to this client's own formation ID only.
      const player = localFormationId
        ? formations.find((formation) => formation.id === localFormationId)
        : formations.find((formation) => formation.isPlayerControlled);
      if (player) this.drawChargeArrow(player.center, snapshot.chargeAimTarget);
    }
    if (snapshot.debugAi) this.drawAiDebug(formations, camera);
    ctx.restore();

    this.drawMinimap(formations, banners, camera, snapshot, localFormationId, resourceNodes, battlefieldMap);
    this.drawPlayerMode(snapshot);
    if (snapshot.introActive) this.drawIntro(snapshot);
    this.drawResult(snapshot);
  }

  private drawBattlefield(camera: Camera, snapshot: GameSnapshot, resourceNodes: readonly ResourceNodeState[], terrainDamage: TerrainDamageSystem, battlefieldMap: BattlefieldMap): void {
    const { ctx } = this;
    ctx.fillStyle = '#536746';
    ctx.fillRect(0, 0, GAME_CONFIG.world.width, GAME_CONFIG.world.height);

    const bounds = camera.visibleBounds(160);
    const tile = battlefieldMap.tileSize;
    const startCol = Math.max(0, Math.floor(bounds.left / tile));
    const endCol = Math.min(battlefieldMap.columns - 1, Math.ceil(bounds.right / tile));
    const startRow = Math.max(0, Math.floor(bounds.top / tile));
    const endRow = Math.min(battlefieldMap.rows - 1, Math.ceil(bounds.bottom / tile));

    // OPEN_FIELD is entirely plain static terrain. The base fill above already draws
    // the correct ground, so avoid hundreds of redundant per-tile fillRect/detail
    // calls every frame. River map and any destructible static terrain keep the full
    // tile renderer. Player-built roads/bridges are rendered separately as construction.
    if (battlefieldMap.mapId !== 'OPEN_FIELD') {
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          const terrain = terrainDamage.effectiveTerrainAtTile(col, row);
          const x = col * tile;
          const y = row * tile;
          ctx.fillStyle = this.terrainColor(terrain);
          ctx.fillRect(x, y, tile + 1, tile + 1);
          this.drawTerrainDetail(terrain, x, y, tile, col, row, camera);
          const damageState = terrainDamage.stateAtTile(col, row);
          if (damageState && !damageState.destroyed && damageState.hp > 0 && damageState.hp < damageState.maxHp) {
            const ratio = damageState.maxHp <= 0 ? 0 : damageState.hp / damageState.maxHp;
            ctx.strokeStyle = ratio > 0.66 ? 'rgba(65,38,28,0.35)' : ratio > 0.33 ? 'rgba(65,38,28,0.58)' : 'rgba(40,25,18,0.78)';
            ctx.lineWidth = (ratio > 0.33 ? 2 : 3) / camera.zoom;
            ctx.beginPath();
            ctx.moveTo(x + tile * 0.18, y + tile * 0.24);
            ctx.lineTo(x + tile * 0.48, y + tile * 0.46);
            ctx.lineTo(x + tile * 0.34, y + tile * 0.78);
            if (ratio < 0.5) { ctx.moveTo(x + tile * 0.48, y + tile * 0.46); ctx.lineTo(x + tile * 0.82, y + tile * 0.30); }
            if (ratio < 0.25) { ctx.moveTo(x + tile * 0.50, y + tile * 0.50); ctx.lineTo(x + tile * 0.76, y + tile * 0.82); }
            ctx.stroke();
          }
        }
      }
    }

    ctx.strokeStyle = 'rgba(235, 225, 192, 0.05)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.beginPath();
    for (let col = startCol; col <= endCol + 1; col += 1) {
      const x = col * tile;
      ctx.moveTo(x, startRow * tile);
      ctx.lineTo(x, (endRow + 1) * tile);
    }
    for (let row = startRow; row <= endRow + 1; row += 1) {
      const y = row * tile;
      ctx.moveTo(startCol * tile, y);
      ctx.lineTo((endCol + 1) * tile, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(235, 221, 176, 0.38)';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.strokeRect(0, 0, GAME_CONFIG.world.width, GAME_CONFIG.world.height);

    this.drawHomeGround('blue', { x: GAME_CONFIG.banner.blueX, y: GAME_CONFIG.banner.blueY }, camera);
    this.drawHomeGround('red', { x: GAME_CONFIG.banner.redX, y: GAME_CONFIG.banner.redY }, camera);
    this.drawSpawnCamp('blue', battlefieldMap.spawnCenter('blue'), camera);
    this.drawSpawnCamp('red', battlefieldMap.spawnCenter('red'), camera);
    this.drawMapSites(camera, snapshot, resourceNodes);
    this.drawBarracks(camera, snapshot);
    this.drawUpgradeFacilities(camera, snapshot);
    if (battlefieldMap.mapId === 'GRAND_RIVER') this.drawCrossingLabels(camera, battlefieldMap);

    ctx.fillStyle = 'rgba(30, 42, 27, 0.28)';
    ctx.font = `${28 / camera.zoom}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(battlefieldMap.mapId === 'OPEN_FIELD' ? '平原' : '河川', GAME_CONFIG.world.width / 2, GAME_CONFIG.world.height / 2 - 420);
  }

  private terrainColor(terrain: TerrainType): string {
    switch (terrain) {
      case 'road': return '#7b704e';
      case 'forest': return '#344f36';
      case 'mountain': return '#5b5a50';
      case 'river': return '#385e70';
      case 'ford': return '#587178';
      case 'bridge': return '#8b7048';
      default: return '#536746';
    }
  }

  private drawTerrainDetail(terrain: TerrainType, x: number, y: number, tile: number, col: number, row: number, camera: Camera): void {
    const { ctx } = this;
    const seed = ((col * 73856093) ^ (row * 19349663)) >>> 0;
    const n = (seed % 997) / 997;
    if (terrain === 'forest') {
      ctx.fillStyle = 'rgba(18, 42, 25, 0.46)';
      for (let i = 0; i < 3; i += 1) {
        const px = x + tile * (0.22 + ((n * 13 + i * 0.31) % 0.62));
        const py = y + tile * (0.20 + ((n * 7 + i * 0.27) % 0.60));
        ctx.beginPath();
        ctx.arc(px, py, (8 + ((seed >> (i + 2)) % 7)) / camera.zoom, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (terrain === 'mountain') {
      ctx.fillStyle = 'rgba(40, 39, 35, 0.42)';
      ctx.beginPath();
      ctx.moveTo(x + tile * 0.12, y + tile * 0.82);
      ctx.lineTo(x + tile * 0.48, y + tile * (0.16 + n * 0.12));
      ctx.lineTo(x + tile * 0.88, y + tile * 0.82);
      ctx.closePath();
      ctx.fill();
    } else if (terrain === 'river' || terrain === 'ford') {
      ctx.strokeStyle = terrain === 'river' ? 'rgba(185, 224, 232, 0.16)' : 'rgba(226, 215, 172, 0.20)';
      ctx.lineWidth = 2 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + tile * (0.36 + n * 0.16));
      ctx.quadraticCurveTo(x + tile * 0.5, y + tile * (0.20 + n * 0.18), x + tile - 8, y + tile * (0.45 + n * 0.12));
      ctx.stroke();
    } else if (terrain === 'bridge') {
      ctx.strokeStyle = 'rgba(54, 38, 24, 0.48)';
      ctx.lineWidth = 3 / camera.zoom;
      for (let i = 1; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + i * tile / 4, y + 4);
        ctx.lineTo(x + i * tile / 4, y + tile - 4);
        ctx.stroke();
      }
    } else if (terrain === 'road') {
      ctx.strokeStyle = 'rgba(232, 214, 158, 0.10)';
      ctx.lineWidth = 2 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + tile * 0.5);
      ctx.lineTo(x + tile - 4, y + tile * 0.5);
      ctx.stroke();
    }
  }

  private drawMapSites(camera: Camera, snapshot: GameSnapshot, resourceNodes: readonly ResourceNodeState[]): void {
    if (!snapshot.resourcesEnabled) return;
    const { ctx } = this;

    for (const node of resourceNodes) {
      if (!this.pointVisible(node.position, camera, 190)) continue;
      const depleted = node.amount <= 0.01;
      const amountRatio = node.maxAmount <= 0 ? 0 : Math.max(0, Math.min(1, node.amount / node.maxAmount));
      ctx.save();
      ctx.globalAlpha = depleted ? 0.42 : 1;
      const radius = node.resource === 'alloy' ? 74 : node.rich ? 68 : 60;
      ctx.fillStyle = node.resource === 'wood' ? 'rgba(74, 53, 28, 0.58)'
        : node.resource === 'iron' ? 'rgba(85, 91, 91, 0.62)'
          : node.resource === 'gunpowder' ? 'rgba(104, 82, 45, 0.62)'
            : 'rgba(147, 128, 65, 0.62)';
      ctx.strokeStyle = node.rich ? 'rgba(255, 224, 121, 0.92)' : 'rgba(231, 216, 177, 0.72)';
      ctx.lineWidth = (node.rich ? 4 : 3) / camera.zoom;
      ctx.beginPath();
      ctx.arc(node.position.x, node.position.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (node.resource === 'wood') {
        ctx.strokeStyle = 'rgba(43, 31, 18, 0.9)';
        ctx.lineWidth = 10 / camera.zoom;
        for (let i = -1; i <= 1; i += 1) {
          ctx.beginPath();
          ctx.moveTo(node.position.x - 30, node.position.y + i * 16);
          ctx.lineTo(node.position.x + 30, node.position.y + i * 16);
          ctx.stroke();
        }
      } else if (node.resource === 'iron' || node.resource === 'alloy') {
        const fill = node.resource === 'alloy' ? 'rgba(245, 220, 118, 0.9)' : 'rgba(184, 190, 188, 0.88)';
        ctx.fillStyle = fill;
        for (let i = 0; i < 5; i += 1) {
          const angle = (Math.PI * 2 * i) / 5;
          ctx.beginPath();
          ctx.moveTo(node.position.x + Math.cos(angle) * 16, node.position.y + Math.sin(angle) * 16 - 13);
          ctx.lineTo(node.position.x + Math.cos(angle) * 34 + 11, node.position.y + Math.sin(angle) * 34 + 17);
          ctx.lineTo(node.position.x + Math.cos(angle) * 34 - 11, node.position.y + Math.sin(angle) * 34 + 17);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(60, 48, 31, 0.95)';
        ctx.fillRect(node.position.x - 31, node.position.y - 24, 62, 48);
        ctx.strokeStyle = 'rgba(213, 180, 100, 0.82)';
        ctx.lineWidth = 3 / camera.zoom;
        ctx.strokeRect(node.position.x - 31, node.position.y - 24, 62, 48);
        ctx.beginPath();
        ctx.moveTo(node.position.x - 31, node.position.y);
        ctx.lineTo(node.position.x + 31, node.position.y);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = depleted ? 'rgba(191, 178, 153, 0.72)' : 'rgba(250, 235, 194, 0.96)';
      ctx.font = `bold ${11 / camera.zoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${node.rich ? '★ ' : ''}${RESOURCE_LABELS[node.resource]}`, node.position.x, node.position.y - (radius + 15) / camera.zoom);
      ctx.fillStyle = depleted ? 'rgba(213, 150, 120, 0.8)' : 'rgba(224, 211, 173, 0.72)';
      ctx.font = `${9 / camera.zoom}px ui-monospace, monospace`;
      ctx.fillText(depleted ? '枯渇' : `${Math.round(amountRatio * 100)}%`, node.position.x, node.position.y + (radius + 17) / camera.zoom);
      ctx.restore();
    }
  }


  private drawBarracks(camera: Camera, snapshot: GameSnapshot): void {
    if (!snapshot.recruitmentEnabled) return;
    const { ctx } = this;
    for (const barracks of BARRACKS) {
      if (!this.pointVisible(barracks.position, camera, 220)) continue;
      ctx.save();
      ctx.translate(barracks.position.x, barracks.position.y);
      ctx.fillStyle = barracks.team === 'blue' ? 'rgba(49, 91, 142, 0.82)' : 'rgba(145, 60, 57, 0.82)';
      ctx.strokeStyle = 'rgba(238, 220, 174, 0.92)';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.fillRect(-74, -52, 148, 104);
      ctx.strokeRect(-74, -52, 148, 104);
      ctx.fillStyle = 'rgba(70, 49, 28, 0.95)';
      ctx.beginPath();
      ctx.moveTo(-88, -50);
      ctx.lineTo(0, -94);
      ctx.lineTo(88, -50);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(245, 232, 194, 0.96)';
      ctx.font = `bold ${12 / camera.zoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('兵舎', 0, 79 / camera.zoom);
      ctx.restore();
    }
  }

  private drawUpgradeFacilities(camera: Camera, snapshot: GameSnapshot): void {
    if (!snapshot.equipmentEnabled) return;
    const { ctx } = this;
    for (const facility of UPGRADE_FACILITIES) {
      if (!this.pointVisible(facility.position, camera, 220)) continue;
      ctx.save();
      ctx.translate(facility.position.x, facility.position.y);
      const teamTint = facility.team === 'blue' ? 'rgba(48, 85, 130, 0.88)' : 'rgba(131, 57, 55, 0.88)';
      ctx.fillStyle = teamTint;
      ctx.strokeStyle = facility.kind === 'foundry' ? 'rgba(214, 173, 88, 0.96)' : 'rgba(221, 209, 177, 0.94)';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.fillRect(-66, -45, 132, 90);
      ctx.strokeRect(-66, -45, 132, 90);
      ctx.fillStyle = facility.kind === 'foundry' ? 'rgba(60, 54, 48, 0.98)' : 'rgba(73, 51, 30, 0.98)';
      ctx.beginPath();
      ctx.moveTo(-78, -43);
      ctx.lineTo(0, -82);
      ctx.lineTo(78, -43);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (facility.kind === 'foundry') {
        ctx.fillStyle = 'rgba(45, 43, 40, 0.98)';
        ctx.fillRect(34, -78, 18, 40);
        ctx.fillStyle = 'rgba(221, 181, 86, 0.86)';
        ctx.beginPath();
        ctx.arc(-18, 5, 14 / camera.zoom, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(239, 219, 168, 0.88)';
        ctx.lineWidth = 5 / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(-24, 18);
        ctx.lineTo(24, -18);
        ctx.moveTo(-24, -18);
        ctx.lineTo(24, 18);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(246, 232, 194, 0.98)';
      ctx.font = `bold ${12 / camera.zoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(facility.kind === 'foundry' ? '砲兵工廠' : '工房', 0, 70 / camera.zoom);
      ctx.restore();
    }
  }

  private drawCrossingLabels(camera: Camera, battlefieldMap: BattlefieldMap): void {
    const { ctx } = this;
    for (const crossing of CROSSINGS) {
      const point = { x: crossing.x, y: battlefieldMap.riverY(crossing.x) };
      if (!this.pointVisible(point, camera, 150)) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(245, 232, 194, 0.72)';
      ctx.font = `bold ${10 / camera.zoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(crossing.label, point.x, point.y - 205 / camera.zoom);
      ctx.restore();
    }
  }

  private drawHomeGround(team: 'blue' | 'red', point: Vec2, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = this.teamRgba(team, 0.16);
    ctx.lineWidth = 12 / camera.zoom;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 360, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSpawnCamp(team: 'blue' | 'red', point: Vec2, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = this.teamRgba(team, 0.48);
    ctx.fillStyle = this.teamRgba(team, 0.13);
    ctx.lineWidth = 4 / camera.zoom;
    ctx.setLineDash([18 / camera.zoom, 12 / camera.zoom]);
    ctx.fillRect(point.x - 430, point.y - 360, 860, 720);
    ctx.strokeRect(point.x - 430, point.y - 360, 860, 720);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(235, 226, 198, 0.68)';
    ctx.font = `bold ${18 / camera.zoom}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${team.toUpperCase()} RESPAWN CAMP`, point.x, point.y - 390);
    ctx.font = `${11 / camera.zoom}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(235, 226, 198, 0.46)';
    ctx.fillText('ここで待機すると兵員・士気・資材を回復', point.x, point.y - 365);
    ctx.restore();
  }

  private drawFieldworks(fieldworks: Fieldwork[], camera: Camera): void {
    const { ctx } = this;
    for (const fieldwork of fieldworks) {
      if (!fieldwork.active || !this.pointVisible(fieldwork.position, camera, 180)) continue;
      const { a, b } = fieldwork.endpoints();
      ctx.save();
      ctx.strokeStyle = teamDisplayColor(fieldwork.team);
      ctx.lineWidth = 12 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = '#4c3a28';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      for (let i = 0; i <= 6; i += 1) {
        const t = i / 6;
        const x = a.x + dx * t;
        const y = a.y + dy * t;
        ctx.beginPath();
        ctx.moveTo(x - nx * 18, y - ny * 18);
        ctx.lineTo(x + nx * 18, y + ny * 18);
        ctx.stroke();
      }
      const hpWidth = 90 / camera.zoom;
      ctx.fillStyle = 'rgba(15,15,15,0.65)';
      ctx.fillRect(fieldwork.position.x - hpWidth / 2, fieldwork.position.y - 30 / camera.zoom, hpWidth, 5 / camera.zoom);
      ctx.fillStyle = '#c7b27c';
      ctx.fillRect(fieldwork.position.x - hpWidth / 2, fieldwork.position.y - 30 / camera.zoom, hpWidth * fieldwork.ratio(), 5 / camera.zoom);
      ctx.restore();
    }
  }

  private drawCapturePoints(snapshot: GameSnapshot, camera: Camera): void {
    if (!snapshot.conquestEnabled) return;
    const { ctx } = this;
    for (const point of snapshot.capturePoints) {
      if (!this.pointVisible(point.position, camera, 560)) continue;
      const displayTeam = point.owner ?? point.captureTeam;
      const flagHeight = Math.max(0, Math.min(1, point.progress));
      ctx.save();
      ctx.translate(point.position.x, point.position.y);
      ctx.fillStyle = point.contested
        ? 'rgba(230, 196, 92, 0.12)'
        : displayTeam === 'blue' ? 'rgba(64, 126, 214, 0.12)'
          : displayTeam === 'red' ? 'rgba(201, 68, 68, 0.12)'
            : 'rgba(232, 222, 186, 0.08)';
      ctx.strokeStyle = point.contested
        ? 'rgba(245, 205, 88, 0.85)'
        : displayTeam === 'blue' ? 'rgba(103, 167, 245, 0.75)'
          : displayTeam === 'red' ? 'rgba(238, 102, 102, 0.75)'
            : 'rgba(225, 217, 188, 0.55)';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.beginPath();
      ctx.arc(0, 0, 430, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const poleTop = -92 / camera.zoom;
      const poleBottom = 42 / camera.zoom;
      ctx.strokeStyle = 'rgba(227, 218, 184, 0.92)';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(0, poleBottom);
      ctx.lineTo(0, poleTop);
      ctx.stroke();
      ctx.fillStyle = 'rgba(214, 198, 151, 0.95)';
      ctx.beginPath();
      ctx.arc(0, poleTop, 5 / camera.zoom, 0, Math.PI * 2);
      ctx.fill();

      if (displayTeam && flagHeight > 0.01) {
        const raiseY = poleBottom + (poleTop - poleBottom) * flagHeight;
        const width = 56 / camera.zoom;
        const height = 28 / camera.zoom;
        this.drawFactionFlag(this.factionForTeam(displayTeam), 2 / camera.zoom, raiseY, width, height);
      }

      ctx.font = `bold ${24 / camera.zoom}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f1e7c6';
      const status = point.contested ? `CONTESTED ${point.bluePresence}-${point.redPresence}`
        : point.owner && point.captureTeam && point.captureTeam !== point.owner
          ? `${point.captureTeam.toUpperCase()} ATTACK ${point.bluePresence}-${point.redPresence}`
        : point.owner ? point.owner.toUpperCase()
          : point.captureTeam ? `${point.captureTeam.toUpperCase()} ${Math.round(flagHeight * 100)}%`
            : 'NEUTRAL';
      ctx.fillText(`${point.id} · ${point.label}`, 0, -126 / camera.zoom);
      ctx.font = `${16 / camera.zoom}px system-ui, sans-serif`;
      ctx.fillStyle = point.contested ? '#f4cb64' : '#d8d0b6';
      ctx.fillText(status, 0, -104 / camera.zoom);
      ctx.restore();
    }
  }

  private drawBanners(banners: Banner[], camera: Camera, selectedWeapon: WeaponType, localTeam: Team | null): void {
    for (const banner of banners) {
      if (!this.pointVisible(banner.position, camera, 180)) continue;
      this.drawBanner(banner, camera, selectedWeapon, localTeam);
    }
  }

  private drawBanner(banner: Banner, camera: Camera, selectedWeapon: WeaponType, localTeam: Team | null): void {
    const { ctx } = this;
    const pulse = banner.underAttackTimer > 0 ? 1 + Math.sin(performance.now() * 0.018) * 0.12 : 1;
    ctx.save();
    ctx.translate(banner.position.x, banner.position.y);

    ctx.fillStyle = this.teamRgba(banner.team, 0.16);
    ctx.beginPath();
    ctx.arc(0, 0, GAME_CONFIG.banner.visualRadius * 1.65 * pulse, 0, Math.PI * 2);
    ctx.fill();

    if (selectedWeapon === 'axe' && localTeam !== null && banner.team !== localTeam && !banner.destroyed) {
      ctx.strokeStyle = 'rgba(255, 215, 92, 0.72)';
      ctx.lineWidth = 4 / camera.zoom;
      ctx.setLineDash([11 / camera.zoom, 8 / camera.zoom]);
      ctx.beginPath();
      ctx.arc(0, 0, GAME_CONFIG.banner.clickRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = '#352b1f';
    ctx.lineWidth = 8 / camera.zoom;
    ctx.beginPath();
    ctx.moveTo(0, 52);
    ctx.lineTo(0, -70);
    ctx.stroke();

    if (!banner.destroyed) {
      this.drawFactionFlag(this.factionForTeam(banner.team), 4, -68, 70, 42);
    } else {
      ctx.rotate(0.74);
      ctx.strokeStyle = '#352b1f';
      ctx.lineWidth = 8 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(0, 42);
      ctx.lineTo(0, -66);
      ctx.stroke();
    }

    ctx.fillStyle = '#756349';
    ctx.beginPath();
    ctx.arc(0, 54, 24, 0, Math.PI * 2);
    ctx.fill();

    const barWidth = 120 / camera.zoom;
    const barHeight = 10 / camera.zoom;
    ctx.fillStyle = 'rgba(25, 20, 15, 0.82)';
    ctx.fillRect(-barWidth / 2, -105 / camera.zoom, barWidth, barHeight);
    ctx.fillStyle = teamDisplayColor(banner.team);
    ctx.fillRect(-barWidth / 2, -105 / camera.zoom, barWidth * banner.ratio, barHeight);
    ctx.strokeStyle = 'rgba(244, 234, 210, 0.75)';
    ctx.lineWidth = 1 / camera.zoom;
    ctx.strokeRect(-barWidth / 2, -105 / camera.zoom, barWidth, barHeight);

    ctx.fillStyle = '#f5e8c9';
    ctx.font = `bold ${14 / camera.zoom}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${banner.team.toUpperCase()} · ${factionShortLabel(this.factionForTeam(banner.team))}`, 0, -119 / camera.zoom);
    ctx.restore();
  }

  private drawFormations(
    formations: Formation[],
    camera: Camera,
    formationLabels: ReadonlyMap<string, string>,
    localFormationId: string | null,
  ): void {
    for (const formation of formations) {
      if (formation.aliveCount() === 0 || !this.pointVisible(formation.center, camera, 300)) continue;
      if (formation.id === localFormationId) this.drawPlayerSelection(formation, camera);
      if (formation.spawnProtectionTimer > 0) this.drawSpawnProtection(formation, camera);
      if (isArtilleryClass(formation.squadClass)) this.drawCannon(formation, camera, formation.mode === 'routed');
      for (const soldier of formation.soldiers) {
        if (!soldier.dead) {
          this.drawSoldier(
            soldier.position,
            soldier.direction,
            soldier.team,
            soldier.hitFlashTimer,
            soldier.meleeStabTimer,
            formation.squadClass,
            formation.weapon,
            formation.mode === 'bannerAttack',
            formation.mode === 'routed',
            camera,
          );
        }
      }
      this.drawFormationLabel(formation, camera, formationLabels, localFormationId);
    }
  }

  private drawSoldier(
    position: Vec2,
    direction: number,
    team: Team,
    hitFlashTimer: number,
    stabTimer: number,
    squadClass: SquadClass,
    weapon: WeaponType,
    objectiveAttack: boolean,
    routed: boolean,
    camera: Camera,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(direction);

    const routedColors = this.routedPalette(team);
    const routedBody = routedColors.body;
    const routedSkin = routedColors.skin;
    const teamBody = routed ? routedBody : team === 'blue' ? '#315f99' : team === 'red' ? '#a43d3d' : team === 'yellow' ? '#b2922f' : '#3f8b5c';
    if (isChargeCavalryClass(squadClass) || squadClass === 'dragoon' || squadClass === 'horseArtillery') {
      ctx.fillStyle = hitFlashTimer > 0 ? '#fff1c6' : routed ? routedColors.dark : '#5a4633';
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hitFlashTimer > 0 ? '#fff1c6' : teamBody;
      ctx.fillRect(-3, -7, 10, 8);
      ctx.fillStyle = routed ? routedSkin : '#e4d2aa';
      ctx.beginPath();
      ctx.arc(6, -5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d8d7ca';
      ctx.lineWidth = 2 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(5, -2);
      ctx.lineTo(24 + (stabTimer > 0 ? 7 : 0), -2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (isArtilleryClass(squadClass)) {
      ctx.fillStyle = hitFlashTimer > 0 ? '#fff1c6' : teamBody;
      ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = routed ? routedSkin : '#e4d2aa';
      ctx.beginPath();
      ctx.arc(4, 0, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const body = hitFlashTimer > 0
      ? '#fff1c6'
      : routed ? routedBody : team === 'blue' ? '#315f99' : team === 'red' ? '#a43d3d' : team === 'yellow' ? '#b2922f' : '#3f8b5c';
    ctx.fillStyle = body;
    ctx.fillRect(
      -GAME_CONFIG.soldier.bodyLength / 2,
      -GAME_CONFIG.soldier.bodyWidth / 2,
      GAME_CONFIG.soldier.bodyLength,
      GAME_CONFIG.soldier.bodyWidth,
    );

    ctx.fillStyle = routed ? routedSkin : '#e4d2aa';
    ctx.beginPath();
    ctx.arc(3, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();

    if (weapon === 'axe' || objectiveAttack) {
      const swing = objectiveAttack ? Math.sin(performance.now() * 0.018 + position.x * 0.03) * 0.35 : 0;
      ctx.rotate(swing);
      ctx.strokeStyle = '#5b4027';
      ctx.lineWidth = 2.4 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(3, 0);
      ctx.lineTo(18, -2);
      ctx.stroke();
      ctx.strokeStyle = '#c5c9c6';
      ctx.lineWidth = 4 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(17, -7);
      ctx.lineTo(20, 3);
      ctx.stroke();
    } else {
      const stabExtension = weapon === 'bayonet' && stabTimer > 0 ? 8 : 0;
      ctx.strokeStyle = '#342c21';
      ctx.lineWidth = 2 / Math.max(0.72, camera.zoom);
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(17 + stabExtension, -2);
      ctx.stroke();
      if (weapon === 'bayonet' || stabTimer > 0) {
        ctx.strokeStyle = '#d8d7ca';
        ctx.lineWidth = 1.2 / Math.max(0.72, camera.zoom);
        ctx.beginPath();
        ctx.moveTo(17 + stabExtension, -2);
        ctx.lineTo(24 + stabExtension, -2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawCannon(formation: Formation, camera: Camera, routed = false): void {
    const { ctx } = this;
    const profile = artilleryProfile(formation.squadClass, formation.artilleryPerformanceTier, formation.artilleryBatteryTier);
    const forwardX = Math.cos(formation.direction);
    const forwardY = Math.sin(formation.direction);
    const rightX = -forwardY;
    const rightY = forwardX;
    for (let i = 0; i < profile.guns; i += 1) {
      const offset = artilleryGunLocalOffset(formation.formationShape, i, profile.guns, 34, 42);
      ctx.save();
      ctx.translate(
        formation.center.x + forwardX * offset.forward + rightX * offset.lateral,
        formation.center.y + forwardY * offset.forward + rightY * offset.lateral,
      );
      ctx.rotate(formation.direction);
      const heavy = formation.squadClass === 'heavyArtillery';
      const horse = formation.squadClass === 'horseArtillery';
      const mortar = formation.squadClass === 'mortar';
      const routedColors = this.routedPalette(formation.team);

      if (mortar) {
        // Mortars are deliberately drawn as a separate weapon silhouette rather than
        // a shortened field cannon: broad base plate, short elevated tube, open muzzle
        // and two support legs. This keeps the class readable even at low zoom.
        const body = routed ? routedColors.body : '#49433a';
        const dark = routed ? routedColors.dark : '#24231f';
        const metal = routed ? routedColors.dark : '#34332e';
        const invZoom = 1 / Math.max(0.7, camera.zoom);

        // Circular base plate.
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(-5, 0, 15, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = dark;
        ctx.lineWidth = 2.2 * invZoom;
        ctx.stroke();

        // Bipod/support legs.
        ctx.strokeStyle = dark;
        ctx.lineWidth = 3.2 * invZoom;
        ctx.beginPath();
        ctx.moveTo(3, -2);
        ctx.lineTo(-9, -13);
        ctx.moveTo(3, 2);
        ctx.lineTo(-9, 13);
        ctx.stroke();

        // Short, thick high-angle tube represented from above.
        ctx.strokeStyle = metal;
        ctx.lineCap = 'round';
        ctx.lineWidth = 12 * invZoom;
        ctx.beginPath();
        ctx.moveTo(-1, 0);
        ctx.lineTo(19, 0);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Large open muzzle makes it visually distinct from cannon barrels.
        ctx.fillStyle = '#161613';
        ctx.beginPath();
        ctx.arc(20, 0, 7.2 * invZoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = routed ? routedColors.dark : '#77736a';
        ctx.lineWidth = 2.4 * invZoom;
        ctx.stroke();

        if (formation.artilleryDeployed) {
          ctx.strokeStyle = 'rgba(255, 219, 115, 0.75)';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.beginPath();
          ctx.arc(0, 0, 25, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = routed ? routedColors.dark : '#2c2923';
        ctx.lineWidth = (heavy ? 10 : horse ? 5 : 7) / Math.max(0.7, camera.zoom);
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(heavy ? 58 : horse ? 37 : 43, 0);
        ctx.stroke();
        ctx.fillStyle = routed ? routedColors.body : '#4b4032';
        const wheel = heavy ? 13 : horse ? 8 : 10;
        ctx.beginPath();
        ctx.arc(-5, -10, wheel, 0, Math.PI * 2);
        ctx.arc(-5, 10, wheel, 0, Math.PI * 2);
        ctx.fill();
        if (formation.artilleryDeployed) {
          ctx.strokeStyle = 'rgba(255, 219, 115, 0.75)';
          ctx.lineWidth = 2 / camera.zoom;
          ctx.beginPath();
          ctx.arc(0, 0, heavy ? 34 : 28, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  private drawPlayerSelection(formation: Formation, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 108, 0.92)';
    ctx.lineWidth = 3 / camera.zoom;
    ctx.setLineDash([12 / camera.zoom, 8 / camera.zoom]);
    ctx.beginPath();
    ctx.arc(formation.center.x, formation.center.y, 205, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSpawnProtection(formation: Formation, camera: Camera): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = 'rgba(242, 235, 184, 0.52)';
    ctx.lineWidth = 4 / camera.zoom;
    ctx.beginPath();
    ctx.arc(formation.center.x, formation.center.y, 196, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawFormationLabel(
    formation: Formation,
    camera: Camera,
    formationLabels: ReadonlyMap<string, string>,
    localFormationId: string | null,
  ): void {
    const { ctx } = this;
    const size = Math.max(11, 14 / camera.zoom);
    ctx.textAlign = 'center';
    ctx.font = `bold ${size}px ui-monospace, monospace`;
    const customLabel = formationLabels.get(formation.id);
    const isLocal = formation.id === localFormationId;
    const routedColors = this.routedPalette(formation.team);
    ctx.fillStyle = formation.mode === 'routed'
      ? routedColors.label
      : customLabel
        ? (isLocal ? '#ffe18a' : '#fff0b8')
        : this.teamLightColor(formation.team);
    const suffix = isLocal ? ' · YOU' : '';
    const objective = formation.mode === 'bannerAttack' ? ' · AXE' : '';
    const classTag = classShortLabel(formation.squadClass);
    const deploy = isArtilleryClass(formation.squadClass) && formation.artilleryDeployed ? ' · DEPLOYED' : '';
    const rout = formation.mode === 'routed' ? ' · ROUT' : formation.isShaken() ? ' · SHAKEN' : '';
    const name = customLabel ?? formation.id;
    ctx.fillText(`${name} [${classTag}]${suffix}${objective}${deploy}${rout}  ${formation.aliveCount()} · M${Math.round(formation.morale)}`, formation.center.x, formation.center.y - 54);
    const moraleWidth = 78;
    const moraleY = formation.center.y - 44;
    ctx.fillStyle = 'rgba(20,18,14,.72)';
    ctx.fillRect(formation.center.x - moraleWidth / 2, moraleY, moraleWidth, 4 / camera.zoom);
    ctx.fillStyle = formation.mode === 'routed'
      ? routedColors.morale
      : formation.morale < GAME_CONFIG.morale.routThreshold ? '#d45a55' : formation.morale < GAME_CONFIG.morale.shakenThreshold ? '#d8a64f' : '#7fc48d';
    ctx.fillRect(formation.center.x - moraleWidth / 2, moraleY, moraleWidth * formation.moraleRatio(), 4 / camera.zoom);
  }

  private drawProjectiles(projectiles: Projectile[], camera: Camera): void {
    const { ctx } = this;
    ctx.lineWidth = 1.6 / camera.zoom;
    for (const projectile of projectiles) {
      if (!this.pointVisible(projectile.position, camera, 80)) continue;
      ctx.strokeStyle = this.teamLightColor(projectile.team);
      ctx.beginPath();
      const tail = projectile.trail[projectile.trail.length - 1] ?? projectile.position;
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(projectile.position.x, projectile.position.y);
      ctx.stroke();
    }
  }

  private drawArtilleryShells(shells: ArtilleryShell[], camera: Camera): void {
    const { ctx } = this;
    for (const shell of shells) {
      if (!this.pointVisible(shell.position, camera, 80)) continue;
      ctx.fillStyle = '#211d18';
      ctx.beginPath();
      ctx.arc(shell.position.x, shell.position.y, 5 / Math.max(0.7, camera.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawArtilleryExplosions(explosions: ArtilleryExplosion[], camera: Camera): void {
    const { ctx } = this;
    for (const explosion of explosions) {
      if (!this.pointVisible(explosion.position, camera, 180)) continue;
      const t = 1 - explosion.life / explosion.maxLife;
      const radius = (explosion.radius ?? GAME_CONFIG.artillery.blastRadius) * (0.3 + t * 0.9);
      ctx.fillStyle = `rgba(255, 194, 72, ${0.34 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(explosion.position.x, explosion.position.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 231, 172, ${0.65 * (1 - t)})`;
      ctx.lineWidth = 4 / camera.zoom;
      ctx.beginPath();
      ctx.arc(explosion.position.x, explosion.position.y, radius * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawMuzzleFlashes(flashes: MuzzleFlash[], camera: Camera): void {
    const { ctx } = this;
    for (const flash of flashes) {
      if (!this.pointVisible(flash.position, camera, 60)) continue;
      const ratio = flash.life / GAME_CONFIG.effects.flashLifetime;
      ctx.save();
      ctx.translate(flash.position.x, flash.position.y);
      ctx.rotate(flash.direction);
      ctx.globalAlpha = Math.max(0, ratio);
      ctx.fillStyle = '#ffd35a';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(18, -5);
      ctx.lineTo(12, 0);
      ctx.lineTo(18, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawSmoke(smoke: SmokeParticle[], camera: Camera): void {
    const { ctx } = this;
    for (const particle of smoke) {
      if (!this.pointVisible(particle.position, camera, 80)) continue;
      const t = Math.min(1, particle.age / particle.lifetime);
      const radius = particle.size * (0.65 + t * 1.55);
      ctx.fillStyle = `rgba(224, 224, 213, ${0.24 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(particle.position.x, particle.position.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCorpses(corpses: CorpseParticle[], camera: Camera): void {
    const { ctx } = this;
    for (const corpse of corpses) {
      if (!this.pointVisible(corpse.position, camera, 60)) continue;
      const alpha = Math.min(1, corpse.life / 0.5, corpse.life / corpse.maxLife + 0.2);
      ctx.save();
      ctx.translate(corpse.position.x, corpse.position.y);
      ctx.rotate(corpse.angle);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = this.teamDarkColor(corpse.team);
      ctx.fillRect(-9, -4.5, 18, 9);
      ctx.restore();
    }
  }

  private drawMeleeStrikes(strikes: MeleeStrike[], camera: Camera): void {
    const { ctx } = this;
    for (const strike of strikes) {
      if (!this.pointVisible(strike.start, camera, 60)) continue;
      const alpha = Math.max(0, strike.life / GAME_CONFIG.effects.meleeStrikeLifetime);
      ctx.strokeStyle = this.teamRgba(strike.team, alpha);
      ctx.lineWidth = 2.4 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(strike.start.x, strike.start.y);
      ctx.lineTo(strike.end.x, strike.end.y);
      ctx.stroke();
    }
  }

  private drawAxeStrikes(strikes: AxeStrike[], camera: Camera): void {
    const { ctx } = this;
    for (const strike of strikes) {
      if (!this.pointVisible(strike.start, camera, 80)) continue;
      const alpha = Math.max(0, strike.life / GAME_CONFIG.effects.axeStrikeLifetime);
      ctx.strokeStyle = `rgba(255, 216, 112, ${alpha})`;
      ctx.lineWidth = 4 / camera.zoom;
      ctx.beginPath();
      ctx.moveTo(strike.start.x, strike.start.y);
      ctx.lineTo(strike.end.x, strike.end.y);
      ctx.stroke();
    }
  }

  private drawChargeArrow(start: Vec2, end: Vec2): void {
    const { ctx } = this;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    const px = -ny;
    const py = nx;
    const head = 30;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 98, 0.95)';
    ctx.fillStyle = 'rgba(255, 220, 98, 0.95)';
    ctx.lineWidth = 6;
    ctx.setLineDash([18, 12]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x - nx * head, end.y - ny * head);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - nx * head + px * 16, end.y - ny * head + py * 16);
    ctx.lineTo(end.x - nx * head - px * 16, end.y - ny * head - py * 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawConstructionGhost(): void {
    const ghost = this.constructionGhost;
    if (!ghost) return;
    const { ctx } = this;
    const grid = GAME_CONFIG.world.grid;
    const half = grid * 0.47;
    ctx.save();
    ctx.translate(ghost.position.x, ghost.position.y);
    ctx.rotate(ghost.direction * Math.PI / 2);
    ctx.globalAlpha = 0.48;
    ctx.fillStyle = ghost.valid ? '#56c271' : ghost.cooldown ? '#d36b64' : '#c64f4f';
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.globalAlpha = 0.92;
    ctx.strokeStyle = ghost.valid ? '#a5f0b7' : '#ff9a91';
    ctx.lineWidth = 3;
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    if (ghost.kind === 'loophole') {
      ctx.fillStyle = '#1a1d19';
      ctx.fillRect(half * 0.15, -half * 0.18, half * 0.88, half * 0.36);
    } else if (ghost.kind === 'door') {
      ctx.fillStyle = '#3d2a1c'; ctx.fillRect(-half * 0.42, -half * 0.72, half * 0.84, half * 1.44);
    } else if (ghost.kind === 'roadTile') {
      ctx.fillStyle = '#8a7657'; ctx.fillRect(-half, -half * 0.52, half * 2, half * 1.04);
    } else if (ghost.kind === 'bridgeTile') {
      ctx.fillStyle = '#9a7043';
      for (let y = -half * 0.75; y <= half * 0.75; y += half * 0.38) ctx.fillRect(-half, y, half * 2, half * 0.18);
    }
    ctx.restore();
  }

  private drawConstructionBlocks(blocks: ConstructionBlock[], camera: Camera): void {
    void camera;
    const { ctx } = this;
    const grid = GAME_CONFIG.world.grid;
    for (const block of blocks) {
      if (!block.active) continue;
      const p = block.position;
      const half = grid * 0.47;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(block.direction * Math.PI / 2);
      const ratio = block.ratio();
      if (block.kind === 'ironWall') ctx.fillStyle = '#5e6468';
      else if (block.kind === 'loophole') ctx.fillStyle = '#6f5338';
      else if (block.kind === 'door') ctx.fillStyle = '#64452e';
      else if (block.kind === 'roadTile') ctx.fillStyle = '#75654f';
      else if (block.kind === 'bridgeTile') ctx.fillStyle = '#8b623b';
      else ctx.fillStyle = '#7c5a39';
      ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.strokeStyle = teamDisplayColor(block.team);
      ctx.lineWidth = 3;
      ctx.strokeRect(-half, -half, half * 2, half * 2);
      if (block.kind === 'loophole') {
        ctx.fillStyle = '#171b18';
        ctx.fillRect(half * 0.15, -half * 0.18, half * 0.88, half * 0.36);
      } else if (block.kind === 'door') {
        ctx.fillStyle = '#332117'; ctx.fillRect(-half * 0.38, -half * 0.72, half * 0.76, half * 1.44);
        ctx.fillStyle = '#c8a35f'; ctx.beginPath(); ctx.arc(half * 0.22, 0, 3, 0, Math.PI * 2); ctx.fill();
      } else if (block.kind === 'roadTile') {
        ctx.strokeStyle = 'rgba(220,205,168,0.38)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-half, 0); ctx.lineTo(half, 0); ctx.stroke();
      } else if (block.kind === 'bridgeTile') {
        ctx.fillStyle = '#b1834d';
        for (let y = -half * 0.75; y <= half * 0.75; y += half * 0.38) ctx.fillRect(-half, y, half * 2, half * 0.16);
      }
      if (ratio <= 0.75) {
        ctx.strokeStyle = ratio <= 0.25 ? '#2b1c16' : ratio <= 0.5 ? '#493024' : '#5b4030';
        ctx.lineWidth = ratio <= 0.25 ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(-half * 0.75, -half * 0.55);
        ctx.lineTo(-half * 0.15, half * 0.05);
        ctx.lineTo(-half * 0.45, half * 0.7);
        if (ratio <= 0.5) {
          ctx.moveTo(half * 0.55, -half * 0.75);
          ctx.lineTo(half * 0.1, -half * 0.05);
          ctx.lineTo(half * 0.65, half * 0.55);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawPlayerArtilleryRange(
    formations: Formation[],
    snapshot: GameSnapshot,
    camera: Camera,
    localFormationId: string | null,
  ): void {
    if (!isArtilleryClass(snapshot.playerClass)) return;
    const player = localFormationId
      ? formations.find((formation) => formation.id === localFormationId)
      : formations.find((formation) => formation.isPlayerControlled);
    if (!player || player.aliveCount() === 0) return;

    const profile = artilleryProfile(snapshot.playerClass, snapshot.playerArtilleryPerformanceTier as 1 | 2 | 3, snapshot.playerArtilleryBatteryTier as 1 | 2 | 3);
    const origin = snapshot.playerArtilleryRangeOrigin ?? player.center;
    const { ctx } = this;
    ctx.save();

    // Maximum range: solid outer ring. The origin comes from the latest authoritative snapshot
    // in multiplayer so the ring matches the coordinates used for firing validation.
    ctx.strokeStyle = snapshot.playerArtilleryAimIssue ? 'rgba(255, 164, 104, 0.82)' : 'rgba(255, 224, 115, 0.82)';
    ctx.lineWidth = 3 / camera.zoom;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, profile.range, 0, Math.PI * 2);
    ctx.stroke();

    // Minimum range: dashed inner ring. Shots inside this circle are invalid.
    if (profile.minRange > 0) {
      ctx.strokeStyle = 'rgba(255, 132, 104, 0.72)';
      ctx.lineWidth = 2.5 / camera.zoom;
      ctx.setLineDash([14 / camera.zoom, 10 / camera.zoom]);
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, profile.minRange, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawAiDebug(formations: Formation[], camera: Camera): void {
    const { ctx } = this;
    const byId = new Map(formations.map((formation) => [formation.id, formation]));
    for (const formation of formations) {
      if (formation.aliveCount() === 0 || formation.isPlayerControlled || !this.pointVisible(formation.center, camera, 300)) continue;
      const target = formation.debugTargetId ? byId.get(formation.debugTargetId) : undefined;
      if (target) {
        ctx.strokeStyle = this.teamRgba(formation.team, 0.24);
        ctx.lineWidth = 2 / camera.zoom;
        ctx.beginPath();
        ctx.moveTo(formation.center.x, formation.center.y);
        ctx.lineTo(target.center.x, target.center.y);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(20, 18, 14, 0.78)';
      const width = 164 / camera.zoom;
      const height = 34 / camera.zoom;
      ctx.fillRect(formation.center.x - width / 2, formation.center.y + 52, width, height);
      ctx.fillStyle = '#f1e6c9';
      ctx.font = `${11 / camera.zoom}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(
        `${formation.squadClass.toUpperCase()} · ${formation.debugIntent} → ${formation.debugTargetId ?? '-'}`,
        formation.center.x,
        formation.center.y + 73 / camera.zoom,
      );
    }
  }

  private drawMinimap(formations: Formation[], banners: Banner[], camera: Camera, snapshot: GameSnapshot, localFormationId: string | null, resourceNodes: readonly ResourceNodeState[], battlefieldMap: BattlefieldMap): void {
    const { ctx } = this;
    const { x, y, width, height } = minimapRect(this.minimapPosition);
    const sx = width / GAME_CONFIG.world.width;
    const sy = height / GAME_CONFIG.world.height;

    ctx.save();
    ctx.globalAlpha = this.minimapOpacity;
    if (!this.minimapTerrainCache || this.minimapTerrainCache.dataset.mapId !== battlefieldMap.mapId) this.minimapTerrainCache = this.buildMinimapTerrainCache(width, height, battlefieldMap);
    ctx.drawImage(this.minimapTerrainCache, x, y, width, height);
    ctx.fillStyle = 'rgba(15, 16, 12, 0.16)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = snapshot.cameraFollow ? 'rgba(224, 211, 170, 0.65)' : 'rgba(255, 218, 115, 0.88)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, height);

    if (isArtilleryClass(snapshot.playerClass)) {
      const player = localFormationId
        ? formations.find((formation) => formation.id === localFormationId)
        : formations.find((formation) => formation.isPlayerControlled);
      if (player && player.aliveCount() > 0) {
        const profile = artilleryProfile(snapshot.playerClass, snapshot.playerArtilleryPerformanceTier as 1 | 2 | 3, snapshot.playerArtilleryBatteryTier as 1 | 2 | 3);
        const origin = snapshot.playerArtilleryRangeOrigin ?? player.center;
        const px = x + origin.x * sx;
        const py = y + origin.y * sy;
        ctx.strokeStyle = 'rgba(255, 224, 115, 0.82)';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.ellipse(px, py, profile.range * sx, profile.range * sy, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (profile.minRange > 0) {
          ctx.strokeStyle = 'rgba(255, 132, 104, 0.76)';
          ctx.setLineDash([3, 2]);
          ctx.beginPath();
          ctx.ellipse(px, py, profile.minRange * sx, profile.minRange * sy, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    if (snapshot.conquestEnabled) {
      for (const point of snapshot.capturePoints) {
        const px = x + point.position.x * sx;
        const py = y + point.position.y * sy;
        const team = point.owner ?? point.captureTeam;
        ctx.fillStyle = point.contested ? '#f0c75e' : team === 'blue' ? '#5f9de8' : team === 'red' ? '#dc6666' : '#d0c8a8';
        ctx.strokeStyle = '#182016';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, point.contested ? 6 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f3ead0';
        ctx.font = 'bold 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(point.id, px, py - 8);
      }
    }

    for (const formation of formations) {
      if (formation.aliveCount() === 0) continue;
      const routedColors = this.routedPalette(formation.team);
      ctx.fillStyle = formation.mode === 'routed'
        ? (formation.id === localFormationId ? routedColors.minimapLocal : routedColors.minimap)
        : formation.id === localFormationId
          ? '#ffe073'
          : teamDisplayColor(formation.team);
      const px = x + formation.center.x * sx;
      const py = y + formation.center.y * sy;
      const size = formation.id === localFormationId ? 7 : formation.mode === 'bannerAttack' ? 6 : 4;
      if (isChargeCavalryClass(formation.squadClass)) {
        ctx.beginPath();
        ctx.moveTo(px + size, py);
        ctx.lineTo(px - size, py - size * 0.8);
        ctx.lineTo(px - size, py + size * 0.8);
        ctx.closePath();
        ctx.fill();
      } else if (isArtilleryClass(formation.squadClass)) {
        ctx.beginPath();
        ctx.arc(px, py, size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      }
    }

    if (snapshot.resourcesEnabled) {
      for (const node of resourceNodes) {
        const px = x + node.position.x * sx;
        const py = y + node.position.y * sy;
        const depleted = node.amount <= 0.01;
        ctx.fillStyle = depleted ? 'rgba(132, 124, 108, 0.65)'
          : node.resource === 'wood' ? 'rgba(122, 174, 102, 0.92)'
            : node.resource === 'iron' ? 'rgba(185, 194, 196, 0.92)'
              : node.resource === 'gunpowder' ? 'rgba(209, 157, 83, 0.92)'
                : 'rgba(248, 220, 104, 0.96)';
        const r = node.resource === 'alloy' ? 3.8 : node.rich ? 3.0 : 2.5;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (snapshot.recruitmentEnabled) {
      for (const barracks of BARRACKS) {
        const px = x + barracks.position.x * sx;
        const py = y + barracks.position.y * sy;
        ctx.fillStyle = barracks.team === 'blue' ? '#b6d5ff' : '#ffc0b8';
        ctx.fillRect(px - 3.5, py - 3.5, 7, 7);
        ctx.strokeStyle = 'rgba(44, 35, 24, 0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - 3.5, py - 3.5, 7, 7);
      }
    }

    for (const banner of banners) {
      const px = x + banner.position.x * sx;
      const py = y + banner.position.y * sy;
      ctx.fillStyle = banner.destroyed ? '#5b5142' : teamDisplayColor(banner.team);
      ctx.beginPath();
      ctx.moveTo(px, py - 7);
      ctx.lineTo(px + 7, py);
      ctx.lineTo(px, py + 7);
      ctx.lineTo(px - 7, py);
      ctx.closePath();
      ctx.fill();
    }

    const bounds = camera.visibleBounds();
    ctx.strokeStyle = '#f4e9c9';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x + bounds.left * sx,
      y + bounds.top * sy,
      (bounds.right - bounds.left) * sx,
      (bounds.bottom - bounds.top) * sy,
    );
    ctx.fillStyle = 'rgba(244, 233, 201, 0.9)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TACTICAL MAP · CLICK TO JUMP', x + 7, y + 12);
    ctx.restore();
  }

  private buildMinimapTerrainCache(width: number, height: number, battlefieldMap: BattlefieldMap = BATTLEFIELD_MAP): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    canvas.dataset.mapId = battlefieldMap.mapId;
    const tileW = width / battlefieldMap.columns;
    const tileH = height / battlefieldMap.rows;
    for (let row = 0; row < battlefieldMap.rows; row += 1) {
      for (let col = 0; col < battlefieldMap.columns; col += 1) {
        ctx.fillStyle = this.terrainColor(battlefieldMap.terrainAtTile(col, row));
        ctx.fillRect(col * tileW, row * tileH, tileW + 1, tileH + 1);
      }
    }
    return canvas;
  }

  private drawPlayerMode(snapshot: GameSnapshot): void {
    let text = '';
    if (snapshot.chargeAiming) text = snapshot.playerClass === 'cavalry' ? 'CAVALRY CHARGE — RELEASE TO COMMIT' : 'CHARGE VECTOR — RELEASE TO COMMIT';
    else if (snapshot.playerMode === 'charging') text = snapshot.playerClass === 'cavalry' ? 'CAVALRY — FULL CHARGE' : 'PLAYER SQUAD — CHARGING';
    else if (snapshot.playerMode === 'melee') text = 'PLAYER SQUAD — BAYONET MELEE';
    else if (snapshot.playerMode === 'reforming') text = 'PLAYER SQUAD — REFORMING';
    else if (snapshot.playerMode === 'bannerAttack') {
      text = snapshot.playerBannerInRange ? 'DESTROYING ENEMY BANNER' : 'ADVANCING TO ENEMY BANNER';
    }
    if (!text) return;

    const { ctx } = this;
    ctx.fillStyle = 'rgba(25, 20, 14, 0.72)';
    ctx.fillRect(GAME_CONFIG.viewport.width / 2 - 205, 16, 410, 34);
    ctx.strokeStyle = 'rgba(232, 210, 160, 0.72)';
    ctx.strokeRect(GAME_CONFIG.viewport.width / 2 - 205, 16, 410, 34);
    ctx.fillStyle = '#f4ddb0';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, GAME_CONFIG.viewport.width / 2, 38);
  }

  private drawIntro(snapshot: GameSnapshot): void {
    const { ctx } = this;
    if (snapshot.introStage === 'pan-enemy' || snapshot.introStage === 'return-player') return;

    const secondStage = snapshot.introStage === 'enemy-banner';
    ctx.save();
    const panelWidth = snapshot.conquestEnabled ? 620 : secondStage ? 590 : 500;
    const panelHeight = snapshot.conquestEnabled ? 144 : secondStage ? 160 : 104;
    const x = GAME_CONFIG.viewport.width / 2 - panelWidth / 2;
    const y = GAME_CONFIG.viewport.height * 0.68 - panelHeight / 2;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.84)';
    ctx.fillRect(x, y, panelWidth, panelHeight);
    ctx.strokeStyle = 'rgba(236, 218, 174, 0.82)';
    ctx.strokeRect(x, y, panelWidth, panelHeight);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4e7c7';
    ctx.font = 'bold 25px Georgia, serif';

    if (snapshot.conquestEnabled) {
      ctx.fillText(secondStage ? 'TICKETS & FINAL STAND' : 'CAPTURE THE BANNERS', GAME_CONFIG.viewport.width / 2, y + 34);
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = '#d7c8a8';
      if (secondStage) {
        ctx.fillText('2/3拠点以上を保持すると敵Ticketが減少', GAME_CONFIG.viewport.width / 2, y + 66);
        ctx.fillText('敵部隊を完全壊滅させても Ticket -1', GAME_CONFIG.viewport.width / 2, y + 91);
        ctx.fillStyle = '#ffe08a';
        ctx.fillText('Ticket 0 → 増援停止 · 残存部隊全滅で敗北', GAME_CONFIG.viewport.width / 2, y + 121);
      } else {
        ctx.fillText('A / B / C の旗へ部隊を送り込め', GAME_CONFIG.viewport.width / 2, y + 66);
        ctx.fillStyle = '#ffe08a';
        ctx.fillText('敵旗を下ろし、自軍の旗を掲げれば占領', GAME_CONFIG.viewport.width / 2, y + 94);
        ctx.fillStyle = '#b7aa91';
        ctx.fillText('占領力はエリア内の部隊数で決まる', GAME_CONFIG.viewport.width / 2, y + 120);
      }
    } else {
      ctx.fillText(secondStage ? 'ENEMY BANNER' : 'YOUR BANNER', GAME_CONFIG.viewport.width / 2, y + 34);
      ctx.font = '14px ui-monospace, monospace';
      ctx.fillStyle = '#d7c8a8';
      if (secondStage) {
        ctx.fillText('敵Bannerを破壊すれば勝利', GAME_CONFIG.viewport.width / 2, y + 65);
        ctx.fillStyle = '#ffe08a';
        ctx.fillText('Bannerへダメージを与えられるのは歩兵系の「斧」のみ', GAME_CONFIG.viewport.width / 2, y + 91);
        ctx.fillText('[3] AXE を選択 → 敵旗を右クリック', GAME_CONFIG.viewport.width / 2, y + 118);
        ctx.fillStyle = '#b7aa91';
        ctx.fillText('銃撃・砲撃・騎兵突撃ではBannerを破壊できない', GAME_CONFIG.viewport.width / 2, y + 140);
      } else {
        ctx.fillText('この旗を守り抜け', GAME_CONFIG.viewport.width / 2, y + 66);
        ctx.fillStyle = '#b7aa91';
        ctx.fillText('敵歩兵の斧攻撃を許すな', GAME_CONFIG.viewport.width / 2, y + 90);
      }
    }
    ctx.restore();
  }

  private drawResult(snapshot: GameSnapshot): void {
    if (!snapshot.winner) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.68)';
    ctx.fillRect(0, 0, GAME_CONFIG.viewport.width, GAME_CONFIG.viewport.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5ead0';
    ctx.font = 'bold 48px Georgia, serif';
    ctx.fillText('BANNERFALL', GAME_CONFIG.viewport.width / 2, GAME_CONFIG.viewport.height / 2 - 38);
    ctx.font = 'bold 24px Georgia, serif';
    const victoryText = snapshot.conquestEnabled
      ? snapshot.winner === 'blue' ? 'RED REINFORCEMENTS EXHAUSTED — BLUE VICTORY' : 'BLUE REINFORCEMENTS EXHAUSTED — RED VICTORY'
      : snapshot.winner === 'blue' ? 'RED BANNER HAS FALLEN — BLUE VICTORY' : 'BLUE BANNER HAS FALLEN — RED VICTORY';
    ctx.fillText(victoryText, GAME_CONFIG.viewport.width / 2, GAME_CONFIG.viewport.height / 2 + 4);
    ctx.font = '14px ui-monospace, monospace';
    ctx.fillStyle = '#d6c8aa';
    ctx.fillText('R で再戦', GAME_CONFIG.viewport.width / 2, GAME_CONFIG.viewport.height / 2 + 43);
  }

  private pointVisible(point: Vec2, camera: Camera, margin: number): boolean {
    const bounds = camera.visibleBounds(margin);
    return point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom;
  }
}
