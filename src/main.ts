import './styles.css';
import { NetworkClient } from './network/networkClient';
import { MultiplayerBattle } from './network/multiplayerBattle';
import type { MatchStartPayload, RoomState } from './network/protocol';

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

const required = [
  menuShell, battleShell, titleScreen, createScreen, joinScreen, lobbyScreen,
  playerNameInput, serverUrlInput, connectionStatus, connectionDot, menuError, canvas, networkStatus,
];
if (required.some((element) => !element)) throw new Error('Bannerfall Phase 3.7 UI initialization failed.');

const network = new NetworkClient();
let currentRoom: RoomState | null = null;
let currentBattle: MultiplayerBattle | null = null;

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

function renderLobby(room: RoomState): void {
  currentRoom = room;
  const code = document.querySelector<HTMLElement>('#lobby-code');
  const settings = document.querySelector<HTMLElement>('#lobby-settings');
  const bluePlayers = document.querySelector<HTMLElement>('#blue-players');
  const redPlayers = document.querySelector<HTMLElement>('#red-players');
  const startButton = document.querySelector<HTMLButtonElement>('#start-match');
  if (!code || !settings || !bluePlayers || !redPlayers || !startButton) return;

  code.textContent = room.code;
  settings.textContent = `${room.settings.blueSquads} vs ${room.settings.redSquads} squads · RESPAWN ${room.settings.respawnSeconds}s · ${room.settings.passwordProtected ? 'PASSWORD ON' : 'OPEN ROOM'}`;
  bluePlayers.innerHTML = '';
  redPlayers.innerHTML = '';
  for (const player of room.players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    const name = document.createElement('span');
    name.textContent = player.name;
    if (player.owner) name.classList.add('host');
    const role = document.createElement('span');
    role.textContent = player.owner ? 'HOST' : 'PLAYER';
    row.append(name, role);
    (player.team === 'blue' ? bluePlayers : redPlayers).appendChild(row);
  }
  const local = room.players.find((player) => player.id === network.clientId);
  startButton.disabled = !local?.owner || room.phase !== 'lobby';
  startButton.textContent = local?.owner ? 'START BATTLE' : 'WAITING FOR HOST';
  showScreen('lobby');
}

function startBattle(payload: MatchStartPayload): void {
  currentRoom = payload.room;
  menuShell!.classList.add('hidden');
  battleShell!.classList.remove('hidden');
  currentBattle?.stop();
  currentBattle = new MultiplayerBattle(network, payload, canvas!);
  networkStatus!.textContent = network.isAuthority ? 'NET HOST' : 'NET CLIENT';
  const subtitle = document.querySelector<HTMLElement>('#battle-subtitle');
  if (subtitle) subtitle.textContent = `Room ${payload.room.code} · ${payload.room.settings.blueSquads}v${payload.room.settings.redSquads}`;
}

network.onConnection = (connected, text) => {
  connectionStatus!.textContent = text;
  connectionDot!.classList.toggle('online', connected);
};
network.onError = (message) => showError(message);
network.onNotice = (message) => showError(message);
network.onRoomState = (room) => {
  currentRoom = room;
  const inBattle = !battleShell!.classList.contains('hidden');
  if (inBattle && room.phase === 'battle') {
    currentBattle?.updateRoom(room);
    return;
  }
  if (inBattle && room.phase === 'lobby') {
    currentBattle?.stop();
    currentBattle = null;
    battleShell!.classList.add('hidden');
    menuShell!.classList.remove('hidden');
  }
  renderLobby(room);
};
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
document.querySelector('#start-match')?.addEventListener('click', () => network.startMatch());
document.querySelector('#leave-room')?.addEventListener('click', () => {
  network.leaveRoom();
  currentRoom = null;
  showScreen('title');
});

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

if (invitedRoom) showScreen('join');
else showScreen('title');
