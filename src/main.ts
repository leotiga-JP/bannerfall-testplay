import './styles.css';
import { SQUAD_CLASSES, TEAM_IDS, classLabel as squadClassLabel, isSquadClass, type SquadClass, type Team } from './game/types';
import { NetworkClient } from './network/networkClient';
import { BATTLEFIELD_MAP, OPEN_FIELD_MAP, SPAWN_AREA_COUNT, isMapId, mapLabel, type MapId } from './game/battlefieldMap';
import { MultiplayerBattle } from './network/multiplayerBattle';
import type { ChatMessage, MatchStartPayload, RoomBrowserEntry, RoomState, RoomVisibility } from './network/protocol';
import { gameModeDescription, gameModeLabel, isGameMode, type GameMode } from './game/gameMode';
import { DEFAULT_BLUE_FACTION, DEFAULT_RED_FACTION, DEFAULT_YELLOW_FACTION, DEFAULT_GREEN_FACTION, FACTION_IDS, factionLabel, factionShortLabel, isFactionId, type FactionId } from './game/factionBanners';

const menuShell = document.querySelector<HTMLElement>('#menu-shell');
const battleShell = document.querySelector<HTMLElement>('#battle-shell');
const titleScreen = document.querySelector<HTMLElement>('#title-screen');
const createScreen = document.querySelector<HTMLElement>('#create-screen');
const joinScreen = document.querySelector<HTMLElement>('#join-screen');
const browserScreen = document.querySelector<HTMLElement>('#browser-screen');
const roomBrowserList = document.querySelector<HTMLElement>('#room-browser-list');
const roomBrowserSummary = document.querySelector<HTMLElement>('#room-browser-summary');
const lobbyScreen = document.querySelector<HTMLElement>('#lobby-screen');
const playerNameInput = document.querySelector<HTMLInputElement>('#player-name');
const serverUrlInput = document.querySelector<HTMLInputElement>('#server-url');
const connectionStatus = document.querySelector<HTMLElement>('#connection-status');
const connectionDot = document.querySelector<HTMLElement>('#connection-dot');
const menuError = document.querySelector<HTMLElement>('#menu-error');
const canvas = document.querySelector<HTMLCanvasElement>('#game');
const networkStatus = document.querySelector<HTMLElement>('#network-status');
const spawnPoints = document.querySelector<HTMLElement>('#spawn-points');
const deploymentStatus = document.querySelector<HTMLElement>('#deployment-status');
const deploymentMap = document.querySelector<HTMLElement>('#deployment-map');
const deploymentMapFeatures = document.querySelector<HTMLElement>('#deployment-map-features');
const createMapSelect = document.querySelector<HTMLSelectElement>('#create-map');
const createMapPreview = document.querySelector<HTMLElement>('#create-map-preview');
const createMapPreviewFeatures = document.querySelector<HTMLElement>('#create-map-preview-features');
const createMapPreviewTitle = document.querySelector<HTMLElement>('#create-map-preview-title');
const createMapPreviewCaption = document.querySelector<HTMLElement>('#create-map-preview-caption');
const createArmyBalance = document.querySelector<HTMLElement>('#create-army-balance');
const readyButton = document.querySelector<HTMLButtonElement>('#toggle-ready');
const lobbyChatLog = document.querySelector<HTMLElement>('#lobby-chat-log');
const lobbyChatInput = document.querySelector<HTMLInputElement>('#lobby-chat-input');
const battleChatLog = document.querySelector<HTMLElement>('#battle-chat-log');
const battleChatInput = document.querySelector<HTMLInputElement>('#battle-chat-input');
const lobbyCountdown = document.querySelector<HTMLElement>('#lobby-countdown');
const lobbyCountdownNumber = document.querySelector<HTMLElement>('#lobby-countdown-number');

const required = [
  menuShell, battleShell, titleScreen, createScreen, joinScreen, browserScreen, roomBrowserList, roomBrowserSummary, lobbyScreen,
  playerNameInput, serverUrlInput, connectionStatus, connectionDot, menuError, canvas, networkStatus,
  spawnPoints, deploymentStatus, deploymentMap, deploymentMapFeatures, createMapSelect, createMapPreview, createMapPreviewFeatures, createMapPreviewTitle, createMapPreviewCaption, createArmyBalance, readyButton, lobbyChatLog, lobbyChatInput, battleChatLog,
  battleChatInput, lobbyCountdown, lobbyCountdownNumber,
];
if (required.some((element) => !element)) throw new Error('Bannerfall Version 4.6.1 UI initialization failed.');

const network = new NetworkClient();
let currentRoom: RoomState | null = null;
let currentBattle: MultiplayerBattle | null = null;

function activeTeamsForCount(teamCount: number): Team[] {
  return TEAM_IDS.slice(0, Math.max(2, Math.min(4, Math.floor(teamCount)))) as Team[];
}

function activeTeamsForRoom(room: RoomState): Team[] {
  return activeTeamsForCount(room.settings.teamCount);
}

function roomFaction(room: RoomState, team: Team): FactionId {
  if (team === 'blue') return room.settings.blueFaction;
  if (team === 'red') return room.settings.redFaction;
  if (team === 'yellow') return room.settings.yellowFaction;
  return room.settings.greenFaction;
}

function roomSquads(room: RoomState, team: Team): number {
  if (team === 'blue') return room.settings.blueSquads;
  if (team === 'red') return room.settings.redSquads;
  if (team === 'yellow') return room.settings.yellowSquads;
  return room.settings.greenSquads;
}

