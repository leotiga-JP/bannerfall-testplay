import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { Game } from '../src/game/game.ts';
import { BATTLEFIELD_MAP, SPAWN_AREA_COUNT } from '../src/game/battlefieldMap.ts';
import type { InputManager } from '../src/input/inputManager.ts';
import { isSquadClass, type SquadClass, type Team, type Vec2, type WeaponType } from '../src/game/types.ts';
import {
  GAME_VERSION,
  PROTOCOL_VERSION,
  type ChatMessage,
  type ContinuousControl,
  type PlayerAction,
  type RoomBrowserEntry,
  type RoomState,
  type RoomVisibility,
} from '../src/network/protocol.ts';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_PLAYERS = 20;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TICK_SECONDS = 1 / 20;
const SNAPSHOT_SECONDS = 1 / 10;
const MATCH_COUNTDOWN_SECONDS = 3;
const CHAT_HISTORY_LIMIT = 50;
const RECONNECT_WINDOW_MS = 120_000;

interface ServerPlayer {
  id: string;
  name: string;
  team: Team;
  formationId: string | null;
  squadClass: SquadClass;
  spawnIndex: number | null;
  ready: boolean;
  reconnectToken: string;
  ws: WebSocket;
}

interface ReconnectReservation {
  token: string;
  name: string;
  team: Team;
  formationId: string;
  squadClass: SquadClass;
  spawnIndex: number;
  expiresAt: number;
}

interface PasswordRecord {
  salt: string;
  hash: string;
}

interface Room {
  code: string;
  phase: 'lobby' | 'countdown' | 'battle';
  ownerId: string;
  password: PasswordRecord | null;
  settings: { blueSquads: number; redSquads: number; respawnSeconds: number; visibility: RoomVisibility };
  players: Map<string, ServerPlayer>;
  reservations: Map<string, ReconnectReservation>;
  chat: ChatMessage[];
  game: Game | null;
  snapshotClock: number;
  countdownTimer: ReturnType<typeof setTimeout> | null;
}

interface Session {
  id: string;
  name: string;
  roomCode: string | null;
  protocolOk: boolean;
  ws: WebSocket;
}

class HeadlessInput {
  isDown(_key: string): boolean { return false; }
  consumePressed(_key: string): boolean { return false; }
  consumePause(): boolean { return false; }
  consumeRestart(): boolean { return false; }
  consumeReform(): boolean { return false; }
  consumeCenterCamera(): boolean { return false; }
  isForcedMarchHeld(): boolean { return false; }
  consumeDebugToggle(): boolean { return false; }
  consumeTimeScale(): number | null { return null; }
  consumeWeaponSelection(): WeaponType | null { return null; }
  consumeClassSelection(): null { return null; }
  queueClassSelection(): void {}
  consumePrimaryClick(): null { return null; }
  consumeChargeStart(): boolean { return false; }
  consumeRightPress(): boolean { return false; }
  consumeBreakOff(): boolean { return false; }
  consumeChargeRelease(): boolean { return false; }
  isChargeHeld(): boolean { return false; }
  getPointer(): Vec2 { return { x: 640, y: 360 }; }
  consumePanDelta(): Vec2 { return { x: 0, y: 0 }; }
  consumeWheelDelta(): number { return 0; }
  clearActionInputs(): void {}
  endFrame(): void {}
}

const rooms = new Map<string, Room>();
const sessions = new Map<string, Session>();
const tickSamples: number[] = [];
let tickMaxMs = 0;

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function cleanName(value: unknown): string {
  const text = String(value ?? '').trim().replace(/[<>\u0000-\u001f]/g, '');
  return text.slice(0, 24) || 'Player';
}

function cleanChat(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function randomCode(): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let i = 0; i < 6; i += 1) code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Could not allocate room code.');
}

