// V1.34 Performance → Support staff: the daily report of the team doctor, physios, physical coach and psychologist,
// the day board and the daily / weekly measurements. Logic in src/core/support.js; this file draws, calls the AI
// and saves. Who reads what is decided by the database: full reports for the author, Coach Donny (readiness owner),
// the Head Coach and admins; counts only (support_summary) for everyone else.
import { JOBS, DISCS, DISC_LABEL, ASK, RESPONSES, supportReport, usersOfDay, fromParse, whatsappText, anonymise, summarize, perDay, weekSignals,
  repeatAthletes, watchList, dayBoard, weekRange, noticeRecord, REPEAT_AT, HIGH_VAS } from '../core/support.js';

const DRAFT_KEY = 'hub-support-draft';
const blankRow = () => ({ athlete: '', athleteSeen: '', title: '', did: '', found: '', region: '', response: '', vasBefore: '', vasAfter: '', followUp: false, notify: false, notifyText: '' });

export function supportUi(ctx) {
  const { S, esc, tag, banner, setMsg, val, render, PLATFORM, HUB_USER, FEAT, today, meName, titles } = ctx;
  S.sup ||= { reports: [], notices: [], draft: null, summary: null, sumFor: '', lastSaved: null, filter: '' };
  const U = S.sup;
  // Who may file (support staff, Coach Donny, Head Coach, admins) and who reads every report (the last three).
  const canFile = () => !HUB_USER || !!HUB_USER.canSupport;
  const readsAll = () => !HUB_USER || HUB_USER.roles.some((r) => ['admin', 'head_coach', 'readiness_owner'].includes(r));
  const job = () => HUB_USER?.supportJob || '';
  const roster = () => Object.fromEntries(titles().map((t) => [t, (S.roster[t] || []).filter(Boolean)]));

  function draft() {
    if (!U.draft) { try { U.draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { U.draft = null; } }
    if (!U.draft) U.draft = { date: today(), discipline: JOBS[job()]?.disc || '', rows: [blankRow()], general: { did: '', found: '', teams: [] }, paste: '', source: 'form' };
    return U.draft;
  }
  const keep = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(U.draft)); } catch { /* per-device convenience */ } };
  // The form's values → the draft (no redraw while typing).
  function collect() {
    const d = draft(); const f = document.getElementById('supForm'); if (!f) return d;
    d.date = val('supDate') || d.date; if (document.getElementById('supDisc')) d.discipline = val('supDisc');
    d.paste = val('supPaste');
    d.rows = d.rows.map((r, i) => {
      const g = (k) => val(`sR-${i}-${k}`); const c = (k) => !!document.getElementById(`sR-${i}-${k}`)?.checked;
      const pick = g('athlete'); const [t, a] = pick.includes('|') ? pick.split('|') : ['', ''];
      return { ...r, athlete: a, title: a ? t : (r.title || ''), athleteSeen: g('seen'), did: g('did'), found: g('found'), region: g('region'), response: g('response'),
        vasBefore: g('vb'), vasAfter: g('va'), followUp: c('fu'), notify: c('nt'), notifyText: g('ntx') };
    });
    d.general = { did: val('supGDid'), found: val('supGFound'), teams: titles().filter((t) => document.getElementById(`supGT-${t.replace(/\W/g, '_')}`)?.checked) };
    keep(); return d;
  }

  // ---------------------------------------------------------------- the form
  function form() {
    const d = draft(); const disc = d.discipline; const A = ASK[disc] || ASK.physical; const R = roster();
    const opts = (r) => `<option value=""></option>${Object.entries(R).filter(([, xs]) => xs.length).map(([t, xs]) => `<optgroup label="${esc(t)}">${xs.map((x) => `<option value="${esc(`${t}|${x}`)}" ${r.athlete === x && r.title === t ? 'selected' : ''}>${esc(x)}</option>`).join('')}</optgroup>`).join('')}`;
    const row = (r, i) => `<div class="obj"><header><div><b>Athlete ${i + 1}</b></div><button type="button" class="linkbtn" data-sup-del="${i}">Remove</button></header>
      <div class="form"><label class="field" for="sR-${i}-athlete">Athlete<select id="sR-${i}-athlete">${opts(r)}</select></label>
        <label class="field" for="sR-${i}-seen">Not in the list? Name and team<input type="text" id="sR-${i}-seen" value="${esc(r.athlete ? '' : r.athleteSeen)}" placeholder="e.g. Jonathan (CS2)"></label></div>
      <label class="field" for="sR-${i}-found">${esc(A.found)}<textarea rows="2" id="sR-${i}-found">${esc(r.found)}</textarea></label>
      ${disc === 'physio' ? `<div class="form"><label class="field" for="sR-${i}-region">Body region<input type="text" id="sR-${i}-region" value="${esc(r.region)}"></label>
        <label class="field" for="sR-${i}-vb">VAS before (0–10)<input type="number" min="0" max="10" inputmode="numeric" id="sR-${i}-vb" value="${esc(r.vasBefore ?? '')}"></label>
        <label class="field" for="sR-${i}-va">VAS after (0–10)<input type="number" min="0" max="10" inputmode="numeric" id="sR-${i}-va" value="${esc(r.vasAfter ?? '')}"></label></div>` : ''}
      <label class="field" for="sR-${i}-did">${esc(A.did)}<textarea rows="2" id="sR-${i}-did">${esc(r.did)}</textarea></label>
      <div class="form">${disc === 'physio' || disc === 'medic' ? `<label class="field" for="sR-${i}-response">Athlete response<select id="sR-${i}-response"><option value=""></option>${RESPONSES.map((x) => `<option value="${x}" ${r.response === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span><input type="checkbox" id="sR-${i}-fu" ${r.followUp ? 'checked' : ''}> Follow-up needed</span></label>
        <label class="field"><span><input type="checkbox" id="sR-${i}-nt" ${r.notify ? 'checked' : ''}> Tell the coach (no diagnosis)</span></label></div>
      <label class="field" for="sR-${i}-ntx">Line for the coach, if ticked<input type="text" id="sR-${i}-ntx" maxlength="200" value="${esc(r.notifyText)}" placeholder="e.g. Check with the physio before scrim"></label></div>`;
    const users = (() => { try { return usersOfDay(supportReport({ ...d, by: meName() || 'x', asOf: today() })).text; } catch { return ''; } })();
    return `<div class="panel" id="supForm"><h2>Daily report${job() ? ` — ${esc(JOBS[job()].label)}` : ''}</h2>
      <p class="note">Three questions: what you did, what you found, which athletes you saw. Only you, Coach Donny, the Head Coach and admins read the details${disc === 'psych' ? '' : '; the coach only gets the line you tick'}.</p>
      <div class="form"><label class="field" for="supDate">Date<input type="date" id="supDate" value="${esc(d.date)}" max="${today()}"></label>
        ${job() ? '' : `<label class="field" for="supDisc">Your role<select id="supDisc"><option value=""></option>${DISCS.map((x) => `<option value="${x}" ${disc === x ? 'selected' : ''}>${esc(DISC_LABEL[x])}</option>`).join('')}</select></label>`}</div>
      <details class="capdump" ${d.rows.some((r) => r.found || r.did) ? '' : 'open'}><summary>Paste from WhatsApp: the AI fills the form</summary>
        <p class="note">Paste the message you send to the group. The AI only moves your own words into the fields; check them, then save. The text is sent to the AI service to be read.</p>
        <label class="field" for="supPaste">Your WhatsApp report<textarea id="supPaste" rows="6">${esc(d.paste || '')}</textarea></label>
        <div class="toolbar">${FEAT.ai && FEAT.supportAi && PLATFORM?.ai ? '<button class="btn" type="button" data-sup-parse="1">Fill the form (AI)</button>' : '<span class="note">AI reading switches on with the next AI update; type the form below meanwhile.</span>'}<span class="msg" id="supPMsg" role="status"></span></div></details>
      ${disc ? `${d.rows.map(row).join('')}<div class="toolbar"><button class="btn" type="button" data-sup-add="1">+ Add athlete</button></div>
      <div class="h3">For a whole team or the session (optional)</div>
      <div class="form"><label class="field wide" for="supGDid">What you did<textarea rows="2" id="supGDid">${esc(d.general.did)}</textarea></label>
        <label class="field wide" for="supGFound">What you found<textarea rows="2" id="supGFound">${esc(d.general.found)}</textarea></label></div>
      <fieldset class="objpick"><legend class="note">Teams</legend>${titles().map((t) => `<label><input type="checkbox" id="supGT-${t.replace(/\W/g, '_')}" ${d.general.teams.includes(t) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</fieldset>
      <p class="note"><b>Seen today:</b> <span id="supUsers">${esc(users)}</span></p>
      <div class="toolbar"><button class="btn primary" type="button" data-sup-save="1">Save report</button>${U.lastSaved ? '<button class="btn" type="button" data-sup-wa="1">Copy for WhatsApp</button>' : ''}<button class="btn" type="button" data-sup-clear="1">Clear form</button><span class="msg" id="supMsg" role="status"></span></div>`
    : '<p class="empty">Pick your role first (an admin can set it for you in Users & access).</p>'}</div>`;
  }

  // ---------------------------------------------------------------- measurements
  const statCard = (k, v, note = '') => `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${v}</span>${note ? `<span class="note">${esc(note)}</span>` : ''}</div>`;
  function measures(cur, prev, days) {
    const sig = weekSignals(cur, prev);
    return `<div class="panel"><h2>This week — support staff</h2>
      <div class="stats">${statCard('Reports filed (7 days)', cur.reports, `${prev.reports} the week before`)}${statCard('Athlete visits', cur.seen, `${prev.seen} the week before`)}
        ${statCard('Follow-ups flagged', cur.followUps)}${statCard(`Seen ${REPEAT_AT}+ times`, cur.repeat)}
        ${statCard('Physio: pain drop (VAS)', cur.vasDrop == null ? '—' : `−${cur.vasDrop}`, cur.vasN ? `${cur.vasN} treatment(s)` : '')}${statCard('Better after treatment', cur.responded ? `${cur.better}/${cur.responded}` : '—')}</div>
      ${sig.length ? `<ul class="plain">${sig.map((s) => `<li>${s.level === 'warn' ? tag('c-Medium', 'watch') : tag('c-Low', 'note')} ${esc(s.text)}</li>`).join('')}</ul>` : '<p class="note">Nothing unusual this week.</p>'}
      <div class="cols"><div><div class="h3">Days with a report (of 7)</div><ul class="plain">${DISCS.map((d) => `<li>${esc(DISC_LABEL[d])}: <b>${cur.byDisc[d].days}</b> <span class="note">· ${cur.byDisc[d].athletes} visit(s)</span></li>`).join('')}</ul></div>
        <div><div class="h3">Visits per team</div>${Object.keys(cur.byTitle).length ? `<ul class="plain">${Object.entries(cur.byTitle).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<li>${esc(t)}: <b>${n}</b> <span class="note">(${prev.byTitle[t] || 0} the week before)</span></li>`).join('')}</ul>` : '<p class="empty">No visits.</p>'}</div></div>
      <details class="howto"><summary>Day by day</summary><div class="tw"><table><thead><tr><th>Day</th><th class="n">Reports</th><th>Roles</th><th class="n">Athlete visits</th><th class="n">Follow-ups</th></tr></thead><tbody>
        ${days.map((x) => `<tr><td>${esc(x.day)}</td><td class="n">${x.reports}</td><td>${esc(x.discs.map((d) => DISC_LABEL[d]).join(', ') || '—')}</td><td class="n">${x.seen}</td><td class="n">${x.followUps}</td></tr>`).join('')}</tbody></table></div></details>
      <p class="note">Counts only, from the support staff's daily reports. A visit is one athlete in one report. The details stay with the staff, Coach Donny, the Head Coach and admins.</p></div>`;
  }
  async function loadSummary() {
    const w = weekRange(today()); const key = `${w.from}|${w.to}`; if (U.sumFor === key || !S.db?.supportSummary) return;
    U.sumFor = key;
    try { const [c, p] = await Promise.all([S.db.supportSummary(w.from, w.to), S.db.supportSummary(w.prevFrom, w.prevTo)]); U.summary = { cur: c, prev: p }; } catch { U.summary = { error: true }; }
    render();
  }
  function weekBlock() {
    const w = weekRange(today());
    if (readsAll() || !S.db) {
      const cur = summarize(anonymise(U.reports, w.from, w.to)); const prev = summarize(anonymise(U.reports, w.prevFrom, w.prevTo));
      return measures(cur, prev, perDay(anonymise(U.reports, w.from, w.to), w.from, w.to));
    }
    if (!U.summary) { setTimeout(loadSummary, 0); return '<div class="panel"><p class="note">Loading the week…</p></div>'; }
    if (U.summary.error || !U.summary.cur) return '';
    const norm = (x) => ({ reports: (x?.reports || []).map((r) => ({ day: String(r.day), disc: r.disc })), rows: (x?.rows || []).map((r) => ({ ...r, day: String(r.day) })), repeat: Number(x?.repeat) || 0 });
    const c = norm(U.summary.cur); const p = norm(U.summary.prev);
    return measures(summarize(c), summarize(p), perDay(c, w.from, w.to));
  }

  // ---------------------------------------------------------------- with names (Donny, Head Coach, admins)
  function namesBlock() {
    const w = weekRange(today()); const board = dayBoard(U.reports, today());
    const watch = watchList(U.reports, w.from, w.to); const rep = repeatAthletes(U.reports, w.from, w.to);
    const label = { 'follow-up': ['c-Medium', 'follow-up'], worse: ['c-Blocked', 'worse'], pain: ['c-Blocked', `pain ≥${HIGH_VAS}`] };
    return `<div class="panel"><h2>Today — who has reported</h2><div class="stats">${board.map((b) => statCard(b.label, b.n ? '✓' : '—', b.n ? `${b.by.join(', ')} · ${b.seen} athlete(s)` : 'no report yet')).join('')}</div></div>
      <div class="panel"><h2>To watch (7 days)</h2>
        ${rep.length ? `<div class="h3">Seen ${REPEAT_AT}+ times</div><ul class="plain">${rep.map((x) => `<li><b>${esc(x.athlete)}</b> ${x.title ? `<span class="note">${esc(x.title)}</span>` : ''} — ${x.n} visits · ${esc(x.discs.map((d) => DISC_LABEL[d]).join(', '))} · last ${esc(x.last)}</li>`).join('')}</ul>` : ''}
        ${watch.length ? `<div class="h3">Open follow-ups, worse, still in pain</div><ul class="plain">${watch.slice(0, 20).map((x) => `<li>${tag(...label[x.kind])} <b>${esc(x.athlete)}</b> ${x.title ? `<span class="note">${esc(x.title)}</span>` : ''} — ${esc(x.date)}, ${esc(DISC_LABEL[x.disc])} (${esc(x.by)}): ${esc(x.text)}</li>`).join('')}</ul>` : ''}
        ${rep.length || watch.length ? '' : '<p class="note">Nothing open.</p>'}</div>
      ${reportList(U.reports.filter((r) => r.date >= shift(today(), -13)), true)}`;
  }
  const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  function card(r) {
    const A = ASK[r.discipline];
    return `<div class="obj"><header><div><span class="note">${esc(r.date)} · ${esc(DISC_LABEL[r.discipline])} · ${esc(r.by)}${r.source === 'whatsapp' ? ' · from WhatsApp' : ''}</span><h3>${esc(usersOfDay(r).text)}</h3></div></header>
      ${r.rows.map((x) => `<p><b>${esc(x.athlete)}</b>${x.title ? ` <span class="note">${esc(x.title)}</span>` : ''}${x.followUp ? ` ${tag('c-Medium', 'follow-up')}` : ''}${x.response ? ` ${tag(x.response === 'worse' ? 'c-Blocked' : x.response === 'better' ? 'c-Verified' : 'c-Low', x.response)}` : ''}<br>
        ${x.found ? `<span class="note">${esc(A.found)}:</span> <span data-no-tr>${esc(x.found)}</span><br>` : ''}${x.region ? `<span class="note">Region:</span> <span data-no-tr>${esc(x.region)}</span><br>` : ''}
        ${x.did ? `<span class="note">${esc(A.did)}:</span> <span data-no-tr>${esc(x.did)}</span>` : ''}${x.vasBefore != null ? ` <span class="note">· VAS ${x.vasBefore} → ${x.vasAfter ?? '?'}</span>` : ''}</p>`).join('')}
      ${r.general.did || r.general.found ? `<p><b>Team${r.general.teams.length ? ` (${esc(r.general.teams.join(', '))})` : ''}</b><br><span data-no-tr>${esc([r.general.did, r.general.found].filter(Boolean).join(' — '))}</span></p>` : ''}</div>`;
  }
  function reportList(list, filter) {
    const f = U.filter; const shown = list.filter((r) => !f || r.discipline === f).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return `<div class="panel"><h2>Reports (14 days)</h2>${filter ? `<nav class="subnav" aria-label="Role">${['', ...DISCS].map((d) => `<button type="button" data-sup-filter="${d}" aria-pressed="${f === d}">${esc(d ? DISC_LABEL[d] : 'All')}</button>`).join('')}</nav>` : ''}
      ${shown.length ? shown.slice(0, 40).map(card).join('') : '<p class="empty">No report yet.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- page, notices, dashboard line
  function page() {
    if (S.mode === 'demo') return '<div class="panel"><p class="empty">Support staff reports use operational records only.</p></div>';
    if (HUB_USER && !FEAT.support) return `<div class="panel">${banner('warn', '<div>Support staff reports switch on after the V1.34 database update.</div>')}</div>`;
    const head = '<div class="panel"><div class="lead">Support <em>staff</em></div><p>Daily reports of the team doctor, physiotherapists, physical coach and psychologist.</p></div>';
    if (readsAll()) return head + (canFile() ? form() : '') + weekBlock() + namesBlock();
    if (canFile()) return head + form() + reportList(U.reports.filter((r) => r.date >= shift(today(), -13)), false);
    return head + weekBlock();
  }
  // Title coaches: the neutral lines the staff chose to send (last 3 days).
  function noticesPanel(myTitles) {
    const since = shift(today(), -2); const list = U.notices.filter((n) => n.date >= since && myTitles.includes(n.title)).sort((a, b) => b.date.localeCompare(a.date));
    return list.length ? `<div class="panel"><h2>From the support staff</h2><ul class="plain">${list.map((n) => `<li><b>${esc(n.athlete || n.title)}</b> <span class="note">${esc(n.title)} · ${esc(n.date)} · ${esc(n.by)}</span> — ${esc(n.text)}</li>`).join('')}</ul></div>` : '';
  }
  function subscribe(db) {
    if (!FEAT.support) return;
    if (canFile()) db.collection('support_reports').onSnapshot((snap) => { U.reports = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('support_notices').onSnapshot((snap) => { U.notices = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
  }

  // ---------------------------------------------------------------- events
  async function onClick(t) {
    const ds = t.dataset;
    if (ds.supAdd) { const d = collect(); d.rows.push(blankRow()); keep(); render(); return true; }
    if (ds.supDel != null && ds.supDel !== undefined && 'supDel' in ds) { const d = collect(); d.rows.splice(Number(ds.supDel), 1); if (!d.rows.length) d.rows.push(blankRow()); keep(); render(); return true; }
    if (ds.supClear) { U.draft = null; try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ } draft(); render(); return true; }
    if (ds.supFilter != null && 'supFilter' in ds) { U.filter = ds.supFilter; render(); return true; }
    if (ds.supParse) {
      const d = collect(); if (!d.paste.trim()) { setMsg('supPMsg', 'Paste the report first.', 'err'); return true; }
      setMsg('supPMsg', 'Reading… (5–15 s)');
      try {
        const out = await PLATFORM.ai.call({ action: 'support_parse', text: d.paste, roster: roster(), discipline: d.discipline || JOBS[job()]?.disc || '' });
        const p = fromParse(out.raw, roster());
        Object.assign(d, { discipline: d.discipline || p.discipline, date: p.date && p.date <= today() ? p.date : d.date, rows: p.rows.length ? p.rows : d.rows, general: (p.general.did || p.general.found) ? p.general : d.general, source: 'whatsapp' });
        keep(); render();
        setMsg('supPMsg', `${p.rows.length} athlete(s) filled.${p.unmatched.length ? ` Not in the roster: ${p.unmatched.join(', ')} — pick them or keep the name.` : ''}${p.notes ? ` ${p.notes}` : ''} Check, then save.`, 'ok');
      } catch (err) { setMsg('supPMsg', err.message, 'err'); }
      return true;
    }
    if (ds.supSave) {
      const d = collect();
      try {
        const r = supportReport({ ...d, job: job(), by: HUB_USER?.name || meName(), asOf: today() });
        const notices = r.rows.filter((x) => x.notify).map((x) => noticeRecord({ title: x.title, athlete: x.athlete, text: x.notifyText, by: r.by, date: r.date, disc: r.discipline }));
        if (S.db) { await S.db.collection('support_reports').doc(r.id).set(r); for (const n of notices) await S.db.collection('support_notices').doc(n.id).set(n); }
        else { U.reports.push(r); U.notices.push(...notices); }
        if (!U.reports.some((x) => x.id === r.id)) U.reports.push(r);
        U.lastSaved = r; U.draft = null; try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ }
        render(); setMsg('supMsg', `Saved: ${usersOfDay(r).text}.${notices.length ? ` ${notices.length} line(s) sent to the coaches.` : ''}`, 'ok');
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
    const d = collect(); const span = document.getElementById('supUsers');
    if (span) { try { span.textContent = usersOfDay(supportReport({ ...d, by: 'x', asOf: today() })).text; } catch { span.textContent = ''; } }
    return true;
  }
  return { page, noticesPanel, subscribe, onClick, onInput, readsAll, canFile };
}
