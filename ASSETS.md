# Asset provenance

| Asset | Path | Creator / source | License | Notes |
|---|---|---|---|---|
| Catalog illustrations (6 styles) | `frontend/public/assets/catalog/*.svg` | Original, drawn during the hackathon (Claude Code, generated SVG) | Project license | Flat front-view head; only the hair changes. Labeled "Reference, hindi ikaw" in the UI |
| Barber mascot | `frontend/src/components/Mascot.tsx` | Original, drawn during the hackathon | Project license | Decorative; `aria-hidden` |
| Figtree variable font | `@fontsource-variable/figtree` (bundled at build time) | Erik Kennedy | SIL OFL 1.1 | Served locally; no font CDN |
| MediaPipe Face Landmarker model | `knowledge/models/face_landmarker.task` (not committed; see README setup) | Google | Apache-2.0 | Downloaded once during setup |

Customer photos are never committed and never used as marketing assets. The demo uses fictional customers only.