function hashPassword(password: string): PasswordRecord | null {
  if (!password) return null;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function verifyPassword(password: string, record: PasswordRecord | null): boolean {
  if (!record) return !password;
  const salt = Buffer.from(record.salt, 'hex');
  const expected = Buffer.from(record.hash, 'hex');
  const actual = crypto.scryptSync(password, salt, 32);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function reservedCount(room: Room, team: Team): number {
  let count = 0;
  const now = Date.now();
  for (const reservation of room.reservations.values()) {
    if (reservation.expiresAt > now && reservation.team === team) count += 1;
  }
  return count;
}

function deployedHumanCount(room: Room, team: Team): number {
  let count = 0;
  for (const player of room.players.values()) {
    if (player.team === team && (room.phase !== 'battle' || player.formationId !== null)) count += 1;
  }
  return count;
}

function pendingTeamCount(room: Room, team: Team, excludeId?: string): number {
  let count = 0;
  for (const player of room.players.values()) {
    if (player.id === excludeId || player.team !== team) continue;
    if (room.phase === 'battle' && player.formationId !== null) continue;
    count += 1;
  }
  return count;
}

function teamSlotState(room: Room, team: Team) {
  const total = team === 'blue' ? room.settings.blueSquads : room.settings.redSquads;
  const humans = deployedHumanCount(room, team);
  const reserved = room.phase === 'battle' ? reservedCount(room, team) : 0;
  const available = Math.max(0, total - humans - reserved);
  return { humans, reserved, available, total };
}

function publicRoom(room: Room): RoomState {
  return {
    code: room.code,
    phase: room.phase,
    settings: {
      blueSquads: room.settings.blueSquads,
      redSquads: room.settings.redSquads,
      respawnSeconds: room.settings.respawnSeconds,
      passwordProtected: !!room.password,
      visibility: room.settings.visibility,
    },
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      team: player.team,
      formationId: player.formationId,
      owner: player.id === room.ownerId,
      connected: true,
      squadClass: player.squadClass,
      spawnIndex: player.spawnIndex,
      ready: player.ready,
    })),
    ownerId: room.ownerId,
    slots: { blue: teamSlotState(room, 'blue'), red: teamSlotState(room, 'red') },
  };
}

function broadcast(room: Room, payload: unknown): void {
  const raw = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.ws.readyState === WebSocket.OPEN) player.ws.send(raw);
  }
}

function roomBrowserEntry(room: Room): RoomBrowserEntry {
  const owner = room.players.get(room.ownerId);
  const blue = teamSlotState(room, 'blue');
  const red = teamSlotState(room, 'red');
  const capacity = Math.min(MAX_PLAYERS, room.settings.blueSquads + room.settings.redSquads);
  const joinable = room.phase === 'lobby'
    ? room.players.size < capacity
    : room.phase === 'battle' && (blue.available + red.available + blue.reserved + red.reserved > 0);
  return {
    code: room.code,
    hostName: owner?.name ?? 'Host',
    phase: room.phase,
    players: room.players.size,
    maxPlayers: capacity,
    blueSquads: room.settings.blueSquads,
    redSquads: room.settings.redSquads,
    respawnSeconds: room.settings.respawnSeconds,
    passwordProtected: !!room.password,
    blueHumans: blue.humans,
    redHumans: red.humans,
    blueAvailable: blue.available,
    redAvailable: red.available,
    joinable,
  };
}

function publicRoomList(): RoomBrowserEntry[] {
  const phaseOrder: Record<Room['phase'], number> = { lobby: 0, countdown: 1, battle: 2 };
  return [...rooms.values()]
    .filter((room) => room.settings.visibility === 'public')
    .map(roomBrowserEntry)
    .sort((a, b) => phaseOrder[a.phase] - phaseOrder[b.phase] || b.players - a.players || a.code.localeCompare(b.code));
}

function sendRoomList(ws: WebSocket): void {
  send(ws, { type: 'room_list', rooms: publicRoomList() });
}

function broadcastRoomList(): void {
  const raw = JSON.stringify({ type: 'room_list', rooms: publicRoomList() });
  for (const session of sessions.values()) {
    if (session.ws.readyState === WebSocket.OPEN) session.ws.send(raw);
  }
}

function broadcastRoom(room: Room): void {
  broadcast(room, { type: 'room_state', room: publicRoom(room) });
}

function teamCount(room: Room, team: Team): number {
  let count = 0;
  for (const player of room.players.values()) if (player.team === team) count += 1;
  return count;
}

