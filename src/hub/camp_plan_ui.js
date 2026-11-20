// V1.35 Camp plan screen (Pelatnas → Camp plan): every title's coach builds the camp's phases on a monthly
// timeline, sets each day's level, keeps a daily unit template, and marks each day as run. Logic and checks
// live in src/core/camp_plan.js; this file only draws and saves. One record per title in camp_plans.
import * as C from '../core/camp_plan.js';
import { EVENT } from '../core/matchday.js';
import { TITLES as WEC_TITLES } from '../core/staff.js';

const DECK_CAMP = { start: '2026-11-16', end: '2026-12-12' }; // the example camp in the periodisation deck
const MARK = { 'as-planned': '✓', partly: '½', 'not-run': '✗' };

export function campPlanUi(ctx) {
  const { S, esc, tag, banner, setMsg, val, render, meName, sid, localDay, titleVisible, canEdit, loadsVisible } = ctx;
  S.cp ||= { title: null, day: null, unitDay: 'Mon' };
  S.camp_plans ||= [];
  const titles = () => WEC_TITLES.map((t) => t.id).filter(titleVisible);
  const planOf = (title) => S.camp_plans.find((p) => p.title === title) || null;
  const sessionsOf = (title) => (S.scrims || []).filter((s) => s.title === title);
  const loadsOf = (title) => (loadsVisible() ? (S.well?.loads || []).filter((x) => x.title === title) : null);
  const pct = (x) => (x == null ? '—' : `${x}%`);

  async function save(plan) {
    if (S.db) await S.db.collection('camp_plans').doc(sid(plan.id)).set(plan);
    const i = S.camp_plans.findIndex((p) => p.id === plan.id);
    if (i >= 0) S.camp_plans[i] = plan; else S.camp_plans.push(plan);
  }

  function overviewPanel(today) {
    const rows = C.overview(titles(), S.camp_plans, today, sessionsOf);
    return `<div class="panel hero-panel"><div class="lead">Camp <em>plan</em></div>
      <p>Each title plans the pelatnas on a monthly timeline: a phase per week (accumulation → peak volume → transmutation → taper), a level for every day, and a daily unit template. Mark each day as it is run; the hub tracks the rest.</p>
      <div class="tw"><table><thead><tr><th>Title</th><th>Now</th><th class="n">Days run as planned</th><th class="n">Days not marked</th><th class="n">Sessions logged</th><th class="n">Plan warnings</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><button type="button" class="linkish" data-cp-title="${esc(r.title)}">${esc(r.title)}</button></td>
        ${r.plan ? `<td>${r.week ? `Week ${r.week} · ${esc(r.phase)}` : esc(r.state)}</td><td class="n">${pct(r.adherence)}</td><td class="n">${r.unmarked ? `<b>${r.unmarked}</b>` : '0'}</td><td class="n">${r.logged}</td><td class="n">${r.warnings ? tag('c-Low', String(r.warnings)) : '0'}</td>`
        : `<td colspan="5"><span class="note">No camp plan yet.</span></td>`}</tr>`).join('')}
      </tbody></table></div>
      <p class="note">"Days run as planned": of the days marked so far, as planned counts 1 and partly counts ½. Days off are not counted.</p></div>`;
  }

  function createPanel(title) {
    const c = S.pl_camp || DECK_CAMP;
    if (!canEdit(title)) return `<div class="panel"><h2>${esc(title)}</h2><p class="empty">No camp plan yet. The ${esc(title)} coach makes it here.</p></div>`;
    return `<div class="panel"><h2>Make the ${esc(title)} camp plan</h2>
      <p>Starts from the hybrid model: week 1 accumulation (≈74 % load), peak volume (100 %), transmutation (≈89 %), taper (≈54 %); Mon high, Tue medium, Wed high, Thu low, Fri high, Sat simulation, Sun off. Change anything afterwards. To see a finished plan first, open the <button type="button" class="linkish" data-cp-title="${esc(C.EXAMPLE_TITLE)}">Example</button> tab.</p>
      <div class="grid3"><label class="field">Start<input type="date" id="cpStart" value="${esc(c.start)}"></label>
        <label class="field">End<input type="date" id="cpEnd" value="${esc(c.end)}"></label></div>
      <div class="toolbar"><button class="btn primary" type="button" data-cp-create="${esc(title)}">Make the plan</button><span class="msg" id="msg-cp-create" role="status"></span></div>
      <p class="note">${S.pl_camp ? 'Dates taken from the Pelatnas board.' : 'Camp dates are not recorded yet, so the deck\'s example dates (16 Nov – 12 Dec) are filled in.'}</p></div>`;
  }

  function calendar(plan, today) {
    const until = [plan.end, EVENT.end].sort().at(-1);
    const sel = S.cp.day;
    const cell = (d) => {
      if (!d) return '<td class="cp-empty"></td>';
      const day = plan.days[d]; const wec = d >= EVENT.start && d <= EVENT.end;
      const n = +d.slice(8);
      if (!day) return `<td class="cp-out${wec ? ' cp-wec' : ''}"><span class="cp-n">${n}</span>${wec ? '<span class="cp-l">WEC</span>' : ''}</td>`;
      const wi = C.weekIndex(plan, d); const first = d === C.addDays(plan.start, wi * 7);
      const cls = `cp-day cp-${day.level}${d === today ? ' cp-today' : ''}${d === sel ? ' cp-sel' : ''}${d < today && day.level !== 'off' && !day.status ? ' cp-miss' : ''}`;
      return `<td><button type="button" class="${cls}" data-cp-day="${d}" aria-pressed="${d === sel}" aria-label="${esc(`${d}, ${C.LEVELS[day.level].label}${day.status ? `, ${C.STATUS_LABEL[day.status]}` : ''}`)}">
        <span class="cp-n">${n}${day.status ? ` <b class="cp-m cp-m-${day.status}">${MARK[day.status]}</b>` : ''}</span>
        <span class="cp-l">${esc(C.LEVELS[day.level].label)}</span>${first ? `<span class="cp-ph">W${wi + 1} · ${esc(C.PHASE[plan.weeks[wi].phase].label)}</span>` : ''}</button></td>`;
    };
    return `<div class="panel"><h2>Monthly timeline</h2>
      <div class="cp-legend">${C.LEVEL_IDS.map((l) => `<span class="cp-key cp-${l}">${esc(C.LEVELS[l].label)} · ${C.LEVELS[l].hours} h</span>`).join('')}<span class="cp-key cp-wec">WEC ${esc(EVENT.start.slice(8))}–${esc(EVENT.end.slice(8))} Dec</span><span class="note">✓ as planned · ½ partly · ✗ not run · dashed = past day not marked</span></div>
      <div class="cp-months">${C.months(plan.start, until).map((m) => `<div class="cp-month"><h3 class="h3">${esc(m.label)}</h3>
        <table class="cp-cal"><thead><tr>${C.WEEKDAYS.map((w) => `<th>${w}</th>`).join('')}</tr></thead><tbody>${m.rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</div>
      <p class="note">Tap a day to set its level, mark it, or read that weekday's units.</p></div>`;
  }

  function dayPanel(plan, title, today) {
    const d = C.inPlan(plan, S.cp.day) ? S.cp.day : C.inPlan(plan, today) ? today : plan.start;
    const day = plan.days[d]; const wi = C.weekIndex(plan, d); const wk = C.weekday(d);
    const u = plan.units?.[wk] || {};
    const edit = !plan.example && canEdit(title);
    return `<div class="panel"><h2>${esc(wk)} ${esc(d)} · Week ${wi + 1}, ${esc(C.PHASE[plan.weeks[wi].phase].label)}</h2>
      ${edit ? `<div class="grid3"><label class="field">Day level<select id="cpLevel">${C.LEVEL_IDS.map((l) => `<option value="${l}" ${day.level === l ? 'selected' : ''}>${esc(C.LEVELS[l].label)} (±${C.LEVELS[l].hours} h)</option>`).join('')}</select></label>
        <label class="field wide">Note (optional)<input id="cpNote" maxlength="${C.LIMITS.note}" value="${esc(day.note || '')}" placeholder="e.g. scrim block 2 swapped for VOD (yellow status)"></label></div>
        <div class="h3">Was it run?</div>
        <div class="pl-marks">${C.STATUS.map((s) => `<button type="button" class="chip ${day.status === s ? 'on' : ''} cp-s-${s}" aria-pressed="${day.status === s}" data-cp-status="${s}" ${d > today ? 'disabled' : ''}>${C.STATUS_LABEL[s]}</button>`).join('')}</div>
        <div class="toolbar"><button class="btn primary" type="button" data-cp-saveday="${esc(d)}">Save day</button><span class="msg" id="msg-cp-day" role="status"></span></div>
        ${d > today ? '<p class="note">Days can be marked once they have happened.</p>' : ''}`
        : `<p>${tag('c-Low', C.LEVELS[day.level].label)} ${day.status ? tag('s-done', C.STATUS_LABEL[day.status]) : '<span class="note">not marked</span>'} ${day.note ? `· ${esc(day.note)}` : ''}</p>`}
      ${day.level === 'off' ? '' : `<div class="h3">${esc(wk)} units</div><ul class="plain">${C.UNIT_ROWS.filter((r) => u[r.id]).map((r) => `<li><b>${esc(r.label)}</b> <span class="note">${esc(r.time)}</span> — ${esc(u[r.id])}</li>`).join('') || '<li class="note">No units written for this weekday.</li>'}</ul>`}</div>`;
  }

  function weeksPanel(plan, title, prog) {
    const edit = !plan.example && canEdit(title);
    const loadsOn = prog.weeks.some((w) => w.load != null);
    const bar = (w) => `<div class="cp-bars" aria-hidden="true"><span class="cp-bar cp-plan" style="width:${Math.min(w.target, 120) / 1.2}%"></span>${w.actual != null ? `<span class="cp-bar cp-act" style="width:${Math.min(w.actual, 120) / 1.2}%"></span>` : ''}</div>`;
    return `<div class="panel"><h2>Weeks: planned and actual</h2>
      <div class="tw"><table><thead><tr><th>Week</th><th>Dates</th><th>Phase</th><th class="n">Target load</th><th class="n">Planned hours</th><th class="n">Days marked</th><th class="n">As planned</th><th class="n">Sessions logged</th>${loadsOn ? '<th class="n">Actual load</th>' : ''}<th>Planned vs actual</th></tr></thead><tbody>
      ${prog.weeks.map((w) => `<tr${prog.current?.i === w.i ? ' class="cp-now"' : ''}><td>W${w.n}</td><td class="note">${esc(w.from.slice(5))} – ${esc(w.to.slice(5))}</td>
        <td>${edit ? `<select id="cpPh-${w.i}" aria-label="Phase, week ${w.n}">${C.PHASES.map((p) => `<option value="${p.id}" ${w.phase === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>` : esc(C.PHASE[w.phase].label)}</td>
        <td class="n">${edit ? `<input id="cpTg-${w.i}" type="number" min="0" max="120" value="${w.target}" aria-label="Target load %, week ${w.n}" style="width:5em"> % <button class="btn small" type="button" data-cp-saveweek="${w.i}">Save</button>` : `${w.target}%`}</td>
        <td class="n">${w.hours}</td><td class="n">${w.marked} / ${w.past}</td><td class="n">${pct(w.adherence)}</td><td class="n">${w.logged}</td>${loadsOn ? `<td class="n">${pct(w.actual)}</td>` : ''}<td>${bar(w)}</td></tr>`).join('')}
      </tbody></table></div><span class="msg" id="msg-cp-week" role="status"></span>
      <p class="note">Target load is a % of the peak week (the deck: 74 → 100 → 89 → 54). ${loadsOn ? 'Actual load comes from the session-RPE records (minutes × RPE) for this title, put on the same scale: 100 % is the load that matches the weeks already finished, on average. Grey bar planned, red bar actual.' : 'Actual load appears here for staff who can see the session-RPE records (readiness owner, admins). Grey bar: planned.'}</p>
      <div class="cp-phases">${C.PHASES.map((p) => `<div class="obj"><h3>${esc(p.label)} <span class="note">≈${p.target}%</span></h3><p class="note">${esc(p.hint)}</p></div>`).join('')}</div></div>`;
  }

  function unitsPanel(plan, title) {
    const edit = !plan.example && canEdit(title); const wd = S.cp.unitDay || 'Mon';
    const u = plan.units?.[wd] || {};
    return `<div class="panel"><h2>Daily unit template</h2>
      <div class="tw"><table class="cp-units"><thead><tr><th>Unit</th>${C.WEEKDAYS.map((w) => `<th>${w}</th>`).join('')}</tr></thead><tbody>
      ${C.UNIT_ROWS.map((r) => `<tr><td><b>${esc(r.label)}</b><br><span class="note">${esc(r.time)}</span></td>${C.WEEKDAYS.map((w) => `<td class="note">${esc(plan.units?.[w]?.[r.id] || '')}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <p class="note">Break 14.30–15.00 (active: walk, stretch, drink) · dinner 17.00–18.00 without screens · sRPE filled in at night, screens off 22.30. Status yellow: scrim block 2 becomes VOD or light drill; red: recovery.</p>
      ${edit ? `<details><summary>Edit a weekday</summary>
        <div class="drseg" role="tablist">${C.WEEKDAYS.map((w) => `<button type="button" role="tab" aria-selected="${w === wd}" data-cp-unitday="${w}">${w}</button>`).join('')}</div>
        <div class="grid3">${C.UNIT_ROWS.map((r) => `<label class="field wide">${esc(r.label)} <span class="note">${esc(r.time)}</span><input id="cpU-${r.id}" maxlength="${C.LIMITS.unit}" value="${esc(u[r.id] || '')}"></label>`).join('')}</div>
        <div class="toolbar"><button class="btn primary" type="button" data-cp-saveunits="${wd}">Save ${wd}</button><span class="msg" id="msg-cp-units" role="status"></span></div></details>` : ''}</div>`;
  }

  function page() {
    const today = localDay();
    const ts = titles();
    if (!ts.length) return '<div class="panel"><p class="empty">No title assigned to you yet.</p></div>';
    const ex = C.EXAMPLE_TITLE;
    const title = S.cp.title === ex || ts.includes(S.cp.title) ? S.cp.title : ts.find((t) => planOf(t)) || ex;
    const plan = title === ex ? C.examplePlan(today) : planOf(title);
    const seg = `<div class="panel"><div class="drseg" role="tablist">${[ex, ...ts].map((t) => `<button type="button" role="tab" aria-selected="${t === title}" data-cp-title="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
    if (!plan) return overviewPanel(today) + seg + createPanel(title);
    const prog = C.progress(plan, today, { sessions: sessionsOf(title), loads: loadsOf(title) });
    const warn = C.warnings(plan);
    const exNote = plan.example ? banner('synth', `<div><b>Example — not saved, not anyone's data.</b> The camp from the periodisation deck (MOBA, 16 Nov – 12 Dec): phases, day levels and the daily unit template, with the days so far marked the way a real camp tends to go. Tap any day to see it. Each title's coach makes their own plan from that title's tab; it starts from this same model.</div>`) : '';
    return `${overviewPanel(today)}${seg}${exNote}
      <div class="panel"><h2>${esc(title)} · ${esc(plan.start)} to ${esc(plan.end)}</h2>
        <div class="stats"><div class="stat"><span class="k">Now</span><span class="v">${prog.current ? `W${prog.current.n}` : esc(prog.state)}</span><span class="note">${prog.current ? esc(C.PHASE[prog.current.phase].label) : ''}</span></div>
          <div class="stat"><span class="k">Days run as planned</span><span class="v">${pct(prog.adherence)}</span><span class="note">${prog.marked} of ${prog.past} days marked</span></div>
          <div class="stat"><span class="k">Days not marked</span><span class="v">${prog.unmarked}</span></div>
          <div class="stat"><span class="k">Sessions logged</span><span class="v">${prog.logged}</span><span class="note">from Scrims &amp; practice</span></div>
          <div class="stat"><span class="k">Days to go</span><span class="v">${prog.daysLeft}</span></div></div>
        ${warn.length ? banner('synth', `<div><b>Check the plan:</b><ul class="plain">${warn.map((w) => `<li>${esc(w.text)}</li>`).join('')}</ul></div>`) : ''}
        <p class="note">Last changed by ${esc(plan.by)}, ${esc(String(plan.at).slice(0, 10))}.</p></div>
      ${calendar(plan, today)}${dayPanel(plan, title, today)}${weeksPanel(plan, title, prog)}${unitsPanel(plan, title)}`;
  }

  async function onClick(t) {
    const ds = t.dataset;
    const title = () => (titles().includes(S.cp.title) ? S.cp.title : null);
    try {
      if (ds.cpTitle) { S.cp.title = ds.cpTitle; S.cp.day = null; render(); return true; }
      if (ds.cpDay) { S.cp.day = ds.cpDay; S.cp.status = undefined; render(); return true; }
      if (ds.cpUnitday) { S.cp.unitDay = ds.cpUnitday; render(); return true; }
      if (ds.cpStatus) {
        const plan = planOf(title()); const d = C.inPlan(plan, S.cp.day) ? S.cp.day : localDay();
        const cur = S.cp.status !== undefined ? S.cp.status : plan.days[d]?.status || '';
        S.cp.status = cur === ds.cpStatus ? '' : ds.cpStatus; S.cp.day = d;
        for (const b of document.querySelectorAll('[data-cp-status]')) { const on = b.dataset.cpStatus === S.cp.status; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
        return true;
      }
      if (ds.cpCreate) {
        if (planOf(ds.cpCreate)) throw new Error('This title already has a camp plan.');
        await save(C.newPlan({ title: ds.cpCreate, start: val('cpStart'), end: val('cpEnd'), by: meName() || 'staff' })); render(); return true;
      }
      if (ds.cpSaveday) {
        const plan = planOf(title()); const d = ds.cpSaveday;
        const status = S.cp.status !== undefined ? S.cp.status : plan.days[d]?.status || '';
        if (status && d > localDay()) throw new Error('Days can be marked once they have happened.');
        await save(C.setDay(plan, d, { level: val('cpLevel'), status, note: val('cpNote') }, meName())); S.cp.status = undefined; render(); setMsg('msg-cp-day', 'Saved.', 'ok'); return true;
      }
      if (ds.cpSaveweek !== undefined) {
        const i = Number(ds.cpSaveweek);
        await save(C.setWeek(planOf(title()), i, { phase: val(`cpPh-${i}`), target: val(`cpTg-${i}`) }, meName())); render(); setMsg('msg-cp-week', `Week ${i + 1} saved.`, 'ok'); return true;
      }
      if (ds.cpSaveunits) {
        const values = Object.fromEntries(C.UNIT_ROWS.map((r) => [r.id, val(`cpU-${r.id}`)]));
        await save(C.setUnits(planOf(title()), ds.cpSaveunits, values, meName())); render(); setMsg('msg-cp-units', 'Saved.', 'ok'); return true;
      }
    } catch (e) {
      setMsg(ds.cpCreate ? 'msg-cp-create' : ds.cpSaveweek !== undefined ? 'msg-cp-week' : ds.cpSaveunits ? 'msg-cp-units' : 'msg-cp-day', e.message, 'err'); return true;
    }
    return false;
  }
  function subscribe(db) {
    db.collection('camp_plans').onSnapshot((snap) => { S.camp_plans = snap.docs.map((x) => x.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
  }
  // For Today: past days of the coach's plans that are not marked yet.
  function todayLine() {
    const today = localDay();
    return C.overview(titles(), S.camp_plans, today, sessionsOf).filter((r) => r.plan).reduce((a, r) => a + r.unmarked, 0);
  }
  return { page, onClick, subscribe, todayLine };
}
