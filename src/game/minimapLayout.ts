import { GAME_CONFIG } from './config';

export type MinimapPosition = 'bottom-right' | 'top-left';

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function minimapRect(position: MinimapPosition): MinimapRect {
  const width = GAME_CONFIG.minimap.width;
  const height = GAME_CONFIG.minimap.height;
  if (position === 'top-left') {
    return {
      x: GAME_CONFIG.minimap.margin,
      y: GAME_CONFIG.minimap.margin,
      width,
      height,
    };
  }
  return {
    x: GAME_CONFIG.viewport.width - width - GAME_CONFIG.minimap.margin,
    y: GAME_CONFIG.viewport.height - height - GAME_CONFIG.minimap.margin,
    width,
    height,
  };
}
