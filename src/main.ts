import './styles.css';
import { GAME_CONFIG } from './game/config';
import { Game } from './game/game';
import { InputManager } from './input/inputManager';
import { Renderer } from './rendering/renderer';
import { Hud } from './ui/hud';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
const statusElement = document.querySelector<HTMLElement>('#status');
const pauseOverlay = document.querySelector<HTMLElement>('#pause-overlay');
const cameraElement = document.querySelector<HTMLElement>('#camera-status');
const blueBannerCard = document.querySelector<HTMLElement>('#blue-banner-card');
const redBannerCard = document.querySelector<HTMLElement>('#red-banner-card');
const blueBannerHp = document.querySelector<HTMLElement>('#blue-banner-hp');
const redBannerHp = document.querySelector<HTMLElement>('#red-banner-hp');
const blueBannerBar = document.querySelector<HTMLElement>('#blue-banner-bar');
const redBannerBar = document.querySelector<HTMLElement>('#red-banner-bar');
const playerState = document.querySelector<HTMLElement>('#player-state');
const playerDetail = document.querySelector<HTMLElement>('#player-detail');
const notice = document.querySelector<HTMLElement>('#notice');
const objectiveProgress = document.querySelector<HTMLElement>('#objective-progress');
const contextHint = document.querySelector<HTMLElement>('#context-hint');
const hotbar = document.querySelector<HTMLElement>('#hotbar');

const required = [
  canvas, statusElement, pauseOverlay, cameraElement,
  blueBannerCard, redBannerCard, blueBannerHp, redBannerHp,
  blueBannerBar, redBannerBar, playerState, playerDetail,
  notice, objectiveProgress, contextHint, hotbar,
];
if (required.some((element) => !element)) throw new Error('Bannerfall DOM initialization failed.');

const ctx = canvas!.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context is not available.');

ctx.imageSmoothingEnabled = false;
canvas!.width = GAME_CONFIG.viewport.width;
canvas!.height = GAME_CONFIG.viewport.height;

const input = new InputManager(canvas!);
const game = new Game(input);
const renderer = new Renderer(ctx);
const hud = new Hud(
  statusElement!, pauseOverlay!, cameraElement!,
  blueBannerCard!, redBannerCard!, blueBannerHp!, redBannerHp!,
  blueBannerBar!, redBannerBar!, playerState!, playerDetail!,
  notice!, objectiveProgress!, contextHint!, hotbar!,
);

let previousTime = performance.now();

function frame(now: number): void {
  const rawDt = Math.min((now - previousTime) / 1000, 0.04);
  previousTime = now;
  game.update(rawDt);
  const snapshot = game.snapshot();
  renderer.render(
    game.formations,
    game.banners,
    game.projectiles,
    game.smoke,
    game.muzzleFlashes,
    game.corpses,
    game.meleeStrikes,
    game.axeStrikes,
    snapshot,
    game.camera,
  );
  hud.update(snapshot);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
