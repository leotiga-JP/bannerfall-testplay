import type { FormationMode } from '../entities/formation';
import type { SquadClass, Team, Vec2, WeaponType } from '../game/types';

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
}

export interface RoomState {
  code: string;
  phase: 'lobby' | 'battle';
  settings: RoomSettings;
  players: LobbyPlayer[];
  ownerId: string;
}

export interface MatchStartPayload {
  room: RoomState;
  authorityId: string;
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
}

export interface BattleNetSnapshot {
  seq: number;
  time: number;
  winner: Team | null;
  blueBannerHp: number;
  redBannerHp: number;
  blueBannerUnderAttack: number;
  redBannerUnderAttack: number;
  formations: FormationNetState[];
  projectiles: ProjectileNetState[];
  shells: ShellNetState[];
}

export type ClientMessage =
  | { type: 'hello'; name: string }
  | { type: 'create_room'; name: string; password: string; settings: Omit<RoomSettings, 'passwordProtected'> }
  | { type: 'join_room'; name: string; code: string; password: string }
  | { type: 'change_team'; team: Team }
  | { type: 'start_match' }
  | { type: 'control'; control: ContinuousControl }
  | { type: 'action'; action: PlayerAction }
  | { type: 'snapshot'; snapshot: BattleNetSnapshot }
  | { type: 'leave_room' }
  | { type: 'ping'; at: number };

export type ServerMessage =
  | { type: 'welcome'; clientId: string }
  | { type: 'room_state'; room: RoomState }
  | { type: 'match_start'; payload: MatchStartPayload }
  | { type: 'remote_control'; playerId: string; control: ContinuousControl }
  | { type: 'remote_action'; playerId: string; action: PlayerAction }
  | { type: 'battle_snapshot'; snapshot: BattleNetSnapshot }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }
  | { type: 'pong'; at: number };
