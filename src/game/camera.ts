import { GAME_CONFIG } from './config';
import type { Vec2 } from './types';

export class Camera {
  position: Vec2;
  zoom: number = GAME_CONFIG.camera.defaultZoom;
  followPlayer = true;

  constructor(start: Vec2) {
    this.position = { ...start };
    this.clamp();
  }

  reset(start: Vec2): void {
    this.position = { ...start };
    this.zoom = GAME_CONFIG.camera.defaultZoom;
    this.followPlayer = true;
    this.clamp();
  }

  updateFollow(target: Vec2, dt: number): void {
    if (!this.followPlayer) return;
    const amount = 1 - Math.exp(-GAME_CONFIG.camera.followSharpness * dt);
    this.position.x += (target.x - this.position.x) * amount;
    this.position.y += (target.y - this.position.y) * amount;
    this.clamp();
  }

  panByScreen(delta: Vec2): void {
    this.followPlayer = false;
    this.position.x -= delta.x / this.zoom;
    this.position.y -= delta.y / this.zoom;
    this.clamp();
  }

  centerOn(point: Vec2): void {
    this.position = { ...point };
    this.followPlayer = true;
    this.clamp();
  }

  jumpTo(point: Vec2): void {
    this.position = { ...point };
    this.followPlayer = false;
    this.clamp();
  }

  setCinematic(point: Vec2, zoom = this.zoom): void {
    this.followPlayer = false;
    this.position = { ...point };
    this.zoom = Math.max(GAME_CONFIG.camera.minZoom, Math.min(GAME_CONFIG.camera.maxZoom, zoom));
    this.clamp();
  }

  adjustZoom(wheelDelta: number): void {
    const factor = Math.exp(-wheelDelta * GAME_CONFIG.camera.zoomSpeed);
    this.zoom = Math.max(
      GAME_CONFIG.camera.minZoom,
      Math.min(GAME_CONFIG.camera.maxZoom, this.zoom * factor),
    );
    this.clamp();
  }

  screenToWorld(point: Vec2): Vec2 {
    return {
      x: this.position.x + (point.x - GAME_CONFIG.viewport.width / 2) / this.zoom,
      y: this.position.y + (point.y - GAME_CONFIG.viewport.height / 2) / this.zoom,
    };
  }

  visibleBounds(margin = 0): { left: number; right: number; top: number; bottom: number } {
    const halfWidth = GAME_CONFIG.viewport.width / (2 * this.zoom);
    const halfHeight = GAME_CONFIG.viewport.height / (2 * this.zoom);
    return {
      left: this.position.x - halfWidth - margin,
      right: this.position.x + halfWidth + margin,
      top: this.position.y - halfHeight - margin,
      bottom: this.position.y + halfHeight + margin,
    };
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.translate(GAME_CONFIG.viewport.width / 2, GAME_CONFIG.viewport.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.position.x, -this.position.y);
  }

  private clamp(): void {
    const halfWidth = GAME_CONFIG.viewport.width / (2 * this.zoom);
    const halfHeight = GAME_CONFIG.viewport.height / (2 * this.zoom);
    const minX = Math.min(halfWidth, GAME_CONFIG.world.width / 2);
    const maxX = Math.max(GAME_CONFIG.world.width - halfWidth, GAME_CONFIG.world.width / 2);
    const minY = Math.min(halfHeight, GAME_CONFIG.world.height / 2);
    const maxY = Math.max(GAME_CONFIG.world.height - halfHeight, GAME_CONFIG.world.height / 2);
    this.position.x = Math.max(minX, Math.min(maxX, this.position.x));
    this.position.y = Math.max(minY, Math.min(maxY, this.position.y));
  }
}
