// V1.34 on the website with a fake AI: a physio pastes her WhatsApp report, the AI fills the form, she ticks one
// line for the coach and saves. Coach Donny sees the names and the watch list; a title coach sees only the neutral
// line and counts; a support-only account sees only its own page.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay } from '../../src/core/dates.js';

let html;
before(async () => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  for (let i = 0; i < 100; i++) {
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten by another test file */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const people = {
  dewi: { id: 'u-dewi', email: 'dewi@example.test', password: 'pw', name: 'Andhika Dewi', roles: ['support'], titles: [] },
  donny: { id: 'u-donny', email: 'donny@example.test', password: 'pw', name: 'Coach Donny', staffKey: 'donny', roles: ['readiness_owner'], titles: [] },
  indra: { id: 'u-indra', email: 'indra@example.test', password: 'pw', name: 'Coach Indra', roles: ['title_coach'], titles: ['MLBB Women'] },
};
const t0 = localDay();
function world() {
  const B = backend(); Object.values(people).forEach((p) => B.addUser(p));
  B.tables.profiles.find((p) => p.id === 'u-dewi').support_job = 'physio_women';
  ['Vivi', 'Viorelle', 'Fumy'].forEach((ign, i) => B.tables.roster_players.push({ title: 'MLBB Women', ign, sort_order: i }));
  B.aiActions = ['scoreboard', 'draft', 'debrief', 'digest', 'plan', 'summary', 'prep', 'tags', 'br_result', 'weekly', 'meta_extract', 'meta_fit', 'prematch', 'scout_day', 'brainstorm', 'match_result', 'support_parse'];
  B.calls = [];
  B.ai = async (body) => { B.calls.push(body); return body.action === 'support_parse' ? { data: { raw: { discipline: 'physio', date: t0, notes: '', general: { did: '', found: '', teams: [] }, rows: [
    { athlete_seen: 'Kak Vivi indrawaty', athlete: '', title_seen: 'MLBB women', did: 'Ultrasound', found: 'tightness quadriceps, nyeri hamstring berkurang', region: 'quadriceps', response: 'better', vas_before: 4, vas_after: 3, follow_up: false },
    { athlete_seen: 'Kak Viorelle Valencia Chen', athlete: 'Viorelle', title_seen: 'MLBB women', did: 'Ultrasound arm bilateral', found: 'muscle strain biceps', region: 'biceps', response: '', vas_before: 4, vas_after: 2, follow_up: true }] }, model: 'm' } } : { status: 400, error: 'no fake answer' }; };
  return B;
}
async function open(B, who, hash) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/${hash ? `#${hash}` : ''}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(people[who].id); } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  return { dom, d, w: dom.window, text: () => d.getElementById('main').textContent, nav: () => d.getElementById('titles').textContent,
    set: (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); },
    wait: async (fn) => { for (let i = 0; i < 80 && !fn(); i++) await sleep(50); } };
}

