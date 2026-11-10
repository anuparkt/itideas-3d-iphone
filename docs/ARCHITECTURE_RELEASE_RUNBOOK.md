# ITIDEAS CAD Viewer — Architecture, Validation & Release Runbook (v2.3)

## 1. Evidence, scope, current state
- Source code: GitHub repository anuparkt/itideas-3d-iphone. Baseline production branch: cloudflare-independent-cad-viewer (v2.2, as established in project conversations). Feature branch: cad-v2.3-design-cnc-qa.
- CI: .github/workflows/cad-viewer.yml builds static files for Cloudflare Pages with Node 22, Node unit tests and artifact smoke tests. GitHub success is **not** proof of mobile/browser or Cloudflare production success.
- Cloudflare Pages project identifier, deployment URL, branch controls and account permissions are **TBD** and must be verified in the project dashboard before assuming production release succeeded.
- Scope: mobile/desktop CAD Viewer, SVG/PDF review exports, CNC preflight, polygon collision nesting, quote estimation and a consistent UI design system. Out of scope: production G-code generation, machine calibration and physical machining certification.

## 2. Low-level architecture (source of truth)
- Frontend: static HTML + JS modules, CSS from style.css and design.css, PWA service worker.
- Three.js + STL/3MF/OBJ/PLY/GLB load paths are bundled into dist/app.bundle.js for reliable first load, reducing external module runtime requests.
- DXF ASCII: dxf-parser bundled as dist/dxf-parser.bundle.js. Drawing model and unit inspection: cad-geometry.js.
- Polygon QA: clipper-lib embedded in dist/cnc-quality.js. preflightDxf checks units, open paths, identical duplicates, self intersection and detail vs tool. packPolygonAware uses polygon intersection, rectangular sheet boundaries and clearance; deliberately excludes nesting into holes and does not guarantee optimal material use.
- Quotation: nesting-engine.js calculates material, cut length, setup/tooling, finishing, gross margin and optional VAT. Costs are **editable estimates**.
- Exports: SVG and PDF are review artifacts; STL output has no unit metadata; no CAM/G-code output.
- PDF-compatible Illustrator preview dynamically fetches PDF.js from cdnjs.cloudflare.com; STEP/STP converter dynamically fetches OpenCascade WASM/JS from cdn.jsdelivr.net. These formats are not guaranteed to work fully offline.
- Files selected via iPhone Files are processed locally in browser; no model upload API is implemented in this codebase. Runtime module downloads still contact public CDNs.

## 3. Key reliability and manufacturing risks
1. **Accuracy:** DXF spline/bulge sampling loses exact mathematical curves. Tool offsets are a visual estimate; CAM must verify tool diameter, offset side, tabs, dogbones, holding fixtures and zero position.
2. **Incomplete data:** DXF TEXT must be converted to outlines, and unsupported entities/insert transforms need verification. Previewed 3D mesh is not an authoritative solid STEP BREP.
3. **Nesting solver:** rectangle mode is conservative. Polygon-aware mode uses approximate grid/edge candidates and real polygon intersections with a 0.001mm integer scale. It is limited to 24 placed pieces and may not find the theoretical optimum.
4. **Resource use:** opening large STEP/3MF, rasterizing A4 PDFs and complex polygon intersection on older iPhones may exhaust memory. Stop and use desktop CAM for large cases.
5. **Supply chain:** external dependencies at build time and remaining CDN for PDF.js and OpenCascade. Lock exact runtime dependencies and capture known working builds. No API tokens or secrets belong in code.
6. **Client cache:** versioned service worker pre-cache must include new output modules; HTML/script/styles must use network-first refresh. If an iPhone shows old UI, check Cloudflare deployment and Safari vs Home Screen cache.

## 4. Deployment MOP (controlled change)
### Entry conditions
- Approved production branch and confirmed Cloudflare Pages project are known to the owner; change authorized.
- GitHub CI green: unit tests, static build, bundle smoke tests and JS syntax.
- Reviewer checks before/after at a known preview URL on iPhone Safari and desktop. Validate DXF Files picker, sample 100x50mm geometry, nesting ABC, clipping QA failure, 3MF and PDF export.
- Previous successful Cloudflare production deployment remains available for rollback.
### Change actions
1. Review PR from cad-v2.3-design-cnc-qa into cloudflare-independent-cad-viewer; record baseline commit ID and CI results.
2. Only merge after QA passes. Cloudflare Git integration *may* deploy automatically, depending on production branch controls. Confirm via Cloudflare Pages > Deployments.
3. Check the resulting commit hash, HTTP 200 for index + scripts + CSS, and presence of the app bundle, DXF bundle and CNC QA bundle. Check console for missing module errors.
4. On Safari iPhone open the URL directly; verify files, sheet, mouse/touch pan zoom, preflight, calculations, and error labels. Then test the Home Screen PWA.
### Expected outcome / PASS
- No regression of STL/3MF/STEP/DXF/AI open paths.
- Preflight reports open, duplicate and crossing contour issues, not a CAM-ready false claim.
- Polygon-aware mode shows collision-free layout for known sample and preserves gap/kerf assumptions; rectangle mode still works.
- PDF A4, SVG and CSV output are marked inspection only. No manufacturing export is claimed.
- Readable, non-overlapping UI at 390px iPhone and >=768px desktop. All critical actions accessible by touch and keyboard.
### STOP/FAIL conditions
- GitHub tests red, broken production JS, missing core asset, DXF picker gray again, geometry overlaps or app crashes: DO NOT proceed to machining and stop release.
- If Cloudflare auto deployed an incorrect build, roll back to the last successful production deployment via Pages > Deployments > deployment action menu > Rollback. Confirm the prior app version on Safari. Preserve failed logs and SHA for troubleshooting.
- Do not delete previous project, modify Cloudflare DNS or change user permissions as part of this release.
### Recovery / follow-up
- Revert the merge commit in GitHub or publish a forward-fix on the production branch after rollback; otherwise a later Git push could deploy the same regression again.
- Revalidate with a real customer DXF in qualified CAM software and a scrap-material dry-run before declaring any toolpaths production safe.

## 5. Infra / security baseline
- Cloudflare Pages static assets only; no backend compute, job DB or queue in this release. Client-side compute and drawing operations.
- dist/_headers sets X-Content-Type-Options, Referrer-Policy, Permissions-Policy and anti-frame headers. No strict CSP until external PDF.js / OpenCascade WASM requirements have been tested.
- Browser input checks unit metadata, shape count, dimensions and polygon-solving limits. This is not a substitute for virus scanning of arbitrary files or formal security review.
- Future monitoring (TBD): deployment build status, bundle-load failure rate, client crash reports if users opt in, size/performance limits for STEP and 3MF.
- No evidence of Cloudflare deployment status or user-authorized service account credentials is available here. Do not invent production URLs.
