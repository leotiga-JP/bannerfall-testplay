# Bannerfall — Phase 1.5

20 vs 20 line-infantry volley prototype inspired by early-modern / Napoleonic battlefield imagery.

## What changed from Phase 1

- 20 blue infantry vs 20 red infantry
- Two-rank line formations with fixed spacing
- Player controls the entire blue line with WASD
- Mouse aims / rotates the formation
- Left click fires a synchronized musket volley
- Long reload cycle between volleys
- Enemy line advances to effective range and fires automatic volleys
- Projectile travel, inaccuracy/spread, smoke, muzzle flash, screen shake, casualties and knockback corpses
- No regeneration or respawn; eliminate the opposing formation to win

## Controls

- `WASD`: move the blue formation
- `Mouse`: face / aim the formation
- `Left Click`: fire volley when ready
- `Esc` / `P`: pause
- `R`: restart

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## GitHub Pages

The existing `.github/workflows/deploy.yml` remains compatible with this phase. The Vite base path is configured for:

`https://leotiga-jp.github.io/bannerfall-testplay/`

Push to `main` and GitHub Actions will build `dist` and deploy it to Pages.
