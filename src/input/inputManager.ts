import type { Vec2 } from '../game/types';

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private attackPressed = false;
  private pointer: Vec2 = { x: 480, y: 270 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (!event.repeat) this.pressed.add(key);
      this.keys.add(key);
      if (['w', 'a', 's', 'd', 'p', 'r', 'escape', ' '].includes(key)) event.preventDefault();
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });

    canvas.addEventListener('mousemove', (event) => this.updatePointer(event));
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.attackPressed = true;
        event.preventDefault();
      }
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  isDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  consumePressed(key: string): boolean {
    const normalized = key.toLowerCase();
    if (!this.pressed.has(normalized)) return false;
    this.pressed.delete(normalized);
    return true;
  }

  consumePause(): boolean {
    return this.consumePressed('escape') || this.consumePressed('p');
  }

  consumeRestart(): boolean {
    return this.consumePressed('r');
  }

  consumeAttack(): boolean {
    if (!this.attackPressed) return false;
    this.attackPressed = false;
    return true;
  }

  getPointer(): Vec2 {
    return { ...this.pointer };
  }

  private updatePointer(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.pointer = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
