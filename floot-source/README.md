# ITIDEAS 3D Viewer

Portable React + Three.js source exported from Floot project `615f2595-f79f-4e12-9d60-5d1d1c18b7f6`.

## Run locally

```bash
cd floot-source
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Current features

- Local STL loading
- Local 3MF loading
- Fit and ISO/Front/Back/Left/Right/Top/Bottom views
- X/Y/Z bounding dimensions in millimetres
- Solid / edges / wireframe modes
- Grid and XYZ axes
- Two-point measurement
- PNG capture

STEP/STP is exposed in the file picker but parsing is not implemented yet.

The root-level legacy `index.html` in this repository is intentionally untouched. This runnable app lives entirely under `floot-source/`.