function chooseTeam(room: Room): Team {
  const blue = room.phase === 'battle' ? teamSlotState(room, 'blue') : { humans: teamCount(room, 'blue'), available: room.settings.blueSquads - teamCount(room, 'blue') };
  const red = room.phase === 'battle' ? teamSlotState(room, 'red') : { humans: teamCount(room, 'red'), available: room.settings.redSquads - teamCount(room, 'red') };
  if (blue.available <= 0) return 'red';
  if (red.available <= 0) return 'blue';
  return blue.humans <= red.humans ? 'blue' : 'red';
}

function allPlayersReady(room: Room): boolean {
  if (room.players.size === 0) return false;
  for (const player of room.players.values()) {
    if (!player.ready || player.spawnIndex === null) return false;
  }
  return true;
}

function cancelCountdown(room: Room, message?: string): void {
  if (room.countdownTimer) clearTimeout(room.countdownTimer);
  room.countdownTimer = null;
  if (room.phase === 'countdown') room.phase = 'lobby';
  for (const player of room.players.values()) player.ready = false;
  if (message) broadcast(room, { type: 'notice', message });
  broadcastRoomList();
}

function removeFromRoom(session: Session, reason = 'left'): void {
  if (!session.roomCode) return;
  const room = rooms.get(session.roomCode);
  session.roomCode = null;
  if (!room) return;
  const player = room.players.get(session.id);
  room.players.delete(session.id);

  if (room.game && room.phase === 'battle' && player?.formationId) {
    room.game.releaseHumanFormation(player.formationId);
    if (reason === 'disconnected') {
      room.reservations.set(player.reconnectToken, {
        token: player.reconnectToken,
        name: player.name,
        team: player.team,
        formationId: player.formationId,
        squadClass: player.squadClass,
        spawnIndex: player.spawnIndex ?? 0,
        expiresAt: Date.now() + RECONNECT_WINDOW_MS,
      });
      broadcast(room, { type: 'notice', message: `${player.name} disconnected. AI has taken over ${player.formationId} for 120 seconds.` });
    } else {
      broadcast(room, { type: 'notice', message: `${player.name} left the battle. AI has taken over ${player.formationId}.` });
    }
  }

  if (room.players.size === 0) {
    if (room.countdownTimer) clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
    if (room.phase !== 'battle' || room.reservations.size === 0) {
      rooms.delete(room.code);
      broadcastRoomList();
      console.log(`[room ${room.code}] closed`);
      return;
    }
    broadcastRoomList();
    console.log(`[room ${room.code}] awaiting reconnect`);
    return;
  }

  if (room.phase === 'countdown') cancelCountdown(room, 'Player left. Start countdown cancelled.');
  if (room.ownerId === session.id && room.phase !== 'battle') room.ownerId = room.players.keys().next().value as string;
  broadcastRoom(room);
  broadcastRoomList();
  console.log(`[room ${room.code}] ${session.name} ${reason}`);
}

function makePlayer(session: Session, name: string, team: Team): ServerPlayer {
  return {
    id: session.id,
    name,
    team,
    formationId: null,
    squadClass: 'infantry',
    spawnIndex: null,
    ready: false,
    reconnectToken: crypto.randomUUID(),
    ws: session.ws,
  };
}

function createRoom(session: Session, message: Record<string, unknown>): void {
  removeFromRoom(session);
  const settings = (message.settings ?? {}) as Record<string, unknown>;
  const blueSquads = clampInt(settings.blueSquads, 1, 50, 20);
  const redSquads = clampInt(settings.redSquads, 1, 50, 20);
  const respawnSeconds = clampInt(settings.respawnSeconds, 5, 60, 20);
  const visibility: RoomVisibility = settings.visibility === 'unlisted' ? 'unlisted' : 'public';
  const code = randomCode();
  const room: Room = {
    code,
    phase: 'lobby',
    ownerId: session.id,
    password: hashPassword(String(message.password ?? '')),
    settings: { blueSquads, redSquads, respawnSeconds, visibility },
    players: new Map(),
    reservations: new Map(),
    chat: [],
    game: null,
    snapshotClock: 0,
    countdownTimer: null,
  };
  session.name = cleanName(message.name);
  session.roomCode = code;
  const player = makePlayer(session, session.name, 'blue');
  room.players.set(session.id, player);
  rooms.set(code, room);
  send(session.ws, { type: 'reconnect_token', roomCode: code, token: player.reconnectToken });
  send(session.ws, { type: 'chat_history', messages: room.chat });
  broadcastRoom(room);
  broadcastRoomList();
  console.log(`[room ${code}] created by ${session.name} (${blueSquads}v${redSquads}, respawn ${respawnSeconds}s, ${visibility})`);
}

