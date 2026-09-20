import './styles.css';
import type { SquadClass, Team } from './game/types';
import { NetworkClient } from './network/networkClient';
import { MultiplayerBattle } from './network/multiplayerBattle';
import type { ChatMessage, MatchStartPayload, RoomState } from './network/protocol';

const menuShell = document.querySelector<HTMLElement>('#menu-shell');
const battleShell = document.querySelector<HTMLElement>('#battle-shell');
const titleScreen = document.querySelector<HTMLElement>('#title-screen');
const createScreen = document.querySelector<HTMLElement>('#create-screen');
const joinScreen = document.querySelector<HTMLElement>('#join-screen');
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
  menuShell, battleShell, titleScreen, createScreen, joinScreen, lobbyScreen,
  playerNameInput, serverUrlInput, connectionStatus, connectionDot, menuError, canvas, networkStatus,
  spawnPoints, deploymentStatus, readyButton, lobbyChatLog, lobbyChatInput, battleChatLog,
  battleChatInput, lobbyCountdown, lobbyCountdownNumber,
];
if (required.some((element) => !element)) throw new Error('Bannerfall Phase 3.8 UI initialization failed.');

const network = new NetworkClient();
let currentRoom: RoomState | null = null;
let currentBattle: MultiplayerBattle | null = null;
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

function showScreen(target: 'title' | 'create' | 'join' | 'lobby'): void {
  titleScreen!.classList.toggle('hidden', target !== 'title');
  createScreen!.classList.toggle('hidden', target !== 'create');
  joinScreen!.classList.toggle('hidden', target !== 'join');
  lobbyScreen!.classList.toggle('hidden', target !== 'lobby');
}

function showError(message: string): void {
  menuError!.textContent = message;
  menuError!.classList.remove('hidden');
  window.setTimeout(() => menuError!.classList.add('hidden'), 5000);
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
  if (squadClass === 'cavalry') return 'CAVALRY';
  if (squadClass === 'artillery') return 'ARTILLERY';
  return 'INFANTRY';
}

