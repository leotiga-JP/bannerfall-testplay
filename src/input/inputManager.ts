import type { Vec2 } from '../game/types';

export class InputManager {
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();
  private attackPressed = false;
  private rightMouseDown = false;
  private rightMousePressed = false;
  private rightMouseReleased = false;
  private pointer: Vec2 = { x: 640, y: 360 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (!event.repeat) this.pressed.add(key);
      this.keys.add(key);
      if (['w', 'a', 's', 'd', 'f', 'p', 'r', 'escape', ' '].includes(key)) event.preventDefault();
    });

    window.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      this.keys.delete(key);
      this.released.add(key);
    });

    canvas.addEventListener('mousemove', (event) => this.updatePointer(event));
    canvas.addEventListener('mousedown', (event) => {
      this.updatePointer(event);
      if (event.button === 0) {
        this.attackPressed = true;
        event.preventDefault();
      }
      if (event.button === 2) {
        this.rightMouseDown = true;
        this.rightMousePressed = true;
        event.preventDefault();
      }
    });

    window.addEventListener('mouseup', (event) => {
      if (event.button === 2) {
        this.rightMouseDown = false;
        this.rightMouseReleased = true;
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

  consumeReform(): boolean {
    return this.consumePressed('f');
  }

  consumeAttack(): boolean {
    if (!this.attackPressed) return false;
    this.attackPressed = false;
    return true;
  }

  consumeChargeStart(): boolean {
    const keyboard = this.consumePressed(' ');
    if (this.rightMousePressed) {
      this.rightMousePressed = false;
      return true;
    }
    return keyboard;
  }

  consumeBreakOff(): boolean {
    if (!this.rightMousePressed) return false;
    this.rightMousePressed = false;
    return true;
  }

  consumeChargeRelease(): boolean {
    const keyboard = this.released.has(' ');
    if (keyboard) this.released.delete(' ');
    if (this.rightMouseReleased) {
      this.rightMouseReleased = false;
      return true;
    }
    return keyboard;
  }

  isChargeHeld(): boolean {
    return this.keys.has(' ') || this.rightMouseDown;
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
    this.released.clear();
  }
}
