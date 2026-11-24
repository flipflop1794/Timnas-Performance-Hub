// V1.37 physio pain map: tender points on a front and a back body figure (after the physio's reference picture:
// occiput, trapezius, supraspinatus, gluteal, greater trochanter on the back; low cervical, second rib, lateral
// epicondyle, knee, ankle on the front), plus spots that matter in esports (wrist, hand / fingers, upper and lower
// back, eyes). Left and right are separate points. Each picked point may carry a pain score (VAS 0-10).
// Stored inside the support report row as pain: [{ p: 'knee_L', v: 5 }]. Drawn by us (no copied artwork).

const PARTS = {
  occiput: { en: 'Occiput', ind: 'Oksiput (belakang kepala)', view: 'back', dx: 10, y: 50 },
  trapezius: { en: 'Trapezius', ind: 'Trapezius (bahu atas)', view: 'back', dx: 30, y: 86 },
  supraspinatus: { en: 'Supraspinatus', ind: 'Supraspinatus (belikat atas)', view: 'back', dx: 24, y: 106 },
  upperback: { en: 'Upper back', ind: 'Punggung atas', view: 'back', dx: 0, y: 140, extra: true },
  lowerback: { en: 'Lower back', ind: 'Punggung bawah', view: 'back', dx: 0, y: 205, extra: true },
  gluteal: { en: 'Gluteal', ind: 'Gluteal (bokong)', view: 'back', dx: 20, y: 238 },
  trochanter: { en: 'Greater trochanter', ind: 'Trokanter mayor (pinggul samping)', view: 'back', dx: 40, y: 262 },
  // V1.52 the physios' ask (support team, 24 Nov): the back of the thigh and the calf, left and right.
  hamstring: { en: 'Hamstring', ind: 'Hamstring (paha belakang)', view: 'back', dx: 27, y: 306 },
  calf: { en: 'Calf', ind: 'Betis', view: 'back', dx: 25, y: 382 },
  eyes: { en: 'Eyes', ind: 'Mata', view: 'front', dx: 0, y: 36, extra: true },
  cervical: { en: 'Low cervical', ind: 'Leher bawah (servikal)', view: 'front', dx: 8, y: 76 },
  rib2: { en: 'Second rib', ind: 'Iga kedua', view: 'front', dx: 24, y: 100 },
  epicondyle: { en: 'Lateral epicondyle', ind: 'Epikondilus lateral (siku luar)', view: 'front', dx: 70, y: 168 },
  wrist: { en: 'Wrist', ind: 'Pergelangan tangan', view: 'front', dx: 78, y: 224, extra: true },
  fingers: { en: 'Hand / fingers', ind: 'Tangan / jari', view: 'front', dx: 82, y: 250, extra: true },
  knee: { en: 'Knee', ind: 'Lutut', view: 'front', dx: 20, y: 344 },
  ankle: { en: 'Ankle', ind: 'Pergelangan kaki', view: 'front', dx: 18, y: 424 },
};
// Points: one per side, or one in the middle (dx 0).
export const POINTS = Object.entries(PARTS).flatMap(([part, x]) => (x.dx ? ['L', 'R'].map((side) => ({ id: `${part}_${side}`, part, side, ...x })) : [{ id: part, part, side: '', ...x }]));
const BY_ID = Object.fromEntries(POINTS.map((p) => [p.id, p]));
export const isPoint = (id) => !!BY_ID[id];

export function pointLabel(id, lang = 'en') {
  const p = BY_ID[id]; if (!p) return String(id || '');
  const name = lang === 'id' ? PARTS[p.part].ind : PARTS[p.part].en;
  if (!p.side) return name;
  return lang === 'id' ? `${name} ${p.side === 'L' ? 'kiri' : 'kanan'}` : `${name} (${p.side === 'L' ? 'left' : 'right'})`;
}

// The physio's picks, checked: known points only, once each, pain score a whole number 0-10 or empty.
export function cleanPain(list, label = 'Pain map') {
  const out = []; const seen = new Set();
  for (const x of Array.isArray(list) ? list : []) {
    const p = String(x?.p || ''); if (!BY_ID[p] || seen.has(p)) continue; seen.add(p);
    let v = x?.v; if (v === '' || v == null) v = null;
    else { v = Number(v); if (!Number.isInteger(v) || v < 0 || v > 10) throw new Error(`${label}: ${pointLabel(p)} — pain score must be a whole number from 0 to 10.`); }
    out.push({ p, v });
  }
  return out.slice(0, 30);
}
export const painText = (pain, lang = 'en') => (pain || []).map((x) => `${pointLabel(x.p, lang)}${x.v != null ? ` ${x.v}/10` : ''}`).join(', ');
export const painLevel = (v) => (v == null ? 'pm-set' : v >= 7 ? 'pm-high' : v >= 4 ? 'pm-mid' : 'pm-low');

