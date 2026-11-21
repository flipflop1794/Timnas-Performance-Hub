// V1.39 — read an MLBB hero from its avatar (the round hero portrait on the result screen, the Data tab
// and the draft). Pure functions on RGBA pixels, so the same code runs in the browser (canvas
// getImageData), in Node tests, and in the snippet that built data/mlbb/hero_icons.json.
//
// How it works
// - The crop is resampled to 24 x 24 and split into an 8 x 8 grid; only the 32 cells inside a circle of
//   0.42 x the side are used, so the frame, the corners and level badges around a portrait do not count.
// - Per cell: brightness (evened out per image, so a darker or brighter screenshot still matches) and two
//   colour channels. 32 cells x 3 = 96 bytes per portrait.
// - The crop may be a little larger than the portrait: it is also read at 92 %, 86 % and 80 % of its side
//   in nine positions, and the closest window counts. Crop generously rather than tightly.
// - The closest hero is filled in only when it is close (SURE_MAX) and clearly closer than the next hero
//   (SURE_GAP); otherwise the three closest are offered as suggestions.
// - Skins change the portrait. A crop the staff confirmed can be kept as an extra reference for that hero
//   ("learned"), so the next game with that skin is read.
//
// Checked on the 133 official icons (mobilelegends.com/rank, 21 Nov 2026) after scaling to 44–60 px,
// a gold frame, a dark/contrast change and loose off-centre crops: the right hero came first in every
// case, and no flipped / recoloured / shifted portrait was filled in as "sure" (docs/HUB_V1_39.md).

export const SIZE = 24;
export const GRID = 8;
export const RADIUS = 0.42;
export const CELLS = (() => {
  const cs = SIZE / GRID; const out = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const cx = (gx + 0.5) * cs - SIZE / 2; const cy = (gy + 0.5) * cs - SIZE / 2;
      if (Math.hypot(cx, cy) <= RADIUS * SIZE) out.push([gx, gy]);
    }
  }
  return out;
})();
export const FEATURE_LEN = CELLS.length * 3;   // 96

// Area-average a square window (x0, y0, side) of an RGBA image down to SIZE x SIZE (RGB floats).
function resample(rgba, w, h, x0, y0, side) {
  const out = new Float64Array(SIZE * SIZE * 3); const cnt = new Float64Array(SIZE * SIZE);
  const xa = Math.max(0, Math.floor(x0)); const xb = Math.min(w, Math.ceil(x0 + side));
  const ya = Math.max(0, Math.floor(y0)); const yb = Math.min(h, Math.ceil(y0 + side));
  for (let y = ya; y < yb; y++) {
    const oy = Math.floor(((y + 0.5 - y0) / side) * SIZE); if (oy < 0 || oy >= SIZE) continue;
    for (let x = xa; x < xb; x++) {
      const ox = Math.floor(((x + 0.5 - x0) / side) * SIZE); if (ox < 0 || ox >= SIZE) continue;
      const o = oy * SIZE + ox; const i = (y * w + x) * 4;
      out[o * 3] += rgba[i]; out[o * 3 + 1] += rgba[i + 1]; out[o * 3 + 2] += rgba[i + 2]; cnt[o]++;
    }
  }
  for (let o = 0; o < SIZE * SIZE; o++) {
    if (cnt[o]) { out[o * 3] /= cnt[o]; out[o * 3 + 1] /= cnt[o]; out[o * 3 + 2] /= cnt[o]; continue; }
    // A window smaller than SIZE px: nearest pixel.
    const x = Math.min(w - 1, Math.max(0, Math.floor(x0 + ((o % SIZE) + 0.5) / SIZE * side)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(y0 + (Math.floor(o / SIZE) + 0.5) / SIZE * side)));
    const i = (y * w + x) * 4; out[o * 3] = rgba[i]; out[o * 3 + 1] = rgba[i + 1]; out[o * 3 + 2] = rgba[i + 2];
  }
  return out;
}

