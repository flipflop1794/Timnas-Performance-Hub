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
export function diffProportions(k1, n1, k2, n2) {
  const p1 = k1 / n1, p2 = k2 / n2;
  const se = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
  const d = p2 - p1;
  return { d, lo: d - 1.96 * se, hi: d + 1.96 * se, p1, p2 };
}

// Difference of two means (Welch) with a 95% interval.
export function diffMeans(a, b) {
  const ma = mean(a), mb = mean(b);
  const se = Math.sqrt((sd(a) ** 2) / a.length + (sd(b) ** 2) / b.length);
  const d = mb - ma;
  return { d, lo: d - 1.96 * se, hi: d + 1.96 * se, ma, mb };
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