function joinRoom(session: Session, message: Record<string, unknown>): void {
  const code = String(message.code ?? '').trim().toUpperCase();
  const room = rooms.get(code);
  if (!room) return send(session.ws, { type: 'error', message: 'Room not found.' });
  if (room.phase === 'countdown') return send(session.ws, { type: 'error', message: 'Match is starting. Try again in a few seconds.' });
  if (!verifyPassword(String(message.password ?? ''), room.password)) return send(session.ws, { type: 'error', message: 'Incorrect password.' });

  const requestedToken = String(message.reconnectToken ?? '').trim();
  const reservation = requestedToken ? room.reservations.get(requestedToken) : undefined;
  if (room.phase === 'battle' && reservation && reservation.expiresAt > Date.now() && room.game) {
    removeFromRoom(session);
    session.name = cleanName(message.name) || reservation.name;
    session.roomCode = code;
    const player = makePlayer(session, reservation.name, reservation.team);
    player.reconnectToken = reservation.token;
    player.formationId = reservation.formationId;
    player.squadClass = reservation.squadClass;
    player.spawnIndex = reservation.spawnIndex;
    player.ready = true;
    room.players.set(session.id, player);
    room.reservations.delete(reservation.token);
    room.game.claimHumanFormation(reservation.formationId, undefined, undefined, false, false);
    send(session.ws, { type: 'reconnect_token', roomCode: code, token: player.reconnectToken });
    send(session.ws, { type: 'chat_history', messages: room.chat });
    send(session.ws, { type: 'match_start', payload: { room: publicRoom(room), authorityId: 'server', joinInProgress: true } });
    send(session.ws, { type: 'battle_snapshot', snapshot: room.game.createNetworkSnapshot() });
    broadcastRoom(room);
    broadcastRoomList();
    console.log(`[room ${code}] ${player.name} reconnected to ${player.formationId}`);
    return;
  }

  const totalSlots = room.settings.blueSquads + room.settings.redSquads;
  if (room.players.size >= Math.min(MAX_PLAYERS, totalSlots)) return send(session.ws, { type: 'error', message: 'Room is full.' });
  if (room.phase === 'battle') {
    const blue = teamSlotState(room, 'blue');
    const red = teamSlotState(room, 'red');
    if (blue.available + red.available <= 0) return send(session.ws, { type: 'error', message: 'No AI squad slots are currently available.' });
  }

  removeFromRoom(session);
  session.name = cleanName(message.name);
  session.roomCode = code;
  const player = makePlayer(session, session.name, chooseTeam(room));
  room.players.set(session.id, player);
  send(session.ws, { type: 'reconnect_token', roomCode: code, token: player.reconnectToken });
  send(session.ws, { type: 'chat_history', messages: room.chat });
  broadcastRoom(room);
  broadcastRoomList();
  console.log(`[room ${code}] ${session.name} joined${room.phase === 'battle' ? ' staging' : ''}`);
}

function changeTeam(session: Session, team: unknown): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  if (!room || (team !== 'blue' && team !== 'red')) return;
  const player = room.players.get(session.id);
  if (!player || (room.phase === 'battle' && player.formationId !== null) || room.phase === 'countdown') return;
  const capacity = team === 'blue' ? room.settings.blueSquads : room.settings.redSquads;
  const occupied = room.phase === 'battle'
    ? teamSlotState(room, team).humans + teamSlotState(room, team).reserved + pendingTeamCount(room, team, player.id)
    : teamCount(room, team) - (player.team === team ? 1 : 0);
  if (occupied >= capacity) return send(session.ws, { type: 'error', message: `${team.toUpperCase()} has no free squad slots.` });
  if (player.team === team) return;
  player.team = team;
  player.spawnIndex = null;
  player.ready = false;
  broadcastRoom(room);
}

