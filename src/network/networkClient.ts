import {
  PROTOCOL_VERSION,
  type BattleNetSnapshot,
  type BattlePresentationEvent,
  type ChatMessage,
  type ClientMessage,
  type ContinuousControl,
  type MatchStartPayload,
  type PlayerAction,
  type RoomBrowserEntry,
  type RoomState,
  type ServerMessage,
} from './protocol';
import type { SquadClass, Team } from '../game/types';
import type { ResourceNetworkState } from '../game/resourceSystem';
import type { ConstructionNetworkState } from '../game/constructionSystem';

interface JoinMemory {
  name: string;
  code: string;
  password: string;
}

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
  onBattleEvents?: (events: BattlePresentationEvent[]) => void;
  onResourceState?: (state: ResourceNetworkState) => void;
  onConstructionState?: (state: ConstructionNetworkState) => void;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;

  private socket: WebSocket | null = null;
  private lastUrl = '';
  private joinMemory: JoinMemory | null = null;
  private pendingPassword = '';
  private manualClose = false;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private heartbeatTimer: number | null = null;
  private lastPongAt = 0;
  private autoRejoinPending = false;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get isAuthority(): boolean {
    return !!this.clientId && this.clientId === this.authorityId;
  }

  async connect(rawUrl: string): Promise<void> {
    const url = this.normalizeUrl(rawUrl);
    this.lastUrl = url;
    this.manualClose = false;
    this.cancelReconnect();
    const previous = this.socket;
    this.socket = null;
    if (previous && previous.readyState <= WebSocket.OPEN) previous.close(1000, 'replaced');
    this.onConnection?.(false, 'CONNECTING');
    await this.openSocket(url, false);
  }

  createRoom(
    name: string,
    password: string,
    settings: Omit<import('./protocol').RoomSettings, 'passwordProtected'>,
  ): void {
    this.pendingPassword = password;
    this.joinMemory = { name, code: '', password };
    this.send({ type: 'create_room', name, password, settings });
  }

  setConquestTickets(tickets: number): void {
    this.send({ type: 'set_conquest_tickets', tickets });
  }

  requestRoomList(): void {
    this.send({ type: 'request_room_list' }, true);
  }

  joinRoom(name: string, code: string, password: string): void {
    const normalized = code.trim().toUpperCase();
    this.pendingPassword = password;
    this.joinMemory = { name, code: normalized, password };
    this.sendJoin(this.joinMemory);
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

  deployMidmatch(): void {
    this.send({ type: 'deploy_midmatch' });
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
    // Continuous input is superseded by the next packet. Never allow it to build
    // a large browser-side send queue on a slow connection.
    this.send({ type: 'control', control }, true);
  }

  sendAction(action: PlayerAction): void {
    this.send({ type: 'action', action });
  }

  sendSnapshot(snapshot: BattleNetSnapshot): void {
    this.send({ type: 'snapshot', snapshot }, true);
  }

  leaveRoom(): void {
    if (this.room?.code) localStorage.removeItem(`bannerfall.reconnect.${this.room.code}`);
    this.send({ type: 'leave_room' });
    this.room = null;
    this.joinMemory = null;
    this.autoRejoinPending = false;
  }

  close(): void {
    this.manualClose = true;
    this.joinMemory = null;
    this.autoRejoinPending = false;
    this.cancelReconnect();
    this.stopHeartbeat();
    this.socket?.close(1000, 'client closed');
    this.socket = null;
  }

  private async openSocket(url: string, reconnecting: boolean): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.socket = ws;
      let opened = false;
      const timeout = window.setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('Connection timed out.'));
        }
      }, 8000);

      ws.addEventListener('open', () => {
        opened = true;
        window.clearTimeout(timeout);
        ws.send(JSON.stringify({ type: 'hello', name: this.joinMemory?.name ?? '', protocolVersion: PROTOCOL_VERSION } satisfies ClientMessage));
        this.lastPongAt = Date.now();
        this.startHeartbeat();
        if (reconnecting) {
          this.autoRejoinPending = !!this.joinMemory?.code;
          this.onConnection?.(true, 'RECONNECTED');
        } else {
          this.reconnectAttempt = 0;
          this.onConnection?.(true, 'ONLINE');
        }
        resolve();
      }, { once: true });

      ws.addEventListener('error', () => {
        window.clearTimeout(timeout);
        if (!opened) reject(new Error('WebSocket connection failed.'));
      });

      ws.addEventListener('close', () => {
        window.clearTimeout(timeout);
        if (this.socket !== ws) return;
        this.stopHeartbeat();
        this.socket = null;
        if (this.manualClose) {
          this.onConnection?.(false, 'OFFLINE');
          return;
        }
        this.onConnection?.(false, this.joinMemory?.code ? 'RECONNECTING…' : 'OFFLINE');
        if (this.joinMemory?.code && this.lastUrl) this.scheduleReconnect();
      });

      ws.addEventListener('message', (event) => this.handleMessage(String(event.data)));
    });
  }

  private scheduleReconnect(): void {
    if (this.manualClose || this.reconnectTimer !== null || !this.lastUrl || !this.joinMemory?.code) return;
    const delay = Math.min(8000, 700 * 2 ** Math.min(this.reconnectAttempt, 4));
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.manualClose || this.connected) return;
      try {
        await this.openSocket(this.lastUrl, true);
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      const ws = this.socket;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (now - this.lastPongAt > 20_000) {
        ws.close(4000, 'heartbeat timeout');
        return;
      }
      this.send({ type: 'ping', at: now }, true);
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendJoin(memory: JoinMemory): void {
    const reconnectToken = localStorage.getItem(`bannerfall.reconnect.${memory.code}`) ?? undefined;
    this.send({ type: 'join_room', name: memory.name, code: memory.code, password: memory.password, reconnectToken });
  }

  private send(message: ClientMessage, droppable = false): void {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (!droppable) this.onError?.('Server is not connected.');
      return;
    }
    if (droppable && ws.bufferedAmount > 128 * 1024) return;
    ws.send(JSON.stringify(message));
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
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          this.manualClose = true;
          this.onError?.(`バージョン不一致: Client protocol ${PROTOCOL_VERSION} / Server protocol ${message.protocolVersion ?? 'unknown'}`);
          this.socket?.close();
          return;
        }
        this.clientId = message.clientId;
        if (this.autoRejoinPending && this.joinMemory?.code) {
          this.autoRejoinPending = false;
          this.sendJoin(this.joinMemory);
        }
        break;
      case 'reconnect_token':
        localStorage.setItem(`bannerfall.reconnect.${message.roomCode}`, message.token);
        if (this.joinMemory && !this.joinMemory.code) this.joinMemory.code = message.roomCode;
        break;
      case 'room_state': {
        this.room = message.room;
        const local = message.room.players.find((player) => player.id === this.clientId);
        if (local) {
          this.joinMemory = {
            name: local.name,
            code: message.room.code,
            password: this.joinMemory?.password ?? this.pendingPassword,
          };
        }
        this.reconnectAttempt = 0;
        this.onRoomState?.(message.room);
        break;
      }
      case 'room_list':
        this.onRoomList?.(message.rooms);
        break;
      case 'match_countdown':
        this.onMatchCountdown?.(message.seconds);
        break;
      case 'match_start':
        this.room = message.payload.room;
        this.authorityId = message.payload.authorityId;
        this.reconnectAttempt = 0;
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
      case 'battle_events':
        this.onBattleEvents?.(message.events);
        break;
      case 'resource_state':
        this.onResourceState?.(message.state);
        break;
      case 'construction_state':
        this.onConstructionState?.(message.state);
        break;
      case 'error':
        this.onError?.(message.message);
        break;
      case 'notice':
        this.onNotice?.(message.message);
        break;
      case 'pong':
        this.lastPongAt = Date.now();
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