// Spots reported in a period (physio reports): count per point, overall and per team, most reported first.
export function painCounts(reports, from, to) {
  const all = {}; const byTitle = {};
  for (const r of reports || []) {
    if (r.date < from || r.date > to) continue;
    for (const row of r.rows || []) for (const x of row.pain || []) {
      all[x.p] = (all[x.p] || 0) + 1; const t = row.title || 'Other'; (byTitle[t] ||= {})[x.p] = (byTitle[t][x.p] || 0) + 1;
    }
  }
  const sort = (o) => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { top: sort(all), byTitle: Object.fromEntries(Object.entries(byTitle).map(([t, o]) => [t, sort(o)])), total: Object.values(all).reduce((a, n) => a + n, 0) };
}

// The two figures as one SVG (back on the left, front on the right, as in the reference picture).
// pain: picked points; counts: { pointId: n } for a summary map (dot size); row: the form row index when tappable.
const CX = { back: 110, front: 330 };
// The person's left is on the viewer's left on the back figure and on the viewer's right on the front figure.
const xOf = (p) => CX[p.view] + (p.side ? (p.view === 'back' ? (p.side === 'L' ? -1 : 1) : (p.side === 'L' ? 1 : -1)) * p.dx : 0);
// V1.37b: an anatomical (muscle) figure in the pose of the physio's reference picture: arms slightly out, palms
// forward, no text. One outline (right half mirrored, smoothed), then muscle lines for the front or the back.
const HALF = [[9, 74], [40, 83], [55, 92], [61, 110], [64, 140], [70, 168], [78, 200], [83, 226], [89, 248], [85, 263], [75, 257], [70, 230],
  [62, 198], [56, 172], [49, 132], [44, 118], [41, 160], [36, 196], [45, 232], [48, 280], [41, 344], [41, 380], [30, 426], [37, 446], [12, 449],
  [12, 428], [14, 380], [12, 344], [6, 292], [0, 270]];
