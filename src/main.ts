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
const cameraElement = document.querySelector<HTMLElement>('#camera-status');

if (!canvas || !statusElement || !pauseOverlay || !blueCountElement || !redCountElement || !reloadElement || !cameraElement) {
  throw new Error('Bannerfall DOM initialization failed.');
}

const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context is not available.');

ctx.imageSmoothingEnabled = false;
canvas.width = GAME_CONFIG.viewport.width;
canvas.height = GAME_CONFIG.viewport.height;

const input = new InputManager(canvas);
const game = new Game(input);
const renderer = new Renderer(ctx);
const hud = new Hud(
  statusElement,
  pauseOverlay,
  blueCountElement,
  redCountElement,
  reloadElement,
  cameraElement,
);

let previousTime = performance.now();

function frame(now: number): void {
  const rawDt = Math.min((now - previousTime) / 1000, 0.04);
  previousTime = now;
  game.update(rawDt);
  const snapshot = game.snapshot();
  renderer.render(
    game.formations,
    game.projectiles,
    game.smoke,
    game.muzzleFlashes,
    game.corpses,
    game.meleeStrikes,
    snapshot,
    game.camera,
  );
  hud.update(snapshot);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