function selectClass(session: Session, squadClass: unknown): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  if (!room || room.phase === 'countdown' || !isSquadClass(squadClass)) return;
  const player = room.players.get(session.id);
  if (!player || (room.phase === 'battle' && player.formationId !== null)) return;
  player.squadClass = squadClass;
  player.ready = false;
  broadcastRoom(room);
}

function selectSpawn(session: Session, rawIndex: unknown): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  if (!room || room.phase === 'countdown') return;
  const player = room.players.get(session.id);
  if (!player || (room.phase === 'battle' && player.formationId !== null)) return;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= SPAWN_AREA_COUNT) {
    return send(session.ws, { type: 'error', message: 'Invalid spawn area.' });
  }
  player.spawnIndex = index;
  player.ready = false;
  broadcastRoom(room);
}

function setReady(session: Session, ready: unknown): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  if (!room || room.phase !== 'lobby') return;
  const player = room.players.get(session.id);
  if (!player) return;
  const next = ready === true;
  if (next && player.spawnIndex === null) return send(session.ws, { type: 'error', message: 'Select a deployment point before READY.' });
  player.ready = next;
  broadcastRoom(room);
}

function sendChat(session: Session, rawText: unknown): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  if (!room) return;
  const player = room.players.get(session.id);
  if (!player) return;
  const text = cleanChat(rawText);
  if (!text) return;
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    playerId: player.id,
    playerName: player.name,
    text,
    at: Date.now(),
  };
  room.chat.push(message);
  if (room.chat.length > CHAT_HISTORY_LIMIT) room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);
  broadcast(room, { type: 'chat_message', message });
}

function launchMatch(room: Room): void {
  if (room.phase !== 'countdown' || !allPlayersReady(room)) {
    cancelCountdown(room, 'Deployment changed. Start cancelled.');
    broadcastRoom(room);
    return;
  }

  const initialClasses: Record<string, SquadClass> = {};
  const initialSpawnAreas: Record<string, number> = {};
  const humanFormationIds: string[] = [];
  for (const team of ['blue', 'red'] as const) {
    const teamPlayers = [...room.players.values()].filter((player) => player.team === team);
    teamPlayers.forEach((player, slotIndex) => {
      if (player.spawnIndex === null) return;
      player.formationId = `${team === 'blue' ? 'B' : 'R'}${String(slotIndex + 1).padStart(2, '0')}`;
      humanFormationIds.push(player.formationId);
      initialClasses[player.formationId] = player.squadClass;
      initialSpawnAreas[player.formationId] = player.spawnIndex;
    });
  }
  const firstFormationId = humanFormationIds[0] ?? 'B01';
  room.game = new Game(new HeadlessInput() as unknown as InputManager, {
    blueSquads: room.settings.blueSquads,
    redSquads: room.settings.redSquads,
    respawnSeconds: room.settings.respawnSeconds,
    localFormationId: firstFormationId,
    humanFormationIds,
    initialClasses,
    initialSpawnAreas,
    introEnabled: true,
  });
  room.phase = 'battle';
  room.snapshotClock = 0;
  room.countdownTimer = null;
  broadcast(room, { type: 'match_start', payload: { room: publicRoom(room), authorityId: 'server', joinInProgress: false } });
  broadcastRoomList();
  console.log(`[room ${room.code}] authoritative match started (${humanFormationIds.length} players)`);
}

