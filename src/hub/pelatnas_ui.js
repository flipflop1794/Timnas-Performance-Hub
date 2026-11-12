// V1.16 Pelatnas board screens: camp dates, the day's schedule with attendance, and player availability.
// Logic and checks live in src/core/pelatnas.js; this file only draws and saves. The schedule is the
// scrim & practice planner (S.scrims): sessions are planned there, per title, and attendance is taken here.
import * as P from '../core/pelatnas.js';
import { TITLES as WEC_TITLES } from '../core/staff.js';

const KIND_LABEL = { scrim: 'Scrim', 'scenario drill': 'Scenario drill', review: 'Review', 'individual practice': 'Individual practice', 'physical / recovery': 'Physical / recovery' };

export function pelatnasUi(ctx) {
  const { S, esc, tag, banner, setMsg, val, render, meName, sid, localDay, shiftDay, titleVisible, canSetDates } = ctx;
  S.pl ||= { day: localDay(), title: null, player: {}, draft: {}, conflicts: {}, msgLang: 'id' };
  S.pl_avail ||= []; S.pl_att ||= []; S.pl_camp ??= null;
  const titles = () => WEC_TITLES.map((t) => t.id).filter(titleVisible);
  const roster = (title) => (S.roster[title] || []).filter(Boolean);
  const availOf = (title, player) => S.pl_avail.find((a) => a.title === title && a.player === player) || null;
  const attOf = (sessionId) => S.pl_att.find((a) => a.sessionId === sessionId) || null;

  async function put(coll, list, rec) {
    if (S.db) await S.db.collection(coll).doc(sid(rec.id)).set(rec);
    const i = S[list].findIndex((x) => x.id === rec.id);
    if (i >= 0) S[list][i] = rec; else S[list].push(rec);
  }

  // ---------------------------------------------------------------- camp dates (shared by both pages)
  function campPanel() {
    const line = P.campLine(S.pl_camp);
    const c = S.pl_camp || {};
    const form = canSetDates() ? `<details class="pl-dates"><summary>${S.pl_camp ? 'Change the camp dates' : 'Record the camp dates'}</summary>
      <div class="grid3">
        <label class="field">Start<input type="date" id="plStart" value="${esc(c.start || '')}"></label>
        <label class="field">End<input type="date" id="plEnd" value="${esc(c.end || '')}"></label>
        <label class="field">Venue<input id="plVenue" value="${esc(c.venue || '')}" placeholder="TBD"></label>
        <label class="field">Status<select id="plDStatus">${P.DATE_STATUS.map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s === 'proposed' ? 'Proposed (not final)' : 'Confirmed by PB ESI'}</option>`).join('')}</select></label>
        <label class="field wide">Source (needed when confirmed)<input id="plSource" value="${esc(c.source || '')}" placeholder="e.g. PB ESI BOD letter, 20 Nov"></label>
      </div>
      <div class="toolbar"><button class="btn primary" type="button" data-pl-savedates="1">Save dates</button><span class="msg" id="msg-pl-dates" role="status"></span></div>
      <p class="note">Admin and Head Coach only. Until PB ESI confirms, keep the status on "Proposed": every screen and the availability message then say the dates are not final.</p></details>` : '';
    return `<div class="panel hero-panel"><div class="lead">Pelatnas <em>board</em></div>
      ${banner(line.state === 'confirmed' ? 'real' : 'synth', `<div><b>${esc(line.text)}</b>${S.pl_camp ? ` <span class="note">Recorded by ${esc(c.by)}${c.source ? `; source: ${esc(c.source)}` : ''}.</span>` : ''}</div>`)}
      ${form}</div>`;
  }

  // ---------------------------------------------------------------- day: schedule and attendance
  function dayPage() {
    const day = S.pl.day || localDay();
    const sessions = P.daySessions(S.scrims || [], day, titles());
    const dayAtt = S.pl_att.filter((a) => a.date === day && titleVisible(a.title));
    const weekAtt = S.pl_att.filter((a) => a.date > shiftDay(day, -7) && a.date <= day && titleVisible(a.title));
    const rDay = P.attendanceRate(dayAtt); const rWeek = P.attendanceRate(weekAtt);
    const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
    const cards = sessions.map((s) => sessionCard(s, day)).join('');
    return `${campPanel()}
      <div class="panel"><h2>Schedule and attendance</h2>
        <div class="toolbar"><button class="btn" type="button" data-pl-day="-1">‹ Previous day</button>
          <input type="date" id="plDay" value="${esc(day)}" data-pl-pickday="1" aria-label="Day">
          <button class="btn" type="button" data-pl-day="1">Next day ›</button>
          ${day !== localDay() ? '<button class="btn" type="button" data-pl-day="0">Today</button>' : ''}</div>
        <div class="stats"><div class="stat"><span class="k">Sessions planned</span><span class="v">${sessions.length}</span></div>
          <div class="stat"><span class="k">Attendance this day</span><span class="v">${pct(rDay.rate)}</span><span class="note">${rDay.there} of ${rDay.marked} marked</span></div>
          <div class="stat"><span class="k">Attendance, 7 days</span><span class="v">${pct(rWeek.rate)}</span><span class="note">${rWeek.sessions} session${rWeek.sessions === 1 ? '' : 's'} recorded, ${rWeek.late} late</span></div></div>
        <p class="note">Sessions come from each title's <b>Scrims &amp; practice</b> planner: plan scrims, reviews, individual practice and physical sessions there, then take attendance here. Attendance is about turning up, not performance or health.</p>
      </div>
      ${cards || `<div class="panel"><p class="empty">Nothing planned for ${esc(day)}. Plan sessions in a title's Scrims &amp; practice tab.</p></div>`}`;
  }
  function sessionCard(s, day) {
    const rec = attOf(s.id);
    const draft = S.pl.draft[s.id] ||= { ...(rec?.marks || {}) };
    const players = roster(s.title);
    const row = (p) => {
      const av = P.availableOn(availOf(s.title, p), day);
      return `<tr><td>${esc(p)}${av === false ? ` ${tag('c-High', 'not available this day')}` : av === null ? ` ${tag('c-Low', 'availability not known')}` : ''}</td>
        <td class="pl-marks">${P.MARKS.map((m) => `<button type="button" class="chip ${draft[p] === m ? 'on' : ''} pl-${m}" aria-pressed="${draft[p] === m}" data-pl-mark="${esc(`${s.id}|${p}|${m}`)}">${P.MARK_LABEL[m]}</button>`).join('')}</td></tr>`;
    };
    const head = `${esc(s.time || 'Time TBD')} · <b>${esc(s.title)}</b> · ${esc(KIND_LABEL[s.kind] || s.kind)}${s.partner ? ` vs ${esc(s.partner)}` : ''}`;
    return `<div class="panel"><h3 class="h3">${head}</h3>
      <p class="note">Owner: ${esc(s.owner || '—')}${s.status === 'done' ? ' · logged' : ''}${rec ? ` · attendance saved by ${esc(rec.by)} at ${esc(rec.at.slice(11, 16))} UTC` : ''}</p>
      ${players.length ? `<div class="tw"><table><thead><tr><th>Player</th><th>Attendance</th></tr></thead><tbody>${players.map(row).join('')}</tbody></table></div>
        <div class="toolbar"><button class="btn" type="button" data-pl-allpresent="${esc(s.id)}">Everyone present</button>
          <input id="plNote-${esc(sid(s.id))}" placeholder="Note (optional, no health details)" value="${esc(rec?.note || '')}" aria-label="Note">
          <button class="btn primary" type="button" data-pl-saveatt="${esc(s.id)}">Save attendance</button><span class="msg" id="msg-pl-${esc(sid(s.id))}" role="status"></span></div>`
        : `<p class="empty">No players on the ${esc(s.title)} roster yet (Team tab).</p>`}</div>`;
  }

  // ---------------------------------------------------------------- availability
  function availPage() {
    const ts = titles();
    const title = ts.includes(S.pl.title) ? S.pl.title : ts[0];
    const rost = Object.fromEntries(ts.map((t) => [t, roster(t)]));
    const sum = P.availabilitySummary(rost, S.pl_avail);
    const total = sum.reduce((a, r) => ({ players: a.players + r.players, answered: a.answered + r.answered }), { players: 0, answered: 0 });
    const msg = P.availabilityMessage({ lang: S.pl.msgLang, camp: S.pl_camp });
    return `${campPanel()}
      <div class="panel"><h2>Player availability</h2>
        <p>${total.answered} of ${total.players} players have answered.</p>
        <div class="tw"><table><thead><tr><th>Title</th><th class="n">Players</th><th class="n">All of it</th><th class="n">Part</th><th class="n">Not available</th><th>Still to answer</th></tr></thead><tbody>
        ${sum.map((r) => `<tr><td><button type="button" class="linkish" data-pl-title="${esc(r.title)}">${esc(r.title)}</button></td><td class="n">${r.players}</td><td class="n">${r.full}</td><td class="n">${r.part}</td><td class="n">${r.none}</td><td>${r.open.length ? esc(r.open.join(', ')) : tag('s-done', 'all answered')}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="panel"><h2>Ask the players</h2>
        <p class="note">A ready message for WhatsApp. It asks for dates and a reason category only, and says that the SK and compensation will come officially from PB ESI, with no figures or dates promised.</p>
        <div class="toolbar"><button class="btn ${S.pl.msgLang === 'id' ? 'primary' : ''}" type="button" data-pl-msglang="id">Bahasa Indonesia</button><button class="btn ${S.pl.msgLang === 'en' ? 'primary' : ''}" type="button" data-pl-msglang="en">English</button>
          <button class="btn" type="button" data-pl-copy="1">Copy message</button><span class="msg" id="msg-pl-copy" role="status"></span></div>
        <textarea id="plMsg" rows="9" readonly>${esc(msg)}</textarea></div>
      ${playerPanel(title)}`;
  }
  function playerPanel(title) {
    const players = roster(title);
    if (!players.length) return `<div class="panel"><h2>${esc(title)}</h2><p class="empty">No players on the roster yet (Team tab).</p></div>`;
    const who = players.includes(S.pl.player[title]) ? S.pl.player[title] : players[0];
    const a = availOf(title, who);
    const key = `${title}|${who}`;
    const conf = S.pl.conflicts[key] ||= [...(a?.conflicts || [])];
    return `<div class="panel"><h2>Record an answer — ${esc(title)}</h2>
      <div class="drseg" role="tablist">${players.map((p) => { const st = availOf(title, p)?.status || 'Not asked yet'; return `<button type="button" role="tab" aria-selected="${p === who}" data-pl-player="${esc(`${title}|${p}`)}">${esc(p)} ${P.AVAIL_OPEN.has(st) ? '·' : '✓'}</button>`; }).join('')}</div>
      <div class="grid3">
        <label class="field">Status<select id="plStatus">${P.AVAIL_STATUS.map((s) => `<option ${(a?.status || 'Not asked yet') === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
        <label class="field">Available from<input type="date" id="plFrom" value="${esc(a?.from || '')}"></label>
        <label class="field">Available to<input type="date" id="plTo" value="${esc(a?.to || '')}"></label>
        <label class="field wide">Note (optional)<input id="plANote" value="${esc(a?.note || '')}" placeholder="e.g. joins after club playoffs" maxlength="200"></label>
      </div>
      <div class="h3">Dates not possible</div>
      ${conf.length ? `<ul class="plain">${conf.map((c, i) => `<li>${esc(c.from)} to ${esc(c.to)} · ${esc(c.reason)} <button type="button" class="btn small" data-pl-delconf="${esc(`${key}|${i}`)}">Remove</button></li>`).join('')}</ul>` : '<p class="note">None recorded.</p>'}
      <div class="grid3"><label class="field">From<input type="date" id="plCFrom"></label><label class="field">To<input type="date" id="plCTo"></label>
        <label class="field">Reason<select id="plCReason">${P.CONFLICT_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label></div>
      <div class="toolbar"><button class="btn" type="button" data-pl-addconf="${esc(key)}">Add these dates</button>
        <button class="btn primary" type="button" data-pl-saveavail="${esc(key)}">Save ${esc(who)}</button><span class="msg" id="msg-pl-avail" role="status"></span></div>
      <p class="note">Reason categories only: no health, family or contact details.${a ? ` Last saved by ${esc(a.by)}, ${esc(a.at.slice(0, 10))}.` : ''}</p></div>`;
  }

  // ---------------------------------------------------------------- events
  async function onClick(t) {
    const ds = t.dataset;
    try {
      if (ds.plDay !== undefined) { S.pl.day = ds.plDay === '0' ? localDay() : shiftDay(S.pl.day || localDay(), Number(ds.plDay)); render(); return true; }
      if (ds.plMark) {
        const [sessionId, player, mark] = ds.plMark.split('|');
        const d = S.pl.draft[sessionId] ||= {}; d[player] = d[player] === mark ? '' : mark; render(); return true;
      }
      if (ds.plAllpresent) {
        const s = (S.scrims || []).find((x) => x.id === ds.plAllpresent); if (!s) return true;
        const d = S.pl.draft[s.id] ||= {}; for (const p of roster(s.title)) d[p] = 'present'; render(); return true;
      }
      if (ds.plSaveatt) {
        const s = (S.scrims || []).find((x) => x.id === ds.plSaveatt);
        const rec = P.attendance(s, S.pl.draft[s.id], { by: meName() || 'staff', note: val(`plNote-${sid(s.id)}`) });
        await put('pelatnas_attendance', 'pl_att', rec); render(); setMsg(`msg-pl-${sid(s.id)}`, 'Saved.', 'ok'); return true;
      }
      if (ds.plTitle) { S.pl.title = ds.plTitle; render(); return true; }
      if (ds.plPlayer) { const [title, p] = ds.plPlayer.split('|'); S.pl.title = title; S.pl.player[title] = p; render(); return true; }
      if (ds.plAddconf) {
        const c = { from: val('plCFrom'), to: val('plCTo'), reason: val('plCReason') };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c.from) || !/^\d{4}-\d{2}-\d{2}$/.test(c.to) || c.from > c.to) throw new Error('Give a from and to date for the dates that are not possible.');
        (S.pl.conflicts[ds.plAddconf] ||= []).push(c); render(); return true;
      }
      if (ds.plDelconf) { const parts = ds.plDelconf.split('|'); const i = Number(parts.pop()); const key = parts.join('|'); S.pl.conflicts[key]?.splice(i, 1); render(); return true; }
      if (ds.plSaveavail) {
        const [title, player] = ds.plSaveavail.split('|');
        const rec = P.availability(availOf(title, player), { title, player, status: val('plStatus'), from: val('plFrom'), to: val('plTo'), conflicts: S.pl.conflicts[ds.plSaveavail] || [], note: val('plANote'), by: meName() || 'staff' });
        await put('pelatnas_availability', 'pl_avail', rec); delete S.pl.conflicts[ds.plSaveavail]; render(); setMsg('msg-pl-avail', 'Saved.', 'ok'); return true;
      }
      if (ds.plMsglang) { S.pl.msgLang = ds.plMsglang; render(); return true; }
      if (ds.plCopy) {
        const el = document.getElementById('plMsg');
        try { await navigator.clipboard.writeText(el.value); setMsg('msg-pl-copy', 'Copied.', 'ok'); } catch { el.select(); setMsg('msg-pl-copy', 'Selected: press Ctrl+C (or long-press Copy).', ''); }
        return true;
      }
      if (ds.plSavedates) {
        const rec = P.campDates({ start: val('plStart'), end: val('plEnd'), venue: val('plVenue'), status: val('plDStatus'), source: val('plSource'), by: meName() || 'staff' });
        if (S.db) await S.db.doc('config/pelatnas').set({ camp: rec });
        S.pl_camp = rec; render(); setMsg('msg-pl-dates', 'Saved.', 'ok'); return true;
      }
    } catch (e) {
      const where = ds.plSaveatt ? `msg-pl-${sid(ds.plSaveatt)}` : ds.plSavedates ? 'msg-pl-dates' : ds.plCopy ? 'msg-pl-copy' : 'msg-pl-avail';
      setMsg(where, e.message, 'err'); return true;
    }
    return false;
  }
  function onChange(e) {
    const t = e.target;
    if (t.dataset?.plPickday && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) { S.pl.day = t.value; render(); return true; }
    return false;
  }
  function subscribe(db) {
    db.collection('pelatnas_availability').onSnapshot((snap) => { S.pl_avail = snap.docs.map((x) => x.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('pelatnas_attendance').onSnapshot((snap) => { S.pl_att = snap.docs.map((x) => x.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.doc('config/pelatnas').onSnapshot((d) => { const x = d.data(); S.pl_camp = x?.camp || null; render(); }, () => {});
  }
  // For Today and the weekly brief: open availability answers and today's attendance.
  function todayLine() {
    const ts = titles();
    const sum = P.availabilitySummary(Object.fromEntries(ts.map((t) => [t, roster(t)])), S.pl_avail);
    const open = sum.reduce((a, r) => a + r.open.length, 0);
    const sessions = P.daySessions(S.scrims || [], localDay(), ts);
    const taken = sessions.filter((s) => attOf(s.id)).length;
    return { campText: P.campLine(S.pl_camp).text, open, sessions: sessions.length, taken };
  }
  return { dayPage, availPage, onClick, onChange, subscribe, todayLine };
}
