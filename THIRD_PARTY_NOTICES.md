# Third-party notices for MLBB Local Result Scanner

The on-device OCR scanner was ported from the Scrim Log EVOS ICON project. It uses Tesseract.js 7.0.0 (Apache-2.0) and English Tesseract language data from `@tesseract.js-data/eng` (MIT). The self-hosted worker, WebAssembly core, and language files are under `public/tesseract/` and `public/tessdata/`.

MLBB hero portraits under `public/mlbb-icons/` are game artwork, not covered by those software licenses. Eight dated official Moonton portraits were copied from Scrim Log's `public/hero-icons/2026-09-16/`; the other portraits were downloaded from the Mobile Legends Wiki image catalogue. Source URLs and hero IDs are recorded in `data/mlbb/scrim_log_icon_sources.json`. Portrait rights remain with their respective owners.

- Tesseract.js: https://github.com/naptha/tesseract.js
- English language data: https://github.com/naptha/tessdata
- Official MLBB catalogue: https://www.mobilelegends.com/
- Mobile Legends Wiki: https://mobile-legends.fandom.com/
