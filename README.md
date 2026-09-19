# Bannerfall — Phase 1

Player vs AI 1v1 combat prototype.

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

This repository includes `.github/workflows/deploy.yml` for automatic GitHub Pages deployment.

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Push to `main` (or run the workflow manually from the Actions tab).

The workflow builds the Vite project and publishes the generated `dist` directory.

Do not publish the source `index.html` directly as the Pages site root; Vite must first bundle the TypeScript and CSS into `dist`.
