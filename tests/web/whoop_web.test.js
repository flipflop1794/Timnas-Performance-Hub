// V1.51 Whoop on the website (fake server function): Coach Donny sets up the Whoop app once, copies a link for an
// athlete, sees recovery rings, sleep, strain, HRV and the IKB; the MLBB Women coach sees recovery and sleep only;
// without the server function nothing shows (no noise).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay, shiftDay } from '../../src/core/dates.js';

let html;
before(async () => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  for (let i = 0; i < 100; i++) {
    try { html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8'); if (/<\/html>\s*$/.test(html)) break; } catch { /* being rewritten */ }
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const people = {
  donny: { id: 'u-donny', email: 'donny@example.test', password: 'pw', name: 'Coach Donny', staffKey: 'donny', roles: ['readiness_owner'], titles: [] },
  ilyas: { id: 'u-ilyas', email: 'ilyas@example.test', password: 'pw', name: 'Coach Ilyas', roles: ['title_coach'], titles: ['MLBB Women'] },
};
const t0 = localDay();
// the server's answer, shaped like supabase/functions/_shared/whoop_handler.js read()
const days = (athlete, recs) => recs.map((rec, i) => ({ title: 'MLBB Women', athlete, day: shiftDay(t0, i - recs.length + 1),
  data: { recovery: rec, hrv: 40 + i * 2, rhr: 64 - (i % 3), sleepMin: 380 + i * 5, inBedMin: 450, sleepPerf: 80, strain: 9.5, mid: 900 + (i % 2) * 20, spo2: 95.5, calibrating: false } }));
function world({ configured = true } = {}) {
  const B = backend(); Object.values(people).forEach((p) => B.addUser(p));
  ['Vivi', 'Viorelle', 'Fumy'].forEach((ign, i) => B.tables.roster_players.push({ title: 'MLBB Women', ign, sort_order: i }));
  const state = { configured, calls: [] };
  B.whoop = async (body, uid) => {
    state.calls.push({ ...body, uid });
    if (body.action === 'config') { state.configured = true; return { data: { ok: true } }; }
    if (body.action === 'invite') return { data: { url: 'https://proj.supabase.co/functions/v1/whoop?go=abc123', expiresInDays: 7 } };
    if (body.action === 'sync') return { data: { synced: 1, failed: 0, reconnect: 0 } };
    if (body.action !== 'read') return { status: 400, error: 'Unknown action' };
    const links = [{ title: 'MLBB Women', athlete: 'Vivy Indrawaty', last_sync: new Date().toISOString(), needs_reconnect: false }];
    const all = days('Vivy Indrawaty', [70, 60, 72, 66, 75, 80, 85]);
    if (uid === 'u-donny') return { data: { configured: state.configured, manage: true, redirectUri: 'https://proj.supabase.co/functions/v1/whoop', links, days: all } };
    if (!(body.titles || []).includes('MLBB Women')) return { status: 403, error: 'Not allowed' };
    return { data: { configured: true, manage: false, links: links.map(({ title, athlete, last_sync, needs_reconnect }) => ({ title, athlete, last_sync, needs_reconnect })), days: all.map((d) => ({ ...d, data: { recovery: d.data.recovery, sleepMin: d.data.sleepMin } })) } };
  };
  return { B, state };
}
async function open(B, who, hash) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: `https://hub.example.test/#${hash}`,
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(people[who].id);
      Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (t) => { w.__copied = t; } } }); } });
  const d = dom.window.document;
  for (let i = 0; i < 120 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(200);
  return { d, w: dom.window, text: () => d.getElementById('main').textContent, wait: async (fn) => { for (let i = 0; i < 80 && !fn(); i++) await sleep(50); } };
}

test('Coach Donny: one-time setup, rings and numbers, the link for an athlete, pull now', async () => {
  const { B, state } = world({ configured: false });
  const x = await open(B, 'donny', 'support');
  await x.wait(() => /Morning readiness · Whoop/.test(x.text()) && x.d.getElementById('wrCid'));
  assert.match(x.text(), /One-time setup: the Whoop app/); assert.match(x.text(), /functions\/v1\/whoop/);
  x.d.getElementById('wrCid').value = 'cid-1'; x.d.getElementById('wrSec').value = 'sec-xyz';
  x.d.querySelector('[data-wr-save]').click();
  await x.wait(() => state.calls.some((c) => c.action === 'config'));
  assert.deepEqual(state.calls.find((c) => c.action === 'config'), { action: 'config', clientId: 'cid-1', clientSecret: 'sec-xyz', uid: 'u-donny' });
  await x.wait(() => !x.d.getElementById('wrCid'));
  // Vivy: ring 85 (green), sleep, strain, HRV, IKB tag; the order on the page: to check, then Whoop, then today
  const ring = x.d.querySelector('.wr-ring'); assert.ok(ring.classList.contains('green')); assert.equal(ring.textContent, '85');
  assert.match(x.text(), /Vivy Indrawaty/); assert.match(x.text(), /Sleep 6h 50m · Strain 9.5 · HRV 52/); assert.match(x.text(), /IKB \d+ · (normal|watch|low)/);
  assert.ok(x.text().indexOf('To check') < x.text().indexOf('Morning readiness'), 'Whoop sits under "To check"');
  x.d.querySelector('[data-wr-open]').click();
  await x.wait(() => x.d.querySelector('.wr-more'));
  assert.equal(x.d.querySelectorAll('.wr-dots i').length, 14); assert.equal(x.d.querySelectorAll('.wr-dots i.green').length, 5);
  assert.match(x.text(), /7-day average 73%/);
  // the rest of the MLBB Women list (BTN names + the hub roster) is not connected yet: copy a link for WhatsApp
  assert.match(x.text(), /Not connected yet \(5\)/); assert.doesNotMatch(x.d.querySelector('.wr-wait').textContent, /Vivy/, 'connected athletes are not in the list');
  x.d.querySelector('[data-wr-copy="MLBB Women|Viorelle Valencia Chen"]').click();
  await x.wait(() => x.w.__copied);
  assert.match(x.w.__copied, /^Hi Viorelle Valencia Chen,/); assert.match(x.w.__copied, /whoop\?go=abc123/);
  assert.deepEqual(state.calls.find((c) => c.action === 'invite'), { action: 'invite', title: 'MLBB Women', athlete: 'Viorelle Valencia Chen', uid: 'u-donny' });
  x.d.querySelector('[data-wr-sync]').click();
  await x.wait(() => /Updated 1 athlete/.test(x.text()));
});

test('MLBB Women coach: recovery and sleep in My team, nothing else; no server function → no panel', async () => {
  const { B } = world();
  const c = await open(B, 'ilyas', 't-mlbbw-reports');
  await c.wait(() => /Morning readiness · Whoop/.test(c.text()));
  assert.match(c.text(), /Vivy Indrawaty/); assert.match(c.text(), /Sleep 6h 50m/); assert.equal(c.d.querySelector('.wr-ring').textContent, '85');
  assert.doesNotMatch(c.text(), /HRV|Strain|IKB|Copy Whoop link|Disconnect/);
  const B2 = world().B; delete B2.whoop;
  const n = await open(B2, 'donny', 'support');
  await n.wait(() => /To check/.test(n.text())); await sleep(300);
  assert.doesNotMatch(n.text(), /Whoop/, 'nothing until the function is live');
});
