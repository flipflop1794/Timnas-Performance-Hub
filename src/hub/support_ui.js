// V1.34 Performance → Support staff: the daily report of the team doctor, physios, physical coach and psychologists.
// V1.35 (camp-plan session): one session, many athletes. V1.36: one row per athlete with the same three columns in the
// form and the saved report (what was done · findings · follow-up), psychologists' session type and prognosis,
// editing with a history the database keeps, "My summary" for each staff member (own data only) and "Support team
// progress" for Coach Donny, the Head Coach and admins. Logic in src/core/support.js and history.js.
import { JOBS, DISCS, DISC_LABEL, ASK, RESPONSES, SESSIONS, SESSION_LABEL, followText, supportReport, usersOfDay, fromParse, whatsappText, anonymise, summarize, perDay,
  weekSignals, repeatAthletes, watchList, dayBoard, weekRange, noticeRecord, groupRows, isBlankRow, REPEAT_AT, HIGH_VAS, calWeek, weekGrid, weekText,
  openFollowUps, closeFollowUp, reportedOn, reminderText, readinessList, myRecap, recapText } from '../core/support.js';
import { EVENT } from '../core/matchday.js';
import { playersOf, coachesOf, fullName } from '../core/people.js';
import { historyOf } from '../core/history.js';
import { POINTS, bodySvg, pointLabel, painText, painCounts } from '../core/painmap.js';

const DRAFT_KEY = 'hub-support-draft';
const blankGroup = () => ({ picks: [], others: '', did: '', found: '', region: '', followUp: '', open: false });
const groupCount = (g) => (g?.picks || []).length + String(g?.others || '').split(/[,;\n]/).filter((x) => x.trim()).length;
const blankRow = () => ({ athlete: '', athleteSeen: '', title: '', did: '', found: '', followUp: '', session: '', prognosis: '', region: '', response: '', vasBefore: '', vasAfter: '', pain: [], notify: false, notifyText: '' });

