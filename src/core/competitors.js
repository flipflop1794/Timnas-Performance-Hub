import { localDay } from './dates.js';
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
  // 13 Nov 2026: team pages on wec.iesf.org re-read by the hub (roster checks in data/wec/rival_rosters.json).
  { title: 'MLBB', nation: 'Myanmar', date: '2026-11-13', source: 'wec.iesf.org team page MYA (re-read 13 Nov); GMA News on the Asian Games side', kind: 'observed', note: 'WEC roster fully replaced since 3 Nov: now J3X (C), Coin, Dear, Niko, Shyco; coach Thet Lynn Htut. The Asian Games gold side (4–0 over Indonesia in the final) was the core of Yangon Galacticos: whether these five are that core is still to verify.' },
  { title: 'MLBB', nation: 'Türkiye', date: '2026-11-13', source: 'wec.iesf.org team page TUR (re-read 13 Nov); Liquipedia / GosuGamers on Sunshine', kind: 'observed', note: 'WEC roster fully replaced since 3 Nov (EKSI, Blotzfet, Rx no longer listed): now Sunshine (C), Harikasın Samet, intangible, Saviom, Zeichnen; coach Jeff. Sunshine (Emre Sarı) played the M6 Swiss Stage with ULFHEDNAR.' },
  { title: 'MLBB', nation: 'Cambodia', date: '2026-11-13', source: 'wec.iesf.org team page CAM (re-read 13 Nov)', kind: 'observed', note: 'Three changes since 3 Nov: Ayzen, Darkside, Runnn in; SryimFelix, PPPPPP, Saa out. Linnn now captain; Wickyyy stays.' },
  { title: 'PUBG Mobile', nation: 'Türkiye', date: '2026-11-13', source: 'wec.iesf.org team page TUR; esportsworldcup.com PMWC 2026 report', kind: 'observed', note: 'WEC four includes HamsiG and S2GKam1kaze of S2G Esports, the 2026 PUBG Mobile World Cup winners (HamsiG: two-time world champion). Expect club-level coordination.' },
  { title: 'Dota 2', nation: 'Greece', date: '2026-11-03', source: 'OpenDota proPlayers', kind: 'observed', note: 'Skylark and Focus found (both JustBetter); SsaSpartan, dEsire, Thugitoo not yet matched.' },
];
// ---- V1.21: public results on record (desk research, read 13 Nov 2026) ----
// What rival nations did at recent national-team events, from published results. Kept apart from staff
// scouting notes on purpose: it is context, not scouting, so it does not count towards scouting coverage.
// `check: true` = read from a search summary because the page itself (Liquipedia) blocks automated
// reading; a person should open the link and confirm before relying on it. `club: true` = a club result
// (players may differ from the national five). Nothing here is scored or predicted.
export const FORM_READ = '2026-11-13';
const IESF24 = 'IESF, "WEC24 Complete: Indonesia Crowned Overall Champion!" — iesf.org/?p=28752';
const IESF25 = 'IESF WEC25 Kuala Lumpur report, 8 Dec 2025 — iesf.org/?p=29836';
const AG26 = 'Wikipedia, Esports at the 2026 Asian Games; AESF recap — aesf.com';
const LQ = (p) => `Liquipedia ${p} (search summary)`;
export const EVENTS = [
  { title: 'MLBB', event: 'WEC24 Riyadh', date: '2024-11', gold: 'Malaysia', silver: 'Philippines', bronze: ['Indonesia'], source: IESF24 },
  { title: 'MLBB', event: 'WEC25 Kuala Lumpur', date: '2025-12-07', gold: 'Malaysia', silver: 'Cambodia', bronze: ['Türkiye'], extra: 'Final 3–0. Indonesia 4th (lost the bronze match to Türkiye).', source: `${IESF25}; medcom.id` },
  { title: 'MLBB', event: 'SEA Games 2025 Bangkok', date: '2025-12-17', gold: 'Philippines', silver: 'Malaysia', bronze: [], extra: 'Bronze not confirmed across sources.', source: 'spin.ph; Bernama', check: true },
  { title: 'MLBB', event: 'Asian Games 2026 Aichi-Nagoya', date: '2026-10-01', gold: 'Myanmar', silver: 'Indonesia', bronze: ['Malaysia', 'Mongolia'], source: AG26 },
  { title: 'MLBB Women', event: 'WEC24 Riyadh', date: '2024-11', gold: 'Indonesia', silver: 'Cambodia', bronze: ['Egypt'], source: IESF24 },
  { title: 'MLBB Women', event: 'WEC25 Kuala Lumpur', date: '2025-12-07', gold: 'Indonesia', silver: 'Cambodia', bronze: ['Egypt'], extra: 'Indonesia unbeaten; final 3–0 vs Cambodia.', source: `${IESF25}; hotspawn.com` },
  { title: 'Dota 2', event: 'WEC24 Riyadh', date: '2024-11', gold: 'Greece', silver: 'Sweden', bronze: ['Türkiye'], extra: 'Final 2–0.', source: `${IESF24}; battlenet.gr` },
  { title: 'Dota 2', event: 'WEC25 Kuala Lumpur', date: '2025-12', gold: null, silver: null, bronze: [], extra: 'Dota 2 main event listed as cancelled: no 2025 champion.', source: LQ('IESF/World_Esports_Championships/2025'), check: true },
  { title: 'PUBG Mobile', event: 'WEC24 Riyadh', date: '2024-11', gold: 'Türkiye', silver: 'Ukraine', bronze: ['Brazil'], source: IESF24 },
  { title: 'PUBG Mobile', event: 'Asian Games 2026 Aichi-Nagoya', date: '2026-09-29', gold: 'Thailand', silver: 'China', bronze: ['Pakistan'], extra: 'Thailand 128 pts over 12 matches. No WEC rival on the podium.', source: AG26 },
  { title: 'eFootball', event: 'Asian Games 2026 Aichi-Nagoya', date: '2026-10', gold: 'Iran', silver: 'Malaysia', bronze: ['Japan', 'Uzbekistan'], source: AG26 },
  { title: 'eFootball', event: 'FIFAe World Cup 25 ft. eFootball, Riyadh', date: '2025-12-13', gold: 'Poland (console) · Thailand (mobile)', silver: null, bronze: [], source: 'FIFA — inside.fifa.com, "Thailand, Poland crowned FIFAe World Cup eFootball"' },
];
// Results of nations in our fields that are not already visible from an event podium above.
export const FORM = [
  { title: 'MLBB', nation: 'Türkiye', date: '2025-12-07', event: 'WEC25 Kuala Lumpur', result: 'Bronze: beat Indonesia in the bronze match. First European MLBB medal at a WEC.', source: `${IESF25}; medcom.id` },
  { title: 'MLBB', nation: 'Malaysia', date: '2025-12-07', event: 'WEC25 Kuala Lumpur', result: 'Gold, back-to-back WEC titles (WEC24 and WEC25); 3–0 over Cambodia in the final.', source: IESF25 },
  { title: 'MLBB', nation: 'Cambodia', date: '2025-12-07', event: 'WEC25 Kuala Lumpur', result: 'Silver in both MLBB (0–3 to Malaysia in the final) and MLBB Women.', source: IESF25 },
  { title: 'MLBB', nation: 'Myanmar', date: '2026-10-01', event: 'Asian Games 2026 Aichi-Nagoya', result: 'Gold: 4–0 over Indonesia in the best-of-seven final. Side built on the Yangon Galacticos core.', source: `${AG26}; rri.co.id; GMA News` },
  { title: 'MLBB', nation: 'Nepal', date: '2026-06', event: 'Asian Games 2026 qualifier, East & South Asia', result: 'Group record 2–1, behind Mongolia, Hong Kong and Pakistan; not among the medallists.', source: 'esportsverse.in (AG 2026 MLBB qualifier standings); Moonton', check: true },
  { title: 'MLBB', nation: 'Egypt', date: '2025-12', event: 'WEC25 Kuala Lumpur', result: 'Took part (19-nation field); no podium.', source: 'europeangaming.eu, 10 Nov 2025 (WEC25 MLBB field)' },
  { title: 'MLBB', nation: 'Nepal', date: '2025-12', event: 'WEC25 Kuala Lumpur', result: 'Took part (19-nation field); no podium.', source: 'europeangaming.eu, 10 Nov 2025 (WEC25 MLBB field)' },
  { title: 'MLBB', nation: 'Dominican Republic', date: '2025-12', event: 'WEC25 Kuala Lumpur', result: 'Took part (19-nation field); no podium.', source: 'europeangaming.eu, 10 Nov 2025 (WEC25 MLBB field)' },
  { title: 'MLBB Women', nation: 'Egypt', date: '2025-12-07', event: 'WEC25 Kuala Lumpur', result: 'Bronze for the second WEC running (also WEC24). Met Indonesia in the upper-bracket final.', source: `${IESF25}; medcom.id` },
  { title: 'MLBB Women', nation: 'Türkiye', date: '2025-12', event: 'WEC25 Kuala Lumpur', result: 'Group stage: lost 0–2 to Indonesia.', source: 'hotspawn.com, "IESF WEC 2025: Indonesia recaptures MLBB female division"' },
  { title: 'Dota 2', nation: 'Greece', date: '2024-11', event: 'WEC24 Riyadh', result: 'Gold: 2–0 over Sweden in the final. Defending champion (no WEC25 Dota event).', source: `${IESF24}; battlenet.gr` },
  { title: 'Dota 2', nation: 'Kazakhstan', date: '2026-07', event: 'Esports Nations Cup 2026 national ranking', result: 'Projected #2 nation in Dota 2 (from its players\' points; a projection, not a result). Sources conflict on whether the ENC main event ran in Nov 2026 or moved to Nov 2027.', source: LQ('Dota 2 ENC 2026 National Ranking'), check: true },
  { title: 'Dota 2', nation: 'Mongolia', date: '2026-07', event: 'ENC 2026 South & East Asia qualifier', result: 'Beat Pakistan 2–0 in the upper-bracket final.', source: LQ('Esports_Nations_Cup/2026/South_and_East_Asia'), check: true },
  { title: 'Dota 2', nation: 'South Africa', date: '2026-07', event: 'ENC 2026 Sub-Saharan Africa qualifier', result: 'Beat Nigeria 2–0.', source: LQ('Esports_Nations_Cup/2026/Sub-Saharan_Africa'), check: true },
  { title: 'Dota 2', nation: 'Argentina', date: '2026-07', event: 'ENC 2026 South America qualifier', result: 'Beat Chile 2–1; lost 0–2 to Ecuador.', source: LQ('Esports_Nations_Cup/2026/South_America'), check: true },
  { title: 'Dota 2', nation: 'New Zealand', date: '2026-07', event: 'ENC 2026 SEA & Oceania qualifier', result: 'Lost 0–2 to Myanmar in the upper-bracket quarterfinal.', source: LQ('Esports_Nations_Cup/2026/Southeast_Asia_and_Oceania'), check: true },
  { title: 'Dota 2', nation: 'North Macedonia', date: '2025', event: 'IESF Europe Qualifier 2025, group stage', result: 'Beat Belarus 2–0 (best of three).', source: 'hawk.live (IESF Europe Qualifier 2025)', check: true },
  { title: 'Dota 2', nation: 'Belarus', date: '2025', event: 'IESF Europe Qualifier 2025, group stage', result: 'Lost 0–2 to North Macedonia.', source: 'hawk.live (IESF Europe Qualifier 2025)', check: true },
  { title: 'Dota 2', nation: 'Iran', date: '2025', event: 'IESF West Asia Qualifier 2025', result: 'Beat Jordan 2–1.', source: 'hawk.live (IESF West Asia Qualifier 2025)', check: true },
  { title: 'Dota 2', nation: 'Iran', date: '2026-07', event: 'ENC 2026 MENA & Central Asia qualifier', result: 'Lost 0–2 to Kyrgyzstan; other scores unclear across sources. No official active roster listed on score sites.', source: 'egamersworld.com; hawk.live; escorenews.com', check: true },
  { title: 'Dota 2', nation: 'Greece', date: '2026-07-01', event: 'ENC 2026 Europe East qualifier', result: 'Qualified for the main event: beat Serbia 2–1 in the lower-bracket final (Czechia won the upper bracket).', source: 'esports.ru; dota2.ru (2 Jul 2026)', check: true },
  { title: 'Dota 2', nation: 'Venezuela', date: '2025-09', event: 'IESF World Championship 2025, Americas', result: 'Group A: level at the top with Colombia and Cuba.', source: 'ggscore.com / game-tournaments.com (IESF World Championship 2025)', check: true },
  { title: 'PUBG Mobile', nation: 'Türkiye', date: '2024-11', event: 'WEC24 Riyadh', result: 'Gold (defending WEC champion).', source: IESF24 },
  { title: 'PUBG Mobile', nation: 'Türkiye', date: '2026-08-16', event: 'PUBG Mobile World Cup at EWC 2026, Paris', result: 'Turkish club S2G Esports won (154 pts over 18 matches); two of its players (HamsiG, S2GKam1kaze) are in Türkiye\'s WEC four.', source: 'esportsworldcup.com, "PMWC at EWC26: S2G Esports weathers the storm"; wec.iesf.org team page TUR', club: true },
  { title: 'PUBG Mobile', nation: 'Türkiye', date: '2026', event: 'Esports Nations Cup 2026 ranking', result: 'Top three of the ENC PUBG Mobile ranking with Mongolia and Brazil (direct invites). Sources conflict on whether the ENC main event ran in Nov 2026 or was postponed to Nov 2027.', source: 'insider-gaming.com; PUBG Mobile press release (124 nations); esportsnationscup.com', check: true },
  { title: 'PUBG Mobile', nation: 'Brazil', date: '2024-11', event: 'WEC24 Riyadh', result: 'Bronze. Also top three of the ENC 2026 ranking.', source: `${IESF24}; insider-gaming.com` },
  { title: 'PUBG Mobile', nation: 'Mongolia', date: '2026', event: 'Esports Nations Cup 2026 ranking', result: 'Top three of the ENC PUBG Mobile ranking (direct invite).', source: 'insider-gaming.com; PUBG Mobile press release', check: true },
  { title: 'PUBG Mobile', nation: 'Myanmar', date: '2025-08', event: 'PUBG Mobile World Cup at EWC 2025', result: 'Myanmar club Yangon Galacticos won the World Cup.', source: 'esportsworldcup.com, "PMWC at EWC 25 champions: Yangon Galacticos"', club: true },
  { title: 'PUBG Mobile', nation: 'Malaysia', date: '2026-09-29', event: 'Asian Games 2026 Aichi-Nagoya (12-nation final)', result: '10th, 47 pts over 12 matches (26 eliminations).', source: 'sportskeeda.com; khaosodenglish.com (AG 2026 PUBG Mobile standings)' },
  { title: 'PUBG Mobile', nation: 'Uzbekistan', date: '2026-09-29', event: 'Asian Games 2026 Aichi-Nagoya (12-nation final)', result: '11th, 43 pts over 12 matches.', source: 'sportskeeda.com; khaosodenglish.com (AG 2026 PUBG Mobile standings)' },
  { title: 'PUBG Mobile', nation: 'Myanmar', date: '2026-09-29', event: 'Asian Games 2026 Aichi-Nagoya (12-nation final)', result: '12th (last), 28 pts over 12 matches.', source: 'sportskeeda.com; khaosodenglish.com (AG 2026 PUBG Mobile standings)' },
  { title: 'PUBG Mobile', nation: 'Egypt', date: '2026-07', event: 'ENC 2026 MENA qualifier', result: 'Third, behind Jordan and Saudi Arabia.', source: LQ('PUBG Mobile Esports_Nations_Cup/2026/MENA'), check: true },
  { title: 'PUBG Mobile', nation: 'Colombia', date: '2026-07', event: 'ENC 2026 North & Central America qualifier', result: 'Second, behind Mexico.', source: LQ('PUBG Mobile Esports_Nations_Cup/2026/North_and_Central_America'), check: true },
  { title: 'eFootball', nation: 'Iran', date: '2026-10', event: 'Asian Games 2026', result: 'Gold: beat Malaysia in the final.', source: AG26 },
  { title: 'eFootball', nation: 'Malaysia', date: '2026-10', event: 'Asian Games 2026', result: 'Silver: lost the final to Iran.', source: AG26 },
  { title: 'eFootball', nation: 'Japan', date: '2026-10', event: 'Asian Games 2026', result: 'Bronze.', source: AG26 },
  { title: 'eFootball', nation: 'Uzbekistan', date: '2026-10', event: 'Asian Games 2026', result: 'Bronze.', source: AG26 },
  { title: 'eFootball', nation: 'Poland', date: '2025-12-13', event: 'FIFAe World Cup 25 ft. eFootball', result: 'Console champion.', source: 'FIFA — inside.fifa.com' },
  { title: 'eFootball', nation: 'Thailand', date: '2025-12-13', event: 'FIFAe World Cup 25 ft. eFootball', result: 'Mobile champion.', source: 'FIFA — inside.fifa.com' },
  { title: 'eFootball', nation: 'Brazil', date: '2025-07', event: 'eFootball Championship 2025 World Finals, Tokyo', result: 'Mobile division won by Brazil\'s Juninho (individual event).', source: 'gekisaka.jp; sportsdunia.com', check: true, club: true },
];
const byDate = (a, b) => (b.date || '').localeCompare(a.date || '');
// Everything on record for one nation in one title: its own results plus the podiums it stood on.
export function formOf(title, nation) {
  const podium = EVENTS.filter((e) => e.title === title && [e.gold, e.silver, ...(e.bronze || [])].includes(nation))
    .map((e) => ({ title, nation, date: e.date, event: e.event, result: e.gold === nation ? 'Gold' : e.silver === nation ? 'Silver' : 'Bronze', source: e.source, check: !!e.check, podium: true }));
  const own = FORM.filter((f) => f.title === title && f.nation === nation);
  // A nation's own line for the same event says more than the bare medal: keep the richer one.
  const kept = podium.filter((p) => !own.some((o) => o.event === p.event));
  return [...own, ...kept].sort(byDate);
}
// One title: recent podiums, and which nations in its field have any public result on record.
export function fieldForm(title) {
  const field = FIELDS[title] || [];
  const rows = field.map((nation) => ({ nation, form: formOf(title, nation) }));
  return { title, events: EVENTS.filter((e) => e.title === title).sort(byDate), withResults: rows.filter((r) => r.form.length), without: rows.filter((r) => !r.form.length).map((r) => r.nation) };
}

