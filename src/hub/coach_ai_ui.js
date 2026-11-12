// V1.20 screens for the coach AI: weekly leadership summary (Main dashboard), preparation packs per WEC match
// (Tournament → Preparation packs), recurring weaknesses (a tab per title) and PUBG Mobile results from
// screenshots (PUBG Mobile → Log & import). Logic and checks live in src/core/coach_ai.js, weakness.js and
// src/pubgm/screenshot.js; this file only draws, calls the AI and saves.
import { summaryMaterial, briefFromAi, publishBrief, briefFlagged, prepMaterial, packFromAi, packSessions } from '../core/coach_ai.js';
import { allowedNumbers, checkLine } from '../core/ai_check.js';
import { tagsOf, tagRecord, untagged, weaknessCounts, cleanTags, FLAG_AT } from '../core/weakness.js';
import { proposeBr, brRows, MAPS } from '../pubgm/screenshot.js';
import { shiftDay } from '../core/dates.js';

const COLL = { briefs: 'leadership_briefs', packs: 'prep_packs', wtags: 'weakness_tags' };

export function coachAiUi(ctx) {
  const { S, esc, tag, banner, setMsg, val, render, sid, PLATFORM, HUB_USER, CAN_APPROVE, today, EVENT, titles, titleVisible, cardFor, meName, prepImage, saveScrims, propose, onSaved } = ctx;
  for (const k of Object.keys(COLL)) S[k] ||= [];
  const ai = () => (ctx.aiOn() ? PLATFORM?.ai : null);
  const live = () => S.mode === 'live';
  const writesAll = () => !HUB_USER || HUB_USER.isAdmin || HUB_USER.roles.includes('head_coach');
  const writes = (title) => !HUB_USER || writesAll() || (HUB_USER.roles.length && HUB_USER.titles.includes(title));
  const lineHtml = (x) => (x?.text ? `${esc(x.text)}${x.ok === false ? ` ${tag('c-Blocked', `number not in the figures: ${x.bad.join(', ')}`)}` : ''}` : '');
  async function put(k, rec) {
    if (S.db) await S.db.collection(COLL[k]).doc(sid(rec.id)).set(rec);
    const list = S[k]; const i = list.findIndex((x) => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec);
  }
  function subscribe(db) {
    for (const k of Object.keys(COLL)) db.collection(COLL[k]).onSnapshot((snap) => { S[k] = snap.docs.map((d) => d.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
  }
  const state = () => ({ titles: titles().filter(titleVisible), scrims: S.scrims, reports: S.reports, cycle: S.cycle, wecMatches: S.wecMatches, tags: S.wtags });

  // ---------------------------------------------------------------- weekly summary (Main dashboard)
  function briefPanel() {
    if (!live()) return '';
    const pub = S.briefs.filter((b) => b.status === 'published').sort((a, b) => b.weekEnding.localeCompare(a.weekEnding))[0];
    const d = S.briefDraft;
    const sect = (label, xs) => (xs?.length ? `<div class="h3">${label}</div><ul class="plain">${xs.map((x) => `<li>${x.title ? `<b>${esc(x.title)}:</b> ` : ''}${lineHtml(x)}</li>`).join('')}</ul>` : '');
    const view = (b) => `<p><b>${lineHtml(b.headline)}</b></p>${sect('Per title', b.titles)}${sect('Needs attention', b.attention)}${sect('Next week', b.nextWeek)}`;
    const edit = (b) => {
      const box = (id, x, lab = '') => `<label class="field" for="${id}">${lab}<textarea id="${id}" rows="2">${esc(x?.text || '')}</textarea>${x && x.ok === false ? `<span class="note">${tag('c-Blocked', `number not in the figures: ${x.bad.join(', ')}`)} Fix it or the line is left out.</span>` : ''}</label>`;
      return `${box('brfH', b.headline, 'Headline')}${b.titles.map((x, i) => box(`brfT${i}`, x, esc(x.title))).join('')}${b.attention.map((x, i) => box(`brfA${i}`, x, i ? '' : 'Needs attention')).join('')}${b.nextWeek.map((x, i) => box(`brfN${i}`, x, i ? '' : 'Next week')).join('')}`;
    };
    return `<div class="panel" id="briefPanel"><h2>Weekly summary for leadership</h2>
      ${pub ? `${view(pub)}<p class="note">Week ending ${esc(pub.weekEnding)} · approved by ${esc(pub.publishedBy)}. Written with AI from the figures on this page and checked by the Head Coach.</p>` : '<p class="empty">No summary published yet.</p>'}
      ${writesAll() ? (d ? `<div class="obj"><div class="h3">Draft for the week ending ${esc(d.weekEnding)}${briefFlagged(d) ? ` ${tag('c-Blocked', `${briefFlagged(d)} line(s) with an unchecked number`)}` : ''}</div>${edit(d)}
          <details><summary class="btn ghost">Figures the AI was given</summary><pre class="mono">${esc(JSON.stringify(S.briefMaterial, null, 1))}</pre></details>
          <div class="toolbar"><button class="btn primary" type="button" data-co-brief-publish="1">Approve and publish</button><button class="btn" type="button" data-co-brief-drop="1">Discard draft</button><span class="msg" id="coBriefMsg" role="status"></span></div></div>`
        : ai() ? `<div class="toolbar"><button class="btn" type="button" data-co-brief="1">Draft this week's summary with AI</button><span class="msg" id="coBriefMsg" role="status"></span></div>
          <p class="note">The AI writes in Bahasa Indonesia from this page's figures only; any number not in them is marked. You edit and approve before leadership sees it.</p>` : '') : ''}</div>`;
  }

  // ---------------------------------------------------------------- preparation packs (Tournament)
  function prepPage() {
    if (!live()) return `<div class="panel">${banner('synth', '<div>Preparation packs use operational records only.</div>')}</div>`;
    const t0 = today();
    const matches = S.wecMatches.filter((m) => titleVisible(m.title) && !m.result && m.date >= t0).sort((a, b) => a.date.localeCompare(b.date));
    const card = (m) => {
      const p = S.packs.find((x) => x.matchId === m.id);
      const planned = p ? S.scrims.filter((s) => s.prepPack === p.id) : [];
      const src = (xs) => (xs?.length ? ` <span class="note">[${xs.map(esc).join(', ')}]</span>` : '');
      return `<article class="obj" id="pp-${esc(sid(m.id))}"><header><div><span class="note">${esc(m.date)}${m.time ? ` ${esc(m.time)}` : ''} · ${esc(m.stage || 'stage TBD')}</span><h3>${esc(m.title)} vs ${esc(m.opponent)}</h3></div>${p ? tag(p.status === 'approved' ? 'c-Verified' : 'c-Low', p.status === 'approved' ? `approved by ${p.approvedBy}` : 'draft') : ''}</header>
        ${p ? `<p>${lineHtml(p.summary)}</p>
          ${p.tendencies.length ? `<div class="h3">Their tendencies</div><ul class="plain">${p.tendencies.map((x) => `<li>${lineHtml(x)}${src(x.sources)}</li>`).join('')}</ul>` : ''}
          ${p.focus.length ? `<div class="h3">Our focus before the match</div><ul class="plain">${p.focus.map((x) => `<li><b>${lineHtml(x)}</b>${src(x.sources)}<br><span class="note">Drill: ${esc(x.drill)} · Check: ${esc(x.measure)}</span></li>`).join('')}</ul>` : ''}
          ${p.scrims.length ? `<div class="h3">Suggested sessions</div><ul class="plain">${p.scrims.map((s) => `<li>${esc(shiftDay(t0, s.day))} · ${s.partner === 'internal' ? 'internal' : `vs ${esc(s.partner)}`} · ${esc(s.focus)}</li>`).join('')}</ul>` : ''}
          ${p.watchOut.length ? `<div class="h3">Watch out</div><ul class="plain">${p.watchOut.map((x) => `<li>${lineHtml(x)}</li>`).join('')}</ul>` : ''}
          <p class="note">Sources in brackets: C = opponent card, S = scrims vs stand-ins, W = our recurring weaknesses, B = draft book, RP = scrim reports, P = partner bank.</p>` : '<p class="empty">No pack yet.</p>'}
        <div class="toolbar">
          ${ai() && writes(m.title) ? `<button class="btn${p ? '' : ' primary'}" type="button" data-co-prep="${esc(m.id)}">${p ? 'Draft again with AI' : 'Draft the pack with AI'}</button>` : ''}
          ${p && p.status === 'draft' && CAN_APPROVE ? `<button class="btn" type="button" data-co-prep-approve="${esc(m.id)}">Approve${HUB_USER ? ` as ${esc(HUB_USER.name)}` : ''}</button>` : ''}
          ${p && p.status === 'approved' && writes(m.title) && p.scrims.length && !planned.length ? `<button class="btn primary" type="button" data-co-prep-plan="${esc(m.id)}">Add ${p.scrims.length} session(s) to the plan</button>` : ''}
          ${planned.length ? `<span class="note">${planned.length} session(s) planned from this pack.</span>` : ''}
          <span class="msg" id="ppMsg-${esc(sid(m.id))}" role="status"></span></div></article>`;
    };
    return `<div class="panel"><div class="lead">Preparation <em>packs</em></div>
      <p>One page per WEC match: what the opponent tends to do, our focus for the days before, and suggested scrims. The AI drafts it from the opponent card, our results against stand-ins, our recurring weaknesses, the draft book and the partner bank; a Head Coach or assistant coach approves it, then the sessions go into the plan.</p>
      ${ai() ? '' : banner('warn', '<div>Drafting needs the AI on the website. Approved packs can still be read here.</div>')}</div>
      ${matches.length ? matches.map(card).join('') : `<div class="panel"><p class="empty">No upcoming WEC match entered. Add them under Tournament → Match-day runbook.</p></div>`}`;
  }

  // ---------------------------------------------------------------- recurring weaknesses (per title)
  function weaknessPage(title) {
    if (!live()) return `<div class="panel">${banner('synth', '<div>Weaknesses use operational records only.</div>')}</div>`;
    const t0 = today(); const fid = sid(title);
    const counts = weaknessCounts(S.wtags, title, t0, 14);
    const todo = untagged(S.reports, S.wtags, title);
    const recent = S.reports.filter((r) => r.title === title && r.date >= shiftDay(t0, -13)).sort((a, b) => b.date.localeCompare(a.date));
    const tagsFor = (r) => S.wtags.find((t) => t.reportId === r.id);
    const inCycle = new Set(S.cycle.filter((o) => o.title === title && !['retired', 'rejected'].includes(o.status)).map((o) => o.rec?.problem));
    const label = (w) => `Recurring weakness: ${w.tag}`;
    return `<div class="panel"><div class="lead">${esc(title)}: recurring <em>weaknesses</em></div>
      <p>What keeps failing, from what coaches write under "What failed" and "Adjustment". Each report gets up to 3 labels (by AI or by hand, always correctable). A label that comes back ${FLAG_AT} or more times in 14 days is flagged: turn it into a coaching proposal.</p>
      ${writes(title) && todo.length ? `<div class="toolbar">${ai() ? `<button class="btn" type="button" data-co-tag="${esc(title)}">Label ${Math.min(todo.length, 20)} report(s) with AI</button>` : ''}<span class="note">${todo.length} report(s) with something failing are not labelled yet.</span><span class="msg" id="wtMsg-${esc(fid)}" role="status"></span></div>` : ''}</div>
    <div class="panel"><h2>Last 14 days</h2>${counts.length ? `<div class="tw"><table><thead><tr><th>Weakness</th><th class="n">Reports</th><th class="n">14 days before</th><th></th></tr></thead><tbody>
      ${counts.map((w) => `<tr><td><b>${esc(w.tag)}</b> ${w.flagged ? tag('c-Blocked', 'keeps coming back') : ''}${w.rising && w.prev ? ' <span class="note">▲ rising</span>' : ''}</td><td class="n">${w.n}</td><td class="n">${w.prev}</td>
        <td>${w.flagged && writes(title) ? (inCycle.has(label(w)) ? tag('c-Medium', 'in the coaching cycle') : `<button class="btn" type="button" data-co-weak-propose="${esc(`${title}|${w.tag}`)}">Make it a proposal</button>`) : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty">No labelled reports in the last 28 days.</p>'}</div>
    <div class="panel"><h2>Reports and their labels</h2>${recent.length ? `<ul class="plain">${recent.map((r) => { const t = tagsFor(r); const have = t?.tags || [];
      return `<li><span class="note">${esc(r.date)} · vs ${esc(r.partner)}${t ? ` · ${esc(t.source === 'ai' ? 'AI' : t.by)}` : ''}</span><br>${esc(r.failed || '—')}
        <div class="chips">${tagsOf(title).map((x) => `<button type="button" class="chip${have.includes(x) ? ' planned' : ''}" aria-pressed="${have.includes(x)}" ${writes(title) ? '' : 'disabled'} data-co-wt="${esc(`${r.id}|${x}`)}">${esc(x)}</button>`).join('')}</div></li>`; }).join('')}</ul>` : '<p class="empty">No reports in the last 14 days.</p>'}</div>`;
  }
  // After a report is saved: label it in the background (one small AI call). Silent on failure.
  async function autoTag(report) {
    if (!ai() || !String(report.failed || '').trim() || !tagsOf(report.title).length) return;
    try {
      const out = await ai().call({ action: 'tags', title: report.title, reports: [{ id: report.id, failed: report.failed, adjust: report.adjust }] });
      const got = (out.raw?.reports || []).find((x) => x.id === report.id);
      if (got) await put('wtags', tagRecord(report, got.tags, { by: 'AI', source: 'ai' }));
    } catch { /* labels can be added on the Weaknesses tab */ }
  }

  // ---------------------------------------------------------------- PUBG Mobile results from screenshots
  function brSection() {
    if (!live()) return '';
    const p = S.brPending;
    const num = (id, v, lab, attrs = 'min="0" max="80"') => `<label class="field" for="${id}">${lab}<input type="number" inputmode="numeric" id="${id}" ${attrs} value="${v ?? ''}"></label>`;
    return `<div class="panel" id="brPanel"><h2>Results from screenshots</h2>
      <p>Upload the end-of-match result screen (and the lobby standings, if the room shows them). The AI reads placement, kills and survival; you check, then it goes into the match log below, with no CSV to paste.</p>
      ${p ? `<div class="obj">${p.issues.map((i) => banner(i.level === 'block' ? 'block' : 'warn', `<div>${esc(i.text)}</div>`)).join('')}
        <div class="form"><label class="field" for="brMap">Map<select id="brMap"><option value=""></option>${MAPS.map((m) => `<option ${m === p.map ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
          ${num('brPlace', p.placement, 'Our placement', 'min="1" max="16"')}${num('brKills', p.kills, 'Team kills')}${num('brSurv', p.survivalS, 'Longest survival (s)', 'min="0" max="3000"')}
          <label class="field" for="brMatch">Match label<input type="text" id="brMatch" value="${esc(p.matchLabel)}"></label></div>
        ${p.players.length ? `<div class="tw"><table><thead><tr><th>Player (as read)</th><th class="n">Kills</th><th class="n">Damage</th><th class="n">Survived</th></tr></thead><tbody>${p.players.map((x) => `<tr><td>${esc(x.name)}${x.unsure ? ` ${tag('c-Low', 'check')}` : ''}</td><td class="n">${x.kills ?? '—'}</td><td class="n">${x.damage ?? '—'}</td><td class="n">${x.survivalS ?? '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${p.lobby.length ? `<p class="note">Lobby standings read: ${p.lobby.length} teams. They are saved with ours so the lobby comparison works.</p>` : ''}
        <div class="toolbar"><button class="btn primary" type="button" data-co-br-save="1">Save to the match log</button><button class="btn" type="button" data-co-br-drop="1">Discard</button><span class="msg" id="brMsg" role="status"></span></div></div>`
      : ai() ? `<div class="toolbar"><label class="btn primary filebtn">Upload result screenshot(s)<input type="file" accept="image/*" multiple data-co-br-file="1" hidden></label><span class="msg" id="brMsg" role="status"></span></div>` : banner('warn', '<div>Screenshot reading needs the AI on the website. The CSV route below still works.</div>')}</div>`;
  }
  async function readBr(files) {
    let merged = null;
    for (const f of files) {
      const img = await prepImage(f);
      const out = await ai().call({ action: 'br_result', title: 'PUBG Mobile', image: img, day: today() });
      const pr = proposeBr(out.raw);
      if (pr.issues.some((i) => i.level === 'block')) throw new Error(pr.issues[0].text);
      merged = merged ? { ...merged, map: merged.map || pr.map, placement: merged.placement ?? pr.placement, kills: merged.kills ?? pr.kills, survivalS: merged.survivalS ?? pr.survivalS,
        players: merged.players.length ? merged.players : pr.players, lobby: merged.lobby.length ? merged.lobby : pr.lobby, issues: [...merged.issues, ...pr.issues] } : pr;
    }
    const n = S.pubgm.logged.matches.filter((r) => String(r.date) === today()).length;
    S.brPending = { ...merged, matchLabel: `S-${today().replace(/-/g, '')}-${n + 1}` };
  }

  // ---------------------------------------------------------------- clicks
  async function onClick(t) {
    const ds = t.dataset;
    try {
      if (ds.coBrief) {
        setMsg('coBriefMsg', 'Writing… (10–20 s)');
        const material = summaryMaterial(state(), today(), EVENT);
        const out = await ai().call({ action: 'summary', title: '', material });
        S.briefMaterial = material; S.briefDraft = briefFromAi(out.raw, material, HUB_USER?.name || meName()); render(); return true;
      }
      if (ds.coBriefDrop) { S.briefDraft = null; render(); return true; }
      if (ds.coBriefPublish) {
        const d = S.briefDraft; const ok = allowedNumbers(S.briefMaterial);
        const re = (id, x) => ({ ...x, ...checkLine(val(id), ok) });
        const edited = { ...d, headline: re('brfH', d.headline), titles: d.titles.map((x, i) => re(`brfT${i}`, x)), attention: d.attention.map((x, i) => re(`brfA${i}`, x)), nextWeek: d.nextWeek.map((x, i) => re(`brfN${i}`, x)) };
        const rec = publishBrief(edited, { by: HUB_USER?.name || meName() });
        await put('briefs', rec); S.briefDraft = null; render(); setMsg('coBriefMsg', 'Published: leadership sees it on the Main dashboard.', 'ok'); return true;
      }
      if (ds.coPrep || ds.coPrepApprove || ds.coPrepPlan) {
        const m = S.wecMatches.find((x) => x.id === (ds.coPrep || ds.coPrepApprove || ds.coPrepPlan)); if (!m) return true;
        const msg = `ppMsg-${sid(m.id)}`;
        if (ds.coPrep) {
          setMsg(msg, 'Drafting… (15–30 s)');
          const { card, standIn, book, partners } = cardFor(m.title, m.opponent);
          const reports = S.reports.filter((r) => r.title === m.title).sort((a, b) => b.date.localeCompare(a.date));
          const material = prepMaterial({ match: m, card, standIn, weaknesses: weaknessCounts(S.wtags, m.title, today(), 14), reports, book, partners, asOf: today() });
          const out = await ai().call({ action: 'prep', title: m.title, material });
          const prev = S.packs.find((x) => x.matchId === m.id);
          const pack = { ...packFromAi(out.raw, material, m, HUB_USER?.name || meName()), version: (prev?.version || 0) + 1 };
          await put('packs', pack); render(); setMsg(`ppMsg-${sid(m.id)}`, 'Draft saved. Another coach approves it.', 'ok'); return true;
        }
        const p = S.packs.find((x) => x.matchId === m.id);
        if (ds.coPrepApprove) {
          const rec = HUB_USER && S.db?.approve ? await S.db.approve('prep_packs', sid(p.id)) : { ...p, status: 'approved', approvedBy: meName(), approvedAt: new Date().toISOString() };
          if (!S.db?.approve) await put('packs', rec); else { const i = S.packs.findIndex((x) => x.id === rec.id); S.packs[i] = rec; }
          render(); setMsg(`ppMsg-${sid(m.id)}`, 'Approved.', 'ok'); return true;
        }
        const sessions = packSessions(p, { asOf: today(), owner: HUB_USER?.name || meName() }).map((s) => ({ ...s, prepPack: p.id }));
        await saveScrims(sessions); render(); setMsg(`ppMsg-${sid(m.id)}`, `${sessions.length} session(s) added to Scrims & practice.`, 'ok'); return true;
      }
      if (ds.coTag) {
        const title = ds.coTag; const todo = untagged(S.reports, S.wtags, title).slice(0, 20);
        setMsg(`wtMsg-${sid(title)}`, 'Labelling…');
        const out = await ai().call({ action: 'tags', title, reports: todo.map((r) => ({ id: r.id, failed: r.failed, adjust: r.adjust })) });
        let n = 0;
        for (const x of out.raw?.reports || []) { const r = todo.find((y) => y.id === x.id); if (r) { await put('wtags', tagRecord(r, x.tags, { by: 'AI', source: 'ai' })); n++; } }
        render(); setMsg(`wtMsg-${sid(title)}`, `${n} report(s) labelled. Tap a label to correct it.`, 'ok'); return true;
      }
      if (ds.coWt) {
        const [rid, tg] = ds.coWt.split('|'); const r = S.reports.find((x) => x.id === rid); if (!r) return true;
        const cur = S.wtags.find((x) => x.reportId === rid)?.tags || [];
        const next = cur.includes(tg) ? cur.filter((x) => x !== tg) : cleanTags(r.title, [...cur, tg]);
        await put('wtags', tagRecord(r, next, { by: HUB_USER?.name || meName(), source: 'coach' })); render(); return true;
      }
      if (ds.coWeakPropose) {
        const [title, tg] = ds.coWeakPropose.split('|'); const w = weaknessCounts(S.wtags, title, today(), 14).find((x) => x.tag === tg);
        await propose(title, `Recurring weakness: ${tg}`, w); render(); return true;
      }
      if (ds.coBrDrop) { S.brPending = null; render(); return true; }
      if (ds.coBrSave) {
        const p = S.brPending; const n = (id) => (val(id) === '' ? null : Number(val(id)));
        const rows = brRows({ matchId: val('brMatch').trim() || p.matchLabel, date: today(), map: val('brMap'), ours: { placement: n('brPlace'), kills: n('brKills'), survivalS: n('brSurv') }, lobby: p.lobby });
        await onSaved(rows); S.brPending = null; render(); setMsg('brMsg', `Saved ${rows.length} row(s) to the match log.`, 'ok'); return true;
      }
    } catch (err) {
      const id = ds.coBrief || ds.coBriefPublish ? 'coBriefMsg' : ds.coPrep || ds.coPrepApprove || ds.coPrepPlan ? `ppMsg-${sid(ds.coPrep || ds.coPrepApprove || ds.coPrepPlan)}` : ds.coTag ? `wtMsg-${sid(ds.coTag)}` : 'brMsg';
      setMsg(id, err.message, 'err'); return true;
    }
    return false;
  }
  async function onChange(e) {
    if (!e.target.dataset?.coBrFile) return false;
    const files = [...(e.target.files || [])]; if (!files.length) return true;
    try { setMsg('brMsg', `Reading ${files.length} screenshot(s)…`); await readBr(files); render(); } catch (err) { setMsg('brMsg', err.message, 'err'); }
    return true;
  }
  return { subscribe, briefPanel, prepPage, weaknessPage, brSection, autoTag, onClick, onChange };
}
