import type { Team, Vec2 } from '../game/types';

export class ArtilleryShell {
  readonly team: Team;
  position: Vec2;
  readonly target: Vec2;
  readonly velocity: Vec2;
  active = true;

  constructor(team: Team, start: Vec2, target: Vec2, speed: number) {
    this.team = team;
    this.position = { ...start };
    this.target = { ...target };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    this.velocity = { x: (dx / distance) * speed, y: (dy / distance) * speed };
  }

  update(dt: number): boolean {
    if (!this.active) return false;
    const beforeDx = this.target.x - this.position.x;
    const beforeDy = this.target.y - this.position.y;
    const beforeDistance = Math.hypot(beforeDx, beforeDy);
    const step = Math.hypot(this.velocity.x, this.velocity.y) * dt;
    if (step >= beforeDistance) {
      this.position = { ...this.target };
      this.active = false;
      return true;
    }
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    return false;
  }
}