// Multi-title rivals (decision log v5): useful for cross-title scouting and shared VOD work.
export const MULTI_TITLE = { Egypt: 5, Türkiye: 3, Argentina: 3, Mongolia: 3, 'South Africa': 3, Myanmar: 2, Malaysia: 2, Romania: 2, Kazakhstan: 2, Iran: 2, Belarus: 2, 'United States': 2, Australia: 2, Brazil: 2, Kyrgyzstan: 2, Morocco: 2 };

export const TIERS = ['main threat', 'contender', 'watch', 'not assessed'];

export function rivalNote(x) {
  for (const k of ['title', 'nation', 'note', 'source', 'by']) if (!x[k] || !String(x[k]).trim()) throw new Error(`${k === 'by' ? 'Who wrote it' : k[0].toUpperCase() + k.slice(1)} is required.`);
  if (!FIELDS[x.title]?.includes(x.nation)) throw new Error(`${x.nation} is not in the published ${x.title} field.`);
  if (!['observed', 'hypothesis'].includes(x.kind)) throw new Error('Kind must be observed or hypothesis.');
  return { title: x.title, nation: x.nation, note: x.note.trim(), source: x.source.trim(), kind: x.kind, by: x.by.trim(), date: x.date || localDay(), origin: 'operational' };
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

// Scouting coverage per title and the next nations to scout. Order: unscouted before stale (newest note
// older than STALE_DAYS); within each, the staff's tier first (an unscouted main threat beats a
// three-title "watch"), then multi-title nations (one effort serves several title coaches).
export const STALE_DAYS = 21;
export function coverage(data = {}, asOf = localDay()) {
  return TITLE_ORDER.map((title) => {
    const field = FIELDS[title] || [];
    const ps = field.map((n) => ({ nation: n, ...nationProfile(n, data).per.find((x) => x.title === title) }));
    const noted = ps.filter((x) => x.notes.length).length;
    const tiered = ps.filter((x) => x.tier !== 'not assessed').length;
    const vodRev = ps.filter((x) => x.vodsReviewed).length;
    const ageOf = (x) => (x.updated ? Math.round((Date.parse(asOf) - Date.parse(x.updated)) / 86400000) : Infinity);
    const stale = ps.filter((x) => x.notes.length && ageOf(x) > STALE_DAYS);
    const rank = (x) => (TIERS.indexOf(x.tier) === 3 ? 2.5 : TIERS.indexOf(x.tier)); // not assessed sits between watch and below
    const by = (a, b) => rank(a) - rank(b) || titleCount(b.nation) - titleCount(a.nation) || a.nation.localeCompare(b.nation);
    const next = [...ps.filter((x) => !x.notes.length).sort(by), ...stale.sort(by)].slice(0, 3).map((x) => x.nation);
    return { title, field: field.length, noted, tiered, vodRev, stale: stale.map((x) => x.nation), next };
  });
}
