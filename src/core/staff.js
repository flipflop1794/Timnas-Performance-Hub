// Staff roles and routing (confirmed by Aufa, 3 Nov 2026).
// Routing decides whose queue a proposal lands in. It does not limit who may review: the Head Coach
// oversees everything, and a title coach may review proposals for his own title.

export const STAFF = [
  { id: 'fayad', name: 'Fayad', role: 'Head Coach', focus: ['PUBG Mobile', 'eFootball', 'MLBB Women'], oversight: 'all titles' },
  { id: 'aufa', name: 'Aufa Bassam', role: 'Assistant Coach 2', focus: ['Dota 2', 'MLBB'] },
  { id: 'donny', name: 'Donny Ardy Kusuma', role: 'Assistant Coach 1 — sport scientist', focus: ['Wellbeing'], oversight: 'physical and mental preparation, all titles' },
];

// WEC finals entries. Title coaches as published on wec.iesf.org (29 Oct–3 Nov); TBD where none listed.
export const TITLES = [
  { id: 'Dota 2', coach: 'Gregorius Arvindra Prasetyo', engine: 'dota' },
  { id: 'MLBB', coach: 'Coach Indra', engine: 'draftlab' },
  { id: 'MLBB Women', coach: 'Coach Ilyas', engine: 'draftlab' },
  { id: 'PUBG Mobile', coach: 'Christie Onibala', engine: 'pubgm' },
  { id: 'eFootball', coach: 'TBD (not named)', engine: null },
  { id: 'CS2', coach: 'see WEC roster', engine: null },
  { id: 'CS2 Women', coach: 'see WEC roster', engine: null },
];
export const WELLBEING = 'Wellbeing';

export function owner(title) {
  if (title === WELLBEING) return STAFF.find((s) => s.id === 'donny');
  return STAFF.find((s) => s.focus.includes(title)) || STAFF.find((s) => s.id === 'fayad');
}
export function ownerNote(title) {
  const o = owner(title);
  return o.focus.includes(title) || title === WELLBEING ? `${o.name} (${o.role})` : `${o.name} (${o.role}) — by oversight; no focus owner named`;
}
export function reviewersFor(title) {
  const t = TITLES.find((x) => x.id === title);
  const list = [owner(title).name];
  if (!list.includes('Fayad')) list.push('Fayad');
  if (title !== WELLBEING && !list.includes('Donny Ardy Kusuma')) list.push('Donny Ardy Kusuma');
  if (t && !/TBD|see WEC/.test(t.coach)) list.push(t.coach);
  return list;
}
// What lands in one person's queue.
export function queueFor(personId, objectives) {
  const me = STAFF.find((s) => s.id === personId);
  if (!me) return [];
  return objectives.filter((o) => {
    const mine = o.assignedTo === me.name || (me.id === 'fayad' && !STAFF.some((s) => s.name === o.assignedTo));
    return mine && !['retired', 'rejected'].includes(o.status);
  });
}