const CLASS_UI: Record<SquadClass, { summary: string; role: string }> = {
  infantry: { summary: '20兵 · マスケット / 銃剣 / 斧', role: '標準戦列・旗破壊' },
  lightInfantry: { summary: '15兵 · 高機動 / 散開射撃', role: '側面・牽制・旗破壊' },
  grenadier: { summary: '16兵 · 高士気 / 手榴弾', role: '近距離爆破・正面突破' },
  sharpshooter: { summary: '6兵 · 超長射程 / 高精度', role: '対騎兵・遠距離狙撃' },
  engineer: { summary: '12兵 · 高機動 / 建築', role: '陣地構築・旗破壊特化' },
  dragoon: { summary: '14騎 · 高機動 / カービン', role: '突撃不可・機動火力' },
  cavalry: { summary: '12騎 · 高速 / 突撃', role: '突破・砲兵狩り' },
  hussar: { summary: '10騎 · 衝撃突撃', role: '士気破壊・追撃' },
  cuirassier: { summary: '10騎 · 高HP / 重騎兵', role: '耐久戦・戦列拘束' },
  lancer: { summary: '11騎 · 槍 / 高威力突撃', role: '開けた地形での突破・初撃特化' },
  militaryBand: { summary: '10兵 · 射撃不可 / 演奏支援', role: '士気・移動・再装填支援' },
  artillery: { summary: '6兵 · 2門 · 長射程', role: '継続砲撃・陣地防御' },
  heavyArtillery: { summary: '7兵 · 1門 · 巨大爆発', role: '超火力・長い再装填' },
  horseArtillery: { summary: '6兵 · 3門 · 高速展開', role: '前線追従砲撃・陣地防御' },
  mortar: { summary: '6兵 · 曲射 / 遅い着弾', role: '山岳・防壁越しの短射程砲撃' },
};

function renderClassCatalogs(): void {
  const lobby = document.querySelector<HTMLElement>('#lobby-class-cards');
  const respawn = document.querySelector<HTMLElement>('#class-selector .class-cards');
  if (!lobby || !respawn) return;
  lobby.innerHTML = '';
  respawn.innerHTML = '';
  SQUAD_CLASSES.forEach((squadClass) => {
    const info = CLASS_UI[squadClass];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lobby-class-card';
    button.dataset.lobbyClass = squadClass;
    button.innerHTML = `<strong></strong><small></small><em></em>`;
    button.querySelector('strong')!.textContent = classLabel(squadClass);
    button.querySelector('small')!.textContent = info.summary;
    button.querySelector('em')!.textContent = info.role;
    lobby.appendChild(button);

    const card = document.createElement('div');
    card.className = 'class-card';
    card.dataset.class = squadClass;
    card.innerHTML = `<strong></strong><small></small><em></em>`;
    card.querySelector('strong')!.textContent = classLabel(squadClass);
    card.querySelector('small')!.textContent = info.summary;
    card.querySelector('em')!.textContent = info.role;
    respawn.appendChild(card);
  });
}

renderClassCatalogs();
let chatMessages: ChatMessage[] = [];
let countdownInterval: number | null = null;

const params = new URLSearchParams(window.location.search);
playerNameInput!.value = localStorage.getItem('bannerfall.playerName') ?? '';
serverUrlInput!.value = params.get('server') ?? localStorage.getItem('bannerfall.serverUrl') ?? '';
const invitedRoom = params.get('room');
if (invitedRoom) {
  const code = document.querySelector<HTMLInputElement>('#join-code');
  if (code) code.value = invitedRoom.toUpperCase();
}

function showScreen(target: 'title' | 'create' | 'join' | 'browser' | 'lobby'): void {
  titleScreen!.classList.toggle('hidden', target !== 'title');
  createScreen!.classList.toggle('hidden', target !== 'create');
  joinScreen!.classList.toggle('hidden', target !== 'join');
  browserScreen!.classList.toggle('hidden', target !== 'browser');
  lobbyScreen!.classList.toggle('hidden', target !== 'lobby');
}

function showError(message: string): void {
  menuError!.textContent = message;
  menuError!.classList.remove('hidden');
  window.setTimeout(() => menuError!.classList.add('hidden'), 5000);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard copy failed.');
}

function cleanPlayerName(): string {
  const value = playerNameInput!.value.trim().slice(0, 24);
  if (!value) throw new Error('プレイヤー名を入力してください。');
  localStorage.setItem('bannerfall.playerName', value);
  return value;
}

async function ensureConnected(): Promise<void> {
  const rawUrl = serverUrlInput!.value.trim();
  if (!rawUrl) throw new Error('WebSocket Server URLを入力してください。');
  localStorage.setItem('bannerfall.serverUrl', rawUrl);
  if (network.connected) return;
  await network.connect(rawUrl);
}

