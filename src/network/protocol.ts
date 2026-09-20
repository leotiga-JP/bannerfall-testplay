import type { FormationMode } from '../entities/formation';
import type { SquadClass, Team, Vec2, WeaponType } from '../game/types';

export type RoomPhase = 'lobby' | 'countdown' | 'battle';

export interface RoomSettings {
  blueSquads: number;
  redSquads: number;
  respawnSeconds: number;
  passwordProtected: boolean;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  team: Team;
  formationId: string | null;
  owner: boolean;
  connected: boolean;
  squadClass: SquadClass;
  spawnIndex: number | null;
  ready: boolean;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: LobbyPlayer[];
  ownerId: string;
}

export interface MatchStartPayload {
  room: RoomState;
  authorityId: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  at: number;
  system?: boolean;
}

export interface ContinuousControl {
  formationId: string;
  moveX: number;
  moveY: number;
  aim: Vec2;
  weapon: WeaponType;
}

export type PlayerAction =
  | { type: 'fire'; formationId: string; target: Vec2 }
  | { type: 'charge'; formationId: string; target: Vec2 }
  | { type: 'banner-attack'; formationId: string; targetTeam: Team }
  | { type: 'reform'; formationId: string }
  | { type: 'weapon'; formationId: string; weapon: WeaponType }
  | { type: 'class'; formationId: string; squadClass: SquadClass };

export interface SoldierNetState {
  x: number;
  y: number;
  hp: number;
  dead: boolean;
  direction: number;
  hit: number;
  stab: number;
}

export interface FormationNetState {
  id: string;
  team: Team;
  x: number;
  y: number;
  direction: number;
  squadClass: SquadClass;
  mode: FormationMode;
  weapon: WeaponType;
  reloadTimer: number;
  reloadDuration: number;
  spawnProtectionTimer: number;
  artilleryDeployTimer: number;
  artilleryDeployed: boolean;
  chargeMomentum: number;
  morale: number;
  bannerTargetTeam: Team | null;
  respawnRemaining: number | null;
  plannedClass: SquadClass | null;
  soldiers: SoldierNetState[];
}

export interface ProjectileNetState {
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  moraleDamage: number;
}

export interface ShellNetState {
  team: Team;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  active: boolean;
  sourceClass: SquadClass;
  blastRadius: number;
  blastDamage: number;
  edgeDamage: number;
  moraleDamage: number;
}

export interface BattleNetSnapshot {
  seq: number;
  time: number;
  winner: Team | null;
  blueBannerHp: number;
  redBannerHp: number;
  blueBannerUnderAttack: number;
  redBannerUnderAttack: number;
  blueReinforcementWave: number;
  redReinforcementWave: number;
  formations: FormationNetState[];
  projectiles: ProjectileNetState[];
  shells: ShellNetState[];
}

export type ClientMessage =
  | { type: 'hello'; name: string }
  | { type: 'create_room'; name: string; password: string; settings: Omit<RoomSettings, 'passwordProtected'> }
  | { type: 'join_room'; name: string; code: string; password: string }
  | { type: 'change_team'; team: Team }
  | { type: 'select_class'; squadClass: SquadClass }
  | { type: 'select_spawn'; spawnIndex: number }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'chat_send'; text: string }
  | { type: 'start_match' }
  | { type: 'control'; control: ContinuousControl }
  | { type: 'action'; action: PlayerAction }
  | { type: 'snapshot'; snapshot: BattleNetSnapshot }
  | { type: 'leave_room' }
  | { type: 'ping'; at: number };

export type ServerMessage =
  | { type: 'welcome'; clientId: string }
  | { type: 'room_state'; room: RoomState }
  | { type: 'match_countdown'; seconds: number }
  | { type: 'match_start'; payload: MatchStartPayload }
  | { type: 'chat_history'; messages: ChatMessage[] }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'remote_control'; playerId: string; control: ContinuousControl }
  | { type: 'remote_action'; playerId: string; action: PlayerAction }
  | { type: 'battle_snapshot'; snapshot: BattleNetSnapshot }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }
  | { type: 'pong'; at: number };
