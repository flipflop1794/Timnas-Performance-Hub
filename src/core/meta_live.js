// V1.47 live and official meta data per game, as checked on 23 Nov 2026.
//   MLBB: no public API. The official site's hero rank page (mobilelegends.com/rank) shows win, pick and ban rates
//         from ranked play. Read by hand into a dated snapshot; refresh weekly.
//   Dota 2: OpenDota (already in the hub: Meta → Pro hero stats).
//   CS2, PUBG Mobile, eFootball: no free public source found; the meta tracker and our own records.
// Ranked play is not pro play: it shows what is strong in the game right now, a starting point for ideas to test.

export const META_SOURCES = {
  MLBB: 'mobilelegends.com/rank (official, ranked play) · read by hand weekly',
  'MLBB Women': 'mobilelegends.com/rank (official, ranked play; same game, not the women\'s pro scene) · read by hand weekly',
  'Dota 2': 'OpenDota pro matches (live)',
};

// Read 23 Nov 2026 from mobilelegends.com/rank: filter "Past 1 day", "All" ranks, the 20 heroes the page lists,
// sorted by win rate (page update time 23-11-2026 04:25). Rates in percent.
export const MLBB_RANK = {
  read: '2026-11-23', pageUpdated: '2026-11-23 04:25', source: 'mobilelegends.com/rank', scope: 'Ranked play, all ranks, past 1 day, top 20 by win rate',
  rows: [
    ['Masha', 0.45, 58.43, 40.26], ['Argus', 0.57, 57.15, 1.06], ['Marcel', 0.27, 57.05, 43.41], ['Diggie', 0.21, 55.06, 3.94], ['Khufra', 0.38, 54.75, 2.40],
    ['Floryn', 0.99, 54.25, 13.95], ['Sun', 1.69, 54.00, 49.85], ['Minotaur', 0.99, 53.98, 8.89], ['Valir', 1.29, 53.91, 4.94], ['Bruno', 0.69, 53.77, 0.45],
    ['Aldous', 0.54, 53.76, 0.73], ['Rafaela', 0.73, 53.66, 9.33], ['Lolita', 0.08, 53.45, 0.21], ['Edith', 0.26, 53.28, 0.11], ['Irithel', 0.44, 53.22, 0.29],
    ['Hanabi', 2.42, 53.02, 4.10], ['Estes', 0.61, 52.93, 47.67], ['Aulus', 0.58, 52.91, 13.82], ['Obsidia', 2.00, 52.88, 54.95], ['Xavier', 1.31, 52.83, 1.05],
  ].map(([hero, pick, win, ban]) => ({ hero, pick, win, ban })),
};
// Banned so often in ranked play that a pro team will likely ban or pick it too.
export const HIGH_BAN = 30;

// Ideas worth testing in scrims: strong ranked heroes (top 20 by win rate) that none of our confirmed scrim games
// used. ourHeroes: hero names we played (with counts). A question for the coach, never a verdict.
export function mlbbIdeas(ourHeroes = new Map(), rank = MLBB_RANK) {
  return rank.rows.filter((r) => !ourHeroes.has(r.hero)).map((r) => ({ ...r, contested: r.ban >= HIGH_BAN })).slice(0, 8);
}
