import './styles.css';
import { SQUAD_CLASSES, classLabel as squadClassLabel, isSquadClass, type SquadClass, type Team } from './game/types';
import { NetworkClient } from './network/networkClient';
import { BATTLEFIELD_MAP, SPAWN_AREA_COUNT } from './game/battlefieldMap';
import { MultiplayerBattle } from './network/multiplayerBattle';
import type { ChatMessage, MatchStartPayload, RoomBrowserEntry, RoomState, RoomVisibility } from './network/protocol';

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
  spawnPoints, deploymentStatus, readyButton, lobbyChatLog, lobbyChatInput, battleChatLog,
  battleChatInput, lobbyCountdown, lobbyCountdownNumber,
];
if (required.some((element) => !element)) throw new Error('Bannerfall Version 4.0.6 UI initialization failed.');

const network = new NetworkClient();
let currentRoom: RoomState | null = null;
let currentBattle: MultiplayerBattle | null = null;

const CLASS_UI: Record<SquadClass, { summary: string; role: string }> = {
  infantry: { summary: '20兵 · マスケット / 銃剣 / 斧', role: '標準戦列・旗破壊・馬防柵2' },
  lightInfantry: { summary: '15兵 · 高機動 / 散開射撃', role: '側面・牽制・旗破壊・馬防柵2' },
  grenadier: { summary: '16兵 · 高士気 / 手榴弾', role: '近距離爆破・正面突破・馬防柵2' },
  sharpshooter: { summary: '6兵 · 超長射程 / 高精度', role: '対騎兵・遠距離狙撃・馬防柵1' },
  engineer: { summary: '12兵 · 高機動 / 馬防柵6', role: '陣地構築・旗破壊特化' },
  dragoon: { summary: '14騎 · 高機動 / カービン', role: '突撃不可・機動火力' },
  cavalry: { summary: '12騎 · 高速 / 突撃', role: '突破・砲兵狩り' },
  hussar: { summary: '10騎 · 衝撃突撃', role: '士気破壊・追撃' },
  cuirassier: { summary: '10騎 · 高HP / 重騎兵', role: '耐久戦・戦列拘束' },
  artillery: { summary: '6兵 · 2門 · 長射程', role: '継続砲撃・馬防柵2' },
  heavyArtillery: { summary: '7兵 · 1門 · 巨大爆発', role: '超火力・長い再装填・馬防柵2' },
  horseArtillery: { summary: '6兵 · 3門 · 高速展開', role: '前線追従砲撃・馬防柵2' },
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
  if (!rawUrl) throw new Error('Cloudflare Tunnel URLを入力してください。');
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

function spawnLabel(team: Team, index: number | null): string {
  if (index === null) return 'NO SPAWN';
  const area = BATTLEFIELD_MAP.spawnArea(team, index);
  return area.label;
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
    battle.innerHTML = `<span>BATTLE</span><strong>${entry.blueSquads} vs ${entry.redSquads}</strong>`;

    const respawn = document.createElement('div');
    respawn.className = 'room-browser-cell';
    respawn.innerHTML = `<span>RESPAWN</span><strong>${entry.respawnSeconds}s</strong>`;

    const status = document.createElement('div');
    status.className = `room-browser-status ${entry.phase}`;
    status.textContent = roomPhaseLabel(entry.phase);

    const join = document.createElement('button');
    join.className = 'room-browser-join';
    const full = entry.players >= entry.maxPlayers || !entry.joinable;
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
  const bluePlayers = document.querySelector<HTMLElement>('#blue-players');
  const redPlayers = document.querySelector<HTMLElement>('#red-players');
  const blueCount = document.querySelector<HTMLElement>('#blue-ready-count');
  const redCount = document.querySelector<HTMLElement>('#red-ready-count');
  if (!bluePlayers || !redPlayers || !blueCount || !redCount) return;
  bluePlayers.innerHTML = '';
  redPlayers.innerHTML = '';
  let blueReady = 0;
  let redReady = 0;

  for (const player of room.players) {
    if (player.ready) player.team === 'blue' ? blueReady++ : redReady++;
    const row = document.createElement('div');
    row.className = `player-row deployment-player ${player.ready ? 'ready' : ''}`;
    const identity = document.createElement('span');
    identity.className = 'player-identity';
    identity.textContent = `${player.owner ? '★ ' : ''}${player.name}`;
    const detail = document.createElement('span');
    detail.className = 'player-loadout';
    detail.textContent = `${classLabel(player.squadClass)} · ${spawnLabel(player.team, player.spawnIndex)} · ${player.ready ? 'READY' : 'WAIT'}`;
    row.append(identity, detail);
    (player.team === 'blue' ? bluePlayers : redPlayers).appendChild(row);
  }
  blueCount.textContent = `${blueReady} READY`;
  redCount.textContent = `${redReady} READY`;
}

function spawnPointPercent(team: Team, index: number): { x: number; y: number } {
  const bluePositions = [
    { x: 12, y: 85 },
    { x: 24, y: 73 },
    { x: 36, y: 84 },
  ];
  const blue = bluePositions[Math.max(0, Math.min(2, index))];
  return team === 'blue' ? blue : { x: 100 - blue.x, y: 100 - blue.y };
}

function renderDeploymentMap(room: RoomState): void {
  const local = room.players.find((player) => player.id === network.clientId);
  if (!local) return;
  spawnPoints!.innerHTML = '';
  const canEdit = room.phase === 'lobby' || (room.phase === 'battle' && local.formationId === null);
  for (let index = 0; index < SPAWN_AREA_COUNT; index += 1) {
    const position = spawnPointPercent(local.team, index);
    const button = document.createElement('button');
    button.className = `spawn-point ${local.team}`;
    button.style.left = `${position.x}%`;
    button.style.top = `${position.y}%`;
    button.dataset.spawnIndex = String(index);
    const own = local.spawnIndex === index;
    if (own) button.classList.add('selected');
    button.textContent = BATTLEFIELD_MAP.spawnArea(local.team, index).shortLabel;
    button.title = `${spawnLabel(local.team, index)} — AREA内から分散出撃`;
    button.disabled = !canEdit || (room.phase === 'lobby' && local.ready);
    button.addEventListener('click', () => network.selectSpawn(index));
    spawnPoints!.appendChild(button);
  }
  deploymentStatus!.textContent = local.spawnIndex === null
    ? `SELECT ${local.team.toUpperCase()} SPAWN AREA`
    : `${spawnLabel(local.team, local.spawnIndex)} · ${classLabel(local.squadClass)}${room.phase === 'battle' && !local.formationId ? ' · 出撃準備' : ''}`;
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
  const blueButton = document.querySelector<HTMLButtonElement>('#join-blue');
  const redButton = document.querySelector<HTMLButtonElement>('#join-red');
  if (!local || !startButton || !blueButton || !redButton) return;

  const stagingMidmatch = room.phase === 'battle' && local.formationId === null;
  const allReady = room.players.length > 0 && room.players.every((player) => player.ready && player.spawnIndex !== null);
  const readyCount = room.players.filter((player) => player.ready).length;
  readyButton!.disabled = local.spawnIndex === null || (room.phase !== 'lobby' && !stagingMidmatch);
  readyButton!.classList.toggle('active', local.ready);
  readyButton!.textContent = stagingMidmatch
    ? (local.spawnIndex === null ? 'SELECT SPAWN FIRST' : '出撃')
    : local.ready ? 'CANCEL READY' : local.spawnIndex === null ? 'SELECT SPAWN FIRST' : 'READY';

  const blueFull = room.slots.blue.available <= 0 && local.team !== 'blue';
  const redFull = room.slots.red.available <= 0 && local.team !== 'red';
  blueButton.disabled = (room.phase === 'countdown') || (!stagingMidmatch && room.phase !== 'lobby') || local.team === 'blue' || blueFull || (room.phase === 'lobby' && local.ready);
  redButton.disabled = (room.phase === 'countdown') || (!stagingMidmatch && room.phase !== 'lobby') || local.team === 'red' || redFull || (room.phase === 'lobby' && local.ready);

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
  const mode = room.phase === 'battle' && local?.formationId === null ? '途中参戦 — TEAM / CLASS / SPAWNを選択して出撃' : `${room.settings.blueSquads} vs ${room.settings.redSquads} squads`;
  settings.textContent = `${mode} · RESPAWN ${room.settings.respawnSeconds}s · BLUE H${room.slots.blue.humans}/${room.slots.blue.total} · RED H${room.slots.red.humans}/${room.slots.red.total} · ${room.settings.passwordProtected ? 'PASSWORD ON' : 'OPEN ROOM'} · ${room.settings.visibility === 'public' ? 'PUBLIC' : 'UNLISTED'}`;
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
  if (subtitle) subtitle.textContent = `Room ${payload.room.code} · ${payload.room.settings.blueSquads}v${payload.room.settings.redSquads}`;
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
  document.title = 'Bannerfall — Version 4.0.6';
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

document.querySelector('#create-room')?.addEventListener('click', async () => {
  try {
    const name = cleanPlayerName();
    await ensureConnected();
    const password = document.querySelector<HTMLInputElement>('#create-password')?.value ?? '';
    const visibilitySelect = document.querySelector<HTMLSelectElement>('#create-visibility');
    const visibility: RoomVisibility = visibilitySelect?.value === 'unlisted' ? 'unlisted' : 'public';
    network.createRoom(
      name,
      password,
      numberInput('blue-squads', 1, 50, 20),
      numberInput('red-squads', 1, 50, 20),
      numberInput('respawn-seconds', 5, 60, 20),
      visibility,
    );
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  }
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
