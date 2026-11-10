# ITIDEAS CAD Viewer — DESIGN.md (v2.3 / Stitch)

## 1. Visual Theme & Atmosphere
An engineering instrument workstation: focused, dark, legible, utilitarian. Density 7/10, variance 5/10, motion 2/10. The CAD viewport takes visual priority, never covered by layers or quote forms. Desktop uses an asymmetric viewport plus inspector rail; iPhone uses a compact drawing above a scrollable bottom workbench. No generic marketing hero.

## 2. Color Palette & Roles
- Graphite canvas #0D1318: app shell
- Deep surface #151D23: panels
- Elevated control #1B262D: input fills
- CAD field #10191F: technical drawing
- Primary ink #F0F4F5; secondary ink #AFBEC3
- Divider #34454B: fine separation
- Precision teal #5EB7B2: single, low-saturation accent for actions/focus
- Safety amber #E9C48B: warnings only
- Error coral #EFB0A6: blockers only
- Verified #A9D4BC: passed inspection
- Sheet #F8FAF8: plotted material preview
No purple, pure black, multiple accent colors or colored gradients.

## 3. Typography
- Thai UI: Noto Sans Thai, Tahoma fallback; Latin UI: Geist, Segoe UI fallback. Offline-friendly local fallbacks.
- Dimensions, units, prices: Geist Mono, SFMono-Regular, ui-monospace. Tabular numerals required.
- Hierarchy: 10px overlines, 12px secondary labels, 14px minimum body, 16px section headers, 20px quoted price, 26px measurement readout. Line-height >=1.45. Section labels in sentence case, not all caps.

## 4. Component Contract
- One primary open-file button in header, plus visible current format.
- Mobile navigation: Info, Layers (DXF), Measure, Nesting, Export. Minimum touch area 44x44px, labels under symbols, no horizontal scroll.
- Nesting inspector in order: Source, preflight, material sheet, kerf/tool, polygon-aware or rectangle mode, quote, review and export.
- Errors inline with actionable repair text. Preflight includes issue counts, severities and a clear CAM NOT READY gate. Preview export never claims to be CAM code.
- One clear primary calculate action, a separate QA action, and secondary preview buttons.
- All form labels visible; numbers use inputs with inputmode decimal, font >=16px on iOS.

## 5. Layout Principles
- 4px spacing rhythm: 4, 8, 12, 16, 24.
- Mobile under 768px: drawing uses about 53dvh, bottom navigation 54px, scrollable inspector with around 35dvh. Nesting inspector expands up to 55dvh while leaving the drawing accessible.
- Desktop >=768px: drawing viewport left, 384–440px inspector rail on right, independent pane scrolling. No overlap on the model.
- Large pricing values placed after cut geometry; quotes grouped by material, cutting, finishing, margin and VAT.
- Avoid generic equal three-card layouts. Each page uses a stable visual hierarchy and independent scroll region.

## 6. Motion, Accessibility and Responsiveness
- 160ms cubic-bezier(.2,.7,.2,1) on opacity and transform; active buttons translateY(1px). No continuous movement in engineering tools.
- Respect prefers-reduced-motion. Use native button/label elements, aria-live for QA status, visible focus rings, color plus text for statuses, WCAG AA contrast.
- Mobile safe areas use env(safe-area-inset-*), viewport units use dvh, no 100vh, no huge animated blur or 3D GPU effects outside the model viewport.
- Preserve unrestricted iPhone Files picker because accept filters can disable DXF selection.

## 7. Banned
No generic AI purple/blue gradient, no Inter, no stock hero, no emojis as primary UI icons, no pure black, no neon outer glow, no excessive rounded cards, no inaccessible icon-only buttons, no CAM-ready or production-safe claim without geometry/bit/fixture validation.

## 8. Stitch Screen Briefs
1. Mobile CAD inspection: 390px, dominant field, fixed 44px nav, bottom inspector for file stats.
2. Mobile nesting: 390px, guided step hierarchy and collapsible setup fieldsets, preview and QA gate above quote.
3. Desktop CNC review: 1440px split 68/32, full drawing and right details rail, inspected paths in sheet preview with explicit safety labels.
4. Export / quotation: separate A4 review and cost breakdown, transparent quote assumptions, manufacturing readiness never falsely implied.