function smooth(pts) {
  // Closed Catmull-Rom curve through the points, as cubic Béziers.
  const n = pts.length; const P = (i) => pts[(i + n) % n]; const f = (v) => Math.round(v * 10) / 10;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d} Z`;
}
const OUTLINE = (cx) => smooth([...HALF.map(([x, y]) => [cx + x, y]), ...[...HALF].reverse().slice(1, -1).map(([x, y]) => [cx - x, y])]);
// Muscle lines for one side (s = 1 right, -1 left), as quadratic curves [x1, y1, qx, qy, x2, y2].
const LINES = {
  front: [[4, 96, 28, 90, 46, 110], [6, 128, 28, 134, 44, 116], [46, 96, 56, 112, 52, 130], [56, 172, 66, 186, 72, 210], [3, 140, 12, 140, 18, 142],
    [3, 160, 12, 160, 17, 162], [3, 180, 12, 180, 16, 182], [3, 202, 12, 204, 16, 210], [24, 214, 28, 236, 30, 256], [32, 254, 22, 300, 16, 336],
    [40, 262, 42, 300, 34, 336], [26, 358, 24, 394, 20, 424], [16, 236, 10, 250, 4, 262]],
  back: [[14, 100, 34, 102, 38, 128], [38, 128, 24, 140, 12, 128], [42, 122, 28, 168, 10, 200], [8, 84, 24, 96, 40, 90], [46, 98, 56, 112, 52, 130],
    [2, 238, 28, 230, 42, 250], [42, 250, 26, 272, 2, 264], [26, 274, 24, 312, 20, 340], [36, 278, 40, 312, 34, 340], [28, 358, 38, 378, 26, 404],
    [16, 360, 12, 380, 18, 404], [56, 172, 66, 186, 72, 210]],
};
function figure(cx, view) {
  const q = (s, [x1, y1, qx, qy, x2, y2]) => `M${cx + s * x1} ${y1} Q${cx + s * qx} ${qy} ${cx + s * x2} ${y2}`;
  const lines = [-1, 1].flatMap((s) => LINES[view].map((l) => q(s, l))).join(' ');
  const mid = view === 'front' ? `M${cx} 98 L${cx} 232` : `M${cx} 78 L${cx} 236`;
  // 3D: a rounded body (dark edges, lit middle), a lit head, embossed muscle lines, soft highlights on the big
  // muscles, a drop shadow and a floor shadow.
  const gloss = GLOSS[view].flatMap(([x, y, rx, ry]) => (x ? [-1, 1] : [1]).map((s) => `<ellipse cx="${cx + s * x}" cy="${y}" rx="${rx}" ry="${ry}" style="fill:url(#${u}g)"/>`)).join('');
  return `<ellipse cx="${cx}" cy="452" rx="50" ry="7" style="fill:url(#${u}f)"/>
    <g class="pm-body" filter="url(#${u}sh)"><path class="pm-skin" d="${OUTLINE(cx)}" style="fill:url(#${u}s)"/>
    <rect class="pm-skin" x="${cx - 9}" y="54" width="18" height="24" rx="4" style="fill:url(#${u}s)"/>
    <ellipse class="pm-skin" cx="${cx}" cy="36" rx="19" ry="23" style="fill:url(#${u}h)"/></g>
    <g class="pm-body">${gloss}<path class="pm-lines-hi" d="${lines} ${mid}" transform="translate(1.3 1)"/><path class="pm-lines" d="${lines} ${mid}"/></g>`;
}
// Highlights on the big muscles: [dx, y, rx, ry] (dx 0 = middle).
const GLOSS = {
  front: [[24, 108, 15, 9], [0, 172, 9, 30], [56, 110, 6, 11], [28, 296, 8, 28], [26, 386, 5, 16], [66, 190, 4, 14]],
  back: [[25, 116, 11, 12], [28, 166, 8, 20], [22, 250, 13, 10], [28, 302, 8, 26], [30, 376, 6, 16], [66, 190, 4, 14]],
};
let UID = 0; let u = 'pm0';
function defs() {
  return `<defs>
    <linearGradient id="${u}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F4F7"/><stop offset="1" stop-color="#D6D6DC"/></linearGradient>
    <linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5E2216"/><stop offset=".2" stop-color="#9C3F2B"/><stop offset=".42" stop-color="#C9654A"/>
      <stop offset=".58" stop-color="#C9654A"/><stop offset=".8" stop-color="#9C3F2B"/><stop offset="1" stop-color="#5E2216"/></linearGradient>
    <radialGradient id="${u}h" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#DE8467"/><stop offset=".6" stop-color="#A9472F"/><stop offset="1" stop-color="#6A2719"/></radialGradient>
    <radialGradient id="${u}g"><stop offset="0" stop-color="#FFE3D6" stop-opacity=".42"/><stop offset="1" stop-color="#FFE3D6" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}f"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <radialGradient id="${u}d" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#9AA8FF"/><stop offset=".45" stop-color="#2537D8"/><stop offset="1" stop-color="#0E1673"/></radialGradient>
    <filter id="${u}sh" x="-20%" y="-10%" width="140%" height="125%"><feDropShadow dx="3" dy="4" stdDeviation="3" flood-color="#3A0F08" flood-opacity=".35"/></filter></defs>`;
}
export function bodySvg({ pain = [], counts = null, row = null, esc = (s) => s, lang = 'en', small = false } = {}) {
  u = `pm${++UID}`;   // gradient ids unique per figure on the page
  const picked = Object.fromEntries((pain || []).map((x) => [x.p, x.v]));
  const max = counts ? Math.max(1, ...Object.values(counts)) : 1;
  const dots = POINTS.map((p) => {
    const on = p.id in picked; const n = counts?.[p.id] || 0;
    if (counts && !n) return '';
    if (!counts && row == null && !on) return '';
    const r = counts ? 6 + Math.round((n / max) * 8) : on ? 9 : 7;
    const cls = counts ? 'pm-dot pm-count' : `pm-dot ${on ? `pm-on ${painLevel(picked[p.id])}` : ''}`;
    const tip = `${pointLabel(p.id, lang)}${on && picked[p.id] != null ? ` ${picked[p.id]}/10` : ''}${counts ? ` · ${n}×` : ''}`;
    const tap = row != null ? ` data-sup-pain="${row}" data-pt="${p.id}" role="button" tabindex="0" aria-pressed="${on}"` : '';
    // A glass bead: blue sphere when free, the score colour when picked, with a small light spot on top.
    const x = xOf(p);
    return `<circle class="${cls}" cx="${x}" cy="${p.y}" r="${r}"${!on && !counts ? ` style="fill:url(#${u}d)"` : ''}${tap}><title>${esc(tip)}</title></circle>
      <circle class="pm-shine" cx="${x - r * 0.32}" cy="${p.y - r * 0.36}" r="${Math.max(1.6, r * 0.3)}"/>`;
  }).join('');
  return `<svg class="painmap${small ? ' pm-small' : ''}" viewBox="0 0 440 466" role="img" aria-label="${lang === 'id' ? 'Peta nyeri (kiri: belakang, kanan: depan)' : 'Pain map (left: back, right: front)'}">
    ${defs()}<rect x="0" y="0" width="440" height="466" rx="18" style="fill:url(#${u}bg)"/>${figure(CX.back, 'back')}${figure(CX.front, 'front')}${dots}</svg>`;
}