export function supportUi(ctx) {
  const { S, esc, tag, banner, setMsg, val, render, PLATFORM, HUB_USER, FEAT, today, meName, titles } = ctx;
  S.sup ||= { reports: [], notices: [], hist: [], histAt: 0, histFor: '', draft: null, summary: null, sumFor: '', lastSaved: null, filter: '', person: '' };
  const U = S.sup;
  // Who may file (support staff, Coach Donny, Head Coach, admins) and who reads every report (the last three).
  const canFile = () => !HUB_USER || !!HUB_USER.canSupport;
  const readsAll = () => !HUB_USER || HUB_USER.roles.some((r) => ['admin', 'head_coach', 'readiness_owner'].includes(r));
  const me = () => HUB_USER?.name || meName();
  const job = () => HUB_USER?.supportJob || '';
  // V1.50 the pain map, VAS and body region belong to the physios (Coach Ilham, Coach Dewi): other accounts never get
  // them in their form, and a physio role cannot be picked by hand. Without accounts (local hub) everything shows.
  const isPhysio = () => !HUB_USER || JOBS[job()]?.disc === 'physio';
  // The unsent draft is kept per account on this device, so one person's role and rows never open in another's form.
  const draftKey = () => `${DRAFT_KEY}:${HUB_USER?.id || 'local'}`;
  // Athletes and coaches by full name (BTN TIMNAS list), plus anyone on the hub's rosters not on that list.
  const roster = () => Object.fromEntries(titles().map((t) => [t, [...new Set([...playersOf(t).map((p) => p.name), ...coachesOf(t).map((c) => c.name),
    ...(S.roster[t] || []).filter(Boolean).map((x) => fullName(t, x))])]]));
  // The group picker lists athletes only (a whole team = its players).
  const athletes = () => Object.fromEntries(titles().map((t) => [t, [...new Set([...playersOf(t).map((p) => p.name),
    ...(S.roster[t] || []).filter(Boolean).map((x) => fullName(t, x)).filter((n) => !coachesOf(t).some((c) => c.name === n))])]]));
  const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const fmtAt = (at) => { const d = new Date(at); return Number.isNaN(d.getTime()) ? String(at || '') : `${d.toLocaleString(S.lang === 'id' ? 'id-ID' : 'en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} WIB`; };

  function draft() {
    if (!U.draft) { try { U.draft = JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch { U.draft = null; } }
    if (!U.draft) U.draft = { date: today(), discipline: JOBS[job()]?.disc || '', rows: [blankRow()], general: { did: '', found: '', teams: [] }, paste: '', source: 'form' };
    // A new report always takes the account's own role; only editing a saved report keeps that report's role.
    if (!U.draft.editing) { if (job()) U.draft.discipline = JOBS[job()].disc; else if (U.draft.discipline === 'physio' && !isPhysio()) U.draft.discipline = ''; }
    U.draft.group ||= blankGroup();
    return U.draft;
  }
  const keep = () => { try { localStorage.setItem(draftKey(), JSON.stringify(U.draft)); } catch { /* per-device convenience */ } };
  // The form's values → the draft (no redraw while typing).
  function collect() {
    const d = draft(); const f = document.getElementById('supForm'); if (!f) return d;
    d.date = val('supDate') || d.date; if (document.getElementById('supDisc')) d.discipline = val('supDisc');
    d.paste = val('supPaste');
    d.rows = d.rows.map((r, i) => {
      if (!document.getElementById(`sR-${i}-did`)) return r;
      const g = (k) => val(`sR-${i}-${k}`); const c = (k) => !!document.getElementById(`sR-${i}-${k}`)?.checked;
      const pick = g('athlete'); const [t, a] = pick.includes('|') ? pick.split('|') : ['', ''];
      return { ...r, athlete: a, title: a ? t : (r.title || ''), athleteSeen: g('seen'), did: g('did'), found: g('found'), followUp: g('fu'), session: g('session'), prognosis: g('prog'),
        region: g('region'), response: g('response'), vasBefore: g('vb'), vasAfter: g('va'), notify: c('nt'), notifyText: g('ntx'),
        pain: (r.pain || []).map((x) => { const el = document.getElementById(`sR-${i}-pv-${x.p}`); return el ? { p: x.p, v: el.value } : x; }) };
    });
    if (document.getElementById('supGp')) {
      d.group = { ...d.group, picks: [...f.querySelectorAll('input[data-sup-gp]')].filter((x) => x.checked).map((x) => x.value), others: val('supGpOther'),
        did: val('supGpDid'), found: val('supGpFound'), region: val('supGpRegion'), followUp: val('supGpFu'), open: !!document.getElementById('supGp')?.open };
    }
    d.general = { did: val('supGDid'), found: val('supGFound'), teams: titles().filter((t) => document.getElementById(`supGT-${t.replace(/\W/g, '_')}`)?.checked) };
    keep(); return d;
  }

  // ---------------------------------------------------------------- the form: one row per athlete
  function form() {
    const d = draft(); const disc = d.discipline; const A = ASK[disc] || ASK.physical; const R = roster(); const phys = disc === 'physio' && (isPhysio() || !!d.editing); const psy = disc === 'psych';
    const opts = (r) => `<option value=""></option>${Object.entries(R).filter(([, xs]) => xs.length).map(([t, xs]) => `<optgroup label="${esc(t)}">${xs.map((x) => `<option value="${esc(`${t}|${x}`)}" ${r.athlete === x && r.title === t ? 'selected' : ''} data-no-tr>${esc(x)}</option>`).join('')}</optgroup>`).join('')}`;
    const ta = (id, label, v, rows = 3) => `<label class="field" for="${id}">${label}<textarea rows="${rows}" id="${id}">${esc(v)}</textarea></label>`;
    const row = (r, i) => `<div class="srow-card"><div class="srow-head"><b>Athlete ${i + 1}</b><button type="button" class="linkbtn" data-sup-del="${i}">Remove</button></div>
      <div class="srow${psy ? ' srow5' : ''}">
        <div><label class="field" for="sR-${i}-athlete">Athlete<select id="sR-${i}-athlete">${opts(r)}</select></label>
          <label class="field" for="sR-${i}-seen">Not in the list? Name and team<input type="text" id="sR-${i}-seen" value="${esc(r.athlete ? '' : r.athleteSeen)}" placeholder="e.g. Jonathan (CS2)"></label>
          ${psy ? `<label class="field" for="sR-${i}-session">Session<select id="sR-${i}-session"><option value=""></option>${SESSIONS.map((x) => `<option value="${x}" ${r.session === x ? 'selected' : ''}>${esc(SESSION_LABEL[x])}</option>`).join('')}</select></label>` : ''}</div>
        <div>${ta(`sR-${i}-did`, esc(A.did), r.did)}</div><div>${ta(`sR-${i}-found`, esc(A.found), r.found)}</div>${psy ? `<div>${ta(`sR-${i}-prog`, 'Prognosis', r.prognosis || '')}</div>` : ''}<div>${ta(`sR-${i}-fu`, esc(A.follow), followText(r.followUp))}</div>
      </div>
      <div class="srow-x">
        ${phys ? `<label class="field" for="sR-${i}-region">Body region<input type="text" id="sR-${i}-region" value="${esc(r.region)}"></label>
          <label class="field" for="sR-${i}-vb">VAS before (0–10)<input type="number" min="0" max="10" inputmode="numeric" id="sR-${i}-vb" value="${esc(r.vasBefore ?? '')}"></label>
          <label class="field" for="sR-${i}-va">VAS after (0–10)<input type="number" min="0" max="10" inputmode="numeric" id="sR-${i}-va" value="${esc(r.vasAfter ?? '')}"></label>${painPick(r, i)}` : ''}
        ${phys || disc === 'medic' ? `<label class="field" for="sR-${i}-response">Athlete response<select id="sR-${i}-response"><option value=""></option>${RESPONSES.map((x) => `<option value="${x}" ${r.response === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span><input type="checkbox" id="sR-${i}-nt" ${r.notify ? 'checked' : ''}> Tell the coach (no diagnosis)</span></label>
        <label class="field wide" for="sR-${i}-ntx">Line for the coach, if ticked<input type="text" id="sR-${i}-ntx" maxlength="200" value="${esc(r.notifyText)}" placeholder="e.g. Check with the physio before scrim"></label>
      </div></div>`;
    const G = d.group || blankGroup(); const RA = athletes();
    const painPick = (r, i) => { const on = new Set((r.pain || []).map((x) => x.p)); return `<div class="pm-field"><b>Pain map</b> <span class="note">Tap the painful spots on the front or back, then give each a pain score (0–10).</span>
      <div class="pm-pick">${bodySvg({ pain: r.pain, row: i, esc, lang: S.lang })}
      <div><label class="field" for="sR-${i}-padd">Or pick a spot<select id="sR-${i}-padd"><option value=""></option>${POINTS.filter((p) => !on.has(p.id)).map((p) => `<option value="${p.id}" data-no-tr>${esc(pointLabel(p.id, S.lang))}</option>`).join('')}</select></label>
      ${(r.pain || []).length ? `<ul class="plain pm-list">${r.pain.map((x) => `<li><span data-no-tr>${esc(pointLabel(x.p, S.lang))}</span><label class="field pm-v" for="sR-${i}-pv-${x.p}">Pain (0–10)<input type="number" min="0" max="10" inputmode="numeric" id="sR-${i}-pv-${x.p}" value="${esc(x.v ?? '')}"></label><button type="button" class="linkbtn" data-sup-pain="${i}" data-pt="${x.p}">Remove</button></li>`).join('')}</ul>` : '<p class="note">No spot picked yet.</p>'}</div></div></div>`; };
    const group = `<details class="capdump" id="supGp" ${G.open ? 'open' : ''}><summary>One session, many athletes</summary>
      <p class="note">For a group session (stretching, recovery, a team talk): tick the athletes or a whole team, write it once, then add. Each athlete gets their own row below, which you can still change (pain score, follow-up) before saving.</p>
      <div class="sup-gp">${Object.entries(RA).filter(([, xs]) => xs.length).map(([t, xs]) => `<fieldset class="objpick"><legend class="note">${esc(t)} <button type="button" class="linkbtn" data-sup-gall="${esc(t)}">${xs.every((x) => G.picks.includes(`${t}|${x}`)) ? 'Untick team' : 'Whole team'}</button></legend>
        ${xs.map((x) => `<label><input type="checkbox" data-sup-gp value="${esc(`${t}|${x}`)}" ${G.picks.includes(`${t}|${x}`) ? 'checked' : ''}> <span data-no-tr>${esc(x)}</span></label>`).join('')}</fieldset>`).join('') || '<p class="empty">No team lists in the hub yet: type the names below.</p>'}</div>
      <label class="field" for="supGpOther">Others not in the lists (name and team, comma-separated)<input type="text" id="supGpOther" value="${esc(G.others)}" placeholder="e.g. Jonathan (CS2), Rina (MLBB Women)"></label>
      <div class="srow srow3">${ta('supGpDid', esc(A.did), G.did, 2)}${ta('supGpFound', esc(A.found), G.found, 2)}${ta('supGpFu', 'Follow-up for all of them', followText(G.followUp), 2)}</div>
      ${phys ? `<label class="field" for="supGpRegion">Body region<input type="text" id="supGpRegion" value="${esc(G.region)}"></label>` : ''}
      <div class="toolbar"><span class="note">Selected:</span> <b id="supGpN">${groupCount(G)}</b><button class="btn primary" type="button" data-sup-gadd="1">Add to the report</button><span class="msg" id="supGpMsg" role="status"></span></div></details>`;
    const users = (() => { try { return usersOfDay(supportReport({ ...d, by: me() || 'x', asOf: today() })).text; } catch { return ''; } })();
    return `<div class="panel" id="supForm"><h2>${d.editing ? 'Edit report' : 'Daily report'}${job() ? ` — ${esc(JOBS[job()].label)}` : ''}</h2>
      ${d.editing ? `<p class="note draftnote">Editing the report of ${esc(d.editing.date || d.date)}. Saving keeps the old version in the edit history (who, what, date and time). <button type="button" class="linkbtn" data-sup-clear="1">Cancel editing</button></p>` : ''}
      <p class="note">Each athlete in one row: what was done, findings, follow-up. Only you, Coach Donny, the Head Coach and admins read the details${disc === 'psych' ? '' : '; the coach only gets the line you tick'}.</p>
      <div class="form"><label class="field" for="supDate">Date<input type="date" id="supDate" value="${esc(d.date)}" max="${today()}"></label>
        ${job() ? '' : `<label class="field" for="supDisc">Your role<select id="supDisc"><option value=""></option>${DISCS.filter((x) => x !== 'physio' || isPhysio()).map((x) => `<option value="${x}" ${disc === x ? 'selected' : ''}>${esc(DISC_LABEL[x])}</option>`).join('')}</select></label>`}</div>
      ${d.editing ? '' : `<details class="capdump" ${d.rows.some((r) => r.found || r.did) ? '' : 'open'}><summary>Paste from WhatsApp: the AI fills the form</summary>
        <p class="note">Paste the message you send to the group. The AI only moves your own words into the fields; check them, then save. The text is sent to the AI service to be read.</p>
        <label class="field" for="supPaste">Your WhatsApp report<textarea id="supPaste" rows="6">${esc(d.paste || '')}</textarea></label>
        <div class="toolbar">${FEAT.ai && FEAT.supportAi && PLATFORM?.ai ? '<button class="btn" type="button" data-sup-parse="1">Fill the form (AI)</button>' : '<span class="note">AI reading switches on with the next AI update; type the form below meanwhile.</span>'}<span class="msg" id="supPMsg" role="status"></span></div></details>`}
      ${d.editing ? '' : carryOver()}
      ${disc ? `${d.editing ? '' : group}${d.rows.map(row).join('')}<div class="toolbar"><button class="btn" type="button" data-sup-add="1">+ Add athlete</button></div>
      <div class="h3">For a whole team or the session (optional)</div>
      <div class="form"><label class="field wide" for="supGDid">What was done<textarea rows="2" id="supGDid">${esc(d.general.did)}</textarea></label>
        <label class="field wide" for="supGFound">Findings<textarea rows="2" id="supGFound">${esc(d.general.found)}</textarea></label></div>
      <fieldset class="objpick"><legend class="note">Teams</legend>${titles().map((t) => `<label><input type="checkbox" id="supGT-${t.replace(/\W/g, '_')}" ${d.general.teams.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</fieldset>
      <p class="note"><b>Seen today:</b> <span id="supUsers">${esc(users)}</span></p>
      <div class="toolbar"><button class="btn primary" type="button" data-sup-save="1">${d.editing ? 'Save changes' : 'Save report'}</button>${U.lastSaved && !d.editing ? '<button class="btn" type="button" data-sup-wa="1">Copy for WhatsApp</button>' : ''}${d.editing ? '' : '<button class="btn" type="button" data-sup-clear="1">Clear form</button>'}<span class="msg" id="supMsg" role="status"></span></div>`
    : '<p class="empty">Pick your role first (an admin can set it for you in Users & access).</p>'}</div>`;
  }

  // V1.46 follow-ups that carry over: my open follow-ups of the last 14 days, at the top of the next report.
  // Done closes it on the report it came from (kept in the edit history); "Add to today" puts the athlete in today's report.
  const myOpen = () => openFollowUps(U.reports, shift(today(), -13), today(), me());
  function carryOver() {
    const list = myOpen(); if (!list.length) return '';
    const d = draft(); const inToday = new Set(d.rows.map((r) => `${r.title}|${r.athlete || r.athleteSeen}`));
    return `<div class="carry"><div class="h3">Still open from earlier (${list.length})</div><p class="note">Your follow-ups from the last 14 days. Tick Done when it is finished; a newer report on the same athlete also closes it.</p>
      <ul class="plain carry-list">${list.map((f) => `<li><div><b data-no-tr>${esc(f.athlete)}</b> <span class="note">${esc(f.title || '')} · ${esc(dm(f.date))}</span></div><div data-no-tr>${esc(f.text)}</div>
        <div class="carry-act"><button type="button" class="btn small" data-sup-fudone="${esc(`${f.reportId}#${f.i}`)}">Done</button>${inToday.has(`${f.title}|${f.athlete}`) ? '<span class="note">in today\'s report</span>' : `<button type="button" class="btn small" data-sup-fuadd="${esc(`${f.reportId}#${f.i}`)}">Add to today</button>`}</div></li>`).join('')}</ul>
      <span class="msg" id="supFuMsg" role="status"></span></div>`;
  }

  // ---------------------------------------------------------------- a saved report: the same row, read-only
  const canEdit = (r) => readsAll() || (canFile() && r.by === me());
  function editBadge(r) {
    const h = historyOf(U.hist, r.id, 'support'); if (!h.length) return '';
    const last = h.at(-1);
    return `<button type="button" class="linkbtn" data-sup-hist="${esc(r.id)}">${tag('c-Medium', `Edited ${h.length}× · last by ${last.by || '—'}, ${fmtAt(last.at)}`)}</button>`;
  }
  function card(r) {
    const A = ASK[r.discipline] || ASK.physical;
    const psy = r.discipline === 'psych';
    const extra = (x) => [!psy && x.session && SESSION_LABEL[x.session], !psy && x.prognosis && `Prognosis: ${x.prognosis}`, x.region && `Body region: ${x.region}`, (x.pain || []).length && `Pain spots: ${painText(x.pain, S.lang)}`,
      x.vasBefore != null && `VAS ${x.vasBefore} → ${x.vasAfter ?? '?'}`, x.response && `Response: ${x.response}`, x.notify && `To the coach: ${x.notifyText}`].filter(Boolean);
    return `<div class="obj"><header><div><span class="note">${esc(r.date)} · ${esc(DISC_LABEL[r.discipline])} · <span data-no-tr>${esc(r.by)}</span>${r.source === 'whatsapp' ? ' · from WhatsApp' : ''}</span><h3>${esc(usersOfDay(r).text)}</h3></div>
      <div class="toolbar">${editBadge(r)}${canEdit(r) && S.mode !== 'demo' ? `<button type="button" class="btn" data-sup-edit="${esc(r.id)}">Edit</button>` : ''}</div></header>
      ${r.rows.length ? `<div class="srow srow-h${psy ? ' srow5' : ''}"><div>Athlete</div><div>${esc(A.did)}</div><div>${esc(A.found)}</div>${psy ? '<div>Prognosis</div>' : ''}<div>${esc(A.follow)}</div></div>
      ${r.rows.map((x) => `<div class="srow srow-v${psy ? ' srow5' : ''}"><div><b data-no-tr>${esc(x.athlete)}</b>${x.title ? `<br><span class="note">${esc(x.title)}</span>` : ''}${psy && x.session ? `<br>${tag('c-Medium', SESSION_LABEL[x.session])}` : ''}</div>
        <div data-no-tr>${esc(x.did || '—')}</div><div data-no-tr>${esc(x.found || '—')}</div>${psy ? `<div data-no-tr>${esc(x.prognosis || '—')}</div>` : ''}<div data-no-tr>${esc(followText(x.followUp) === 'Yes' ? (S.lang === 'id' ? 'Ya' : 'Yes') : (followText(x.followUp) || '—'))}${x.fuDone ? `<br>${tag('c-Verified', `done ${esc(String(x.fuDone.at).slice(0, 10))}`)}` : ''}</div></div>
        ${extra(x).length ? `<p class="note srow-xv">${extra(x).map((e) => `<span>${esc(e)}</span>`).join(' · ')}</p>` : ''}${(x.pain || []).length ? `<div class="pm-mini">${bodySvg({ pain: x.pain, esc, lang: S.lang, small: true })}</div>` : ''}`).join('')}` : ''}
      ${r.general.did || r.general.found ? `<p><b>Team${r.general.teams.length ? ` (${esc(r.general.teams.join(', '))})` : ''}</b><br><span data-no-tr>${esc([r.general.did, r.general.found].filter(Boolean).join(' — '))}</span></p>` : ''}</div>`;
  }
  function historyOverlay() {
    if (!U.histFor) return '';
    const r = U.reports.find((x) => x.id === U.histFor); const h = historyOf(U.hist, U.histFor, 'support');
    return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="supHistT"><div class="overlay-box">
      <div class="overlay-head"><b id="supHistT">Edit history</b><button type="button" class="linkbtn" data-sup-histx="1" aria-label="Close">✕</button></div>
      ${r ? `<p class="note">${esc(r.date)} · ${esc(DISC_LABEL[r.discipline])} · <span data-no-tr>${esc(r.by)}</span></p>` : ''}
      ${[...h].reverse().map((e) => `<div class="hist"><p class="note">${esc(fmtAt(e.at))} · <span data-no-tr>${esc(e.by || '—')}</span></p>
        ${e.changes.map((c) => `<p>${esc(c.field)}: ${c.before ? `<s class="note" data-no-tr>${esc(c.before)}</s> → ` : `<span class="note">(empty)</span> → `}<span data-no-tr>${esc(c.after || '—')}</span></p>`).join('')}</div>`).join('')}
      ${r ? `<div class="hist"><p class="note">${esc(fmtAt(r.createdAt))} · <span data-no-tr>${esc(r.by)}</span></p><p class="note">Report created</p></div>` : ''}
      <p class="note">Recorded by the database at every save: it cannot be changed or deleted.</p></div></div>`;
  }

  // ---------------------------------------------------------------- V1.49 the weekly view, rebuilt for phones
  // Staff: the week as seven tiles and one line, then today's report, then the history (folded).
  // Coach Donny, the Head Coach and admins: three blocks, most urgent first — to check, today, this week — then the
  // history and (folded) their own report. Counts only in every WhatsApp copy.
  const T = (en, id) => (S.lang === 'id' ? id : en);
  const DAYS = { en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], id: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] };
  const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] };
  const L = () => (S.lang === 'id' ? 'id' : 'en');
  const dm = (d) => `${Number(d.slice(8))} ${MON[L()][Number(d.slice(5, 7)) - 1]}`;
  const span = (a, b) => (a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8))}–${dm(b)}` : `${dm(a)} – ${dm(b)}`);
  const delta = (a, b) => { const x = a - b; return x > 0 ? `<span class="up">+${x}</span>` : x < 0 ? `<span class="down">−${-x}</span>` : '<span class="note">=</span>'; };
  const weekOff = () => Math.min(0, U.week || 0);
  function weekNav(w, off) {
    return `<div class="sw-nav" data-no-tr><button type="button" class="sw-arrow" data-sup-week="${off - 1}" aria-label="${esc(T('Week before', 'Minggu sebelumnya'))}">‹</button>
      <div class="sw-when"><b>${esc(span(w.from, w.to))}</b>${off === 0 ? `<span class="sw-pill">${esc(T('This week', 'Minggu ini'))}</span>` : `<button type="button" class="linkbtn" data-sup-week="0">${esc(T('Back to this week', 'Kembali ke minggu ini'))}</button>`}</div>
      <button type="button" class="sw-arrow" data-sup-week="${off + 1}" aria-label="${esc(T('Next week', 'Minggu berikutnya'))}" ${off >= 0 ? 'disabled' : ''}>›</button></div>`;
  }
  // V1.50 "My week": the seven tiles, then the recap — days reported, athletes handled, visits (each with the change
  // from the week before), follow-ups written / closed / still open, the role's own numbers, per team and who came
  // back most. Their own reports only. The WhatsApp copy holds counts only.
  function myWeek() {
    const off = weekOff(); const w = calWeek(today(), off); const mine = U.reports.filter((r) => r.by === me()); const t0 = today();
    const rc = myRecap(U.reports, me(), w); const c = rc.cur; const p = rc.prev; const open = off === 0 ? myOpen().length : null;
    const disc = JOBS[job()]?.disc || c.disc || '';
    const tile = (d, i) => { const n = mine.filter((r) => r.date === d).length; const st = d > t0 ? 'future' : n ? 'on' : d === t0 ? 'today' : 'off';
      return `<button type="button" class="sw-day ${st}" data-sup-day="${esc(d)}" aria-pressed="${U.day === d}" ${d > t0 ? 'disabled' : ''} title="${esc(d)}"><span>${esc(DAYS[L()][i])}</span><b>${Number(d.slice(8))}</b></button>`; };
    const kpi = (k, a, b, of) => `<div class="sw-kpi"><span class="k">${esc(k)}</span><span class="v">${a}${of ? `<small>/${of}</small>` : ''}</span><span class="d">${b == null ? '&nbsp;' : delta(a, b)}</span></div>`;
    const lines = [
      c.followUps || c.closed || open ? T(`Follow-ups: ${c.followUps} written · ${c.closed} closed${open != null ? ` · ${open} still open` : ''}`, `Tindak lanjut: ${c.followUps} dibuat · ${c.closed} selesai${open != null ? ` · ${open} masih terbuka` : ''}`) : '',
      disc === 'physio' && c.vasN ? T(`Pain down ${c.vasDrop} on average (${c.vasN} treatments)${c.responded ? ` · better ${c.better}/${c.responded}` : ''}`, `Nyeri turun rata-rata ${c.vasDrop} (${c.vasN} terapi)${c.responded ? ` · membaik ${c.better}/${c.responded}` : ''}`) : '',
      disc === 'medic' && c.responded ? T(`Better after treatment: ${c.better}/${c.responded}`, `Membaik setelah penanganan: ${c.better}/${c.responded}`) : '',
      disc === 'psych' && c.formal + c.informal ? T(`Sessions: ${c.formal} formal · ${c.informal} informal`, `Sesi: ${c.formal} formal · ${c.informal} informal`) : '',
      Object.keys(c.teams).length ? `${T('Per team', 'Per tim')}: ${Object.entries(c.teams).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(' · ')}` : '',
      c.regulars.length ? `${T('Seen most', 'Paling sering')}: ${c.regulars.slice(0, 4).map((a) => `${a.athlete} ${a.n}×`).join(' · ')}` : '',
    ].filter(Boolean);
    return `<div class="panel sw"><p class="note sw-who"><span>Support staff</span>${job() ? ` · <span>${esc(JOBS[job()].label)}</span>` : ''}</p>${weekNav(w, off)}
      <div class="sw-days">${w.days.map(tile).join('')}</div>
      <div class="h3 sw-rh" data-no-tr>${esc(off === 0 ? T('My week so far', 'Rekap minggu saya') : T('My recap of that week', 'Rekap minggu itu'))}</div>
      <div class="sw-kpis" data-no-tr>${kpi(T('Days reported', 'Hari lapor'), c.days, null, 7)}${kpi(T('Athletes handled', 'Atlet ditangani'), c.athletes, p.athletes)}${kpi(T('Visits', 'Kunjungan'), c.visits, p.visits)}</div>
      ${c.reports ? `<p class="note sw-vs" data-no-tr>${esc(T('Small numbers: change from the week before. Each athlete counts once; a visit is each time you saw them.', 'Angka kecil: perubahan dari minggu lalu. Atlet dihitung sekali; kunjungan = setiap kali ditangani.'))}</p>
      ${lines.length ? `<ul class="plain sw-recap" data-no-tr>${lines.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="toolbar"><button class="btn" type="button" data-sup-mywa="1">${esc(T('Copy my recap for WhatsApp', 'Salin rekap saya untuk WA'))}</button><span class="msg" id="supMyMsg" role="status"></span></div>`
        : `<p class="note" data-no-tr>${esc(off === 0 ? T('No report yet this week: your recap fills in as you save reports.', 'Belum ada laporan minggu ini: rekap terisi otomatis setiap kali laporan disimpan.') : T('No report that week.', 'Tidak ada laporan minggu itu.'))}</p>`}</div>`;
  }
  // ---- Coach Donny, Head Coach, admins: 1 to check · 2 today · 3 this week
  function checkBlock() {
    const list = readinessList(U.reports, today(), 14); const toGo = Math.round((Date.parse(EVENT.start) - Date.parse(today())) / 86400000);
    const cls = { pain: 'c-Blocked', worse: 'c-Blocked', repeat: 'c-Medium', 'follow-up': 'c-Medium' };
    const row = (a) => `<li><b data-no-tr>${esc(a.athlete)}</b>${a.title ? ` <span class="note">${esc(a.title)}</span>` : ''} ${a.why.map((x) => tag(cls[x.kind], x.text)).join(' ')} <span class="note" data-no-tr>${esc(T(`last seen ${dm(a.last)}`, `terakhir ${dm(a.last)}`))}</span></li>`;
    return `<div class="panel sw"><h2 data-no-tr>${esc(T(`To check${list.length ? ` (${list.length})` : ''}`, `Perlu dicek${list.length ? ` (${list.length})` : ''}`))}${toGo > 0 ? ` <span class="note">${esc(T(`${toGo} days to WEC`, `${toGo} hari lagi ke WEC`))}</span>` : ''}</h2>
      ${list.length ? `<ul class="plain sw-check">${list.slice(0, 6).map(row).join('')}</ul>${list.length > 6 ? `<details class="sw-more"><summary data-no-tr>${esc(T(`${list.length - 6} more`, `${list.length - 6} lainnya`))}</summary><ul class="plain sw-check">${list.slice(6, 30).map(row).join('')}</ul></details>` : ''}`
        : `<p class="note" data-no-tr>${esc(T('Nobody to check from the last 14 days of reports.', 'Tidak ada yang perlu dicek dari laporan 14 hari terakhir.'))}</p>`}
      <p class="note">${esc(T(`Last 14 days: pain ${HIGH_VAS}/10 or more, worse after treatment, ${REPEAT_AT}+ visits, or a follow-up still open.`, `14 hari terakhir: nyeri ${HIGH_VAS}/10 atau lebih, memburuk setelah terapi, ${REPEAT_AT}+ kunjungan, atau tindak lanjut masih terbuka.`))}</p></div>`;
  }
  function todayBlock() {
    const staff = staffList(); const t = reportedOn(staff, U.reports, today()); const y = reportedOn(staff, U.reports, shift(today(), -1));
    const total = t.done.length + t.missing.length;
    const chip = (x, on) => `<span class="namechip ${on ? 'in' : 'out'}"><span data-no-tr>${esc(x.name)}</span>${x.job && JOBS[x.job] ? ` <span class="note">${esc(JOBS[x.job].label)}</span>` : ''}</span>`;
    return `<div class="panel sw"><h2 data-no-tr>${esc(T(`Today: ${t.done.length} of ${total} reported`, `Hari ini: ${t.done.length} dari ${total} melapor`))}</h2>
      ${total ? `<div class="namechips">${t.done.map((x) => chip(x, true)).join('')}${t.missing.map((x) => chip(x, false)).join('')}</div>` : `<p class="note" data-no-tr>${esc(T('No support staff accounts yet.', 'Belum ada akun tim support.'))}</p>`}
      ${y.missing.length ? `<p class="note" data-no-tr>${esc(T(`Yesterday no report from: ${y.missing.map((x) => x.name).join(', ')}.`, `Kemarin tidak ada laporan dari: ${y.missing.map((x) => x.name).join(', ')}.`))}</p>` : ''}
      ${t.missing.length ? `<div class="toolbar"><button class="btn" type="button" data-sup-remind="1">${esc(T('Send a WhatsApp reminder', 'Kirim pengingat WA'))}</button><span class="msg" id="supRemMsg" role="status"></span></div>` : ''}</div>`;
  }
  function weekBlock() {
    const off = weekOff(); const w = calWeek(today(), off); const t0 = today();
    const cur = summarize(anonymise(U.reports, w.from, w.to)); const prev = summarize(anonymise(U.reports, w.prevFrom, w.prevTo));
    const grid = weekGrid(U.reports, w);
    const kpi = (k, a, b) => `<div class="sw-kpi"><span class="k">${esc(k)}</span><span class="v">${a}</span><span class="d">${delta(a, b)}</span></div>`;
    const dots = (g) => `<span class="dots" aria-label="${esc(T(`${g.daysReported} of 7 days`, `${g.daysReported} dari 7 hari`))}">${g.days.map((n, i) => `<i class="${w.days[i] > t0 ? 'future' : n != null ? 'on' : w.days[i] === t0 ? 'today' : ''}" title="${esc(`${DAYS[L()][i]} ${dm(w.days[i])}${n != null ? `: ${n}` : ''}`)}"></i>`).join('')}</span>`;
    const roleLine = (d) => { const s = summarize(anonymise(U.reports.filter((r) => r.discipline === d), w.from, w.to)); const b = cur.byDisc[d];
      const x = d === 'physio' && s.vasN ? T(` · pain −${s.vasDrop}, better ${s.better}/${s.responded}`, ` · nyeri −${s.vasDrop}, membaik ${s.better}/${s.responded}`) : d === 'psych' && s.formal + s.informal ? ` · formal ${s.formal} / informal ${s.informal}` : '';
      return `<li><b>${esc(DISC_LABEL[d])}</b> <span class="note" data-no-tr>${esc(T(`${b.reports} reports · ${b.athletes} athletes${x}`, `${b.reports} laporan · ${b.athletes} atlet${x}`))}</span></li>`; };
    const roles = DISCS.filter((d) => cur.byDisc[d].reports);
    const edits = U.hist.filter((h) => String(h.at).slice(0, 10) >= w.from && String(h.at).slice(0, 10) <= w.to).map((h) => ({ h, r: U.reports.find((x) => x.id === h.record_id) })).filter((x) => x.r);
    return `<div class="panel sw">${weekNav(w, off)}
      <div class="sw-kpis" data-no-tr>${kpi(T('Reports', 'Laporan'), cur.reports, prev.reports)}${kpi(T('Athletes', 'Atlet'), cur.seen, prev.seen)}${kpi(T('Follow-ups', 'Tindak lanjut'), cur.followUps, prev.followUps)}</div><p class="note sw-vs" data-no-tr>${esc(T('Small numbers: change from the week before.', 'Angka kecil: perubahan dari minggu lalu.'))}</p>
      ${grid.length ? `<ul class="plain sw-people">${grid.map((g) => `<li><span><b data-no-tr>${esc(g.by)}</b> <span class="note">${esc(JOBS[g.job]?.label || DISC_LABEL[g.disc])}</span></span><span class="sw-p-right">${dots(g)}<span class="note">${g.daysReported}/7</span></span></li>`).join('')}</ul>`
        : `<p class="empty" data-no-tr>${esc(T('No report this week.', 'Belum ada laporan minggu ini.'))}</p>`}
      ${roles.length ? `<ul class="plain sw-roles">${roles.map(roleLine).join('')}</ul>` : ''}
      ${Object.keys(cur.byTitle).length ? `<p class="note" data-no-tr>${esc(T('Per team', 'Per tim'))}: ${Object.entries(cur.byTitle).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${esc(t)} ${n}`).join(' · ')}</p>` : ''}
      ${painCounts(U.reports, w.from, w.to).total ? `<details class="sw-more"><summary data-no-tr>${esc(T('Pain spots this week', 'Titik nyeri minggu ini'))}</summary>${painPanel(U.reports, w)}</details>` : ''}
      ${edits.length ? `<details class="sw-more"><summary data-no-tr>${esc(T(`Edited after saving (${edits.length})`, `Diedit setelah disimpan (${edits.length})`))}</summary><ul class="plain">${edits.slice(0, 15).map(({ h, r }) => `<li><button type="button" class="linkbtn" data-sup-hist="${esc(r.id)}">${esc(fmtAt(h.at))}</button> · <span data-no-tr>${esc(h.editor_name || '—')}</span> · ${esc(r.date)} (<span data-no-tr>${esc(r.by)}</span>)</li>`).join('')}</ul></details>` : ''}
      ${cur.reports ? `<div class="toolbar"><button class="btn" type="button" data-sup-wkwa="all">${esc(T('Copy the week for WhatsApp', 'Salin rekap minggu untuk WA'))}</button><span class="msg" id="supWkMsg"></span></div>` : ''}</div>`;
  }
  // Who is on the support staff: the support accounts (Users & access → Support staff job); without that list, whoever
  // filed in the last 14 days.
  function staffList() {
    const acc = (PLATFORM?.actionOwners || []).filter((p) => p.supportJob).map((p) => ({ name: p.name, job: p.supportJob }));
    if (acc.length) return acc;
    const seen = {}; for (const r of U.reports.filter((x) => x.date >= shift(today(), -13))) { const p = (seen[r.by] ||= { name: r.by, job: r.job || '', since: r.date }); if (r.date < p.since) p.since = r.date; }
    return Object.values(seen);
  }
  // Pain spots reported in the week (physio): a map with bigger dots where more athletes hurt, and the top spots per team.
  function painPanel(reports, w) {
    const c = painCounts(reports, w.from, w.to); if (!c.total) return '';
    return `<div class="pm-pick">${bodySvg({ counts: Object.fromEntries(c.top), esc, lang: S.lang, small: true })}
      <ul class="plain">${c.top.slice(0, 6).map(([p, n]) => `<li><span data-no-tr>${esc(pointLabel(p, S.lang))}</span> <b>${n}×</b></li>`).join('')}
      ${Object.entries(c.byTitle).map(([t, xs]) => `<li class="note">${esc(t)}: <span data-no-tr>${esc(xs.slice(0, 3).map(([p, n]) => `${pointLabel(p, S.lang)} ${n}×`).join(', '))}</span></li>`).join('')}</ul></div>`;
  }
  // The history: 14 days, or one day picked on the week strip. Folded unless a day is picked.
  function reportList(list, filter) {
    const f = U.filter; const p = U.person; const people = [...new Set(list.map((r) => r.by))];
    const shown = list.filter((r) => (!f || r.discipline === f) && (!p || r.by === p) && (!U.day || r.date === U.day)).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const title = U.day ? T(`Reports of ${dm(U.day)}`, `Laporan ${dm(U.day)}`) : T(`History, 14 days (${list.length})`, `Riwayat 14 hari (${list.length})`);
    return `<details class="panel sw-fold" ${U.day || U.histOpen ? 'open' : ''} data-sup-histfold="1"><summary data-no-tr>${esc(title)}</summary>
      ${U.day ? `<p><button type="button" class="linkbtn" data-sup-day="">${esc(T('Show all 14 days', 'Tampilkan semua 14 hari'))}</button></p>` : ''}
      ${filter ? `<nav class="subnav" aria-label="Role">${['', ...DISCS].map((d) => `<button type="button" data-sup-filter="${d}" aria-pressed="${f === d}">${esc(d ? DISC_LABEL[d] : 'All')}</button>`).join('')}</nav>
      ${people.length > 1 ? `<nav class="subnav" aria-label="Staff">${['', ...people].map((x) => `<button type="button" data-sup-person="${esc(x)}" aria-pressed="${p === x}">${x ? `<span data-no-tr>${esc(x)}</span>` : 'Everyone'}</button>`).join('')}</nav>` : ''}` : ''}
      ${shown.length ? shown.slice(0, 40).map(card).join('') : `<p class="empty" data-no-tr>${esc(T('No report.', 'Tidak ada laporan.'))}</p>`}</details>`;
  }

  // ---------------------------------------------------------------- page, notices, dashboard line
  async function loadHistory(force = false) {
    if (!S.db?.history || (!force && Date.now() - U.histAt < 60000)) return;
    U.histAt = Date.now();
    try { U.hist = await S.db.history('support_reports'); render(); } catch { /* history not available yet */ }
  }
  function page() {
    if (S.mode === 'demo') return '<div class="panel"><p class="empty">Support staff reports use operational records only.</p></div>';
    if (HUB_USER && !FEAT.support) return `<div class="panel">${banner('warn', '<div>Support staff reports switch on after the V1.34 database update.</div>')}</div>`;
    if (canFile()) setTimeout(() => loadHistory(), 0);
    const recent = U.reports.filter((r) => r.date >= shift(today(), -13));
    // V1.49: most urgent first. The readers' own report form is folded (they rarely file); staff open on their form.
    if (readsAll()) {
      const d = draft(); const busy = !!d.editing || d.rows.some((r) => !isBlankRow(r));
      return `<div class="sw-page">${checkBlock()}${ctx.wearPanel?.() || ''}${weekOff() === 0 ? todayBlock() : ''}${weekBlock()}${reportList(recent, true)}
        ${canFile() ? `<details class="panel sw-fold" ${busy ? 'open' : ''}><summary data-no-tr>${esc(d.editing ? T('Edit report', 'Ubah laporan') : T('File my own report', 'Isi laporan saya'))}</summary>${form()}</details>` : ''}${historyOverlay()}</div>`;
    }
    if (canFile()) return `<div class="sw-page">${myWeek()}${form()}${reportList(recent.filter((r) => r.by === me()), false)}${historyOverlay()}</div>`;
    return `<div class="panel"><p class="note">The support staff reports are read by the support staff themselves, Coach Donny, the Head Coach and admins.</p></div>`;
  }
  // Main dashboard: one numbers-only line (leadership, Coach Donny, Head Coach, admins).
  function overviewLine() {
    if (!S.db?.supportSummary || !(readsAll() || HUB_USER?.roles?.includes('leadership'))) return '';
    if (!U.summary) { setTimeout(loadSummary, 0); return ''; }
    if (U.summary.error || !U.summary.cur) return '';
    const c = summarize({ reports: (U.summary.cur.reports || []).map((r) => ({ day: String(r.day), disc: r.disc })), rows: (U.summary.cur.rows || []).map((r) => ({ ...r, day: String(r.day) })), repeat: Number(U.summary.cur.repeat) || 0 });
    return `<div class="panel"><h2>Support staff this week</h2><p>${c.reports} report(s) · ${c.seen} athlete visit(s) · ${c.followUps} follow-up(s) · ${c.repeat} athlete(s) seen ${REPEAT_AT}+ times</p><p class="note">Counts only; the details stay with the support staff, Coach Donny, the Head Coach and admins.</p></div>`;
  }
  async function loadSummary() {
    const w = weekRange(today()); const key = `${w.from}|${w.to}`; if (U.sumFor === key || !S.db?.supportSummary) return;
    U.sumFor = key;
    try { const [c, p] = await Promise.all([S.db.supportSummary(w.from, w.to), S.db.supportSummary(w.prevFrom, w.prevTo)]); U.summary = { cur: c, prev: p }; } catch { U.summary = { error: true }; }
    render();
  }
  // Title coaches: the neutral lines the staff chose to send (last 3 days).
  function noticesPanel(myTitles) {
    const since = shift(today(), -2); const list = U.notices.filter((n) => n.date >= since && myTitles.includes(n.title)).sort((a, b) => b.date.localeCompare(a.date));
    return list.length ? `<div class="panel"><h2>From the support staff</h2><ul class="plain">${list.map((n) => `<li><b data-no-tr>${esc(n.athlete || n.title)}</b> <span class="note">${esc(n.title)} · ${esc(n.date)} · <span data-no-tr>${esc(n.by)}</span></span> — <span data-no-tr>${esc(n.text)}</span></li>`).join('')}</ul></div>` : '';
  }
  function subscribe(db) {
    if (!FEAT.support) return;
    if (canFile()) db.collection('support_reports').onSnapshot((snap) => { U.reports = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); U.histAt = 0; render(); }, () => {});
    db.collection('support_notices').onSnapshot((snap) => { U.notices = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
  }

  // ---------------------------------------------------------------- events
  async function onClick(t) {
    const ds = t.dataset;
    if (ds.supAdd) { const d = collect(); d.rows.push(blankRow()); keep(); render(); return true; }
    if ('supPain' in ds && ds.pt) {
      const d = collect(); const r = d.rows[Number(ds.supPain)]; if (!r) return true;
      r.pain = (r.pain || []).some((x) => x.p === ds.pt) ? r.pain.filter((x) => x.p !== ds.pt) : [...(r.pain || []), { p: ds.pt, v: '' }];
      keep(); render(); return true;
    }
    if ('supDel' in ds) { const d = collect(); d.rows.splice(Number(ds.supDel), 1); if (!d.rows.length) d.rows.push(blankRow()); keep(); render(); return true; }
    if ('supGall' in ds) {
      const d = collect(); const tt = ds.supGall; const keys = (athletes()[tt] || []).map((x) => `${tt}|${x}`);
      const all = keys.every((k) => d.group.picks.includes(k));
      d.group.picks = all ? d.group.picks.filter((k) => !keys.includes(k)) : [...new Set([...d.group.picks, ...keys])];
      d.group.open = true; keep(); render(); return true;
    }
    if (ds.supGadd) {
      const d = collect();
      try {
        const rows = groupRows(d.group); const had = new Set(d.rows.map((r) => `${r.title}|${r.athlete || r.athleteSeen}`));
        const fresh = rows.filter((r) => !had.has(`${r.title}|${r.athlete || r.athleteSeen}`));
        const next = [...d.rows.filter((r) => !isBlankRow(r)), ...fresh];
        if (next.length > 40) throw new Error('40 athletes at most per report: save this one, then start a new report.');
        d.rows = next;
        d.group = { ...blankGroup(), open: false }; keep(); render();
        setMsg('supMsg', `${fresh.length} athlete(s) added from the group session.${rows.length - fresh.length ? ` ${rows.length - fresh.length} were already in the report.` : ''} Check, then save.`, 'ok');
      } catch (err) { setMsg('supGpMsg', err.message, 'err'); }
      return true;
    }
    if (ds.supFudone || ds.supFuadd) {
      const [id, n] = String(ds.supFudone || ds.supFuadd).split('#'); const r = U.reports.find((x) => x.id === id); const x = r?.rows?.[Number(n)];
      if (!x) return true;
      if (ds.supFuadd) {
        // A name typed by hand (not on the team lists) goes back in the "Not in the list?" box, as it was written.
        const known = (roster()[x.title] || []).includes(x.athlete);
        const d = collect(); d.rows = [...d.rows.filter((y) => !isBlankRow(y)), { ...blankRow(), ...(known ? { athlete: x.athlete } : { athleteSeen: x.athleteSeen || x.athlete }), title: x.title }];
        keep(); render(); setMsg('supMsg', `${x.athlete} added to today's report: write what was done and the findings.`, 'ok'); return true;
      }
      try {
        const next = closeFollowUp(r, Number(n), me());
        if (S.db) await S.db.collection('support_reports').doc(r.id).set(next);
        U.reports[U.reports.indexOf(r)] = next; render();
        setMsg('supFuMsg', `Follow-up for ${x.athlete} marked done.`, 'ok');
      } catch (err) { setMsg('supFuMsg', err.message, 'err'); }
      return true;
    }
    if (ds.supRemind) {
      const t = reportedOn(staffList(), U.reports, today());
      try { await navigator.clipboard.writeText(reminderText(t, S.lang)); setMsg('supRemMsg', 'Copied: paste it in the WhatsApp group.', 'ok'); } catch { setMsg('supRemMsg', 'Copy did not work on this device.', 'err'); }
      return true;
    }
    if (ds.supClear) { U.draft = null; try { localStorage.removeItem(draftKey()); } catch { /* */ } draft(); render(); return true; }
    if ('supWeek' in ds) { U.week = Math.min(0, Number(ds.supWeek) || 0); U.day = ''; render(); return true; }
    if (ds.supMywa) {
      const w = calWeek(today(), Math.min(0, U.week || 0));
      const text = recapText(myRecap(U.reports, me(), w), w, me(), S.lang);
      try { await navigator.clipboard.writeText(text); setMsg('supMyMsg', 'Copied: counts only, no athlete names.', 'ok'); } catch { setMsg('supMyMsg', 'Copy did not work on this device.', 'err'); }
      return true;
    }
    if (ds.supWkwa) {
      const list = ds.supWkwa === 'all' && readsAll() ? U.reports : U.reports.filter((r) => r.by === me());
      const w = calWeek(today(), Math.min(0, U.week || 0));
      const text = weekText(summarize(anonymise(list, w.from, w.to)), summarize(anonymise(list, w.prevFrom, w.prevTo)), w, S.lang);
      try { await navigator.clipboard.writeText(text); setMsg('supWkMsg', 'Copied: paste it in the WhatsApp group.', 'ok'); } catch { setMsg('supWkMsg', 'Copy did not work on this device.', 'err'); }
      return true;
    }
    if ('supDay' in ds) { U.day = ds.supDay && U.day !== ds.supDay ? ds.supDay : ''; render(); return true; }
    if ('supFilter' in ds) { U.filter = ds.supFilter; render(); return true; }
    if ('supPerson' in ds) { U.person = ds.supPerson; render(); return true; }
    if (ds.supHist) { U.histFor = ds.supHist; await loadHistory(true); render(); return true; }
    if (ds.supHistx) { U.histFor = ''; render(); return true; }
    if (ds.supEdit) {
      const r = U.reports.find((x) => x.id === ds.supEdit); if (!r) return true;
      U.draft = { date: r.date, discipline: r.discipline, rows: r.rows.map((x) => ({ ...blankRow(), ...x, followUp: followText(x.followUp), vasBefore: x.vasBefore ?? '', vasAfter: x.vasAfter ?? '' })),
        general: { ...r.general }, paste: '', source: r.source, group: blankGroup(), editing: { id: r.id, createdAt: r.createdAt, by: r.by, job: r.job, date: r.date } };
      keep(); render(); document.getElementById('supForm')?.scrollIntoView?.({ block: 'start' }); return true;
    }
    if (ds.supParse) {
      const d = collect(); if (!d.paste.trim()) { setMsg('supPMsg', 'Paste the report first.', 'err'); return true; }
      setMsg('supPMsg', 'Reading… (5–15 s)');
      try {
        const out = await PLATFORM.ai.call({ action: 'support_parse', text: d.paste, roster: roster(), discipline: d.discipline || JOBS[job()]?.disc || '' });
        const p = fromParse(out.raw, roster());
        Object.assign(d, { discipline: d.discipline || (p.discipline === 'physio' && !isPhysio() ? '' : p.discipline), date: p.date && p.date <= today() ? p.date : d.date, rows: p.rows.length ? p.rows : d.rows, general: (p.general.did || p.general.found) ? p.general : d.general, source: 'whatsapp' });
        keep(); render();
        setMsg('supPMsg', `${p.rows.length} athlete(s) filled.${p.unmatched.length ? ` Not in the roster: ${p.unmatched.join(', ')} — pick them or keep the name.` : ''}${p.notes ? ` ${p.notes}` : ''} Check, then save.`, 'ok');
      } catch (err) { setMsg('supPMsg', err.message, 'err'); }
      return true;
    }
    if (ds.supSave) {
      const d = collect(); const ed = d.editing;
      try {
        const made = supportReport({ ...d, job: ed?.job ?? job(), by: ed?.by || me(), asOf: today() });
        const r = ed ? { ...made, id: ed.id, createdAt: ed.createdAt, editedAt: new Date().toISOString() } : made;
        const before = ed ? U.reports.find((x) => x.id === ed.id) : null;
        const sent = new Set((before?.rows || []).filter((x) => x.notify).map((x) => `${x.athlete}|${x.notifyText}`));
        const notices = r.rows.filter((x) => x.notify && !sent.has(`${x.athlete}|${x.notifyText}`)).map((x) => noticeRecord({ title: x.title, athlete: x.athlete, text: x.notifyText, by: r.by, date: r.date, disc: r.discipline }));
        if (S.db) { await S.db.collection('support_reports').doc(r.id).set(r); for (const n of notices) await S.db.collection('support_notices').doc(n.id).set(n); }
        else { if (before) U.hist.push({ record_id: r.id, at: new Date().toISOString(), editor_name: me(), before, after: r }); U.notices.push(...notices); }
        const i = U.reports.findIndex((x) => x.id === r.id); if (i >= 0) U.reports[i] = r; else U.reports.push(r);
        U.lastSaved = r; U.draft = null; try { localStorage.removeItem(draftKey()); } catch { /* */ }
        if (ed) await loadHistory(true);
        render(); setMsg('supMsg', ed ? 'Changes saved. The old version is in the edit history.' : `Saved: ${usersOfDay(r).text}.${notices.length ? ` ${notices.length} line(s) sent to the coaches.` : ''}`, 'ok');
      } catch (err) { setMsg('supMsg', err.message, 'err'); }
      return true;
    }
    if (ds.supWa && U.lastSaved) {
      const text = whatsappText(U.lastSaved, S.lang);
      try { await navigator.clipboard.writeText(text); setMsg('supMsg', 'Copied: paste it in the WhatsApp group.', 'ok'); } catch { setMsg('supMsg', 'Copy did not work on this device.', 'err'); }
      return true;
    }
    return false;
  }
  function onInput(el) {
    if (!el?.closest?.('#supForm')) return false;
    if (el.id === 'supDisc') { collect(); render(); return true; }
    const pa = /^sR-(\d+)-padd$/.exec(el.id || '');
    if (pa && el.value) { const d = collect(); const r = d.rows[Number(pa[1])]; if (r && !(r.pain || []).some((x) => x.p === el.value)) r.pain = [...(r.pain || []), { p: el.value, v: '' }]; keep(); render(); return true; }
    const d = collect(); const span = document.getElementById('supUsers');
    const gn = document.getElementById('supGpN'); if (gn) gn.textContent = String(groupCount(d.group));
    if (span) { try { span.textContent = usersOfDay(supportReport({ ...d, by: 'x', asOf: today() })).text; } catch { span.textContent = ''; } }
    return true;
  }
  return { page, noticesPanel, overviewLine, subscribe, onClick, onInput, readsAll, canFile };
}
