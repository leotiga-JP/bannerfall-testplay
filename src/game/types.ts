export type Team = 'player' | 'enemy';

export type AiState = 'IDLE' | 'APPROACH' | 'ENGAGE' | 'DEAD';

export interface Vec2 {
  x: number;
  y: number;
}
