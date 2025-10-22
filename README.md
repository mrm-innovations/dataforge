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
- `vite.config.ts` – Vite configuration (base path is set to `/scorecard_v6/`)

## Deployment
- The `base` in `vite.config.ts` is `/scorecard_v6/`, which is useful when hosting under a subpath (e.g., GitHub Pages under a repository named `scorecard_v6`). If you deploy under a different repository or domain root, adjust `base` accordingly.
- Build with `npm run build` and deploy the `dist/` directory to your hosting provider.

## Contributing
Issues and pull requests are welcome. Please open an issue for discussion before major changes.

## License
Add your license of choice here (e.g., MIT). If unspecified, all rights reserved by default.