function deployMidmatch(session: Session): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  const player = room?.players.get(session.id);
  if (!room || !player || room.phase !== 'battle' || !room.game || player.formationId) return;
  if (player.spawnIndex === null) return send(session.ws, { type: 'error', message: 'Select a spawn area before deployment.' });

  const reservedIds = new Set([...room.reservations.values()].filter((entry) => entry.expiresAt > Date.now()).map((entry) => entry.formationId));
  const area = BATTLEFIELD_MAP.spawnArea(player.team, player.spawnIndex);
  const candidates = room.game.formations
    .filter((formation) => formation.team === player.team && !room.game!.humanFormationIds.has(formation.id) && !reservedIds.has(formation.id))
    .sort((a, b) => {
      const ai = Math.max(0, Number.parseInt(a.id.slice(1), 10) - 1);
      const bi = Math.max(0, Number.parseInt(b.id.slice(1), 10) - 1);
      const laneA = ai % 3 === player.spawnIndex ? 0 : 1;
      const laneB = bi % 3 === player.spawnIndex ? 0 : 1;
      if (laneA !== laneB) return laneA - laneB;
      const deadA = a.aliveCount() === 0 ? 0 : 1;
      const deadB = b.aliveCount() === 0 ? 0 : 1;
      if (deadA !== deadB) return deadA - deadB;
      const distanceA = Math.hypot(a.center.x - area.center.x, a.center.y - area.center.y);
      const distanceB = Math.hypot(b.center.x - area.center.x, b.center.y - area.center.y);
      return distanceA - distanceB;
    });
  const formation = candidates[0];
  if (!formation) return send(session.ws, { type: 'error', message: `${player.team.toUpperCase()} has no free AI squad slot.` });

  player.formationId = formation.id;
  player.ready = true;
  room.game.claimHumanFormation(formation.id, player.squadClass, player.spawnIndex, true, true);
  send(session.ws, { type: 'match_start', payload: { room: publicRoom(room), authorityId: 'server', joinInProgress: true } });
  send(session.ws, { type: 'battle_snapshot', snapshot: room.game.createNetworkSnapshot() });
  broadcastRoom(room);
  broadcastRoomList();
  broadcast(room, { type: 'notice', message: `${player.name} deployed to ${player.team.toUpperCase()} as ${formation.id}.` });
}

function startMatch(session: Session): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  if (!room || room.phase !== 'lobby') return;
  if (room.ownerId !== session.id) return send(session.ws, { type: 'error', message: 'Only the room host can start.' });
  if (!allPlayersReady(room)) return send(session.ws, { type: 'error', message: 'Every player must select a spawn point and READY first.' });
  if (teamCount(room, 'blue') > room.settings.blueSquads || teamCount(room, 'red') > room.settings.redSquads) {
    return send(session.ws, { type: 'error', message: 'Too many players for the selected army size.' });
  }

  room.phase = 'countdown';
  broadcastRoom(room);
  broadcast(room, { type: 'match_countdown', seconds: MATCH_COUNTDOWN_SECONDS });
  broadcastRoomList();
  room.countdownTimer = setTimeout(() => launchMatch(room), MATCH_COUNTDOWN_SECONDS * 1000);
}

function applyControl(session: Session, control: ContinuousControl): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  const player = room?.players.get(session.id);
  if (!room?.game || room.phase !== 'battle' || !player?.formationId) return;
  if (control?.formationId !== player.formationId) return;
  room.game.setRemoteControl(control);
}

function applyAction(session: Session, action: PlayerAction): void {
  const room = session.roomCode ? rooms.get(session.roomCode) : null;
  const player = room?.players.get(session.id);
  if (!room?.game || room.phase !== 'battle' || !player?.formationId) return;
  if (action?.formationId !== player.formationId) return;
  room.game.applyRemoteAction(action);
}

