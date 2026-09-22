export const GAME_VERSION = '4.0.6';
export const PROTOCOL_VERSION = 403;

import type { FormationMode } from '../entities/formation';
import type { SquadClass, Team, Vec2, WeaponType } from '../game/types';

export type RoomPhase = 'lobby' | 'countdown' | 'battle';
export type RoomVisibility = 'public' | 'unlisted';

export interface RoomSettings {
  blueSquads: number;
  redSquads: number;
  respawnSeconds: number;
  passwordProtected: boolean;
  visibility: RoomVisibility;
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

export interface TeamSlotState {
  humans: number;
  reserved: number;
  available: number;
  total: number;
}

export interface RoomState {
  code: string;
  phase: RoomPhase;
  settings: RoomSettings;
  players: LobbyPlayer[];
  ownerId: string;
  slots: { blue: TeamSlotState; red: TeamSlotState };
}


export interface RoomBrowserEntry {
  code: string;
  hostName: string;
  phase: RoomPhase;
  players: number;
  maxPlayers: number;
  blueSquads: number;
  redSquads: number;
  respawnSeconds: number;
  passwordProtected: boolean;
  blueHumans: number;
  redHumans: number;
  blueAvailable: number;
  redAvailable: number;
  joinable: boolean;
}

export interface MatchStartPayload {
  room: RoomState;
  authorityId: string;
  joinInProgress?: boolean;
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
  forcedMarch: boolean;
}

export type PlayerAction =
  | { type: 'fire'; formationId: string; target: Vec2 }
  | { type: 'charge'; formationId: string; target: Vec2 }
  | { type: 'banner-attack'; formationId: string; targetTeam: Team }
  | { type: 'reform'; formationId: string }
  | { type: 'grenade'; formationId: string; target: Vec2 }
  | { type: 'fieldwork'; formationId: string; target: Vec2; direction: number }
  | { type: 'fieldwork-attack'; formationId: string; fieldworkId: string }
  | { type: 'weapon'; formationId: string; weapon: WeaponType }
  | { type: 'class'; formationId: string; squadClass: SquadClass }
  | { type: 'spawn'; formationId: string; spawnIndex: number };

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
  plannedSpawnIndex: number | null;
  spawnAreaIndex: number;
  forcedMarch: boolean;
  fieldworkKits: number;
  grenadeCooldown: number;
  baseRecoveryRemaining: number | null;
  soldiers: SoldierNetState[];
}

export interface FormationCombatStatsNetState {
  formationId: string;
  kills: number;
  losses: number;
  bannerDamage: number;
}

export interface ProjectileNetState {
  team: Team;
  sourceFormationId: string;
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
  sourceFormationId: string;
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


export interface FieldworkNetState {
  id: string;
  team: Team;
  sourceFormationId: string;
  x: number;
  y: number;
  direction: number;
  hp: number;
  maxHp: number;
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
  stats: FormationCombatStatsNetState[];
  formations: FormationNetState[];
  projectiles: ProjectileNetState[];
  shells: ShellNetState[];
  fieldworks: FieldworkNetState[];
}

export type ClientMessage =
  | { type: 'hello'; name: string; protocolVersion: number }
  | { type: 'create_room'; name: string; password: string; settings: Omit<RoomSettings, 'passwordProtected'> }
  | { type: 'request_room_list' }
  | { type: 'join_room'; name: string; code: string; password: string; reconnectToken?: string }
  | { type: 'change_team'; team: Team }
  | { type: 'select_class'; squadClass: SquadClass }
  | { type: 'select_spawn'; spawnIndex: number }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'deploy_midmatch' }
  | { type: 'chat_send'; text: string }
  | { type: 'start_match' }
  | { type: 'control'; control: ContinuousControl }
  | { type: 'action'; action: PlayerAction }
  | { type: 'snapshot'; snapshot: BattleNetSnapshot }
  | { type: 'leave_room' }
  | { type: 'ping'; at: number };

export type ServerMessage =
  | { type: 'welcome'; clientId: string; protocolVersion: number; serverVersion: string }
  | { type: 'reconnect_token'; roomCode: string; token: string }
  | { type: 'room_state'; room: RoomState }
  | { type: 'room_list'; rooms: RoomBrowserEntry[] }
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
