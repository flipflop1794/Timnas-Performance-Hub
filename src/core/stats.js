// Shared statistics helpers. Pure functions, no dependencies.

export function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }

export function sd(xs) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// Wilson score interval for a proportion (95% by default).
export function wilson(k, n, z = 1.96) {
  if (!n) return { p: NaN, lo: 0, hi: 1 };
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

// Beta-binomial shrinkage toward a prior mean with `strength` pseudo-games.
export function shrink(k, n, priorMean = 0.5, strength = 10) {
  return (k + priorMean * strength) / (n + strength);
}

// Exponential recency weight: a game `ageDays` old counts 0.5 at `halfLifeDays`.
export function recencyWeight(ageDays, halfLifeDays = 60) {
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

// Difference of two proportions with a normal-approximation 95% interval.
// Agresti–Caffo interval (add one win and one loss to each side): the plain Wald interval has zero
// width at 0/8 vs 8/8 and is too narrow on the small samples scrims give.
export function diffProportions(k1, n1, k2, n2) {
  if (!n1 || !n2) return { d: NaN, lo: -1, hi: 1, p1: n1 ? k1 / n1 : NaN, p2: n2 ? k2 / n2 : NaN };
  const p1 = k1 / n1, p2 = k2 / n2;
  const a1 = (k1 + 1) / (n1 + 2), a2 = (k2 + 1) / (n2 + 2);
  const se = Math.sqrt(a1 * (1 - a1) / (n1 + 2) + a2 * (1 - a2) / (n2 + 2));
  const d = p2 - p1, da = a2 - a1;
  return { d, lo: Math.max(-1, da - 1.96 * se), hi: Math.min(1, da + 1.96 * se), p1, p2 };
}
// Two-sided 95% t critical value (Welch degrees of freedom); 1.96 is too narrow below ~30 games.
const T95 = [12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.20, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.10, 2.09, 2.09, 2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.05, 2.04];
export function t95(df) { return !(df >= 1) ? Infinity : df >= 30 ? 1.96 + 2.4 / df : T95[Math.floor(df) - 1]; }

// Difference of two means (Welch) with a 95% interval.
export function diffMeans(a, b) {
  const ma = mean(a), mb = mean(b);
  if (a.length < 2 || b.length < 2) return { d: mb - ma, lo: -Infinity, hi: Infinity, ma, mb };
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  const se = Math.sqrt(va + vb);
  const d = mb - ma;
  // Both windows constant: no spread to measure, so no claim either way.
  if (!se) return { d, lo: d === 0 ? 0 : -Infinity, hi: d === 0 ? 0 : Infinity, ma, mb };
  const df = (va + vb) ** 2 / ((va ** 2) / (a.length - 1) + (vb ** 2) / (b.length - 1));
  const t = t95(df);
  return { d, lo: d - t * se, hi: d + t * se, ma, mb };
}

// Deterministic PRNG so simulations and tests are reproducible.
export function rng(seed = 1) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

export const round = (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; };
export const pct = (x, d = 0) => `${round(x * 100, d)}%`;
export const mmss = (s) => { const neg = s < 0; s = Math.abs(Math.round(s)); return `${neg ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
