// V1.35 full real names of the national-team athletes and coaches (BTN TIMNAS WEC 2026 dashboard, 20 Nov 2026).
// The hub keeps in-game names (nicknames) as keys, because screenshots and logs carry them; screens show the full
// name, with the nickname beside it. Management and support staff use the names of their own logins.
export const PEOPLE = {
  MLBB: {
    players: [['Aldhia Fahmi Aranda', 'Aran', true], ['Andric Alfayyadh', 'Drichel'], ['Julio Keven', 'Jull.'], ['Yonathan Chin', 'Kevin'], ['Muhammad Rio Adi Wijaya', 'Lyoni']],
    coaches: [['Indra Wijaya', 'Honjay', 'coach'], ['Usep Satyawan', 'Facehugger', 'assistant']],
  },
  'MLBB Women': {
    players: [['Cindy Laurent Siswanto', 'Cinnyyy', true], ['Michelle Denise Siswanto', 'Chel'], ['Venny Lim', 'Fumi Eko'], ['Viorelle Valencia Chen', 'Vival'], ['Vivy Indrawaty', 'Vivian']],
    coaches: [['Ilyas Rahmanda', '', 'coach'], ['Dina Melinda', '', 'assistant']],
  },
  'PUBG Mobile': {
    players: [['Alan Raynold Kumaseh', 'SATAR', true], ['Jouaqueen Matthew Walukow', 'AMETZ'], ['Kelvin Brilliant Embran', 'VINZ'], ['Christopher Javier Lionel Umboh', 'ZAO']],
    coaches: [['Christie Albertos Berie Onibala', 'Christie Onibala', 'coach'], ['Hidan', '', 'assistant']],
  },
  CS2: {
    players: [['Achmad Rismana Handachnie', 'Neorah', true], ['Ai Furqon', 'Cielle'], ['Muhammad Sulaiman Saefulloh', 'Marsyv'], ['Jovan Farrel Briliant', 'SpicyWolfie'], ['Andre Yosua Poluakan', 'Wasteofammo']],
    coaches: [['Baskoro Dwi Putra', 'Baskoro', 'coach']],
  },
  'CS2 Women': {
    players: [['Dhammamitta Marvella Aulia', 'Crescents', true], ['Risalma Agnia Lukman', 'Aphrolyn'], ['Brillian Putri Hac', 'margeaux'], ['Monica Chavela', 'Naove'], ['Daltha Amelia Wiguna', 'oreophelia']],
    coaches: [['Iqbal Mauldhan Yusup', 'Iqbal', 'coach']],
  },
  eFootball: {
    players: [['Elga Cahya Putra', 'Elga']],
    coaches: [['Rizky Faydan', 'Faidan', 'coach'], ['Rommy Hadiwijaya', 'Rommy', 'assistant']],
  },
  'Dota 2': {
    players: [['Matthew Filemon', 'Whitemon', true], ['Muhammad Saieful Ilham', 'Fbz'], ['Tri Kuncoro', 'Jhocam'], ['Musthofa Dzikry Pamungkas', 'Jikroy'], ['Rafli Fathur Rahman', 'Mikoto']],
    coaches: [['Gregorius Arvindra Prasetyo', 'Gregorius', 'coach']],
  },
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const list = (title) => {
  const p = PEOPLE[title]; if (!p) return [];
  return [...p.players.map(([name, nick, captain]) => ({ name, nick, role: captain ? 'captain' : 'player' })), ...p.coaches.map(([name, nick, role]) => ({ name, nick, role }))];
};
export const playersOf = (title) => list(title).filter((x) => x.role === 'player' || x.role === 'captain');
export const coachesOf = (title) => list(title).filter((x) => x.role === 'coach' || x.role === 'assistant');
export const headCoachOf = (title) => coachesOf(title).find((x) => x.role === 'coach') || null;

// An in-game name (or a full name) → the person, or null. Tagged names match too ("AKxSatarrrGOLD" → SATAR).
export function person(title, seen) {
  // Honorifics used in chats ("Kak Vivi", "Bang Jonathan") are not part of the name.
  const k = norm(String(seen || '').trim().replace(/^(kak|bang|mba|mbak|mas|dek|coach|pak|bu)\s+/i, '')); if (!k) return null;
  const titles = title && PEOPLE[title] ? [title] : Object.keys(PEOPLE);
  for (const t of titles) {
    const xs = list(t);
    const hit = xs.find((x) => norm(x.nick) === k || norm(x.name) === k)
      || xs.find((x) => norm(x.nick).length >= 3 && k.includes(norm(x.nick)))
      || xs.find((x) => k.length >= 4 && (norm(x.name).startsWith(k) || norm(x.nick).startsWith(k)))
      // Same family name, first name spelt differently in a chat ("Vivi Indrawaty" for Vivy Indrawaty).
      || xs.find((x) => { const a = String(seen || '').trim().split(/\s+/).at(-1); const b = x.name.split(/\s+/).at(-1); return a.length >= 5 && norm(a) === norm(b) && x.name.split(/\s+/).length > 1 && norm(seen).replace(/^(kak|bang|mba|mbak|mas)/, '')[0] === norm(x.name)[0]; });
    if (hit) return { ...hit, title: t };
  }
  return null;
}
// The full name for display, or the name as given when the person is not on the list.
export const fullName = (title, seen) => person(title, seen)?.name || String(seen ?? '');
// "Aldhia Fahmi Aranda (Aran)": the full name with the in-game name beside it.
export function nameLabel(title, seen) {
  const p = person(title, seen); if (!p) return String(seen ?? '');
  return p.nick && norm(p.nick) !== norm(p.name) ? `${p.name} (${p.nick})` : p.name;
}
