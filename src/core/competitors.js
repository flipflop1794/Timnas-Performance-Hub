// Competitor fields and verified notes per title. Fields as published on wec.iesf.org (read 3 Nov 2026).
// Notes come from the project decision log with their dates; staff add more in the hub. Threat tiers are
// staff judgements, never computed.

export const FIELD_SOURCE = 'wec.iesf.org finals lists, read 3 Nov 2026';
export const FIELDS = {
  'Dota 2': ['Greece', 'South Africa', 'Egypt', 'Venezuela', 'Argentina', 'Kazakhstan', 'Mongolia', 'Iran', 'Belarus', 'North Macedonia', 'New Zealand'],
  MLBB: ['Malaysia', 'Cambodia', 'Myanmar', 'Türkiye', 'Egypt', 'Nepal', 'Dominican Republic'],
  'MLBB Women': ['Egypt', 'Argentina', 'Türkiye'],
  'PUBG Mobile': ['Türkiye', 'Egypt', 'Morocco', 'Colombia', 'Brazil', 'Kyrgyzstan', 'Uzbekistan', 'Mongolia', 'Bangladesh', 'Malaysia', 'Myanmar', 'Belarus', 'Montenegro', 'Romania', 'Serbia'],
  CS2: ['Romania', 'South Africa', 'Egypt', 'United States', 'Argentina', 'Kazakhstan', 'Mongolia', 'Iran', 'Iraq', 'Lithuania', 'Australia'],
  'CS2 Women': ['Poland', 'South Africa', 'Morocco', 'United States', 'Brazil', 'Kyrgyzstan', 'Hong Kong, China', 'France', 'Netherlands', 'Portugal', 'Australia'],
  // The site lists 97 eFootball nations on 3 Nov; the finals format is not published. Kept as a list, not a bracket.
  eFootball: ['Iran', 'Djibouti', 'Madagascar', 'Namibia', 'Somalia', 'South Africa', 'Zimbabwe', 'Egypt', 'Libya', 'Morocco', 'Tunisia', 'Benin', 'Congo', 'DR Congo', 'Ghana', 'Mali', 'Nigeria', 'Senegal', 'The Gambia', 'Colombia', 'Guadeloupe', 'The Bahamas', 'Venezuela', 'Costa Rica', 'Cuba', 'Guatemala', 'Argentina', 'Bolivia', 'Brazil', 'Peru', 'Uruguay', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Uzbekistan', 'Chinese Taipei', 'Hong Kong, China', 'Japan', 'Macau, China', 'Mongolia', 'Bangladesh', 'Bhutan', 'India', 'Nepal', 'Pakistan', 'Sri Lanka', 'Brunei Darussalam', 'Cambodia', 'Malaysia', 'Myanmar', 'Thailand', 'Bahrain', 'Iraq', 'Jordan', 'Kuwait', 'Lebanon', 'Oman', 'Syria', 'United Arab Emirates', 'Austria', 'Azerbaijan', 'Belarus', 'Bosnia and Herzegovina', 'Bulgaria', 'Croatia', 'Czech Republic', 'France', 'Georgia', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova', 'Montenegro', 'Netherlands', 'North Macedonia', 'Poland', 'Portugal', 'Romania', 'Russia', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Türkiye', 'Ukraine', 'Wales', 'Australia', 'New Zealand'],
};

// Verified notes already in the project record (decision log v3–v9).
export const KNOWN = [
  { title: 'MLBB', nation: 'Myanmar', date: '2026-10-29', source: 'Asian Games 2026 results (decision log v3)', kind: 'observed', note: 'Won Asian Games 2026 MLBB gold: 4–0 vs Indonesia\'s Asian Games squad (a different roster from the WEC five), 2–0 vs Malaysia. Same five at WEC: to verify.' },
  { title: 'MLBB', nation: 'Malaysia', date: '2026-10-29', source: 'wec.iesf.org roster vs WEC25 (decision log v3)', kind: 'observed', note: 'WEC26 roster is not the Todak + SRG.OG core that won WEC25.' },
  { title: 'MLBB', nation: 'Cambodia', date: '2026-10-29', source: 'decision log v3', kind: 'observed', note: 'WEC26 roster = its ENC 2026 roster (ENC ranking #5).' },
  { title: 'MLBB', nation: 'Türkiye', date: '2026-10-29', source: 'decision log v3', kind: 'observed', note: 'Roster includes EKSI, Blotzfet, Rx (ENC ranking #4).' },
  { title: 'PUBG Mobile', nation: 'Myanmar', date: '2026-10-29', source: 'decision log v3', kind: 'observed', note: 'Roster includes a Yangon Galacticos-tagged player (PUBG Mobile World Cup 2025 champions). 12th at the Asian Games PUBGM event.' },
  { title: 'Dota 2', nation: 'Mongolia', date: '2026-11-03', source: 'OpenDota + wec.iesf.org (hub V1)', kind: 'observed', note: '4/5 players matched; captain Se not found, "11" ambiguous. NARMAN plays club Dota with Indonesia\'s Jhocam (Team Nemesis). Full pool report in Scouting.' },
  { title: 'Dota 2', nation: 'Greece', date: '2026-11-03', source: 'OpenDota proPlayers', kind: 'observed', note: 'Skylark and Focus found (both JustBetter); SsaSpartan, dEsire, Thugitoo not yet matched.' },
];
// Multi-title rivals (decision log v5): useful for cross-title scouting and shared VOD work.
export const MULTI_TITLE = { Egypt: 5, Türkiye: 3, Argentina: 3, Mongolia: 3, 'South Africa': 3, Myanmar: 2, Malaysia: 2, Romania: 2, Kazakhstan: 2, Iran: 2, Belarus: 2, 'United States': 2, Australia: 2, Brazil: 2, Kyrgyzstan: 2, Morocco: 2 };

export const TIERS = ['main threat', 'contender', 'watch', 'not assessed'];

export function rivalNote(x) {
  for (const k of ['title', 'nation', 'note', 'source', 'by']) if (!x[k] || !String(x[k]).trim()) throw new Error(`${k === 'by' ? 'Who wrote it' : k[0].toUpperCase() + k.slice(1)} is required.`);
  if (!FIELDS[x.title]?.includes(x.nation)) throw new Error(`${x.nation} is not in the published ${x.title} field.`);
  if (!['observed', 'hypothesis'].includes(x.kind)) throw new Error('Kind must be observed or hypothesis.');
  return { title: x.title, nation: x.nation, note: x.note.trim(), source: x.source.trim(), kind: x.kind, by: x.by.trim(), date: x.date || new Date().toISOString().slice(0, 10), origin: 'operational' };
}

// One title's competitor board: field, notes per nation, staff tier, coverage.
export function board(title, notes = [], tiers = {}) {
  const field = FIELDS[title] || [];
  const all = [...KNOWN.filter((k) => k.title === title), ...notes.filter((n) => n.title === title)];
  const rows = field.map((nation) => {
    const ns = all.filter((n) => n.nation === nation).sort((a, b) => b.date.localeCompare(a.date));
    const t = tiers[`${title}|${nation}`];
    return { nation, notes: ns, tier: t?.tier || 'not assessed', tierBy: t?.by || null, tierWhy: t?.why || null, multi: titleCount(nation) };
  });
  const order = (r) => TIERS.indexOf(r.tier);
  rows.sort((a, b) => order(a) - order(b) || b.notes.length - a.notes.length || a.nation.localeCompare(b.nation));
  const covered = rows.filter((r) => r.notes.length).length;
  return { title, field: field.length, rows, covered, coverage: field.length ? covered / field.length : 0 };
}

// ---- V1.5: cross-title competitor analysis ----
export const titleCount = (nation) => Object.values(FIELDS).filter((f) => f.includes(nation)).length;
// Every nation Indonesia can meet, across titles, with what the staff hold on it. Counts only; nothing is scored.
export const TITLE_ORDER = ['Dota 2', 'MLBB', 'MLBB Women', 'PUBG Mobile', 'CS2', 'CS2 Women', 'eFootball'];
const lc = (s) => (s || '').toLowerCase();

export function nationProfile(nation, { rivals = [], tiers = {}, vods = [], partners = [], scrims = [], matches = [] } = {}) {
  const titles = TITLE_ORDER.filter((t) => FIELDS[t]?.includes(nation));
  const per = titles.map((title) => {
    const notes = [...KNOWN, ...rivals].filter((n) => n.title === title && n.nation === nation).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const t = tiers[`${title}|${nation}`];
    const v = vods.filter((x) => x.title === title && x.nation === nation);
    const standIns = partners.filter((p) => p.title === title && p.resembles === nation);
    const sc = scrims.filter((s) => s.title === title && s.mirrors === nation);
    const done = sc.filter((s) => s.status === 'done');
    const wm = matches.filter((m) => m.title === title && m.opponent === nation);
    return { title, tier: t?.tier || 'not assessed', tierBy: t?.by || null, tierWhy: t?.why || null, notes, vods: v, vodsReviewed: v.filter((x) => x.reviewed).length,
      standIns, scrimsDone: done.length, scrimsPlanned: sc.filter((s) => s.status === 'planned').length, lastScrim: done.map((s) => s.date).sort().at(-1) || null, wecMatches: wm,
      updated: [...notes.map((n) => n.date), ...v.map((x) => x.added), ...(t?.at ? [t.at.slice(0, 10)] : [])].filter(Boolean).sort().at(-1) || null };
  });
  return { nation, titles, per };
}

export function crossTitle(data = {}, { includeEfootballUnscouted = false } = {}) {
  const nations = [...new Set(TITLE_ORDER.flatMap((t) => FIELDS[t] || []))];
  const rows = nations.map((n) => {
    const p = nationProfile(n, data);
    const onlyEf = p.titles.length === 1 && p.titles[0] === 'eFootball';
    const touched = p.per.some((x) => x.notes.length || x.tier !== 'not assessed' || x.vods.length || x.wecMatches.length);
    return { ...p, onlyEf, touched,
      threats: p.per.filter((x) => x.tier === 'main threat').length,
      notes: p.per.reduce((a, x) => a + x.notes.length, 0), vods: p.per.reduce((a, x) => a + x.vods.length, 0),
      scrimsDone: p.per.reduce((a, x) => a + x.scrimsDone, 0), updated: p.per.map((x) => x.updated).filter(Boolean).sort().at(-1) || null };
  }).filter((r) => includeEfootballUnscouted || !r.onlyEf || r.touched);
  const rank = (r) => [-r.threats, -r.titles.length, -r.notes];
  rows.sort((a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.nation.localeCompare(b.nation); });
  return rows;
}

// Scouting coverage per title and the next nations to scout: unscouted first, multi-title nations first
// (one scouting effort serves several title coaches), then tier.
export function coverage(data = {}) {
  return TITLE_ORDER.map((title) => {
    const field = FIELDS[title] || [];
    const ps = field.map((n) => ({ nation: n, ...nationProfile(n, data).per.find((x) => x.title === title) }));
    const noted = ps.filter((x) => x.notes.length).length;
    const tiered = ps.filter((x) => x.tier !== 'not assessed').length;
    const vodRev = ps.filter((x) => x.vodsReviewed).length;
    const next = ps.filter((x) => !x.notes.length).sort((a, b) => titleCount(b.nation) - titleCount(a.nation) || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.nation.localeCompare(b.nation)).slice(0, 3).map((x) => x.nation);
    return { title, field: field.length, noted, tiered, vodRev, next };
  });
}