function numberInput(id: string, min: number, max: number, fallback: number): number {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  const value = Number(input?.value ?? fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

function classLabel(squadClass: SquadClass): string {
  return squadClassLabel(squadClass);
}

function battlefieldForMap(mapId: MapId) {
  return mapId === 'OPEN_FIELD' ? OPEN_FIELD_MAP : BATTLEFIELD_MAP;
}

function spawnLabel(team: Team, index: number | null, mapId: MapId = 'GRAND_RIVER'): string {
  if (index === null) return 'NO SPAWN';
  return battlefieldForMap(mapId).spawnArea(team, index).label;
}

function roomPhaseLabel(phase: RoomBrowserEntry['phase']): string {
  if (phase === 'lobby') return 'LOBBY';
  if (phase === 'countdown') return 'STARTING';
  return 'PLAYING';
}

function renderRoomBrowser(entries: RoomBrowserEntry[]): void {
  roomBrowserList!.innerHTML = '';
  const joinableCount = entries.filter((entry) => entry.joinable).length;
  roomBrowserSummary!.textContent = `${entries.length} PUBLIC ROOMS · ${joinableCount} JOINABLE`;

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'room-browser-empty';
    empty.innerHTML = '<strong>NO PUBLIC ROOMS</strong><span>CREATE ROOMで新しい戦場を立てるか、Room Codeから参加してください。</span>';
    roomBrowserList!.appendChild(empty);
    return;
  }

  for (const entry of entries) {
    const row = document.createElement('article');
    row.className = `room-browser-row phase-${entry.phase}`;

    const code = document.createElement('div');
    code.className = 'room-browser-code';
    code.innerHTML = `<strong>${entry.code}</strong><span>${entry.passwordProtected ? 'LOCKED' : 'OPEN'}</span>`;

    const host = document.createElement('div');
    host.className = 'room-browser-cell';
    host.innerHTML = `<span>HOST</span><strong></strong>`;
    const hostStrong = host.querySelector('strong');
    if (hostStrong) hostStrong.textContent = entry.hostName;

    const players = document.createElement('div');
    players.className = 'room-browser-cell';
    players.innerHTML = `<span>PLAYERS</span><strong>${entry.players} / ${entry.maxPlayers}</strong>`;

    const battle = document.createElement('div');
    battle.className = 'room-browser-cell';
    battle.innerHTML = `<span>MODE / BATTLE</span><strong></strong>`;
    const battleStrong = battle.querySelector('strong');
    if (battleStrong) {
      const teams = activeTeamsForCount(entry.teamCount);
      const factionByTeam: Record<Team, FactionId> = { blue: entry.blueFaction, red: entry.redFaction, yellow: entry.yellowFaction, green: entry.greenFaction };
      const squadsByTeam: Record<Team, number> = { blue: entry.blueSquads, red: entry.redSquads, yellow: entry.yellowSquads, green: entry.greenSquads };
      const factions = teams.map((team) => `${team.toUpperCase()} ${factionShortLabel(factionByTeam[team])}`).join(' / ');
      const armies = teams.map((team) => String(squadsByTeam[team])).join(' / ');
      battleStrong.textContent = entry.gameMode === 'CONQUEST'
        ? `${gameModeLabel(entry.gameMode)} · ${factions} · ${armies} · T${entry.conquestTickets}`
        : `${gameModeLabel(entry.gameMode)} · ${entry.teamCount} TEAM · ${factions} · ${armies}`;
    }

    const respawn = document.createElement('div');
    respawn.className = 'room-browser-cell';
    respawn.innerHTML = `<span>RESPAWN</span><strong>${entry.respawnSeconds}s</strong>`;

    const status = document.createElement('div');
    status.className = `room-browser-status ${entry.phase}`;
    status.textContent = roomPhaseLabel(entry.phase);

    const join = document.createElement('button');
    join.className = 'room-browser-join';
    const full = !entry.joinable;
    join.disabled = entry.phase === 'countdown' || full;
    join.textContent = full
      ? 'FULL'
      : entry.phase === 'battle'
        ? (entry.passwordProtected ? 'PASSWORD' : 'JOIN BATTLE')
        : entry.passwordProtected ? 'PASSWORD' : 'JOIN';
    join.addEventListener('click', async () => {
      try {
        const name = cleanPlayerName();
        await ensureConnected();
        if (entry.passwordProtected) {
          const codeInput = document.querySelector<HTMLInputElement>('#join-code');
          const passwordInput = document.querySelector<HTMLInputElement>('#join-password');
          if (codeInput) codeInput.value = entry.code;
          if (passwordInput) passwordInput.value = '';
          showScreen('join');
          window.setTimeout(() => passwordInput?.focus(), 0);
          return;
        }
        network.joinRoom(name, entry.code, '');
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    });

    row.append(code, host, players, battle, respawn, status, join);
    roomBrowserList!.appendChild(row);
  }
}

function renderPlayers(room: RoomState): void {
  const teams = activeTeamsForRoom(room);
  const containers = new Map<Team, HTMLElement>();
  const counts = new Map<Team, HTMLElement>();
  for (const team of TEAM_IDS) {
    const players = document.querySelector<HTMLElement>(`#${team}-players`);
    const count = document.querySelector<HTMLElement>(`#${team}-ready-count`);
    const card = document.querySelector<HTMLElement>(`.${team}-team`);
    const visible = teams.includes(team);
    card?.classList.toggle('hidden', !visible);
    if (players) { players.innerHTML = ''; containers.set(team, players); }
    if (count) counts.set(team, count);
  }
  const readyByTeam = new Map<Team, number>(TEAM_IDS.map((team) => [team, 0]));
  for (const player of room.players) {
    if (player.ready) readyByTeam.set(player.team, (readyByTeam.get(player.team) ?? 0) + 1);
    const row = document.createElement('div');
    row.className = `player-row deployment-player ${player.ready ? 'ready' : ''}`;
    const identity = document.createElement('span');
    identity.className = 'player-identity';
    identity.textContent = `${player.owner ? '★ ' : ''}${player.name}`;
    const detail = document.createElement('span');
    detail.className = 'player-loadout';
    detail.textContent = `${classLabel(player.squadClass)} · ${spawnLabel(player.team, player.spawnIndex, room.settings.mapId)} · ${player.ready ? 'READY' : 'WAIT'}`;
    row.append(identity, detail);
    containers.get(player.team)?.appendChild(row);
  }
  for (const team of teams) counts.get(team)!.textContent = `${readyByTeam.get(team) ?? 0} READY`;
}

function mapPreviewCaption(mapId: MapId): string {
  return mapId === 'OPEN_FIELD'
    ? '全面が平地で構成された会戦マップ'
    : '大河・橋・浅瀬・山岳を含む広域戦マップ';
}

function pointPercent(mapId: MapId, point: { x: number; y: number }): { x: number; y: number } {
  const map = battlefieldForMap(mapId);
  const width = map.columns * map.tileSize;
  const height = map.rows * map.tileSize;
  return { x: point.x / width * 100, y: point.y / height * 100 };
}

function renderMapOverview(
  features: HTMLElement,
  container: HTMLElement,
  mapId: MapId,
  options: { showSpawnLabels?: boolean; showRearZoneLabels?: boolean; teams?: readonly Team[] } = {},
): void {
  const showSpawnLabels = options.showSpawnLabels ?? true;
  const showRearZoneLabels = options.showRearZoneLabels ?? true;
  const teams = options.teams ?? (['blue', 'red'] as const);
  const map = battlefieldForMap(mapId);
  features.innerHTML = '';
  container.classList.toggle('map-grand-river', mapId === 'GRAND_RIVER');
  container.classList.toggle('map-open-field', mapId === 'OPEN_FIELD');
  container.setAttribute('aria-label', `${mapLabel(mapId)} deployment map`);

  const add = (className: string, text = ''): HTMLElement => {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text;
    features.appendChild(element);
    return element;
  };

  if (mapId === 'GRAND_RIVER') {
    const blueZone = add('deployment-zone blue-zone');
    if (showRearZoneLabels) {
      const blueZoneLabel = document.createElement('span');
      blueZoneLabel.textContent = 'BLUE 後方';
      blueZone.appendChild(blueZoneLabel);
    }
    const redZone = add('deployment-zone red-zone');
    if (showRearZoneLabels) {
      const redZoneLabel = document.createElement('span');
      redZoneLabel.textContent = 'RED 後方';
      redZone.appendChild(redZoneLabel);
    }
    add('deployment-river', '大河');
    for (const crossing of [
      { x: 17, label: '西浅瀬' },
      { x: 34, label: '西橋' },
      { x: 50, label: '中央橋' },
      { x: 66, label: '東橋' },
      { x: 83, label: '東浅瀬' },
    ]) {
      const marker = add('deployment-crossing', crossing.label);
      marker.style.left = `${crossing.x}%`;
    }
  } else {
    add('open-field-center', '平原');
    if (teams.length === 2) {
      add('open-field-half blue-half', 'BLUE FRONT');
      add('open-field-half red-half', 'RED FRONT');
    }
  }

  for (const team of teams) {
    for (let index = 0; index < SPAWN_AREA_COUNT; index += 1) {
      const area = map.spawnArea(team, index);
      const position = pointPercent(mapId, area.center);
      const halo = add(`spawn-area-halo ${team}`);
      halo.style.left = `${position.x}%`;
      halo.style.top = `${position.y}%`;
      halo.title = `${team.toUpperCase()} ${area.label}`;
      if (showSpawnLabels) {
        const label = document.createElement('span');
        label.textContent = area.shortLabel;
        halo.appendChild(label);
      }
    }

    const position = pointPercent(mapId, map.bannerPosition(team));
    const marker = add(`map-banner ${team}-banner-marker`, '⚑');
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    marker.title = `${team.toUpperCase()} 旗`;
  }
}

function refreshCreateMapPreview(): void {
  const selected = createMapSelect?.value;
  const mapId: MapId = isMapId(selected) ? selected : 'GRAND_RIVER';
  const requestedCount = Number(document.querySelector<HTMLSelectElement>('#create-team-count')?.value ?? 2);
  const teamCount = mapId === 'OPEN_FIELD' ? Math.max(2, Math.min(4, requestedCount)) : 2;
  if (createMapPreviewFeatures && createMapPreview) renderMapOverview(createMapPreviewFeatures, createMapPreview, mapId, { teams: activeTeamsForCount(teamCount) });
  if (createMapPreviewTitle) createMapPreviewTitle.textContent = mapLabel(mapId);
  if (createMapPreviewCaption) createMapPreviewCaption.textContent = mapPreviewCaption(mapId);
}

function renderDeploymentMap(room: RoomState): void {
  const local = room.players.find((player) => player.id === network.clientId);
  if (!local) return;

  const map = battlefieldForMap(room.settings.mapId);
  if (deploymentMapFeatures && deploymentMap) {
    renderMapOverview(deploymentMapFeatures, deploymentMap, room.settings.mapId, {
      showSpawnLabels: false,
      showRearZoneLabels: false,
      teams: activeTeamsForRoom(room),
    });
  }
  spawnPoints!.innerHTML = '';

  const canEdit = room.phase === 'lobby' || (room.phase === 'battle' && local.formationId === null);
  for (let index = 0; index < SPAWN_AREA_COUNT; index += 1) {
    const area = map.spawnArea(local.team, index);
    const position = pointPercent(room.settings.mapId, area.center);
    const button = document.createElement('button');
    button.className = `spawn-point ${local.team}`;
    button.style.left = `${position.x}%`;
    button.style.top = `${position.y}%`;
    button.dataset.spawnIndex = String(index);
    if (local.spawnIndex === index) button.classList.add('selected');
    button.textContent = area.shortLabel;
    button.title = `${area.label} — AREA内から分散出撃`;
    button.disabled = !canEdit || (room.phase === 'lobby' && local.ready);
    button.addEventListener('click', () => network.selectSpawn(index));
    spawnPoints!.appendChild(button);
  }

  deploymentStatus!.textContent = local.spawnIndex === null
    ? `SELECT ${local.team.toUpperCase()} SPAWN AREA · ${mapLabel(room.settings.mapId)}`
    : `${spawnLabel(local.team, local.spawnIndex, room.settings.mapId)} · ${classLabel(local.squadClass)}${room.settings.gameMode === 'CONQUEST' ? ' · 成長編成' : ''}${room.phase === 'battle' && !local.formationId ? ' · 出撃準備' : ''}`;
}

function renderClassCards(room: RoomState): void {
  const local = room.players.find((player) => player.id === network.clientId);
  if (!local) return;
  const canEdit = room.phase === 'lobby' || (room.phase === 'battle' && local.formationId === null);
  for (const card of document.querySelectorAll<HTMLButtonElement>('[data-lobby-class]')) {
    const value = card.dataset.lobbyClass;
    card.classList.toggle('selected', value === local.squadClass);
    card.disabled = !canEdit || (room.phase === 'lobby' && local.ready);
  }
}

function renderReadyControls(room: RoomState): void {
  const local = room.players.find((player) => player.id === network.clientId);
  const startButton = document.querySelector<HTMLButtonElement>('#start-match');
  if (!local || !startButton) return;
  const teams = activeTeamsForRoom(room);

  const stagingMidmatch = room.phase === 'battle' && local.formationId === null;
  const allReady = room.players.length > 0 && room.players.every((player) => player.ready && player.spawnIndex !== null);
  const readyCount = room.players.filter((player) => player.ready).length;
  readyButton!.disabled = local.spawnIndex === null || (room.phase !== 'lobby' && !stagingMidmatch);
  readyButton!.classList.toggle('active', local.ready);
  readyButton!.textContent = stagingMidmatch
    ? (local.spawnIndex === null ? 'SELECT SPAWN FIRST' : '出撃')
    : local.ready ? 'CANCEL READY' : local.spawnIndex === null ? 'SELECT SPAWN FIRST' : 'READY';

  for (const team of TEAM_IDS) {
    const button = document.querySelector<HTMLButtonElement>(`#join-${team}`);
    if (!button) continue;
    const visible = teams.includes(team);
    button.classList.toggle('hidden', !visible);
    if (!visible) { button.disabled = true; continue; }
    const full = room.slots[team].available <= 0 && local.team !== team;
    button.disabled = (room.phase === 'countdown') || (!stagingMidmatch && room.phase !== 'lobby') || local.team === team || full || (room.phase === 'lobby' && local.ready);
    button.textContent = `${team.toUpperCase()} · ${factionShortLabel(roomFaction(room, team))}`;
  }

  startButton.classList.toggle('hidden', stagingMidmatch);
  if (stagingMidmatch) return;
  startButton.disabled = !local.owner || !allReady || room.phase !== 'lobby';
  if (room.phase === 'countdown') startButton.textContent = 'STARTING...';
  else if (!local.owner) startButton.textContent = `WAITING FOR HOST · ${readyCount}/${room.players.length} READY`;
  else if (!allReady) startButton.textContent = `WAITING FOR READY · ${readyCount}/${room.players.length}`;
  else startButton.textContent = 'START BATTLE';
}

function renderLobby(room: RoomState): void {
  currentRoom = room;
  const code = document.querySelector<HTMLElement>('#lobby-code');
  const settings = document.querySelector<HTMLElement>('#lobby-settings');
  if (!code || !settings) return;
  code.textContent = room.code;
  const local = room.players.find((player) => player.id === network.clientId);
  const teams = activeTeamsForRoom(room);
  const deploymentMode = room.phase === 'battle' && local?.formationId === null
    ? '途中参戦 — TEAM / CLASS / SPAWNを選択して出撃'
    : teams.map((team) => `${team.toUpperCase()} ${roomSquads(room, team)}`).join(' / ');
  const ticketLabel = room.settings.gameMode === 'CONQUEST' ? ` · TICKETS ${room.settings.conquestTickets}` : '';
  const factionText = teams.map((team) => `${team.toUpperCase()} ${factionShortLabel(roomFaction(room, team))}`).join(' / ');
  const humanText = teams.map((team) => `${team.toUpperCase()} H${room.slots[team].humans}/${room.slots[team].total}`).join(' · ');
  settings.textContent = `${mapLabel(room.settings.mapId)} · ${room.settings.teamCount} TEAM · ${gameModeLabel(room.settings.gameMode)} · ${deploymentMode}${ticketLabel} · ${factionText} · INTRO ${room.settings.introEnabled ? 'ON' : 'SKIP'} · BUILD ${room.settings.constructionEnabled ? 'ON' : 'OFF'} · RESPAWN ${room.settings.respawnSeconds}s · ${humanText} · ${room.settings.passwordProtected ? 'PASSWORD ON' : 'OPEN ROOM'} · ${room.settings.visibility === 'public' ? 'PUBLIC' : 'UNLISTED'}`;
  const ticketControls = document.querySelector<HTMLElement>('#lobby-ticket-controls');
  const ticketInput = document.querySelector<HTMLInputElement>('#lobby-conquest-tickets');
  const ticketApply = document.querySelector<HTMLButtonElement>('#lobby-ticket-apply');
  const showTickets = room.settings.gameMode === 'CONQUEST' && room.phase === 'lobby';
  ticketControls?.classList.toggle('hidden', !showTickets);
  if (ticketInput) {
    if (document.activeElement !== ticketInput) ticketInput.value = String(room.settings.conquestTickets);
    ticketInput.disabled = !local?.owner || room.phase !== 'lobby';
  }
  if (ticketApply) ticketApply.disabled = !local?.owner || room.phase !== 'lobby';

  for (const team of TEAM_IDS) {
    const card = document.querySelector<HTMLElement>(`.${team}-team`);
    const title = card?.querySelector<HTMLElement>('.team-title h3');
    const join = document.querySelector<HTMLButtonElement>(`#join-${team}`);
    const visible = teams.includes(team);
    card?.classList.toggle('hidden', !visible);
    join?.classList.toggle('hidden', !visible);
    if (title && visible) title.textContent = `${team.toUpperCase()} · ${factionShortLabel(roomFaction(room, team))}`;
    if (join && visible) join.textContent = `${team.toUpperCase()} · ${factionShortLabel(roomFaction(room, team))}`;
    document.querySelector<HTMLElement>(`.${team}-banner-marker`)?.setAttribute('title', `${team.toUpperCase()} · ${factionLabel(roomFaction(room, team))} 旗`);
  }
  renderPlayers(room);
  renderDeploymentMap(room);
  renderClassCards(room);
  renderReadyControls(room);
  showScreen('lobby');
}

function appendChat(container: HTMLElement, messages: ChatMessage[], compact = false): void {
  container.innerHTML = '';
  const slice = compact ? messages.slice(-8) : messages.slice(-50);
  for (const message of slice) {
    const line = document.createElement('div');
    line.className = `chat-line ${message.system ? 'system' : ''}`;
    const name = document.createElement('strong');
    name.textContent = message.system ? 'SYSTEM' : message.playerName;
    const text = document.createElement('span');
    text.textContent = message.text;
    line.append(name, text);
    container.appendChild(line);
  }
  container.scrollTop = container.scrollHeight;
}

function renderChat(): void {
  appendChat(lobbyChatLog!, chatMessages, false);
  appendChat(battleChatLog!, chatMessages, true);
}

function submitChat(input: HTMLInputElement): void {
  const text = input.value.trim();
  if (!text) return;
  network.sendChat(text);
  input.value = '';
}

function clearCountdown(): void {
  if (countdownInterval !== null) window.clearInterval(countdownInterval);
  countdownInterval = null;
  lobbyCountdown!.classList.add('hidden');
}

function startCountdown(seconds: number): void {
  clearCountdown();
  let remaining = Math.max(1, Math.floor(seconds));
  lobbyCountdownNumber!.textContent = String(remaining);
  lobbyCountdown!.classList.remove('hidden');
  countdownInterval = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      lobbyCountdownNumber!.textContent = 'GO';
      if (countdownInterval !== null) window.clearInterval(countdownInterval);
      countdownInterval = null;
      return;
    }
    lobbyCountdownNumber!.textContent = String(remaining);
  }, 1000);
}