function handleMessage(session: Session, raw: RawData): void {
  let message: Record<string, unknown>;
  try { message = JSON.parse(String(raw)) as Record<string, unknown>; }
  catch { return send(session.ws, { type: 'error', message: 'Invalid JSON.' }); }
  if (message.type === 'hello') {
    const protocolVersion = Number(message.protocolVersion);
    if (protocolVersion !== PROTOCOL_VERSION) {
      send(session.ws, { type: 'error', message: `Version mismatch. Client protocol ${protocolVersion || 'unknown'} / Server protocol ${PROTOCOL_VERSION}.` });
      session.ws.close(1008, 'protocol mismatch');
      return;
    }
    session.protocolOk = true;
    session.name = cleanName(message.name);
    return;
  }
  if (!session.protocolOk) {
    send(session.ws, { type: 'error', message: 'Version handshake required. Reload the Bannerfall client.' });
    session.ws.close(1008, 'handshake required');
    return;
  }
  switch (message.type) {
    case 'create_room': createRoom(session, message); break;
    case 'request_room_list': sendRoomList(session.ws); break;
    case 'join_room': joinRoom(session, message); break;
    case 'change_team': changeTeam(session, message.team); break;
    case 'select_class': selectClass(session, message.squadClass); break;
    case 'select_spawn': selectSpawn(session, message.spawnIndex); break;
    case 'set_ready': setReady(session, message.ready); break;
    case 'deploy_midmatch': deployMidmatch(session); break;
    case 'chat_send': sendChat(session, message.text); break;
    case 'start_match': startMatch(session); break;
    case 'control': applyControl(session, message.control as ContinuousControl); break;
    case 'action': applyAction(session, message.action as PlayerAction); break;
    case 'leave_room': removeFromRoom(session); break;
    case 'ping': send(session.ws, { type: 'pong', at: Number(message.at) || Date.now() }); break;
    default: send(session.ws, { type: 'error', message: 'Unknown message type.' });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const [token, reservation] of room.reservations) {
      if (reservation.expiresAt <= now) room.reservations.delete(token);
    }
    if (room.phase === 'battle' && room.players.size === 0 && room.reservations.size === 0) {
      rooms.delete(room.code);
      console.log(`[room ${room.code}] reconnect window expired; closed`);
    }
  }
  broadcastRoomList();
}, 5000);

setInterval(() => {
  const started = performance.now();
  for (const room of rooms.values()) {
    if (room.phase !== 'battle' || !room.game) continue;
    room.game.update(TICK_SECONDS);
    room.snapshotClock += TICK_SECONDS;
    if (room.snapshotClock >= SNAPSHOT_SECONDS) {
      room.snapshotClock = 0;
      broadcast(room, { type: 'battle_snapshot', snapshot: room.game.createNetworkSnapshot() });
    }
  }
  const elapsed = performance.now() - started;
  tickSamples.push(elapsed);
  if (tickSamples.length > 200) tickSamples.shift();
  tickMaxMs = Math.max(tickMaxMs, elapsed);
}, TICK_SECONDS * 1000);

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const battles = [...rooms.values()].filter((room) => room.phase === 'battle').length;
    const soldiers = [...rooms.values()].reduce((sum, room) => {
      if (!room.game) return sum;
      return sum + room.game.formations.reduce((formationSum, formation) => formationSum + formation.soldiers.length, 0);
    }, 0);
    const tickAvgMs = tickSamples.length > 0 ? tickSamples.reduce((sum, value) => sum + value, 0) / tickSamples.length : 0;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      service: 'bannerfall-server',
      version: GAME_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      rooms: rooms.size,
      battles,
      players: sessions.size,
      soldiers,
      simulationHz: Math.round(1 / TICK_SECONDS),
      snapshotHz: Math.round(1 / SNAPSHOT_SECONDS),
      tickAvgMs: Number(tickAvgMs.toFixed(2)),
      tickMaxMs: Number(tickMaxMs.toFixed(2)),
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Bannerfall Version ${GAME_VERSION} Multiplayer Server`);
});

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: { threshold: 1024 }, maxPayload: 8 * 1024 * 1024 });

wss.on('connection', (ws) => {
  const id = crypto.randomUUID();
  const session: Session = { id, name: 'Player', roomCode: null, protocolOk: false, ws };
  sessions.set(id, session);
  send(ws, { type: 'welcome', clientId: id, protocolVersion: PROTOCOL_VERSION, serverVersion: GAME_VERSION });
  sendRoomList(ws);
  console.log(`[connect] ${id}`);
  ws.on('message', (raw) => handleMessage(session, raw));
  ws.on('close', () => {
    removeFromRoom(session, 'disconnected');
    sessions.delete(id);
    console.log(`[disconnect] ${id}`);
  });
  ws.on('error', (error) => console.error(`[socket ${id}]`, error.message));
});

server.listen(PORT, HOST, () => {
  console.log(`Bannerfall server running at http://${HOST}:${PORT}`);
  console.log(`Health: http://${HOST}:${PORT}/health`);
  console.log(`WebSocket: ws://${HOST}:${PORT}/ws`);
  console.log(`Simulation: ${Math.round(1 / TICK_SECONDS)} Hz / snapshots ${Math.round(1 / SNAPSHOT_SECONDS)} Hz`);
});