test('support staff: paste from WhatsApp → AI fills the form → save; Donny reads names; a title coach gets the line and counts only', async () => {
  const B = world();
  const dewi = await open(B, 'dewi', '');
  assert.equal(dewi.w.location.hash, '#support', 'a support-only account lands on its page');
  assert.doesNotMatch(dewi.nav(), /MLBB|Dota 2|Competitors|Staff/); assert.match(dewi.text(), /Daily report — Physio \(women\)/);
  dewi.set('supPaste', 'Selamat malam, izin melaporkan kegiatan Fisioterapi ...');
  dewi.d.querySelector('[data-sup-parse]').click();
  await dewi.wait(() => dewi.d.getElementById('sR-1-athlete'));
  assert.equal(B.calls[0].action, 'support_parse'); assert.equal(B.calls[0].discipline, 'physio'); assert.ok(B.calls[0].roster['MLBB Women'].includes('Viorelle Valencia Chen'), 'full names from the BTN list');
  assert.equal(dewi.d.getElementById('sR-0-athlete').value, 'MLBB Women|Vivy Indrawaty'); assert.equal(dewi.d.getElementById('sR-0-vb').value, '4');
  // V1.37 pain map: tap a spot on the figure and score it; pick another spot from the list.
  dewi.d.querySelector('[data-sup-pain="0"][data-pt="knee_L"]').dispatchEvent(new dewi.w.MouseEvent('click', { bubbles: true }));
  await dewi.wait(() => dewi.d.getElementById('sR-0-pv-knee_L'));
  dewi.set('sR-0-pv-knee_L', '6');
  const pick = dewi.d.getElementById('sR-1-padd'); pick.value = 'wrist_R'; pick.dispatchEvent(new dewi.w.Event('change', { bubbles: true }));
  await dewi.wait(() => dewi.d.getElementById('sR-1-pv-wrist_R'));
  assert.equal(dewi.d.getElementById('sR-0-pv-knee_L').value, '6', 'the score survives the redraw');
  dewi.d.getElementById('sR-1-nt').checked = true; dewi.set('sR-1-ntx', 'Viorelle: check with the physio before scrim');
  dewi.d.querySelector('[data-sup-save]').click();
  await dewi.wait(() => B.tables.support_reports.length && B.tables.support_notices.length);
  const r = B.tables.support_reports[0].data; assert.equal(r.discipline, 'physio'); assert.equal(r.job, 'physio_women'); assert.equal(r.source, 'whatsapp'); assert.equal(r.rows.length, 2);
  assert.equal(B.tables.support_notices[0].title, 'MLBB Women');
  assert.equal(r.rows[1].followUp, 'Yes', 'follow-up is a text now');
  assert.deepEqual(r.rows[0].pain, [{ p: 'knee_L', v: 6 }]); assert.deepEqual(r.rows[1].pain, [{ p: 'wrist_R', v: null }]);
  // V1.36: her own summary, then an edit that the database records (who, what, when).
  // V1.49: her week strip and one line on top (her own reports only); the history is folded.
  await dewi.wait(() => /1\/7 days · 2 athletes/.test(dewi.text()));
  assert.ok(dewi.d.querySelector('.sw-day.on'), 'today is a filled tile');
  dewi.d.querySelector('[data-sup-histfold]').open = true;
  dewi.d.querySelector('[data-sup-edit]').click();
  await dewi.wait(() => /Edit report/.test(dewi.text()));
  dewi.set('sR-0-found', 'tightness quadriceps, hamstring better'); dewi.set('sR-0-fu', 'Re-check on Friday');
  dewi.d.querySelector('[data-sup-save]').click();
  await dewi.wait(() => B.tables.record_history.length);
  assert.equal(B.tables.support_reports.length, 1, 'edited in place, not a second report');
  assert.equal(B.tables.support_notices.length, 1, 'the notice is not sent twice');
  const h = B.tables.record_history[0]; assert.equal(h.tbl, 'support_reports'); assert.equal(h.editor_name, 'Andhika Dewi');
  assert.equal(h.after.rows[0].followUp, 'Re-check on Friday');
  await dewi.wait(() => /Edited 1×/.test(dewi.text()));
  dewi.d.querySelector('[data-sup-hist]').click();
  await dewi.wait(() => dewi.d.querySelector('.overlay'));
  assert.match(dewi.d.querySelector('.overlay').textContent, /Re-check on Friday/);

  const donny = await open(B, 'donny', 'support');
  await donny.wait(() => /To check/.test(donny.text()));
  // V1.49: to check, today, this week — in that order; dots instead of wide tables.
  const order = ['To check', 'Today: ', 'change from the week before'].map((x) => donny.text().indexOf(x)); assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `blocks in order ${order}`);
  assert.match(donny.text(), /Edited after saving \(1\)/); assert.match(donny.text(), /Viorelle/); assert.match(donny.text(), /follow-up/);
  assert.match(donny.text(), /pain −1\.5, better/);
  assert.match(donny.text(), /Pain spots this week/); assert.match(donny.text(), /Knee \(left\) 1×/);
  assert.equal(donny.d.querySelector('#main table'), null, 'no wide tables on the support page');

  const indra = await open(B, 'indra', 'today');
  await indra.wait(() => /From the support staff/.test(indra.text()));
  assert.match(indra.text(), /Viorelle: check with the physio before scrim/); assert.doesNotMatch(indra.text(), /muscle strain biceps/);
  indra.w.location.hash = 'support'; indra.w.dispatchEvent(new indra.w.HashChangeEvent('hashchange'));
  await indra.wait(() => /read by the support staff themselves/.test(indra.text()));
  assert.match(indra.text(), /read by the support staff themselves/); assert.doesNotMatch(indra.text(), /Athlete visits\s*2/); assert.doesNotMatch(indra.text(), /Vivy|biceps|quadriceps/, 'nothing for a title coach (V1.36)');
  assert.equal(B.supRead('u-indra'), false);
});
