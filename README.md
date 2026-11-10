# ITIDEAS CAD Viewer (Independent / Cloudflare Pages)

Mobile-first CAD inspection on iPhone, iPad and PC. Independent static PWA; no Floot runtime, database or token required.

## Formats
- **STL / 3MF:** 3D mesh, Orbit/Pan/Zoom, orthographic/perspective, ISO/front/right/top, wireframe, transparency, grid/axes, triangle count, pick two points, capture PNG.
- **STEP/STP:** WebAssembly OpenCascade tessellation (CDN on first open); units and tolerances MUST be verified against original CAD.
- **DXF (ASCII):** Vector preview: line, (LW)polyline with bulges, circle, arc, ellipse, TEXT/MTEXT, show/hide layers, fit, pan, zoom, approximate two-point measurement. Reads DXF `$INSUNITS`; unknown units stay **drawing units**, NOT assumed millimeters. INSERT/BLOCK is expanded and SPLINE is approximated for preview; 3D solids and unsupported geometry are not converted.
- **Adobe Illustrator .ai:** first-page preview for **PDF-compatible** AI files only, using PDF.js. Reported dimensions are PDF page/artboard size in mm, NOT physical contour length. Legacy EPS-only files must be exported/saved as PDF-compatible AI or PDF and renamed to AI for this preview; native proprietary Illustrator editability is not supported.

**Engineering warning:** Preview-only, not CAM-ready. Approximated curves and unsupported entities must be verified in CAD before laser/CNC production. Files are processed locally in your browser; libraries download from public CDNs during first use.

## Export formats (v2.1.2)

- **PDF A4 REVIEW:** A4 inspection sheet for DXF vector geometry (with dimensions and visible layers); screenshot-based A4 review for 3D/AI. It is clearly marked **NOT FOR PRODUCTION**. PDF annotations use basic Latin fonts; Thai or custom CAD fonts may not be faithfully preserved.
- **PDF 1:1 DXF:** Vector geometry at CAD drawing size (using `$INSUNITS`) with 5 mm of white margin around the drawing. Only enabled layers export. **Not a final full-color sign artwork, rasterized print, or verified CNC cutting file.** Printing/RIP must use 100% scale; sampled curves and fonts require CAD validation. Unknown DXF units block 1:1 output.
- **PDF 1:1 AI:** Repackages only PDF-compatible Illustrator artwork into a `.pdf` without rendering the page, preserving the source PDF artboard data; verify prepress settings in Illustrator.
- **SVG:** Vector preview of DXF curves and approximate text. Display remains scalable; fonts/curves must be checked before manufacture.
- **PNG:** Transparent DXF preview with iPhone-friendly cap of 4096 pixels on the long edge and 10 megapixels total. For 1.22 m sheets this is lower than 150 DPI; use vector PDF instead of a low-DPI PNG for large-format production.
- **STL binary:** Export a loaded STL, 3MF, or STEP mesh for slicing/3D printing. STL has no units: check dimensional scale, watertightness and manifold geometry in the slicer before printing.

On iPhone Safari, use the Export tab; if the browser previews a file instead of saving it, tap **Share → Save to Files**.

## Development
Requires Node.js >=20.
```
npm test
npm run build
```
Static output: **dist/**. Open `index.html` via an HTTP(S) server (ES module imports do not work reliably under file://).

## Deploy to Cloudflare Pages (GitHub Git integration)
1. Open https://dash.cloudflare.com/ > Workers & Pages > Create application > Pages > Connect to Git.
2. Select GitHub repository `anuparkt/itideas-3d-iphone`.
3. Select production branch `cloudflare-independent-cad-viewer` (keep `main` unchanged while inspecting).
4. **Build command:** `npm run build` · **Build output:** `dist` · **Root directory:** `/` (repository root).
5. Deploy, open the generated `*.pages.dev` URL on iPhone Safari, then Share > Add to Home Screen.
6. A custom domain can be configured in Cloudflare Pages > Custom domains after deployment.

No Cloudflare secrets or GitHub Actions integration required: Cloudflare's GitHub integration builds from branch automatically.
For a permanent rollout, test with sample DXF, Illustrator (PDF-compatible), STL, 3MF, and STEP files before switching production branch.

## Architecture
- `app.js`: legacy 3D viewer behavior preserved, routes DXF/AI to independent 2D viewer.
- `cad2d.js`: browser 2D pan/zoom/layers/measurement and PDF preview.
- `cad-geometry.js`: geometry sampling and unit conversion, Node unit tested.
- `cad-export.js`: local vector PDF, SVG, and raster review PDF export logic (tested without a backend).
- `scripts/build.mjs`: esbuild-based Cloudflare static output including the locally bundled DXF parser.
- `tests/cad-geometry.test.mjs`: geometry tests.

## Limitations
- The DXF parser is bundled locally during the build. Three.js, OpenCascade and PDF.js still require network access on first use; PWA caching afterward is best effort.
- STEP engine may use significant memory on older iPhones, especially for large assemblies.
- DXF arcs and bulges are sampled for rendering, not toolpaths; recursive INSERT/BLOCK expansion is limited to a safe depth; nested and unsupported entities may still be incomplete.
- AI rendering supports PDF-compatible format; missing fonts/embedded assets may display differently from Illustrator.
- No direct export of 2D toolpaths for manufacturing.
