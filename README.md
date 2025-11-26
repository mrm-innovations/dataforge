# DataForge

A React + TypeScript application built with Vite for data exploration and visualization. The project appears to power a “Regional Governance Performance Portal” UI with maps, charts, and province/municipality data.

## Features
- Vite + React (SWC) dev/build pipeline
- TypeScript, Tailwind CSS, and ShadCN-style UI components
- Map and chart components (GeoJSON-driven)

## Getting Started

### Prerequisites
- Node.js 18+ (LTS recommended)
- npm (bundled with Node.js)

### Install
```bash
npm install
```

### Develop
```bash
npm run dev
```
This starts the Vite dev server and prints a local URL.

### Build
```bash
npm run build
```
The production build outputs to `dist/`.

### Preview production build
```bash
npm run preview
```

## Project Structure
- `src/` – Application source (components, lib, styles)
- `public/` – Static assets served at root (e.g., GeoJSON files)
- `index.html` – Vite entry HTML for dev
- `vite.config.ts` – Default Vite configuration (base path is set to `/dataforge/` for GitHub Pages)
- `vite.apache.config.ts` – Apache/XAMPP build config (base path `/dataforge/dist/`)

## Deployment
- GitHub Pages: this repo is configured to deploy via GitHub Actions on push to `main`.
  - Vite `base` is set to `/dataforge/` for project pages at `https://mrm-innovations.github.io/dataforge/`.
  - Workflow: `.github/workflows/deploy.yml` builds and publishes the `dist/` folder using the official Pages actions.
- Manual build: `npm run build` outputs to `dist/` if you need to deploy elsewhere.
- Apache / XAMPP:
  1. Ensure mod_rewrite is enabled in Apache (enabled by default in XAMPP).
  2. Run `npm run build:apache` to emit assets with the `/dataforge/dist/` base.
  3. The bundled SPA lives in `dist/src_entry.html`. `.htaccess` now points Apache’s `DirectoryIndex` and SPA fallback to that file, so visiting `http://localhost/dataforge/` will load the compiled assets under `dist/`.

## Contributing
Issues and pull requests are welcome. Please open an issue for discussion before major changes.

## License
All rights reserved.
