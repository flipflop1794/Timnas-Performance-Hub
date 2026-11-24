// V1.51 Whoop numbers for the hub: Whoop's own recovery colours and Coach Donny's "Indeks Kesiapan Bermain" (IKB),
// ported from his repo (web/src/lib/indeks-esports.mjs + harmonizer.mjs, with the app parameters in parameterApp.ts:
// a baseline of at least 2 earlier days within 28). His status note stands: a proposal, not yet validated for
// esports; a marker relative to the athlete's own baseline, not a measure of cognition.
// The load component (yesterday's session load) is left out here: weights are re-normalised, as in his formula.

export const RECOVERY_BANDS = { green: 67, yellow: 34 };   // Whoop: 67–100 green, 34–66 yellow, 0–33 red
export const recoveryBand = (x) => (x == null ? '' : x >= RECOVERY_BANDS.green ? 'green' : x >= RECOVERY_BANDS.yellow ? 'yellow' : 'red');
export const IKB = { window: 28, minBase: 2, midWindow: 14, clampZ: 3, minParts: 3, normal: 45, watch: 35,
  weights: { LNHRV: { w: 0.25, s: 1 }, DTT: { w: 0.25, s: 1 }, RHR: { w: 0.15, s: -1 }, KETERATURAN: { w: 0.15, s: 1 } } };

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const dayNo = (d) => Date.parse(`${d}T00:00:00Z`) / 86400000;
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const before = (rows, d, win, f) => rows.filter((x) => { const k = dayNo(d) - dayNo(x.day); return k >= 1 && k <= win; }).map(f).filter(Number.isFinite);
const z = (x, base, p) => { if (!Number.isFinite(x) || base.length < p.minBase) return null; const s = sd(base); return s > 0 ? (x - mean(base)) / s : null; };

// One athlete's days (oldest first) → the IKB of each day: { value, band: normal | watch | low, parts } or value null.
export function ikbSeries(rows, p = IKB) {
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  return sorted.map((r) => {
    const ln = (x) => (x?.hrv > 0 ? Math.log(x.hrv) : null);
    const parts = {
      LNHRV: z(ln(r), before(sorted, r.day, p.window, ln), p),
      DTT: z(r.sleepMin, before(sorted, r.day, p.window, (x) => x.sleepMin), p),
      RHR: z(r.rhr, before(sorted, r.day, p.window, (x) => x.rhr), p),
      KETERATURAN: null,
    };
    const mids = before(sorted, r.day, p.midWindow, (x) => x.mid); const midBase = before(sorted, r.day, p.window, (x) => x.mid);
    const s = midBase.length >= p.minBase ? sd(midBase) : null;
    if (Number.isFinite(r.mid) && mids.length >= p.minBase && s > 0) parts.KETERATURAN = -Math.abs(r.mid - median(mids)) / s;
    return { day: r.day, ...ikbFrom(parts, p), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r2(v)])) };
  });
}
// Donny's ikbDariKomponen: weighted, clamped z-scores → 50 + 10 × average; at least 3 parts.
export function ikbFrom(parts, p = IKB) {
  let sum = 0; let wsum = 0; let n = 0;
  for (const [k, { w, s: sign }] of Object.entries(p.weights)) { const v = parts[k]; if (!Number.isFinite(v)) continue; sum += w * sign * Math.max(-p.clampZ, Math.min(p.clampZ, v)); wsum += w; n++; }
  const value = n >= p.minParts ? r2(50 + 10 * (sum / wsum)) : null;
  return { value, band: value == null ? '' : value >= p.normal ? 'normal' : value >= p.watch ? 'watch' : 'low', n };
}

// The rows from the server → one line per athlete: latest day (within 2 days of asOf), 7-day average recovery,
// the last 14 days for the dots, the IKB of the latest day.
export function wearSummary(days, links, asOf) {
  const out = new Map();
  for (const l of links || []) out.set(`${l.title}|${l.athlete}`, { title: l.title, athlete: l.athlete, link: l, rows: [] });
  for (const d of days || []) { const k = `${d.title}|${d.athlete}`; if (!out.has(k)) out.set(k, { title: d.title, athlete: d.athlete, link: null, rows: [] }); out.get(k).rows.push({ day: String(d.day).slice(0, 10), ...(d.data || {}) }); }
  return [...out.values()].map((a) => {
    const rows = a.rows.filter((r) => r.day <= asOf).sort((x, y) => x.day.localeCompare(y.day));
    const last = rows.at(-1); const fresh = last && dayNo(asOf) - dayNo(last.day) <= 1 ? last : null;
    const week = rows.filter((r) => dayNo(asOf) - dayNo(r.day) < 7 && r.recovery != null).map((r) => r.recovery);
    const ikb = rows.some((r) => r.hrv != null) ? ikbSeries(rows).find((x) => x.day === fresh?.day) || null : null;
    const days14 = Array.from({ length: 14 }, (_, i) => { const d = new Date((dayNo(asOf) - 13 + i) * 86400000).toISOString().slice(0, 10); return { day: d, recovery: rows.find((r) => r.day === d)?.recovery ?? null }; });
    return { ...a, rows, today: fresh, lastDay: last?.day || '', avg7: week.length ? Math.round(mean(week)) : null, days14, ikb };
  }).sort((x, y) => x.title.localeCompare(y.title) || (x.today?.recovery ?? 101) - (y.today?.recovery ?? 101) || x.athlete.localeCompare(y.athlete));
}

export const hours = (min, lang = 'id') => (min == null ? '—' : `${Math.floor(min / 60)}${lang === 'id' ? 'j' : 'h'} ${String(min % 60).padStart(2, '0')}m`);
// The WhatsApp message with the athlete's link.
export function inviteText(athlete, url, lang = 'id') {
  return lang === 'id'
    ? `Halo ${athlete}, untuk monitoring kesiapan Timnas: buka link ini di HP, lalu login dengan akun Whoop kamu (cukup sekali). Data recovery, tidur dan strain akan masuk otomatis ke hub tim.\n${url}\nLink berlaku 7 hari.`
    : `Hi ${athlete}, for the national team's readiness monitoring: open this link on your phone and sign in with your Whoop account (once). Recovery, sleep and strain then reach the team hub by themselves.\n${url}\nThe link works for 7 days.`;
}
