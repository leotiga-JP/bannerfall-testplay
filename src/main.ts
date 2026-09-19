import './styles.css';
import { GAME_CONFIG } from './game/config';
import { Game } from './game/game';
import { InputManager } from './input/inputManager';
import { Renderer } from './rendering/renderer';
import { Hud } from './ui/hud';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const statusElement = document.querySelector<HTMLElement>('#status');
const pauseOverlay = document.querySelector<HTMLElement>('#pause-overlay');
const blueCountElement = document.querySelector<HTMLElement>('#blue-count');
const redCountElement = document.querySelector<HTMLElement>('#red-count');
const reloadElement = document.querySelector<HTMLElement>('#reload');

if (!canvas || !statusElement || !pauseOverlay || !blueCountElement || !redCountElement || !reloadElement) {
  throw new Error('Bannerfall DOM initialization failed.');
}

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context is not available.');

ctx.imageSmoothingEnabled = false;
canvas.width = GAME_CONFIG.width;
canvas.height = GAME_CONFIG.height;

const input = new InputManager(canvas);
const game = new Game(input);
const renderer = new Renderer(ctx);
const hud = new Hud(statusElement, pauseOverlay, blueCountElement, redCountElement, reloadElement);

let previousTime = performance.now();

function frame(now: number): void {
  const rawDt = (now - previousTime) / 1000;
  previousTime = now;
  const dt = Math.min(rawDt, 0.04);

  game.update(dt);
  const snapshot = game.snapshot();
  renderer.render(
    game.playerFormation,
    game.enemyFormation,
    game.projectiles,
    game.smoke,
    game.muzzleFlashes,
    game.corpses,
    game.meleeStrikes,
    snapshot,
  );
  hud.update(snapshot);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
