// V1.47 one workspace per category (owner's request, 23 Nov 2026). Every title coach gets the same five tabs —
// My team, Opponents, Meta, Ask AI, Match prep — with the content and logic of their own game. MLBB Men is the
// template; the other categories switch on one by one (WORKSPACE_TITLES).
import { FIELDS } from './competitors.js';
import { localDay } from './dates.js';

export const WORKSPACE_TITLES = ['MLBB'];

// ---------------------------------------------------------------- the opponent list per category
// Starts from the published WEC field. The category's staff can hide a nation or add one (a scrim partner, a club
// worth studying). Each change is a small record kept with the scouting notes (kind "field"); the newest per nation wins.
export function fieldEdit({ title, nation, action, by }) {
  const n = String(nation || '').trim().replace(/\s+/g, ' ');
  if (!FIELDS[title]) throw new Error('Pick a title.');
  if (!n || n.length > 60) throw new Error('Write the opponent name (up to 60 characters).');
  if (!['add', 'hide', 'show'].includes(action)) throw new Error('Choose add, hide or show.');
  if (!by || !String(by).trim()) throw new Error('Who made the change is required.');
  const at = new Date().toISOString();
  return { id: `FE-${title}-${n}-${at}`.replace(/[^\w-]+/g, '_').slice(0, 120), kind: 'field', title, nation: n, action, by: String(by).trim(), date: localDay(), at, origin: 'operational' };
}
// { list: shown opponents (published order, then added), hidden: published but hidden, added: not published }
export function fieldOf(title, records = []) {
  const last = new Map();
  for (const r of records.filter((x) => x.kind === 'field' && x.title === title).sort((a, b) => String(a.at).localeCompare(String(b.at)))) last.set(r.nation.toLowerCase(), r);
  const published = FIELDS[title] || []; const isPub = (n) => published.some((p) => p.toLowerCase() === n.toLowerCase());
  const hidden = published.filter((n) => last.get(n.toLowerCase())?.action === 'hide');
  const added = [...last.values()].filter((r) => r.action === 'add' && !isPub(r.nation)).map((r) => r.nation).sort((a, b) => a.localeCompare(b));
  return { list: [...published.filter((n) => !hidden.includes(n)), ...added], hidden, added };
}

// ---------------------------------------------------------------- Ask AI
// The opponent a question is about: the first opponent of the list named in it (also "Turkey"/"Turki" for Türkiye).
const ALIAS = { 'Türkiye': ['turkey', 'turki', 'turkiye'], 'Dominican Republic': ['dominika', 'dominican'] };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function nationIn(question, list) {
  const q = ` ${fold(question).replace(/[^a-z0-9]+/g, ' ')} `;
  return list.find((n) => [fold(n), ...(ALIAS[n] || [])].some((a) => q.includes(` ${a.replace(/[^a-z0-9]+/g, ' ').trim()} `))) || '';
}

// Starter questions per game, in Bahasa Indonesia and English. A tap fills the box; the coach can change it.
// "{opp}" becomes the first opponent on the list.
export const STARTERS = {
  mlbb: [
    ['Apa yang sebaiknya kita ban lawan {opp}?', 'What should we ban against {opp}?'],
    ['Hero kita mana yang paling sering di-ban lawan latih?', 'Which of our heroes get banned most in scrims?'],
    ['Apa yang paling sering gagal di scrim 2 minggu terakhir, dan apa latihannya?', 'What keeps failing in the last 2 weeks of scrims, and how do we train it?'],
    ['Hero meta mana yang belum kita kuasai?', 'Which meta heroes do we not have covered?'],
    ['Buat rencana 3 sesi scrim minggu ini.', 'Plan three scrim sessions for this week.'],
  ],
  dota: [
    ['Hero andalan pemain {opp} apa saja?', 'What are {opp}\'s players\' best heroes?'],
    ['Apa dari patch terbaru yang penting buat kita?', 'What in the current patch matters for us?'],
    ['Apa 4 ban kita untuk Bo1 lawan {opp}?', 'What are our 4 bans for a Bo1 against {opp}?'],
  ],
  cs2: [
    ['Map mana yang paling lemah buat kita?', 'Which maps are we weakest on?'],
    ['Veto kita lawan {opp} sebaiknya bagaimana?', 'What should our veto be against {opp}?'],
    ['Kenapa kita sering kalah ronde pistol?', 'Why do we lose pistol rounds?'],
  ],
  pubgm: [
    ['Di mana kita paling banyak kehilangan poin?', 'Where do we lose the most points?'],
    ['Apakah kita perlu rotasi lebih awal?', 'Should we rotate earlier?'],
    ['Apa yang perlu kita tahu tentang {opp}?', 'What should we know about {opp}?'],
  ],
  efootball: [
    ['Bagaimana {opp} biasanya mencetak gol?', 'How does {opp} usually score?'],
    ['Formasi mana yang paling berhasil bulan ini?', 'Which formation worked best this month?'],
    ['Apa yang harus diubah saat tertinggal satu gol?', 'What should I change when a goal down?'],
  ],
};
export const gameKey = (title) => (/^MLBB/.test(title) ? 'mlbb' : /^CS2/.test(title) ? 'cs2' : title === 'Dota 2' ? 'dota' : title === 'PUBG Mobile' ? 'pubgm' : title === 'eFootball' ? 'efootball' : '');
export function starters(title, opponents = [], lang = 'id') {
  const opp = opponents[0] || '';
  return (STARTERS[gameKey(title)] || []).filter((s) => opp || !s[0].includes('{opp}')).map((s) => (lang === 'id' ? s[0] : s[1]).replace('{opp}', opp));
}

// What the assistant always knows, so the coach never explains it: category, our squad, the opponent list, the
// event, the matches entered so far. Each item has an id the answer can cite.
export function workspaceContext({ title, squad = [], coaches = [], opponents = [], event = {}, matches = [], asOf = localDay() }) {
  return [
    { id: 'W1', text: `Category: ${title}. Our squad: ${squad.join(', ') || 'not entered'}${coaches.length ? `; coach ${coaches.join(', ')}` : ''}.` },
    { id: 'W2', text: `Opponents in this category (${opponents.length}): ${opponents.join(', ') || 'none listed'}.` },
    { id: 'W3', text: `Event: IESF WEC 2026, ${event.start || '2026-12-15'} to ${event.end || '2026-12-20'}, ${event.venue || 'Indonesia'}. Today: ${asOf}.` },
    ...(matches.length ? [{ id: 'W4', text: `WEC matches entered: ${matches.map((m) => `${m.date} vs ${m.opponent}${m.stage ? ` (${m.stage})` : ''}${m.result ? `: ${m.result.result} ${m.result.score || ''}` : ''}`).join('; ')}.` }] : []),
  ];
}
// A screenshot read by the hub's screenshot reader, as material the assistant can cite ("S1", "S2"...).
export function shotMaterial(n, kind, raw) {
  const s = JSON.stringify(raw || {});
  return { id: `S${n}`, kind, text: s.length > 4000 ? `${s.slice(0, 4000)}…` : s };
}
