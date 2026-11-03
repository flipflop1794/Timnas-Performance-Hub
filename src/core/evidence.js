// Evidence model shared by every game engine.
// A Finding is the unit the coaches reason over. `kind` separates what the data shows
// from what we infer from it and what we only suspect:
//   observed   - read directly from a record (a timestamp, a count)
//   inferred   - a statistic computed from several records, with its sample size
//   hypothesis - a tactical explanation the data is consistent with but cannot prove

export const KINDS = ['observed', 'inferred', 'hypothesis'];
export const CONFIDENCE = ['High', 'Medium', 'Low', 'Blocked'];

// Default confidence from sample size (number of independent games/matches behind it).
export function confidenceFromN(n, { high = 15, medium = 6 } = {}) {
  if (n == null) return 'Blocked';
  if (n >= high) return 'High';
  if (n >= medium) return 'Medium';
  if (n >= 1) return 'Low';
  return 'Blocked';
}

let seq = 0;
export function finding({
  title, kind = 'observed', area, lens, severity = 0, n = null, confidence,
  evidence = [], at = null, sources = [], tags = [], detail = '', data = null,
}) {
  if (!KINDS.includes(kind)) throw new Error(`bad kind ${kind}`);
  if (!lens || !['strategic', 'execution', 'risk'].includes(lens)) throw new Error(`finding needs lens: ${title}`);
  return {
    id: `F${++seq}`, title, kind, area, lens,
    severity, // -3 (costly weakness) .. +3 (clear strength)
    n, confidence: confidence || (kind === 'observed' ? (n == null ? 'Medium' : confidenceFromN(n)) : confidenceFromN(n)),
    evidence, at, sources, tags, detail, data,
  };
}

// Recommendation = training action with the five required parts.
export function recommendation({ problem, evidence, explanation, drill, success, confidence, findings = [], owner = 'TBD (title coach)', priority = 0, area }) {
  for (const [k, v] of Object.entries({ problem, evidence, explanation, drill, success, confidence })) {
    if (!v || (Array.isArray(v) && !v.length)) throw new Error(`recommendation missing ${k}`);
  }
  return { problem, evidence, explanation, drill, success, confidence, findings, owner, priority, area };
}

export function confRank(c) { return { High: 3, Medium: 2, Low: 1, Blocked: 0 }[c] ?? 0; }
