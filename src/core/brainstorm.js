// V1.27 Brainstorm: a coach / analyst session per title with the AI as a thinking partner. The hub picks the
// records for the session's purpose (each with an id); the AI must cite them; the hub checks ids and numbers;
// anything that should become a hub record (session plan, coaching proposal, scouting note) goes through the
// existing forms and the coach's approval. Sessions are not stored: the summary is copied.
import { resultText } from './reports.js';
import { planMaterial, weeklyTrend, weeklyMaterial } from './practice.js';
import { partnerPlan } from './analyst.js';
import { numbersIn, numbersOk } from './ai_feedback.js';
import { materialIds } from './scouting.js';
import { localDay } from './dates.js';

export const BRAIN_MAX = 30;            // messages per session (cost cap)
export const BRAIN_PURPOSES = ['plan', 'opponent'];

export function planBrainMaterial(title, { reports = [], wtags = [], vods = [], partners = [], tiers = {}, scrims = [], asOf = localDay() } = {}) {
  const mine = reports.filter((r) => r.title === title).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
  const pm = planMaterial(title, { reports, wtags, vods, asOf });
  const pp = partnerPlan(title, { partners, reports, wtags, tiers, scrims, asOf });
  return {
    PURPOSE: 'plan next practice', TITLE: title, DATE: asOf,
    REPORTS: mine.map((r) => ({ id: r.id, date: r.date, partner: r.partner, result: resultText(r.result), focus: r.focus, worked: r.worked, failed: r.failed, adjustment: r.adjust,
      previous_adjustment_check: r.fixCheck || undefined, drills: (r.drills || []).map((d) => `${d.name}: ${d.met}`) })),
    WEAKNESSES: pm.weaknesses.map((w) => ({ id: `WK-${w.label}`, ...w })),
    THEMES: pm.themes.map((t, i) => ({ id: `TH-${i + 1}`, ...t })),
    UNFIXED: pm.unfixed,
    TREND: { id: 'TREND', ...weeklyMaterial(weeklyTrend(title, { reports, wtags, asOf })) },
    PARTNERS: pp.suggestions.map((s, i) => ({ id: `PS-${i + 1}`, text: s.text })),
  };
}

// The AI reply, checked: unknown sources are dropped from the list, suggestions need a known source and only known
// numbers, and numbers in the reply that are not in the material or the conversation are pointed out to the staff.
export function checkReply(raw, material, history = []) {
  const ids = materialIds(material);
  const allowed = new Set([...numbersIn(material), ...numbersIn(history.map((h) => h.text))]);
  const reply = String(raw?.reply || '').trim();
  const unverified = [...new Set((reply.match(/\d+(?:[.,]\d+)?/g) || []).filter((n) => !allowed.has(n)))];
  const suggestions = (raw?.suggestions || []).filter((s) => ['session', 'proposal', 'note'].includes(s.kind) && (s.sources || []).some((x) => ids.has(x)) && numbersOk(`${s.title} ${s.detail}`, allowed)).slice(0, 3);
  return { reply, sources: (raw?.sources || []).filter((x) => ids.has(x)), follow_ups: (raw?.follow_ups || []).slice(0, 3).map(String), suggestions,
    unverified, droppedSuggestions: (raw?.suggestions || []).length - suggestions.length };
}

export function sessionText(title, msgs, lang = 'en') {
  const id = lang === 'id';
  const L = [id ? `Brainstorm ${title}` : `Brainstorm — ${title}`];
  for (const m of msgs) L.push('', `${m.role === 'ai' ? 'AI' : (m.by || (id ? 'Staf' : 'Staff'))}: ${m.text}`);
  return L.join('\n');
}