// Feature of one square window. Defaults to the centred square of the image.
export function featureOf(rgba, w, h, x0 = (w - Math.min(w, h)) / 2, y0 = (h - Math.min(w, h)) / 2, side = Math.min(w, h)) {
  if (!w || !h || !rgba || rgba.length < w * h * 4) throw new Error('Empty image.');
  const d = resample(rgba, w, h, x0, y0, side); const cs = SIZE / GRID; const n = CELLS.length;
  const Y = new Float64Array(n); const Cb = new Float64Array(n); const Cr = new Float64Array(n);
  CELLS.forEach(([gx, gy], c) => {
    let R = 0; let G = 0; let B = 0; let k = 0;
    for (let y = gy * cs; y < (gy + 1) * cs; y++) {
      for (let x = gx * cs; x < (gx + 1) * cs; x++) { const o = (y * SIZE + x) * 3; R += d[o]; G += d[o + 1]; B += d[o + 2]; k++; }
    }
    R /= k; G /= k; B /= k;
    Y[c] = 0.299 * R + 0.587 * G + 0.114 * B;
    Cb[c] = -0.1687 * R - 0.3313 * G + 0.5 * B;
    Cr[c] = 0.5 * R - 0.4187 * G - 0.0813 * B;
  });
  const mean = Y.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(Y.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  const f = new Uint8Array(FEATURE_LEN); const q = (v) => Math.max(0, Math.min(255, Math.round(v)));
  for (let c = 0; c < n; c++) {
    f[c * 3] = q(128 + ((Y[c] - mean) / sd) * 40);
    f[c * 3 + 1] = q(128 + Cb[c]);
    f[c * 3 + 2] = q(128 + Cr[c]);
  }
  return f;
}

// The windows a crop is read in: the whole square, then 92 %, 86 % and 80 % of it in nine positions.
export const SCALES = [1, 0.92, 0.86, 0.8];
export function windowsOf(rgba, w, h) {
  const s0 = Math.min(w, h); const ox = (w - s0) / 2; const oy = (h - s0) / 2; const out = [];
  for (const s of SCALES) {
    const sd = s0 * s; const m = s0 - sd; const pos = s === 1 ? [0.5] : [0, 0.5, 1];
    for (const fy of pos) for (const fx of pos) out.push(featureOf(rgba, w, h, ox + m * fx, oy + m * fy, sd));
  }
  return out;
}

export function encodeFeature(f) { let s = ''; for (const b of f) s += String.fromCharCode(b); return btoa(s); }
export function decodeFeature(s) {
  const bin = atob(String(s || '')); const f = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) f[i] = bin.charCodeAt(i);
  if (f.length !== FEATURE_LEN) throw new Error('Bad hero icon feature.');
  return f;
}

// Distance between two features (0 = the same). Colour weighs a little more than brightness, which
// varies more between screenshots.
export function distance(a, b) {
  let d = 0;
  for (let i = 0; i < FEATURE_LEN; i++) { const wt = i % 3 === 0 ? 0.7 : 1.3; const x = a[i] - b[i]; d += wt * x * x; }
  return Math.sqrt(d / FEATURE_LEN);
}

export const SURE_MAX = 8;
export const SURE_GAP = 1.4;

// refs: [{ hero, f, learned? }] (referenceSet). crop: { data, width, height } (an ImageData) or the
// three values. Returns { sure, hero, candidates: [{ hero, d, learned }] }, best first; `allow` (a Set)
// limits the heroes, e.g. to those not banned in this game.
export function readHero(crop, refs, { top = 3, allow = null } = {}) {
  const wins = windowsOf(crop.data, crop.width, crop.height);
  const best = new Map();
  for (const r of refs) {
    if (allow && !allow.has(r.hero)) continue;
    let d = Infinity; for (const v of wins) { const x = distance(v, r.f); if (x < d) d = x; }
    const cur = best.get(r.hero);
    if (!cur || d < cur.d) best.set(r.hero, { hero: r.hero, d, learned: !!r.learned });
  }
  const list = [...best.values()].sort((a, b) => a.d - b.d);
  const [first, second] = list;
  const sure = !!first && first.d <= SURE_MAX && (!second || second.d >= first.d * SURE_GAP);
  return { sure, hero: sure ? first.hero : '', candidates: list.slice(0, top).map((c) => ({ hero: c.hero, d: Math.round(c.d * 10) / 10, learned: c.learned })) };
}

// A confirmed crop, kept so the same skin is read next time: { hero, f } with f stored as text.
export function learnFrom(crop, hero) {
  return { hero, f: encodeFeature(featureOf(crop.data, crop.width, crop.height)) };
}

// The reference set: the official icons (data/mlbb/hero_icons.json) plus learned crops.
export function referenceSet(iconData, learned = []) {
  const refs = Object.entries(iconData?.icons || {}).map(([hero, s]) => ({ hero, f: decodeFeature(s) }));
  for (const l of learned) { try { refs.push({ hero: l.hero, f: decodeFeature(l.f), learned: true }); } catch { /* skip a bad row */ } }
  return refs;
}