function startBattle(payload: MatchStartPayload): void {
  clearCountdown();
  currentRoom = payload.room;
  menuShell!.classList.add('hidden');
  battleShell!.classList.remove('hidden');
  currentBattle?.stop();
  currentBattle = new MultiplayerBattle(network, payload, canvas!);
  networkStatus!.textContent = 'SERVER AUTH';
  const subtitle = document.querySelector<HTMLElement>('#battle-subtitle');
  if (subtitle) subtitle.textContent = `Room ${payload.room.code} · ${mapLabel(payload.room.settings.mapId)} · ${gameModeLabel(payload.room.settings.gameMode)} · ${payload.room.settings.blueSquads}v${payload.room.settings.redSquads}`;
  renderChat();
}

function returnToTitle(): void {
  clearCountdown();
  currentBattle?.stop();
  currentBattle = null;
  if (currentRoom && network.connected) network.leaveRoom();
  currentRoom = null;
  chatMessages = [];
  renderChat();
  battleShell!.classList.add('hidden');
  menuShell!.classList.remove('hidden');
  showScreen('title');
  document.title = 'Bannerfall — Version 4.6.1';
}

network.onConnection = (connected, text) => {
  connectionStatus!.textContent = text;
  connectionDot!.classList.toggle('online', connected);
};
network.onError = (message) => showError(message);
network.onNotice = (message) => showError(message);
network.onChatHistory = (messages) => {
  chatMessages = [...messages];
  renderChat();
};
network.onChatMessage = (message) => {
  chatMessages.push(message);
  if (chatMessages.length > 50) chatMessages.splice(0, chatMessages.length - 50);
  renderChat();
};
network.onRoomList = (rooms) => {
  renderRoomBrowser(rooms);
};
network.onRoomState = (room) => {
  currentRoom = room;
  const inBattle = !battleShell!.classList.contains('hidden');
  if (inBattle && room.phase === 'battle') {
    currentBattle?.updateRoom(room);
    return;
  }
  if (inBattle && room.phase !== 'battle') {
    currentBattle?.stop();
    currentBattle = null;
    battleShell!.classList.add('hidden');
    menuShell!.classList.remove('hidden');
  }
  if (room.phase === 'lobby') clearCountdown();
  renderLobby(room);
};
network.onMatchCountdown = (seconds) => startCountdown(seconds);
network.onMatchStart = (payload) => startBattle(payload);

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-back="title"]')) {
  button.addEventListener('click', () => showScreen('title'));
}

