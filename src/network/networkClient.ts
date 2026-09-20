import type {
  BattleNetSnapshot,
  ChatMessage,
  ClientMessage,
  ContinuousControl,
  MatchStartPayload,
  PlayerAction,
  RoomBrowserEntry,
  RoomState,
  RoomVisibility,
  ServerMessage,
} from './protocol';
import type { SquadClass, Team } from '../game/types';

export class NetworkClient {
  clientId = '';
  room: RoomState | null = null;
  authorityId = '';

  onConnection?: (connected: boolean, text: string) => void;
  onRoomState?: (room: RoomState) => void;
  onRoomList?: (rooms: RoomBrowserEntry[]) => void;
  onMatchCountdown?: (seconds: number) => void;
  onMatchStart?: (payload: MatchStartPayload) => void;
  onChatHistory?: (messages: ChatMessage[]) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onRemoteControl?: (playerId: string, control: ContinuousControl) => void;
  onRemoteAction?: (playerId: string, action: PlayerAction) => void;
  onBattleSnapshot?: (snapshot: BattleNetSnapshot) => void;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;

  private socket: WebSocket | null = null;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get isAuthority(): boolean {
    return !!this.clientId && this.clientId === this.authorityId;
  }

  async connect(rawUrl: string): Promise<void> {
    const url = this.normalizeUrl(rawUrl);
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
    this.onConnection?.(false, 'CONNECTING');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.socket = ws;
      const timeout = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('Connection timed out.'));
        }
      }, 8000);
      ws.addEventListener('open', () => {
        window.clearTimeout(timeout);
        this.onConnection?.(true, 'ONLINE');
        resolve();
      }, { once: true });
      ws.addEventListener('error', () => {
        window.clearTimeout(timeout);
        reject(new Error('WebSocket connection failed.'));
      }, { once: true });
      ws.addEventListener('close', () => {
        this.onConnection?.(false, 'OFFLINE');
      });
      ws.addEventListener('message', (event) => this.handleMessage(String(event.data)));
    });
  }

  createRoom(name: string, password: string, blueSquads: number, redSquads: number, respawnSeconds: number, visibility: RoomVisibility): void {
    this.send({
      type: 'create_room',
      name,
      password,
      settings: { blueSquads, redSquads, respawnSeconds, visibility },
    });
  }

  requestRoomList(): void {
    this.send({ type: 'request_room_list' });
  }

  joinRoom(name: string, code: string, password: string): void {
    this.send({ type: 'join_room', name, code: code.trim().toUpperCase(), password });
  }

  changeTeam(team: Team): void {
    this.send({ type: 'change_team', team });
  }

  selectClass(squadClass: SquadClass): void {
    this.send({ type: 'select_class', squadClass });
  }

  selectSpawn(spawnIndex: number): void {
    this.send({ type: 'select_spawn', spawnIndex });
  }

  setReady(ready: boolean): void {
    this.send({ type: 'set_ready', ready });
  }

  sendChat(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.send({ type: 'chat_send', text: trimmed });
  }

  startMatch(): void {
    this.send({ type: 'start_match' });
  }

  sendControl(control: ContinuousControl): void {
    this.send({ type: 'control', control });
  }

  sendAction(action: PlayerAction): void {
    this.send({ type: 'action', action });
  }

  sendSnapshot(snapshot: BattleNetSnapshot): void {
    this.send({ type: 'snapshot', snapshot });
  }

  leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.room = null;
  }

  close(): void {
    this.socket?.close();
  }

  private send(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.onError?.('Server is not connected.');
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      this.onError?.('Invalid server message.');
      return;
    }
    switch (message.type) {
      case 'welcome':
        this.clientId = message.clientId;
        break;
      case 'room_state':
        this.room = message.room;
        this.onRoomState?.(message.room);
        break;
      case 'room_list':
        this.onRoomList?.(message.rooms);
        break;
      case 'match_countdown':
        this.onMatchCountdown?.(message.seconds);
        break;
      case 'match_start':
        this.room = message.payload.room;
        this.authorityId = message.payload.authorityId;
        this.onMatchStart?.(message.payload);
        break;
      case 'chat_history':
        this.onChatHistory?.(message.messages);
        break;
      case 'chat_message':
        this.onChatMessage?.(message.message);
        break;
      case 'remote_control':
        this.onRemoteControl?.(message.playerId, message.control);
        break;
      case 'remote_action':
        this.onRemoteAction?.(message.playerId, message.action);
        break;
      case 'battle_snapshot':
        this.onBattleSnapshot?.(message.snapshot);
        break;
      case 'error':
        this.onError?.(message.message);
        break;
      case 'notice':
        this.onNotice?.(message.message);
        break;
      case 'pong':
        break;
    }
  }

  private normalizeUrl(raw: string): string {
    let value = raw.trim();
    if (!value) throw new Error('Server URL is empty.');
    if (value.startsWith('https://')) value = `wss://${value.slice(8)}`;
    else if (value.startsWith('http://')) value = `ws://${value.slice(7)}`;
    else if (!value.startsWith('ws://') && !value.startsWith('wss://')) value = `wss://${value}`;
    const url = new URL(value);
    if (!url.pathname || url.pathname === '/') url.pathname = '/ws';
    return url.toString();
  }
}
