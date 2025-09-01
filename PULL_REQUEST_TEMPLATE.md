Title: Web: Harden PGM/YAML parsing, add threshold control, and before/after compare

Summary
- Replace ad-hoc YAML parsing with `yaml` library for robust metadata handling and proper stringify on export.
- Upgrade PGM loader to support P2 (ASCII) and P5 (binary), comments anywhere, non-255 `maxVal`, and respect `negate`.
- Add threshold control (toggle + slider) and apply it before morphology in the processing pipeline.
- Add before/after split compare mode in canvas with draggable slider.

Details
- YAML: `web-app/src/components/MapEnhancerApp.tsx` now uses `YAML.parse`/`YAML.stringify`; `web-app/package.json` adds `yaml` dependency.
- PGM: Parser reads tokens ignoring comments/whitespace, supports 1- and 2-byte samples, normalizes 0..255, and applies `negate` from YAML.
- Filters: `FilterSettings` extended with `threshold: number | null`; UI adds enable/disable + slider (0..1). Pipeline: blur -> threshold -> opening -> dilation -> erosion.
- Compare: `MapCanvas` draws processed, clips left region for original, and renders a split line. Toggle and range control are in the header.

Why
- Real-world maps often include comments and various `maxVal` settings; robust parsing prevents load failures.
- Thresholding before morphology yields cleaner, more predictable obstacle dilation/erosion.
- Compare improves visual QA when tuning parameters.

Testing Notes
- Load sample PGM+YAML with/without comments; try `negate: 1`.
- Toggle threshold on/off, adjust slider; observe binarization.
- Use compare toggle and slider to verify before/after.
- Run `npm install` inside `web-app` to install the new `yaml` dependency.

Follow-ups (future PR)
- Costmap preview via distance transform; Web Worker offloading.
- Export back to PGM (in addition to PNG) and batch processing.

