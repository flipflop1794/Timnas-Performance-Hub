// V1.20: the AI may only repeat numbers that are in the material it was given. Every AI text line is
// checked here before a coach sees it; a line with a number that is not in the material is marked
// (and left out of anything published) instead of trusted.
const NUM = /\d+(?:[.,]\d+)?/g;
export const numbersIn = (text) => (String(text ?? '').match(NUM) || []).map((x) => x.replace(',', '.'));

// Every number that appears anywhere in the material (values and inside text), as strings.
export function allowedNumbers(material) {
  const set = new Set();
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'number') { if (Number.isFinite(v)) { set.add(String(v)); set.add(String(Math.round(v))); set.add(String(Math.round(v * 10) / 10)); } return; }
    if (typeof v === 'string') { for (const n of numbersIn(v)) set.add(n); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(material);
  return set;
}

// { text, ok, bad: [numbers not found] }
export function checkLine(text, allowed) {
  const bad = numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))));
  return { text: String(text ?? '').trim(), ok: !bad.length, bad };
}
