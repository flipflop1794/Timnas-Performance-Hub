// Website build (dist-web-test) with several staff accounts on a shared in-memory backend:
// sign-in, phone-style report filing, persistence across reloads, visibility for other accounts,
// title restrictions, wellbeing protection, corrections, admin access management.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { backend } from './fake-supabase.js';
import { localDay, shiftDay } from '../../src/core/dates.js';

let html;
before(() => {
  execFileSync(process.execPath, ['tools/build.mjs', '--web-test'], { cwd: new URL('../..', import.meta.url) });
  html = readFileSync(new URL('../../dist-web-test/index.html', import.meta.url), 'utf8');
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const people = {
  aufa: { id: 'u-aufa', email: 'aufa@example.test', password: 'pw-aufa-123', name: 'Aufa Bassam', staffKey: 'aufa', roles: ['admin', 'assistant_coach'], titles: ['Dota 2', 'MLBB'] },
  fayad: { id: 'u-fayad', email: 'fayad@example.test', password: 'pw-fayad-123', name: 'Fayad', staffKey: 'fayad', roles: ['head_coach'], titles: [] },
  donny: { id: 'u-donny', email: 'donny@example.test', password: 'pw-donny-123', name: 'Donny Ardy Kusuma', staffKey: 'donny', roles: ['assistant_coach', 'readiness_owner'], titles: [] },
  indra: { id: 'u-indra', email: 'indra@example.test', password: 'pw-indra-123', name: 'Coach Indra', roles: ['title_coach'], titles: ['MLBB'] },
  newbie: { id: 'u-new', email: 'new@example.test', password: 'pw-new-12345', name: 'new', roles: [], titles: [] },
};
function world() { const B = backend(); Object.values(people).forEach((p) => B.addUser(p)); return B; }
async function open(B, who, hash = 'today') {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: hash ? `https://hub.example.test/#${hash}` : 'https://hub.example.test/',
    beforeParse(w) { w.localStorage.setItem('hub-lang', 'en'); w.__HUB_TEST_CLIENT__ = B.client(who ? people[who].id : null); w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {}; } });
  const d = dom.window.document;
  for (let i = 0; i < 60 && /Loading/.test(d.getElementById('main')?.textContent || 'Loading'); i++) await sleep(25);
  await sleep(60);
  return { dom, d, w: dom.window, text: () => d.getElementById('main').textContent, nav: () => d.getElementById('titles').textContent,
    go: async (h) => { dom.window.location.hash = h; dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange')); await sleep(40); },
    set: (id, v) => { const e = d.getElementById(id); e.value = v; e.dispatchEvent(new dom.window.Event('input', { bubbles: true })); },
    click: async (sel) => { d.querySelector(sel).click(); await sleep(60); } };
}

test('no session: the sign-in screen, not the hub; wrong password refused; right password opens the hub', async () => {
  const B = world(); const p = await open(B, null);
  assert.match(p.text(), /Sign in/); assert.doesNotMatch(p.nav(), /MLBB/);
  p.d.getElementById('authEmail').value = people.indra.email; p.d.getElementById('authPw').value = 'wrong';
  p.d.getElementById('loginForm').dispatchEvent(new p.w.Event('submit', { cancelable: true })); await sleep(60);
  assert.match(p.d.getElementById('authMsg').textContent, /not correct/);
  p.d.getElementById('authPw').value = people.indra.password;
  p.d.getElementById('loginForm').dispatchEvent(new p.w.Event('submit', { cancelable: true })); await sleep(250);
  // A title coach sees only his own game and lands on its scrim reports.
  assert.match(p.nav(), /MLBB/); for (const t of ['Dota 2', 'PUBG Mobile', 'eFootball', 'CS2']) assert.doesNotMatch(p.nav(), new RegExp(t));
  assert.match(p.nav(), /Coach Indra/); assert.ok(p.d.getElementById('signOutBtn')); assert.equal(p.d.getElementById('meSel'), null, 'no self-declared identity');
});

test('an account without a role sees only "no access yet"', async () => {
  const B = world(); const p = await open(B, 'newbie');
  assert.match(p.text(), /No access yet/); assert.doesNotMatch(p.nav(), /Dota 2/);
});

test('a title coach files a report from his phone; it survives a reload and the Head Coach sees it live', async () => {
  const B = world();
  const fayad = await open(B, 'fayad', 'mlbb-reports');
  assert.match(fayad.text(), /No report yet/);
  const indra = await open(B, 'indra', 'mlbb-reports');
  assert.equal(indra.d.getElementById('rp-MLBB-by').value, 'Coach Indra', 'written by defaults to the signed-in coach');
  indra.set('rp-MLBB-partner', 'RRQ Academy');
  [...indra.d.querySelectorAll('.chip')].find((b) => b.textContent === '2-1').click(); await sleep(20);
  indra.set('rp-MLBB-focus', 'Early rotations'); await indra.click('[data-rp-prog="MLBB"][data-v="4"]');
  indra.set('rp-MLBB-worked', 'Lane swaps on time'); indra.set('rp-MLBB-adjust', 'Vision 20s before turtle');
  await indra.click('[data-report-save="MLBB"]'); await sleep(100);
  assert.match(indra.d.getElementById('rpMsg-MLBB').textContent, /Report saved \(2-1 vs RRQ Academy\)/);
  const row = B.tables.scrim_reports[0];
  assert.equal(row.created_by, 'u-indra'); assert.equal(row.title, 'MLBB'); assert.equal(row.data.result.won, 2);
  await sleep(400);
  assert.match(fayad.text(), /vs RRQ Academy/, 'Head Coach sees it without reloading'); assert.match(fayad.text(), /Vision 20s before turtle/);
  const again = await open(B, 'indra', 'mlbb-reports'); await sleep(100);
  assert.match(again.text(), /vs RRQ Academy/, 'persists after reload');
  const aufa = await open(B, 'aufa', 'reports-all'); await sleep(100);
  assert.match(aufa.text(), /2026|MLBB/); assert.match(aufa.text(), /Vision 20s before turtle/);
});

test('a coach of another title cannot see or file MLBB records; the page says why', async () => {
  const B = world(); B.addUser({ id: 'u-chr', email: 'c@example.test', password: 'pw-c-1234567', name: 'Christie', roles: ['title_coach'], titles: ['PUBG Mobile'] });
  people.christie = B.users.at(-1);
  const indra = await open(B, 'indra', 'mlbb-reports');
  indra.set('rp-MLBB-partner', 'X'); indra.set('rp-MLBB-won', '1'); indra.set('rp-MLBB-lost', '0'); indra.set('rp-MLBB-focus', 'f'); indra.set('rp-MLBB-progress', '3'); indra.set('rp-MLBB-failed', 'x'); indra.set('rp-MLBB-adjust', 'y');
  await indra.click('[data-report-save="MLBB"]'); await sleep(100);
  assert.equal(B.tables.scrim_reports.length, 1);
  const c = await open(B, 'christie', 'mlbb-reports'); await sleep(100);
  assert.match(c.text(), /You are not assigned to MLBB/); assert.doesNotMatch(c.text(), /vs X/);
  c.set('rp-MLBB-partner', 'Y'); c.set('rp-MLBB-won', '1'); c.set('rp-MLBB-lost', '0'); c.set('rp-MLBB-focus', 'f'); c.set('rp-MLBB-progress', '3'); c.set('rp-MLBB-failed', 'x'); c.set('rp-MLBB-adjust', 'y');
  await c.click('[data-report-save="MLBB"]'); await sleep(100);
  assert.match(c.d.getElementById('rpMsg-MLBB').textContent, /don't have permission/);
  assert.equal(B.tables.scrim_reports.length, 1, 'nothing written');
  await c.go('pubgm-reports'); assert.doesNotMatch(c.text(), /You are not assigned/);
});

test('daily session persists, a manager resolves its follow-up, and leadership sees the live change', async () => {
  const B = world();
  people.manager = { id: 'u-manager', email: 'manager@example.test', password: 'pw-manager-123', name: 'Team Manager', roles: ['assistant_coach'], titles: ['MLBB'] };
  B.addUser(people.manager);
  const today = localDay();
  const date = shiftDay(today, -2);
  const due = shiftDay(today, -1);
  const plan = { id: 'SC-planned', title: 'MLBB', date: today, time: '19:00 WIB', kind: 'scrim', partner: 'Academy', owner: 'Coach Indra', status: 'planned', objectives: [], origin: 'operational' };
  await B.client(people.indra.id).from('scrim_sessions').insert({ id: plan.id, data: plan });
  const lead = await open(B, 'fayad', 'daily-sessions');
  assert.match(lead.text(), /No report filed/);
  assert.ok(lead.d.querySelector('a[href="#mlbb-scrims?record=SC-planned"]'));
  await lead.go('mlbb-scrims?record=SC-planned');
  assert.match(lead.text(), /Academy/);
  await lead.go('daily-sessions');
  const coach = await open(B, 'indra', 'mlbb-reports');
  await coach.go('daily-sessions?title=MLBB');
  assert.deepEqual([...coach.d.querySelectorAll('#daily-title option')].map((o) => o.value), ['MLBB']);
  for (const [key, value] of Object.entries({ date, objective: 'Turtle setup', outcome: '2 clean setups', issue: 'Late ward', nextAction: 'Review river timing' })) coach.set(`daily-${key}`, value);
  await coach.click('#daily-new button[type=submit]');
  const session = B.tables.scrim_sessions.find((row) => row.data.dailyReport);
  assert.equal(session.created_by, people.indra.id);
  assert.equal(session.data.followUp.ownerId, people.indra.id);
  assert.equal(session.data.followUp.due, shiftDay(today, 1));
  assert.equal(session.data.dailyReport.issue, 'Late ward');
  const again = await open(B, 'indra', 'daily-sessions');
  assert.match(again.text(), /Session history.*Turtle setup/s);
  await again.click(`a[href="#daily-sessions?session=${session.id}"]`);
  assert.match(again.text(), /2 clean setups/);

  const manager = await open(B, 'manager', `daily-sessions?session=${session.id}`);
  manager.set('daily-ownerId', people.manager.id);
  manager.set('daily-due', due);
  manager.set('daily-status', 'In progress');
  await manager.click('#daily-edit button');
  await sleep(350);
  assert.equal(B.tables.scrim_sessions.find((row) => row.id === session.id).updated_by, people.manager.id);
  assert.match(lead.text(), /Team Manager.*In progress.*Overdue/s);
  assert.equal(lead.d.querySelectorAll(`a[href="#daily-sessions?session=${session.id}"]`).length, 4);
  manager.set('daily-status', 'Done');
  await manager.click('#daily-edit button');
  await sleep(350);
  assert.match(lead.text(), /No open follow-ups/);
  assert.equal(lead.d.querySelectorAll(`a[href="#daily-sessions?session=${session.id}"]`).length, 2);
  await lead.click('#langBtn');
  assert.match(lead.text(), /Kesiapan tiap disiplin/);
  const other = await open(B, 'donny', `daily-sessions?session=${session.id}`);
  assert.match(other.text(), /Turtle setup/);
  assert.equal(other.d.querySelector('#daily-edit'), null, 'unassigned assistant has read access only');
  for (const page of [lead, coach, again, manager, other]) page.dom.window.close();
});

test('invite and password reset screens use the existing password flow', async () => {
  const B = world();
  const login = await open(B, null);
  login.set('authEmail', people.indra.email);
  await login.click('#forgotBtn');
  assert.match(login.text(), /a link to set a new password is on its way/);
  for (const type of ['invite', 'recovery']) {
    const link = await open(B, 'indra', `type=${type}`);
    assert.match(link.text(), /Set your password/);
    const password = `local-test-password-${type}`;
    link.set('pw1', password);
    link.set('pw2', password);
    await link.click('#pwForm button');
    assert.equal(B.users.find((u) => u.id === people.indra.id).password, password);
    link.dom.window.close();
  }
  login.dom.window.close();
});

test('a completed session accepts one daily report and keeps its original result and objectives', async () => {
  const B = world();
  const id = 'SC-completed';
  const date = shiftDay(localDay(), -1);
  const result = { score: '2-1', matchIds: ['G1'], notes: 'Original log', by: 'Coach Indra', perObjective: {} };
  const source = { id, title: 'MLBB', date, kind: 'scrim', partner: 'Academy', owner: 'Coach Indra',
    status: 'done', objectives: ['OBJ-existing'], result, origin: 'operational' };
  await B.client(people.indra.id).from('scrim_sessions').insert({ id, data: source });
  const coach = await open(B, 'indra', `mlbb-scrims?record=${id}`);
  await coach.click('a[href="#daily-sessions?session=SC-completed"]');
  assert.equal(coach.d.getElementById('daily-outcome').value, '2-1');
  assert.equal(coach.d.getElementById('daily-date'), null);
  for (const [key, value] of Object.entries({ objective: 'Secure river', issue: 'Late ward', nextAction: 'Check vision timing' })) {
    coach.set(`daily-${key}`, value);
  }
  await coach.click('#daily-new button');
  assert.match(coach.text(), /Daily report saved/);
  assert.equal(B.tables.scrim_sessions.length, 1);
  const row = B.tables.scrim_sessions[0];
  assert.deepEqual(row.data.result, result);
  assert.deepEqual(row.data.objectives, source.objectives);
  assert.equal(row.data.dailyReport.outcome, '2-1');
  assert.equal(row.data.followUp.ownerId, people.indra.id);
  const lead = await open(B, 'fayad', 'daily-sessions');
  assert.match(lead.text(), /Check vision timing/);
  await lead.go(`daily-sessions?session=${id}`);
  assert.equal(lead.d.getElementById('daily-new'), null);
  assert.ok(lead.d.querySelector(`a[href="#mlbb-scrims?record=${id}"]`));
  coach.dom.window.close();
  lead.dom.window.close();
});

test('corrections are added, never overwrite the report, and show who entered them', async () => {
  const B = world(); const indra = await open(B, 'indra', 'mlbb-reports');
  indra.set('rp-MLBB-partner', 'X'); indra.set('rp-MLBB-won', '2'); indra.set('rp-MLBB-lost', '1'); indra.set('rp-MLBB-focus', 'f'); indra.set('rp-MLBB-progress', '3'); indra.set('rp-MLBB-failed', 'x'); indra.set('rp-MLBB-adjust', 'y');
  await indra.click('[data-report-save="MLBB"]'); await sleep(400);
  const id = B.tables.scrim_reports[0].id;
  indra.d.getElementById(`rpN-${id}`).value = 'Score was 2-0, not 2-1';
  await indra.click(`[data-report-note="${id}"]`); await sleep(400);
  assert.equal(B.tables.scrim_report_corrections.length, 1); assert.equal(B.tables.scrim_report_corrections[0].created_by, 'u-indra');
  assert.equal(B.tables.scrim_reports[0].data.result.lost, 1); assert.deepEqual(B.tables.scrim_reports[0].data.notes, []);
  assert.match(indra.text(), /Correction .* Coach Indra: Score was 2-0, not 2-1/);
});

test('wellbeing: the Head Coach is refused by the backend; the readiness owner can record and read', async () => {
  const B = world();
  const fayad = await open(B, 'fayad', 'well-day'); await sleep(50);
  assert.match(fayad.text(), /Restricted\. Wellbeing records are limited to the readiness owner/);
  const donny = await open(B, 'donny', 'well-log'); await sleep(50);
  assert.doesNotMatch(donny.text(), /visible to editors only/);
});

test('admin manages access: grants a title; non-admins have no admin page', async () => {
  const B = world();
  const indra = await open(B, 'indra', 'staff-cycle'); assert.doesNotMatch(indra.d.getElementById('tabs').textContent, /Users & access/);
  const aufa = await open(B, 'aufa', 'admin-users');
  for (let i = 0; i < 40 && !/People \(\d/.test(aufa.text()); i++) await sleep(50);
  assert.match(aufa.text(), /People \(\d+\)/); assert.match(aufa.text(), /Coach Indra/);
  aufa.d.getElementById('ad-u-indra-title-MLBB_Women').checked = true;
  await aufa.click('[data-admin-save="u-indra"]'); await sleep(100);
  assert.match(aufa.d.getElementById('adMsg-u-indra').textContent, /Saved/);
  assert.deepEqual(B.tables.user_titles.filter((r) => r.user_id === 'u-indra').map((r) => r.title).sort(), ['MLBB', 'MLBB Women']);
  aufa.d.getElementById('ad-u-new-role-title_coach').checked = true; aufa.d.getElementById('ad-u-new-title-CS2').checked = true;
  await aufa.click('[data-admin-save="u-new"]'); await sleep(100);
  const nb = await open(B, 'newbie', 't-cs2-reports'); assert.match(nb.text(), /Scrim reports — CS2/);
});

test('typing is kept while a colleague saves; the database refuses demo data; sign out returns to sign-in', async () => {
  const B = world();
  const indra = await open(B, 'indra', 'mlbb-reports'); const aufa = await open(B, 'aufa', 'mlbb-reports');
  indra.d.getElementById('rp-MLBB-worked').focus(); indra.set('rp-MLBB-worked', 'half-typed');
  aufa.set('rp-MLBB-partner', 'Z'); aufa.set('rp-MLBB-won', '1'); aufa.set('rp-MLBB-lost', '0'); aufa.set('rp-MLBB-focus', 'f'); aufa.set('rp-MLBB-progress', '3'); aufa.set('rp-MLBB-failed', 'x'); aufa.set('rp-MLBB-adjust', 'y');
  await aufa.click('[data-report-save="MLBB"]'); await sleep(450);
  assert.match(indra.text(), /vs Z/); assert.equal(indra.d.getElementById('rp-MLBB-worked').value, 'half-typed');
  const r = await B.client('u-aufa').from('scrim_reports').insert({ id: 'D1', data: { title: 'MLBB', origin: 'demo' } });
  assert.match(r.error.message, /Only operational records/);
  await indra.click('#signOutBtn'); await sleep(50);
  assert.equal((await B.client(null).from('scrim_reports').select('*')).data.length, 0, 'signed-out reads return nothing');
});

test('title coach lands on his own scrim reports; Head Coach sees all seven games', async () => {
  const B = world();
  const indra = await open(B, 'indra', ''); await sleep(50);
  assert.equal(indra.w.location.hash, '#mlbb-reports'); assert.match(indra.text(), /Scrim reports — MLBB/);
  const fayad = await open(B, 'fayad', 'today');
  for (const t of ['Dota 2', 'PUBG Mobile', 'MLBB', 'MLBB Women', 'eFootball', 'CS2', 'CS2 Women']) assert.match(fayad.nav(), new RegExp(t));
  await indra.go('reports-all'); assert.doesNotMatch(indra.text(), /PUBG Mobile/);
});

test('admin page: AI use this month with an estimated cost', async () => {
  const B = world();
  const at = new Date().toISOString();
  B.tables.ai_usage = [{ id: 1, at, user_id: 'u-indra', title: 'MLBB', action: 'scoreboard', model: 'claude-sonnet-5-5', input_tokens: 1600, output_tokens: 900, cache_read_tokens: 2000, cache_write_tokens: 0, attempts: 1, ok: true }];
  const aufa = await open(B, 'aufa', 'admin-users');
  for (let i = 0; i < 40 && !/AI use this month/.test(aufa.text()); i++) await sleep(50);
  assert.match(aufa.text(), /AI use this month/); assert.match(aufa.text(), /Game screenshots1—\$0\.012/);
});

test('V1.16 approvals: a title coach cannot approve; the writer cannot approve his own version; an assistant coach approves as himself', async () => {
  const B = world();
  const indra = await open(B, 'indra', 'mlbb-draft');
  await indra.click('[data-dr-section="book"]');
  assert.ok(indra.d.getElementById('drBookBy').readOnly, '"written by" is the signed-in person');
  indra.set('drBans', 'Fanny'); await indra.click('[data-dr-savebook]');
  assert.match(indra.d.getElementById('msg-dr-book').textContent, /version 1/);
  assert.equal(indra.d.querySelector('[data-dr-approve]'), null, 'title coach: no approve button');
  assert.equal(indra.d.getElementById('drApprover'), null, 'no approver picker on the website');
  // A typed "approved" written straight to the database is refused.
  const [row] = B.tables.draft_books;
  const forged = await B.client('u-indra').from('draft_books').upsert({ id: row.id, data: { ...row.data, status: 'approved', approvedBy: 'Fayad' } });
  assert.match(forged.error.message, /Approve button/);
  // Aufa (assistant coach) approves; the record names him, not a picked name.
  const aufa = await open(B, 'aufa', 'mlbb-draft');
  await aufa.click('[data-dr-section="book"]');
  assert.match(aufa.d.querySelector('[data-dr-approve]').textContent, /as Aufa Bassam/);
  await aufa.click('[data-dr-approve]'); await sleep(60);
  assert.equal(B.tables.draft_books[0].data.status, 'approved');
  assert.equal(B.tables.draft_books[0].data.approvedBy, 'Aufa Bassam');
  assert.match(aufa.text(), /approved by Aufa Bassam/);
});

test('V1.16 a failed load is shown, not mistaken for "no records"; the next good load clears it', async () => {
  const B = world();
  B.failRead = new Set(['rival_vods']);
  const fayad = await open(B, 'fayad', 'today');
  for (let i = 0; i < 20 && !fayad.d.querySelector('[data-load-error]'); i++) await sleep(25);
  assert.match(fayad.text(), /Some records could not be loaded: VOD library/);
  B.failRead.clear(); fayad.w.dispatchEvent(new fayad.w.Event('focus')); await sleep(400);
  assert.equal(fayad.d.querySelector('[data-load-error]'), null);
});

test('V1.16 screenshot storage: admin sees how full it is and deletes screenshots past 90 days after confirming', async () => {
  const B = world();
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString();
  B.files = [{ name: 'mlbb/old-1.webp', size: 400 * 1024 ** 2, created_at: day(120) }, { name: 'mlbb/old-2.webp', size: 300 * 1024 ** 2, created_at: day(95) },
    { name: 'mlbb/new.webp', size: 200 * 1024 ** 2, created_at: day(3) }];
  const aufa = await open(B, 'aufa', 'admin-users');
  for (let i = 0; i < 40 && !aufa.d.getElementById('storagePanel'); i++) await sleep(50);
  assert.match(aufa.text(), /900 MB of 1 GB/); assert.match(aufa.text(), /Storage 88% full/);
  await aufa.click('#stFind');
  assert.match(aufa.text(), /Delete 2 screenshots older than 90 days\?/);
  assert.equal(B.files.length, 3, 'nothing deleted before confirming');
  await aufa.click('#stPurge'); await sleep(60);
  assert.deepEqual(B.files.map((f) => f.name), ['mlbb/new.webp']);
  assert.match(aufa.text(), /Deleted 2 screenshots/); assert.match(aufa.text(), /200 MB of 1 GB/);
});

test('V1.16 scrim report: the author is the signed-in coach and cannot be changed, even by "copy setup"', async () => {
  const B = world();
  const indra = await open(B, 'indra', 'mlbb-reports');
  const by = indra.d.getElementById('rp-MLBB-by');
  assert.equal(by.value, 'Coach Indra'); assert.ok(by.readOnly);
  B.tables.scrim_reports.push({ id: 'r-old', title: 'MLBB', data: { id: 'r-old', title: 'MLBB', date: localDay(), by: 'Fayad', partner: 'Team Q', result: { mode: 'wl', won: 1, lost: 0, drawn: 0 }, focus: 'f', progress: 3, worked: 'w', adjust: 'Ward earlier', notes: [], origin: 'operational', createdAt: new Date().toISOString() }, created_by: 'u-fayad', created_at: new Date().toISOString() });
  B.notify('scrim_reports'); await sleep(400);
  const copy = [...indra.d.querySelectorAll('.chip')].find((b) => b.textContent === 'Copy setup from last report'); assert.ok(copy); copy.click(); await sleep(60);
  assert.equal(indra.d.getElementById('rp-MLBB-by').value, 'Coach Indra'); assert.equal(indra.d.getElementById('rp-MLBB-partner').value, 'Team Q');
});

test('V1.16 one form: a scrim report filed by the title coach is also the daily report, with his follow-up', async () => {
  const B = world();
  const indra = await open(B, 'indra', 'mlbb-reports');
  for (const [k, v] of Object.entries({ partner: 'Team Q', won: '2', lost: '1', focus: 'Turtle setup', progress: '4', worked: 'Clean turtle', failed: 'Late vision', adjust: 'Ward before lord' })) indra.set(`rp-MLBB-${k}`, v);
  await indra.click('[data-report-save="MLBB"]'); await sleep(150);
  assert.match(indra.d.getElementById('rpMsg-MLBB').textContent, /also the daily report/);
  const [rep] = B.tables.scrim_reports; const sess = B.tables.scrim_sessions.find((s) => s.id === rep.data.scrimId);
  assert.ok(sess, 'report linked to a new session');
  assert.equal(sess.data.status, 'done'); assert.equal(sess.data.dailyReport.fromReport, rep.id);
  assert.equal(sess.data.dailyReport.issue, 'Late vision'); assert.equal(sess.data.followUp.ownerId, 'u-indra');
  // Leadership sees it under Daily sessions without anyone filling the daily form.
  const fayad = await open(B, 'fayad', 'daily-sessions');
  assert.match(fayad.text(), /Session history.*Turtle setup/s); assert.match(fayad.text(), /Ward before lord/);
  // The daily form points scrims to Scrim reports.
  await indra.go('daily-sessions?title=MLBB'); assert.match(indra.text(), /File it under Scrim reports instead/);
});

test('V1.19 leadership: lands on the Main dashboard, sees every title, cannot save; Home returns to the dashboard', async () => {
  const B = world();
  people.ketua = { id: 'u-ketua', email: 'ketua@example.test', password: 'pw-ketua-123', name: 'Ketua BTN', roles: ['leadership'], titles: [] };
  B.addUser(people.ketua);
  const day = localDay(); const at = new Date().toISOString();
  B.tables.scrim_reports.push({ id: 'r-m', title: 'MLBB', data: { id: 'r-m', title: 'MLBB', date: day, by: 'x', partner: 'p', result: { mode: 'wl', won: 2, lost: 1, drawn: 0 }, focus: 'f', progress: 4, worked: 'w', adjust: 'a', notes: [], origin: 'operational', createdAt: at }, created_by: 'u-indra', created_at: at });
  B.tables.wec_matches.push({ id: 'm1', title: 'Dota 2', data: { id: 'm1', title: 'Dota 2', date: '2026-12-16', time: '10:00', opponent: 'Mongolia', stage: 'Group', origin: 'operational' }, created_by: 'u-aufa', created_at: at, updated_at: at });
  const k = await open(B, 'ketua', null);
  for (let i = 0; i < 40 && !/Main dashboard/.test(k.text()); i++) await sleep(50);
  assert.equal(k.w.location.hash, '#overview');
  assert.match(k.text(), /Days to WEC|WEC/);
  const rows = [...k.d.querySelectorAll('#main tbody tr')].map((tr) => tr.cells[0].textContent);
  assert.deepEqual(rows, ['MLBB', 'MLBB Women', 'Dota 2', 'PUBG Mobile', 'eFootball', 'CS2', 'CS2 Women']);
  assert.match(k.d.querySelector('#main tbody tr').textContent, /2-1/);
  assert.match(k.text(), /vs Mongolia/);
  assert.doesNotMatch(k.nav(), /Users & access/);
  // Other pages say read-only; the backend refuses a save.
  await k.go('mlbb-reports'); assert.match(k.text(), /Read-only view for leadership/);
  const forged = await B.client('u-ketua').from('scrim_reports').insert({ id: 'x', data: { title: 'MLBB', origin: 'operational' } });
  assert.ok(forged.error, 'leadership cannot write');
  // Home button returns to the dashboard, for every user.
  await k.click('#homeBtn'); await sleep(40); assert.equal(k.w.location.hash, '#overview');
  const indra = await open(B, 'indra', 'mlbb-reports'); assert.ok(indra.d.getElementById('homeBtn'));
  await indra.click('#homeBtn'); await sleep(40);
  assert.deepEqual([...indra.d.querySelectorAll('#main tbody tr')].map((tr) => tr.cells[0].textContent), ['MLBB'], 'a title coach sees only his title on the dashboard');
});

test('V1.16 practice quality: leadership compares titles; a title coach sees only his own', async () => {
  const B = world();
  const day = localDay();
  const rep = (id, title, progress) => ({ id, title, data: { id, title, date: day, by: 'x', partner: 'p', result: { mode: 'wl', won: 1, lost: 0, drawn: 0 }, focus: 'f', progress, worked: 'w', adjust: 'a', notes: [], origin: 'operational', createdAt: new Date().toISOString() }, created_by: 'u-indra', created_at: new Date().toISOString() });
  B.tables.scrim_reports.push(rep('r1', 'MLBB', 5), rep('r2', 'MLBB', 3), rep('r3', 'Dota 2', 1));
  const fayad = await open(B, 'fayad', 'staff-quality');
  const row = (p, t) => [...p.d.querySelectorAll('#main tbody tr')].find((tr) => tr.cells[0].textContent === t)?.textContent || '';
  assert.match(row(fayad, 'MLBB'), /^MLBB88/);            // on time 100%, plan followed 75% → 88
  assert.match(row(fayad, 'Dota 2'), /^Dota 250/);          // on time 100%, plan followed 0% → 50
  assert.match(row(fayad, 'eFootball'), /no records/);
  const indra = await open(B, 'indra', 'staff-quality');
  assert.deepEqual([...indra.d.querySelectorAll('#main tbody tr')].map((tr) => tr.cells[0].textContent), ['MLBB']);
});

test('V1.16 trends: weekly team lines and per-player table with a fair verdict', async () => {
  const B = world();
  const t0 = localDay(); const at = new Date().toISOString();
  const doc = (table, id, title, data) => B.tables[table].push({ id, title, data: { id, title, origin: 'operational', ...data }, created_by: 'u-indra', created_at: at, updated_at: at });
  // Two weeks ago and before: mostly losses; the last two weeks: mostly wins.
  [[20, 0, 4], [17, 1, 3], [10, 4, 0], [3, 3, 1], [1, 4, 0]].forEach(([ago, won, lost], i) => doc('scrim_reports', `r${i}`, 'MLBB', {
    date: shiftDay(t0, -ago), by: 'x', partner: 'p', result: { mode: 'wl', won, lost, drawn: 0 }, focus: 'f', progress: 3, worked: 'w', adjust: 'a', notes: [], createdAt: at }));
  [[20, 6], [18, 7], [17, 6], [16, 5], [15, 6], [16, 7], [4, 2], [3, 1], [2, 2], [2, 1], [1, 2], [1, 1]].forEach(([ago, deaths], i) => doc('scrim_games', `g${i}`, 'MLBB', {
    game: 'mlbb', reportId: 'r0', date: shiftDay(t0, -ago), result: 'win', createdAt: at,
    players: [{ team: 'ours', player: 'Aran', hero: 'Ling', stats: { kills: 3, deaths, assists: 6 } }] }));
  const aufa = await open(B, 'aufa', 'mlbb-trends');
  for (let i = 0; i < 40 && !/Players/.test(aufa.text()); i++) await sleep(50);
  assert.match(aufa.text(), /MLBB: trends/);
  assert.match(aufa.text(), /Scrim win rate\s*Better/);
  assert.match(aufa.text(), /Plan followed \(1–5\)\s*No clear change|Plan followed \(1–5\)\s*Not enough data/);
  const deaths = [...aufa.d.querySelectorAll('#main tbody tr')].find((tr) => /D \(lower is better\)/.test(tr.textContent));
  assert.ok(deaths, 'deaths row'); assert.match(deaths.textContent, /Better$/);
  assert.equal(aufa.d.querySelectorAll('#main figure.trend').length, 2);
  // eFootball has reports only: team lines, no player table.
  await aufa.go('t-efootball-trends');
  assert.match(aufa.text(), /No scrim reports in this period/); assert.doesNotMatch(aufa.text(), /Players/);
});

test("Coach Donny's system inside the hub: staff sign-in, team saved once in the database, other devices load it, title coaches kept out", async () => {
  const B = world();
  const donny = await open(B, 'donny', 'readiness');
  const shadow = () => donny.d.querySelector('#donnyMount .donny-host')?.shadowRoot?.textContent || '';
  for (let i = 0; i < 40 && !/Papan Tim/.test(shadow()); i++) await sleep(50);
  assert.match(shadow(), /Papan Tim/); assert.match(shadow(), /Dr\. Donny Ardy Kusuma/); assert.match(shadow(), /Saved in the Timnas Hub database/);
  for (let i = 0; i < 40 && !(B.tables.readiness_store || []).length; i++) await sleep(50);
  const n = B.tables.readiness_store.length;
  assert.ok(n > 60, `his team structure saved (${n} rows)`);
  assert.ok(B.tables.readiness_store.every((r) => r.created_by === 'u-donny'), 'saved under the hub user who made the change');
  assert.ok(B.tables.readiness_store.some((r) => r.data.map === 'athletes' && r.data.value.nama === 'Matthew Filemon'));
  // Fayad (Muslih Wahyudi Rahman) is the Head Coach in his list too; Aufa opens it on another device: loaded, not created again.
  const aufa = await open(B, 'aufa', 'readiness'); await sleep(300);
  assert.match(aufa.d.querySelector('#donnyMount .donny-host').shadowRoot.textContent, /Aufa Bassam/);
  assert.equal(B.tables.readiness_store.length, n);
  // A title coach without wellbeing access sees nothing of it.
  const indra = await open(B, 'indra', 'readiness'); await sleep(100);
  assert.match(indra.text(), /Restricted/); assert.equal(indra.d.querySelector('.donny-host'), null);
});
