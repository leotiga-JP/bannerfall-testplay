import type { Fieldwork } from '../entities/fieldwork';
import type { ArtilleryShell } from '../entities/artilleryShell';
import type { Game } from '../game/game';
import { isChargeCavalryClass, type SquadClass, type Vec2 } from '../game/types';

type SampleKey = 'musket' | 'cannon' | 'explosion' | 'cavalryCharge' | 'birds';

interface ChargeVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  baseGain: number;
}

interface TrackedShell {
  target: Vec2;
  position: Vec2;
  sourceClass: SquadClass;
  lastSeen: number;
}

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.72;
  private readonly lastVolleyAt = new Map<string, number>();
  private readonly trackedShells = new Map<string, TrackedShell>();
  private readonly lastCannonAt = new Map<string, number>();
  private readonly lastExplosionAt = new Map<string, number>();
  private readonly knownFieldworks = new Map<string, number>();
  private readonly buffers = new Map<SampleKey, AudioBuffer>();
  private readonly chargeVoices = new Map<string, ChargeVoice>();
  private sampleLoadPromise: Promise<void> | null = null;
  private nextBirdAt = 0;
  private lastMeleeAt = 0;
  private lastAxeAt = 0;

  constructor() {
    const stored = Number(localStorage.getItem('bannerfall.sfxVolume') ?? '72');
    if (Number.isFinite(stored)) this.volume = Math.max(0, Math.min(1, stored / 100));
  }

  get volumePercent(): number {
    return Math.round(this.volume * 100);
  }

  setVolume(percent: number): void {
    const normalized = Math.max(0, Math.min(100, percent));
    this.volume = normalized / 100;
    localStorage.setItem('bannerfall.sfxVolume', String(normalized));
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025);
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!this.sampleLoadPromise) this.sampleLoadPromise = this.loadSamples(ctx);
    if (this.nextBirdAt <= 0) this.scheduleNextBird(performance.now());
  }

  stop(): void {
    for (const voice of this.chargeVoices.values()) {
      try { voice.source.stop(); } catch { /* already stopped */ }
    }
    this.chargeVoices.clear();
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }

  update(game: Game): void {
    if (!this.context || this.context.state !== 'running' || this.volume <= 0) return;
    const now = performance.now();
    const listener = game.playerFormation.center;

    this.updateVolleySounds(game, listener, now);
    this.updateShellSounds(game, listener, now);
    this.updateMeleeSounds(game, listener, now);
    this.updateFieldworkSounds(game.fieldworks, listener, now);
    this.updateChargeSounds(game, listener);
    this.updateAmbient(listener, now);
  }

  private updateVolleySounds(game: Game, listener: Vec2, now: number): void {
    const bySource = new Map<string, { count: number; maxLife: number; position: Vec2 }>();
    for (const projectile of game.projectiles) {
      const source = game.formations.find((formation) => formation.id === projectile.sourceFormationId);
      if (!source) continue;
      const entry = bySource.get(projectile.sourceFormationId) ?? { count: 0, maxLife: 0, position: source.center };
      entry.count += 1;
      entry.maxLife = Math.max(entry.maxLife, projectile.life);
      entry.position = source.center;
      bySource.set(projectile.sourceFormationId, entry);
    }
    for (const [sourceId, volley] of bySource) {
      if (volley.maxLife < 0.72) continue;
      const last = this.lastVolleyAt.get(sourceId) ?? -Infinity;
      if (now - last < 520) continue;
      this.lastVolleyAt.set(sourceId, now);
      this.playMusketVolley(volley.position, listener, Math.max(1, volley.count));
    }
  }

  private updateShellSounds(game: Game, listener: Vec2, now: number): void {
    const currentKeys = new Set<string>();
    for (const shell of game.artilleryShells) {
      const key = this.shellKey(shell);
      currentKeys.add(key);
      const previous = this.trackedShells.get(key);
      if (!previous || now - previous.lastSeen > 800) {
        if (shell.sourceClass !== 'grenadier') {
          const last = this.lastCannonAt.get(shell.sourceFormationId) ?? -Infinity;
          if (now - last > 520) {
            this.lastCannonAt.set(shell.sourceFormationId, now);
            this.playCannon(shell.position, listener, shell.sourceClass);
          }
        }
      }
      this.trackedShells.set(key, {
        target: { ...shell.target },
        position: { ...shell.position },
        sourceClass: shell.sourceClass,
        lastSeen: now,
      });
    }

    for (const [key, tracked] of [...this.trackedShells.entries()]) {
      if (currentKeys.has(key)) continue;
      const distToTarget = Math.hypot(tracked.position.x - tracked.target.x, tracked.position.y - tracked.target.y);
      if (now - tracked.lastSeen < 500 && distToTarget < 240) {
        const sourceKey = key.split(':', 1)[0] ?? key;
        const last = this.lastExplosionAt.get(sourceKey) ?? -Infinity;
        if (now - last > 160) {
          this.lastExplosionAt.set(sourceKey, now);
          this.playExplosion(tracked.target, listener, tracked.sourceClass);
        }
      }
      if (now - tracked.lastSeen > 700 || distToTarget < 240) this.trackedShells.delete(key);
    }
  }

  private updateMeleeSounds(game: Game, listener: Vec2, now: number): void {
    if (game.meleeStrikes.length > 0 && now - this.lastMeleeAt > 130) {
      this.lastMeleeAt = now;
      this.playMetalClash(game.meleeStrikes[0].start, listener);
    }
    if (game.axeStrikes.length > 0 && now - this.lastAxeAt > 180) {
      this.lastAxeAt = now;
      this.playWoodHit(game.axeStrikes[0].end, listener, false);
    }
  }

  private updateFieldworkSounds(fieldworks: Fieldwork[], listener: Vec2, now: number): void {
    const active = new Set<string>();
    for (const fieldwork of fieldworks) {
      if (!fieldwork.active) continue;
      active.add(fieldwork.id);
      if (!this.knownFieldworks.has(fieldwork.id)) {
        this.knownFieldworks.set(fieldwork.id, now);
        this.playWoodHit(fieldwork.position, listener, false);
      }
    }
    for (const [id, createdAt] of [...this.knownFieldworks.entries()]) {
      if (active.has(id)) continue;
      if (now - createdAt > 450) {
        const old = fieldworks.find((fieldwork) => fieldwork.id === id);
        this.playWoodHit(old?.position ?? listener, listener, true);
      }
      this.knownFieldworks.delete(id);
    }
  }


  private updateChargeSounds(game: Game, listener: Vec2): void {
    const active = new Set<string>();
    for (const formation of game.formations) {
      if (!isChargeCavalryClass(formation.squadClass) || formation.mode !== 'charging' || formation.aliveCount() <= 0) continue;
      active.add(formation.id);
      const existing = this.chargeVoices.get(formation.id);
      if (existing) {
        const distanceGain = this.distanceGain(formation.center, listener, 1800);
        existing.gain.gain.setTargetAtTime(existing.baseGain * distanceGain, this.context!.currentTime, 0.05);
      } else {
        this.startChargeVoice(formation.id, formation.center, listener);
      }
    }

    for (const [formationId, voice] of [...this.chargeVoices.entries()]) {
      if (active.has(formationId)) continue;
      const ctx = this.context;
      if (ctx) {
        voice.gain.gain.cancelScheduledValues(ctx.currentTime);
        voice.gain.gain.setTargetAtTime(0.001, ctx.currentTime, 0.045);
        window.setTimeout(() => {
          try { voice.source.stop(); } catch { /* already stopped */ }
        }, 160);
      }
      this.chargeVoices.delete(formationId);
    }
  }

  private updateAmbient(listener: Vec2, now: number): void {
    if (this.nextBirdAt <= 0) this.scheduleNextBird(now);
    if (now < this.nextBirdAt) return;
    const position = {
      x: listener.x + (Math.random() * 2 - 1) * 850,
      y: listener.y + (Math.random() * 2 - 1) * 520,
    };
    this.playSample('birds', position, listener, 0.14, 1700, 1);
    this.scheduleNextBird(now);
  }

  private scheduleNextBird(now: number): void {
    this.nextBirdAt = now + 26000 + Math.random() * 26000;
  }

  private shellKey(shell: ArtilleryShell): string {
    const q = (value: number): number => Math.round(value / 36);
    return `${shell.sourceFormationId}:${shell.sourceClass}:${q(shell.target.x)}:${q(shell.target.y)}`;
  }


  private async loadSamples(ctx: AudioContext): Promise<void> {
    const base = new URL('audio/', document.baseURI);
    const assets: Record<SampleKey, string> = {
      musket: new URL('musket.mp3', base).toString(),
      cannon: new URL('cannon.mp3', base).toString(),
      explosion: new URL('explosion.mp3', base).toString(),
      cavalryCharge: new URL('cavalry_charge.mp3', base).toString(),
      birds: new URL('birds.mp3', base).toString(),
    };

    await Promise.all((Object.entries(assets) as Array<[SampleKey, string]>).map(async ([key, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const encoded = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(encoded.slice(0));
        this.buffers.set(key, buffer);
      } catch (error) {
        console.warn(`[audio] failed to load ${key}:`, error);
      }
    }));
  }

  private playSample(
    key: SampleKey,
    position: Vec2,
    listener: Vec2,
    baseGain: number,
    maxDistance: number,
    playbackRate = 1,
    delay = 0,
  ): AudioBufferSourceNode | null {
    const ctx = this.context;
    const buffer = this.buffers.get(key);
    const out = this.output(position, listener, baseGain, maxDistance);
    if (!ctx || !buffer || !out) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(out);
    source.start(ctx.currentTime + Math.max(0, delay));
    return source;
  }

  private startChargeVoice(formationId: string, position: Vec2, listener: Vec2): void {
    const ctx = this.context;
    const buffer = this.buffers.get('cavalryCharge');
    const master = this.master;
    if (!ctx || !buffer || !master) return;
    const distanceGain = this.distanceGain(position, listener, 1800);
    if (distanceGain <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    const baseGain = 0.28;
    gain.gain.value = baseGain * distanceGain;
    source.connect(gain);
    gain.connect(master);
    source.onended = () => {
      if (this.chargeVoices.get(formationId)?.source === source) this.chargeVoices.delete(formationId);
    };
    source.start();
    this.chargeVoices.set(formationId, { source, gain, baseGain });
  }

  private ensureContext(): AudioContext {
    if (this.context && this.master) return this.context;
    if (!window.AudioContext) throw new Error('Web Audio API is not supported in this browser.');
    this.context = new window.AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    return this.context;
  }

  private distanceGain(position: Vec2, listener: Vec2, maxDistance = 2400): number {
    const distance = Math.hypot(position.x - listener.x, position.y - listener.y);
    if (distance >= maxDistance) return 0;
    const t = 1 - distance / maxDistance;
    // Steeper falloff keeps the battle audible locally without turning distant artillery into a constant wall of sound.
    return Math.pow(t, 2.15);
  }

  private output(position: Vec2, listener: Vec2, baseGain: number, maxDistance = 2400): GainNode | null {
    const ctx = this.context;
    const master = this.master;
    if (!ctx || !master) return null;
    const distanceGain = this.distanceGain(position, listener, maxDistance);
    if (distanceGain <= 0) return null;
    const gain = ctx.createGain();
    gain.gain.value = baseGain * distanceGain;
    gain.connect(master);
    return gain;
  }

  private makeNoise(duration: number): AudioBufferSourceNode | null {
    const ctx = this.context;
    if (!ctx) return null;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length * 0.45);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  private playMusketVolley(position: Vec2, listener: Vec2, count: number): void {
    const layers = count >= 16 ? 3 : count >= 7 ? 2 : 1;
    const baseGain = Math.min(0.62, 0.24 + Math.log2(count + 1) * 0.055);
    for (let i = 0; i < layers; i += 1) {
      const rate = 0.97 + Math.random() * 0.06;
      const delay = i * (0.018 + Math.random() * 0.018);
      this.playSample('musket', position, listener, baseGain / Math.sqrt(layers), 2200, rate, delay);
    }
  }

  private playCannon(position: Vec2, listener: Vec2, squadClass: SquadClass): void {
    const heavy = squadClass === 'heavyArtillery';
    const horse = squadClass === 'horseArtillery';
    const gain = heavy ? 0.42 : horse ? 0.26 : 0.32;
    const distance = heavy ? 3600 : horse ? 2600 : 3000;
    const rate = heavy ? 0.94 : horse ? 1.04 : 1;
    this.playSample('cannon', position, listener, gain, distance, rate);
  }

  private playExplosion(position: Vec2, listener: Vec2, squadClass: SquadClass): void {
    const heavy = squadClass === 'heavyArtillery';
    const grenade = squadClass === 'grenadier';
    const gain = heavy ? 0.52 : grenade ? 0.30 : 0.40;
    const distance = heavy ? 3600 : grenade ? 1800 : 3000;
    const rate = heavy ? 0.92 : grenade ? 1.08 : 1;
    this.playSample('explosion', position, listener, gain, distance, rate);
  }

  private playMetalClash(position: Vec2, listener: Vec2): void {
    const ctx = this.context;
    const out = this.output(position, listener, 0.09, 900);
    if (!ctx || !out) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 900 + Math.random() * 550;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
    osc.connect(gain);
    gain.connect(out);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  }

  private playWoodHit(position: Vec2, listener: Vec2, breaking: boolean): void {
    const ctx = this.context;
    const out = this.output(position, listener, breaking ? 0.22 : 0.12, 1200);
    if (!ctx || !out) return;
    const noise = this.makeNoise(breaking ? 0.18 : 0.07);
    if (!noise) return;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = breaking ? 460 : 620;
    filter.Q.value = 1.3;
    noise.connect(filter);
    filter.connect(out);
    noise.start();
    noise.stop(ctx.currentTime + (breaking ? 0.2 : 0.08));
  }
}