document.querySelector('#show-create')?.addEventListener('click', () => {
  try { cleanPlayerName(); showScreen('create'); } catch (error) { showError(String(error instanceof Error ? error.message : error)); }
});
document.querySelector('#show-join')?.addEventListener('click', () => {
  try { cleanPlayerName(); showScreen('join'); } catch (error) { showError(String(error instanceof Error ? error.message : error)); }
});

document.querySelector('#show-browser')?.addEventListener('click', async () => {
  try {
    cleanPlayerName();
    await ensureConnected();
    showScreen('browser');
    roomBrowserSummary!.textContent = 'LOADING ROOMS...';
    network.requestRoomList();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector('#refresh-room-list')?.addEventListener('click', async () => {
  try {
    await ensureConnected();
    network.requestRoomList();
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});

function selectedCreateTeamCount(): 2 | 3 | 4 {
  const mapId: MapId = isMapId(createMapSelect?.value) ? createMapSelect!.value as MapId : 'GRAND_RIVER';
  const select = document.querySelector<HTMLSelectElement>('#create-team-count');
  const requested = Math.max(2, Math.min(4, Number(select?.value ?? 2))) as 2 | 3 | 4;
  return mapId === 'OPEN_FIELD' ? requested : 2;
}

function refreshCreateArmyBalance(): void {
  const count = selectedCreateTeamCount();
  const values: Record<Team, number> = {
    blue: numberInput('blue-squads', 1, 50, 20),
    red: numberInput('red-squads', 1, 50, 20),
    yellow: numberInput('yellow-squads', 1, 50, 20),
    green: numberInput('green-squads', 1, 50, 20),
  };
  const teams = activeTeamsForCount(count);
  const symmetric = teams.every((team) => values[team] === values.blue);
  if (createArmyBalance) {
    createArmyBalance.textContent = `${teams.map((team) => `${team.toUpperCase()} ${values[team]}`).join(' / ')} · ${symmetric ? '対称戦' : '非対称戦 · AI大軍戦に対応'}`;
    createArmyBalance.classList.toggle('asymmetric', !symmetric);
  }
}

const createGameModeSelect = document.querySelector<HTMLSelectElement>('#create-game-mode');
const createGameModeDescription = document.querySelector<HTMLElement>('#create-game-mode-description');
const createConstructionSelect = document.querySelector<HTMLSelectElement>('#create-construction');
const createTeamCountSelect = document.querySelector<HTMLSelectElement>('#create-team-count');
let rememberedConquestConstruction = 'on';

function refreshCreateTeamOptions(): void {
  const mapId: MapId = isMapId(createMapSelect?.value) ? createMapSelect!.value as MapId : 'GRAND_RIVER';
  if (createTeamCountSelect) {
    createTeamCountSelect.disabled = mapId !== 'OPEN_FIELD';
    if (mapId !== 'OPEN_FIELD') createTeamCountSelect.value = '2';
    createTeamCountSelect.title = mapId === 'OPEN_FIELD' ? '平原は2～4Team対応' : '河川は2Team専用';
  }
  const count = selectedCreateTeamCount();
  document.querySelectorAll<HTMLElement>('.team-yellow-setting').forEach((element) => element.classList.toggle('hidden', count < 3));
  document.querySelectorAll<HTMLElement>('.team-green-setting').forEach((element) => element.classList.toggle('hidden', count < 4));
  if (count > 2 && createGameModeSelect) {
    createGameModeSelect.value = 'BATTLE';
    createGameModeSelect.disabled = true;
    createGameModeSelect.title = '3/4Team戦は4.6.1では戦闘モード専用です。';
  } else if (createGameModeSelect) {
    createGameModeSelect.disabled = false;
    createGameModeSelect.title = '';
  }
  refreshCreateGameModeDescription();
  refreshCreateArmyBalance();
  refreshCreateMapPreview();
}

function refreshCreateGameModeDescription(): void {
  const value = createGameModeSelect?.value;
  const mode: GameMode = isGameMode(value) ? value : 'BATTLE';
  const teamCount = selectedCreateTeamCount();
  if (createGameModeDescription) {
    createGameModeDescription.textContent = teamCount > 2
      ? `${teamCount}Team戦：平原・戦闘モード専用。最後まで旗が残ったTeamが勝利します。`
      : mode === 'BATTLE'
        ? `${gameModeLabel(mode)}：${gameModeDescription(mode)} · ブロック建築は使用不可`
        : `${gameModeLabel(mode)}：${gameModeDescription(mode)}`;
  }
  if (createConstructionSelect) {
    if (mode === 'BATTLE' || teamCount > 2) {
      if (!createConstructionSelect.disabled) rememberedConquestConstruction = createConstructionSelect.value === 'off' ? 'off' : 'on';
      createConstructionSelect.value = 'off';
      createConstructionSelect.disabled = true;
      createConstructionSelect.title = teamCount > 2 ? '3/4Team戦では建築を使用しません。' : '戦闘モードではブロック建築は使用できません。';
    } else {
      createConstructionSelect.disabled = false;
      createConstructionSelect.value = rememberedConquestConstruction;
      createConstructionSelect.title = '';
    }
  }
}

const createBlueFaction = document.querySelector<HTMLSelectElement>('#create-blue-faction');
const createRedFaction = document.querySelector<HTMLSelectElement>('#create-red-faction');
const createYellowFaction = document.querySelector<HTMLSelectElement>('#create-yellow-faction');
const createGreenFaction = document.querySelector<HTMLSelectElement>('#create-green-faction');
const blueFactionSwatch = document.querySelector<HTMLElement>('#blue-faction-swatch');
const redFactionSwatch = document.querySelector<HTMLElement>('#red-faction-swatch');
const yellowFactionSwatch = document.querySelector<HTMLElement>('#yellow-faction-swatch');
const greenFactionSwatch = document.querySelector<HTMLElement>('#green-faction-swatch');

function factionFromSelect(select: HTMLSelectElement | null, fallback: FactionId): FactionId {
  return isFactionId(select?.value) ? select.value : fallback;
}

function updateFactionSwatch(element: HTMLElement | null, faction: FactionId): void {
  if (!element) return;
  element.className = `faction-swatch faction-${faction.toLowerCase()}`;
  element.title = factionLabel(faction);
}

const factionSelects: Record<Team, HTMLSelectElement | null> = {
  blue: createBlueFaction, red: createRedFaction, yellow: createYellowFaction, green: createGreenFaction,
};
const factionSwatches: Record<Team, HTMLElement | null> = {
  blue: blueFactionSwatch, red: redFactionSwatch, yellow: yellowFactionSwatch, green: greenFactionSwatch,
};
const factionFallbacks: Record<Team, FactionId> = {
  blue: DEFAULT_BLUE_FACTION, red: DEFAULT_RED_FACTION, yellow: DEFAULT_YELLOW_FACTION, green: DEFAULT_GREEN_FACTION,
};

function ensureCreateFactionsDistinct(changed: Team = 'blue'): void {
  const teams = activeTeamsForCount(selectedCreateTeamCount());
  const used = new Set<FactionId>();
  // Preserve the just-changed value first, then repair duplicates around it.
  const order = [changed, ...teams.filter((team) => team !== changed)];
  for (const team of order) {
    const select = factionSelects[team];
    if (!select) continue;
    let faction = factionFromSelect(select, factionFallbacks[team]);
    if (used.has(faction)) faction = FACTION_IDS.find((candidate) => !used.has(candidate)) ?? faction;
    select.value = faction;
    used.add(faction);
  }
  for (const team of TEAM_IDS) updateFactionSwatch(factionSwatches[team], factionFromSelect(factionSelects[team], factionFallbacks[team]));
}

createGameModeSelect?.addEventListener('change', refreshCreateGameModeDescription);
createConstructionSelect?.addEventListener('change', () => {
  if (!createConstructionSelect.disabled) rememberedConquestConstruction = createConstructionSelect.value;
});
createMapSelect?.addEventListener('change', refreshCreateTeamOptions);
createTeamCountSelect?.addEventListener('change', () => { ensureCreateFactionsDistinct(); refreshCreateTeamOptions(); });
for (const team of TEAM_IDS) factionSelects[team]?.addEventListener('change', () => ensureCreateFactionsDistinct(team));
for (const id of ['blue-squads', 'red-squads', 'yellow-squads', 'green-squads']) document.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', refreshCreateArmyBalance);
ensureCreateFactionsDistinct('blue');
refreshCreateTeamOptions();
document.querySelector('#create-room')?.addEventListener('click', async () => {
  try {
    const name = cleanPlayerName();
    await ensureConnected();
    const password = document.querySelector<HTMLInputElement>('#create-password')?.value ?? '';
    const visibilitySelect = document.querySelector<HTMLSelectElement>('#create-visibility');
    const visibility: RoomVisibility = visibilitySelect?.value === 'unlisted' ? 'unlisted' : 'public';
    const selectedMap = document.querySelector<HTMLSelectElement>('#create-map')?.value;
    const mapId: MapId = isMapId(selectedMap) ? selectedMap : 'GRAND_RIVER';
    const teamCount = selectedCreateTeamCount();
    const selectedMode = createGameModeSelect?.value;
    const gameMode: GameMode = teamCount > 2 ? 'BATTLE' : isGameMode(selectedMode) ? selectedMode : 'BATTLE';
    const introEnabled = document.querySelector<HTMLSelectElement>('#create-intro')?.value !== 'off';
    const constructionEnabled = teamCount === 2 && gameMode === 'CONQUEST' && createConstructionSelect?.value !== 'off';
    ensureCreateFactionsDistinct('blue');
    const blueSquads = numberInput('blue-squads', 1, 50, 20);
    const redSquads = numberInput('red-squads', 1, 50, 20);
    const yellowSquads = numberInput('yellow-squads', 1, 50, 20);
    const greenSquads = numberInput('green-squads', 1, 50, 20);
    const conquestTickets = Math.max(100, Math.min(400, Math.max(blueSquads, redSquads) * 8));
    network.createRoom(name, password, {
      blueSquads, redSquads, yellowSquads, greenSquads, teamCount,
      respawnSeconds: numberInput('respawn-seconds', 5, 60, 20),
      conquestTickets, visibility, gameMode, introEnabled, constructionEnabled,
      blueFaction: factionFromSelect(createBlueFaction, DEFAULT_BLUE_FACTION),
      redFaction: factionFromSelect(createRedFaction, DEFAULT_RED_FACTION),
      yellowFaction: factionFromSelect(createYellowFaction, DEFAULT_YELLOW_FACTION),
      greenFaction: factionFromSelect(createGreenFaction, DEFAULT_GREEN_FACTION),
      mapId,
    });
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector('#lobby-ticket-apply')?.addEventListener('click', () => {
  if (!currentRoom || currentRoom.phase !== 'lobby' || currentRoom.settings.gameMode !== 'CONQUEST') return;
  const local = currentRoom.players.find((player) => player.id === network.clientId);
  if (!local?.owner) return;
  const input = document.querySelector<HTMLInputElement>('#lobby-conquest-tickets');
  const tickets = Math.max(1, Math.min(9999, Math.floor(Number(input?.value) || currentRoom.settings.conquestTickets)));
  if (input) input.value = String(tickets);
  network.setConquestTickets(tickets);
});

document.querySelector('#join-room')?.addEventListener('click', async () => {
  try {
    const name = cleanPlayerName();
    await ensureConnected();
    const code = document.querySelector<HTMLInputElement>('#join-code')?.value ?? '';
    const password = document.querySelector<HTMLInputElement>('#join-password')?.value ?? '';
    if (code.trim().length !== 6) throw new Error('6文字のRoom Codeを入力してください。');
    network.joinRoom(name, code, password);
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
});

document.querySelector('#join-blue')?.addEventListener('click', () => network.changeTeam('blue'));
document.querySelector('#join-red')?.addEventListener('click', () => network.changeTeam('red'));
document.querySelector('#join-yellow')?.addEventListener('click', () => network.changeTeam('yellow'));
document.querySelector('#join-green')?.addEventListener('click', () => network.changeTeam('green'));
document.querySelector('#lobby-class-cards')?.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-lobby-class]') : null;
  const value = target?.dataset.lobbyClass;
  if (!isSquadClass(value)) return;
  event.preventDefault();
  network.selectClass(value);
});
readyButton!.addEventListener('click', () => {
  const local = currentRoom?.players.find((player) => player.id === network.clientId);
  if (!local || !currentRoom) return;
  if (currentRoom.phase === 'battle' && local.formationId === null) network.deployMidmatch();
  else network.setReady(!local.ready);
});
document.querySelector('#start-match')?.addEventListener('click', () => network.startMatch());
document.querySelector('#leave-room')?.addEventListener('click', () => {
  clearCountdown();
  network.leaveRoom();
  currentRoom = null;
  chatMessages = [];
  renderChat();
  showScreen('title');
});

document.querySelector('#return-title')?.addEventListener('click', () => returnToTitle());

document.querySelector('#copy-invite')?.addEventListener('click', async () => {
  if (!currentRoom) return;
  const server = serverUrlInput!.value.trim();
  const url = new URL(window.location.origin + window.location.pathname);
  if (server) url.searchParams.set('server', server);
  url.searchParams.set('room', currentRoom.code);
  const inviteText = `Bannerfall Room: ${currentRoom.code}\n${url.toString()}`;
  try {
    await copyText(inviteText);
    const button = document.querySelector<HTMLButtonElement>('#copy-invite');
    if (button) {
      const oldLabel = button.textContent;
      button.textContent = `COPIED ${currentRoom.code}`;
      window.setTimeout(() => { button.textContent = oldLabel; }, 1600);
    }
  } catch {
    showError(`Inviteのコピーに失敗しました。Room Code: ${currentRoom.code}`);
  }
});

document.querySelector('#lobby-chat-send')?.addEventListener('click', () => submitChat(lobbyChatInput!));
lobbyChatInput!.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitChat(lobbyChatInput!);
  }
});
battleChatInput!.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitChat(battleChatInput!);
    battleChatInput!.blur();
  } else if (event.key === 'Escape') {
    battleChatInput!.blur();
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || battleShell!.classList.contains('hidden')) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  event.preventDefault();
  battleChatInput!.focus();
});

if (invitedRoom) showScreen('join');
else showScreen('title');
