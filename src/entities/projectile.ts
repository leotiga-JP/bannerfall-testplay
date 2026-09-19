import type { Team, Vec2 } from '../game/types';

export class Projectile {
  readonly team: Team;
  position: Vec2;
  readonly velocity: Vec2;
  life: number;
  readonly damage: number;
  readonly trail: Vec2[] = [];

  constructor(team: Team, position: Vec2, velocity: Vec2, life: number, damage: number) {
    this.team = team;
    this.position = { ...position };
    this.velocity = { ...velocity };
    this.life = life;
    this.damage = damage;
  }

  update(dt: number): void {
    this.trail.unshift({ ...this.position });
    if (this.trail.length > 3) this.trail.pop();
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.life -= dt;
  }
}