function spawnLabel(team: Team, index: number | null): string {
  if (index === null) return 'NO SPAWN';
  return `${team === 'blue' ? 'B' : 'R'}${String(index + 1).padStart(2, '0')}`;
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

function spawnPointPercent(team: Team, index: number, count: number): { x: number; y: number } {
  // Schematic deployment map: keep the same row/column ordering as the battlefield,
  // but spread buttons across each deployment zone so 50-player layouts stay clickable.
  const columns = count <= 20 ? Math.min(4, count) : count <= 35 ? 5 : 6;
  const rows = Math.ceil(count / columns);
  const row = Math.floor(index / columns);
  const column = index % columns;
  const xStep = columns <= 1 ? 0 : column / (columns - 1);
  const yStep = rows <= 1 ? 0.5 : row / (rows - 1);
  const blueX = 8 + xStep * 29;
  const redX = 92 - xStep * 29;
  return { x: team === 'blue' ? blueX : redX, y: 12 + yStep * 76 };
}

function renderDeploymentMap(room: RoomState): void {
  const local = room.players.find((player) => player.id === network.clientId);
  if (!local) return;
  spawnPoints!.innerHTML = '';
  const count = local.team === 'blue' ? room.settings.blueSquads : room.settings.redSquads;
  const occupied = new Map<number, string>();
  for (const player of room.players) {
    if (player.team === local.team && player.spawnIndex !== null) occupied.set(player.spawnIndex, player.name);
  }
  for (let index = 0; index < count; index += 1) {
    const position = spawnPointPercent(local.team, index, count);
    const button = document.createElement('button');
    button.className = `spawn-point ${local.team}`;
    button.style.left = `${position.x}%`;
    button.style.top = `${position.y}%`;
    button.dataset.spawnIndex = String(index);
    const holder = occupied.get(index);
    const own = local.spawnIndex === index;
    if (holder) button.classList.add(own ? 'selected' : 'occupied');
    button.textContent = own ? '★' : holder ? '×' : String(index + 1);
    button.title = holder ? `${spawnLabel(local.team, index)} — ${holder}` : `${spawnLabel(local.team, index)} — FREE`;
    button.disabled = (!!holder && !own) || local.ready || room.phase !== 'lobby';
    button.addEventListener('click', () => network.selectSpawn(index));
    spawnPoints!.appendChild(button);
  }
  deploymentStatus!.textContent = local.spawnIndex === null
    ? `SELECT ${local.team.toUpperCase()} DEPLOYMENT POINT`
    : `DEPLOYMENT ${spawnLabel(local.team, local.spawnIndex)} · ${classLabel(local.squadClass)}`;
}

function renderClassCards(room: RoomState): void {
  const local = room.players.find((player) => player.id === network.clientId);
  if (!local) return;
  for (const card of document.querySelectorAll<HTMLButtonElement>('[data-lobby-class]')) {
    const value = card.dataset.lobbyClass;
    card.classList.toggle('selected', value === local.squadClass);
    card.disabled = local.ready || room.phase !== 'lobby';
  }
}

function renderReadyControls(room: RoomState): void {
  const local = room.players.find((player) => player.id === network.clientId);
  const startButton = document.querySelector<HTMLButtonElement>('#start-match');
  const blueButton = document.querySelector<HTMLButtonElement>('#join-blue');
  const redButton = document.querySelector<HTMLButtonElement>('#join-red');
  if (!local || !startButton || !blueButton || !redButton) return;

  const allReady = room.players.length > 0 && room.players.every((player) => player.ready && player.spawnIndex !== null);
  const readyCount = room.players.filter((player) => player.ready).length;
  readyButton!.disabled = local.spawnIndex === null || room.phase !== 'lobby';
  readyButton!.classList.toggle('active', local.ready);
  readyButton!.textContent = local.ready ? 'CANCEL READY' : local.spawnIndex === null ? 'SELECT SPAWN FIRST' : 'READY';
  blueButton.disabled = local.ready || room.phase !== 'lobby' || local.team === 'blue';
  redButton.disabled = local.ready || room.phase !== 'lobby' || local.team === 'red';

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
  settings.textContent = `${room.settings.blueSquads} vs ${room.settings.redSquads} squads · RESPAWN ${room.settings.respawnSeconds}s · ${room.settings.passwordProtected ? 'PASSWORD ON' : 'OPEN ROOM'}`;
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
  document.title = 'Bannerfall — Phase 3.8';
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

document.querySelector('#create-room')?.addEventListener('click', async () => {
  try {
    const name = cleanPlayerName();
    await ensureConnected();
    const password = document.querySelector<HTMLInputElement>('#create-password')?.value ?? '';
    network.createRoom(
      name,
      password,
      numberInput('blue-squads', 1, 50, 20),
      numberInput('red-squads', 1, 50, 20),
      numberInput('respawn-seconds', 5, 60, 20),
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
for (const card of document.querySelectorAll<HTMLButtonElement>('[data-lobby-class]')) {
  card.addEventListener('click', () => {
    const value = card.dataset.lobbyClass;
    if (value === 'infantry' || value === 'cavalry' || value === 'artillery') network.selectClass(value);
  });
}
readyButton!.addEventListener('click', () => {
  const local = currentRoom?.players.find((player) => player.id === network.clientId);
  if (local) network.setReady(!local.ready);
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
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('server', server);
  url.searchParams.set('room', currentRoom.code);
  try {
    await navigator.clipboard.writeText(url.toString());
    const button = document.querySelector<HTMLButtonElement>('#copy-invite');
    if (button) {
      const old = button.textContent;
      button.textContent = 'COPIED';
      window.setTimeout(() => { button.textContent = old; }, 1400);
    }
  } catch {
    showError('Invite URLのコピーに失敗しました。');
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
