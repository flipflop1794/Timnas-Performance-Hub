// V1.13 screens: game capture from screenshots (with the confirm screen), the debrief dump, the
// Patterns tab (hub-computed facts + AI findings) and the player stat trail. The AI is reached only
// through the website's platform hook (PLATFORM.ai), so the Claude-artifact build and the tests run
// without it: every AI step has a by-hand path.
import { DATA } from './data.gen.js';
import { heroIndex, gameOf, proposeGame, proposeDraft, confirmGame, blankGame, gameToProposal, mergeGames, heroesFromDraft, heroChoices, heroMemory, playerHeroes, findDuplicate, STAT_DEFS, SIDE_LABEL, MAP_SIDES, durationText, parseDuration, latestGames, gamesResult, extractionAccuracy, learnAliases } from '../core/capture.js';
import { checkDebriefInput, checkDebriefSplit } from '../core/debrief.js';
import { facts, checkFindings, findingRecord, markFinding, statTrail, digestPayload, MIN_SAMPLE, standInRecord, statGoalProgress } from '../core/patterns.js';
import { GAME_SIDES, LIMITS } from '../../supabase/functions/_shared/scrim_spec.js';

const HEROES = {
  mlbb: heroIndex(DATA.mlbbHeroes),
  dota: heroIndex(DATA.heroesCsv.trim().split(/\r?\n/).slice(1).map((l) => ({ name: l.split(',')[1] }))),
};
export const heroesFor = (title) => HEROES[gameOf(title)] || null;

export function captureUi(ctx) {
  const { S, esc, tag, banner, setMsg, val, render, meName, sid, fillReport, localToday, PLATFORM } = ctx;
  const ai = () => PLATFORM?.ai || null;
  S.games ||= []; S.captures ||= {}; S.findings ||= []; S.aliases ||= {}; S.cap ||= {}; S.patPeriod ||= {}; S.patDropped ||= {};

  // ---------------------------------------------------------------- per-form capture state (this device)
  const capKey = (fid) => `hub-cap-${fid}`;
  function st(fid) {
    if (!S.cap[fid]) { let x = null; try { x = JSON.parse(localStorage.getItem(capKey(fid)) || 'null'); } catch { x = null; } S.cap[fid] = x && Array.isArray(x.ready) ? x : { pending: null, ready: [] }; }
    return S.cap[fid];
  }
  function keep(fid) { try { const x = S.cap[fid]; if (x && (x.pending || x.ready.length)) localStorage.setItem(capKey(fid), JSON.stringify(x)); else localStorage.removeItem(capKey(fid)); } catch { /* per-device convenience only */ } }
  // Save a record and show it on this device at once (the shared copy arrives by live update, which can
  // lag or drop on a sleeping phone; the next load replaces the local copy with the stored one).
  async function put(coll, rec) {
    if (S.db) await S.db.collection(coll).doc(rec.id).set(rec);
    const list = coll === 'scrim_games' ? S.games : S.findings; const i = list.findIndex((x) => x.id === rec.id);
    if (i >= 0) list[i] = rec; else list.push(rec);
  }
  const rosterOf = (title) => (S.roster[title] || []).filter(Boolean);
  const aliasesOf = (title) => S.aliases[title]?.aliases || {};
  const gamesOf = (title) => latestGames(S.games.filter((g) => g.title === title));

  // Shrink a screenshot to WebP before upload: long edge at most 1568 px, the size above which the AI
  // scales images down anyway (so no detail is lost, and upload and reading are faster). Quality 0.92
  // keeps small digits sharp. Falls back to the original file.
  async function prepImage(file) {
    if (!/^image\//.test(file.type || '')) throw new Error('Pick an image (a screenshot).');
    let blob = file;
    try {
      const bmp = await createImageBitmap(file); const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const webp = await new Promise((res) => c.toBlob(res, 'image/webp', 0.92));
      if (webp && webp.type === 'image/webp') blob = webp;
    } catch { /* browser without canvas or bitmap support: send the original */ }
    if (blob.size > LIMITS.imageBytes) throw new Error('The screenshot is over 2.5 MB. Take it again, or crop it to the scoreboard.');
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('The screenshot could not be read on this device.')); r.readAsDataURL(blob); });
    return { data: url.slice(url.indexOf(',') + 1), mediaType: blob.type || file.type };
  }

  // ---------------------------------------------------------------- games section in the report form
  function gamesSection(title, fid) {
    if (!gameOf(title)) return '';
    const s = st(fid); const on = !!ai();
    const list = s.ready.map((g, i) => `<li><b>Game ${i + 1}</b> · ${g.result === 'win' ? tag('c-Verified', 'win') : tag('c-Blocked', 'loss')} · ${esc(durationText(g.durationS))}${g.mapSide ? ` · ${esc(SIDE_LABEL[g.mapSide])} side` : ''} · <span class="note">${g.players.filter((p) => p.team === 'ours').map((p) => esc(`${p.player === 'stand-in' ? 'stand-in' : p.player} (${p.hero})`)).join(', ')}${g.draft.length ? ` · draft ${g.draft.length} actions` : ''}${g.source === 'screenshot' ? ` · from screenshot${g.corrections.length ? `, ${g.corrections.length} value${g.corrections.length > 1 ? 's' : ''} corrected` : ''}` : ' · typed'}</span>
      <button type="button" class="linkbtn" data-cap-remove="${esc(`${fid}|${i}`)}">Remove</button></li>`).join('');
    if (s.savedFor) return `<div class="h3">Games</div>${banner('block', `<div><b>${s.ready.length} game(s) of the report vs ${esc(s.savedFor.partner)} (${esc(s.savedFor.date)}) are not saved yet.</b> The report itself is saved.</div>`)}<div class="toolbar"><button class="btn primary" type="button" data-cap-retry="${esc(title)}">Retry saving games</button><span class="msg" id="capMsg-${fid}" role="status"></span></div>`;
    return `<div class="h3">Games</div>
      <p class="note">${on ? 'Upload the screenshots of one game: pick the end-of-game screen first, and you can select the second screen (Data or Scoreboard tab) and the draft or loading screen together with it. The AI sorts them, and a draft fills the heroes. You check every value before it counts.' : 'AI screenshot reading works on the website. Here you can type each game by hand.'} Confirmed games fill the result above and feed the Patterns tab and player trails.</p>
      ${list ? `<ul class="plain capgames">${list}</ul>` : ''}
      ${s.pending ? editorHtml(title, fid, s.pending) : `<div class="toolbar">${on ? `<label class="btn primary filebtn">Add game from screenshot<input type="file" accept="image/*" multiple data-cap-shot="${esc(title)}" hidden></label>` : ''}<button class="btn" type="button" data-cap-manual="${esc(title)}">Add game by hand</button><span class="msg" id="capMsg-${fid}" role="status"></span></div>`}`;
  }
  const flagOf = (p, field) => (p.flags || []).find((f) => f.field === field);
  const cell = (p, field) => { const f = flagOf(p, field); return f ? ` class="flag" title="${esc(f.reason)}" aria-invalid="true"` : ''; };
  // V1.20: each player's Draft Room pool (main / can play) first, then the heroes they used in confirmed games.
  const poolsOf = (title) => {
    const out = {};
    for (const p of (S.dr_pools || []).filter((x) => x.title === title)) out[p.player] = Object.entries(p.heroes || {}).filter(([, v]) => ['main', 'can'].includes(v.tier)).sort((a, b) => (a[1].tier === 'main' ? -1 : 1) - (b[1].tier === 'main' ? -1 : 1)).map(([h]) => h);
    return out;
  };
  const heroHelp = (title) => {
    const gs = gamesOf(title); const used = playerHeroes(gs); const pools = poolsOf(title);
    const merged = Object.fromEntries([...new Set([...Object.keys(used), ...Object.keys(pools)])].map((p) => [p, [...new Set([...(pools[p] || []), ...(used[p] || [])])].slice(0, 6)]));
    return { memory: heroMemory(gs), playerHeroes: merged };
  };
  // Pools for filling an unsure hero: the Draft Room pool, else (Dota, no Draft Room) heroes used 2+ times in scrims.
  const fillPools = (title) => { const p = poolsOf(title); if (Object.keys(p).length) return p; return playerHeroes(gamesOf(title)); };
  function editorHtml(title, fid, pend) {
    const g = pend.base; const game = gameOf(title); const sides = GAME_SIDES[game]; const defs = STAT_DEFS[game]; const roster = rosterOf(title);
    const block = g.issues.some((i) => i.level === 'block');
    const iss = g.issues.length ? banner(block ? 'block' : 'synth', `<div><b>${block ? 'Cannot use this screenshot.' : 'Check before confirming:'}</b><ul class="plain">${g.issues.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul></div>`) : (pend.fromScreenshot && !g.players.some((p) => p.flags.length) ? banner('real', '<div>Read cleanly. Still check each value against the screenshot.</div>') : '');
    const dl = `<datalist id="capHeroes-${fid}">${heroesFor(title).names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
    // Short words in the boxes (phone width); full words in messages.
    const SHORT = { left: 'Left', right: 'Right', blue: 'Blue', red: 'Red', radiant: 'Radiant', dire: 'Dire' };
    const sideSel = (id, cur, extra = '', list = sides, words = SIDE_LABEL) => `<select id="${id}"${extra}><option value=""></option>${list.map((x) => `<option value="${x}" ${x === cur ? 'selected' : ''}>${words[x]}</option>`).join('')}</select>`;
    const help = heroHelp(title);
    const chips = (p, i) => { const c = heroChoices(p, help); return c.length ? `<div class="herochips">${c.map((h) => `<button type="button" class="hchip" data-cap-hero="${esc(`${fid}|${i}|${h}`)}">${esc(h)}</button>`).join('')}</div>` : ''; };
    const heroBlank = g.players.filter((p) => !p.hero).length;
    // Phone first: hero, player and K/D/A come before the wider columns.
    const rows = g.players.map((p, i) => `<tr><td>${sideSel(`cg-${fid}-${i}-side`, p.side, cell(p, 'side'), sides, SHORT)}</td>
      <td><input type="text" id="cg-${fid}-${i}-hero" list="capHeroes-${fid}" value="${esc(p.hero)}"${cell(p, 'hero')} size="10" placeholder="${p.hero ? '' : 'pick'}">${p.hero ? '' : chips(p, i)}</td>
      <td><select id="cg-${fid}-${i}-player"><option value="">${p.side && p.side !== g.ourSide ? '(partner)' : ''}</option>${roster.map((r) => `<option ${r === p.player ? 'selected' : ''}>${esc(r)}</option>`).join('')}<option value="stand-in" ${p.player === 'stand-in' ? 'selected' : ''}>stand-in</option></select></td>
      ${defs.map((d) => `<td><input type="number" inputmode="${d.decimal ? 'decimal' : 'numeric'}" step="${d.decimal ? '0.1' : '1'}" min="0" id="cg-${fid}-${i}-${d.key}" value="${p.stats[d.key] ?? ''}"${cell(p, d.key)}></td>`).join('')}
      <td><input type="text" id="cg-${fid}-${i}-name" value="${esc(p.nameSeen)}"${cell(p, 'name')} size="10"></td></tr>`).join('');
    const dr = pend.draft;
    const draftHtml = dr ? `<div class="h3">Draft</div>${dr.issues.length ? banner('synth', `<div><ul class="plain">${dr.issues.map((i) => `<li>${esc(i.text)}</li>`).join('')}</ul></div>`) : ''}
      <label class="field" for="cd-${fid}-first">First pick${sideSel(`cd-${fid}-first`, dr.firstPick)}</label>
      <div class="tw"><table class="capdraft"><thead><tr><th class="n">#</th><th>Team</th><th>Action</th><th>Hero</th></tr></thead><tbody>${dr.actions.map((a, i) => `<tr><td class="n">${a.order}</td><td>${sideSel(`cd-${fid}-${i}-side`, a.side, '', sides, SHORT)}</td><td><select id="cd-${fid}-${i}-action"><option ${a.action === 'pick' ? 'selected' : ''}>pick</option><option ${a.action === 'ban' ? 'selected' : ''}>ban</option></select></td><td><input type="text" id="cd-${fid}-${i}-hero" list="capHeroes-${fid}" value="${esc(a.hero)}" placeholder="${a.hero ? '' : esc(a.candidates.slice(0, 2).join(' / ') || 'pick')}"${a.flags.length ? ` class="flag" title="${esc(a.flags.map((f) => f.reason).join('; '))}" aria-invalid="true"` : ''}></td></tr>`).join('')}</tbody></table></div>
      <p class="note">Clear a hero to drop a row you cannot read.</p>` : '';
    const names = Object.entries(g.teamNames || {}).filter(([, v]) => v);
    return `<div class="capedit" role="group" aria-label="Check the game">
      ${pend.fix ? banner('synth', `<div><b>Fixing game ${pend.fix.gameNo} of the report vs ${esc(pend.fix.partner)} (${esc(pend.fix.date)}).</b> The old version is kept in the history; the report gets a correction note.</div>`) : ''}
      ${iss}${dl}
      ${names.length ? `<p class="note">Teams on screen: ${names.map(([k, v]) => `${esc(SIDE_LABEL[k])}: ${esc(v)}`).join(' · ')}</p>` : ''}
      <div class="form">
        <label class="field" for="cg-${fid}-our">Our team${sideSel(`cg-${fid}-our`, g.ourSide)}</label>
        <label class="field" for="cg-${fid}-result">Result<select id="cg-${fid}-result"><option value=""></option><option value="win" ${g.result === 'win' ? 'selected' : ''}>Win</option><option value="loss" ${g.result === 'loss' ? 'selected' : ''}>Loss</option></select></label>
        <label class="field" for="cg-${fid}-dur">Duration (mm:ss)<input type="text" inputmode="numeric" id="cg-${fid}-dur" value="${g.durationS == null ? '' : esc(durationText(g.durationS))}" placeholder="18:42"></label>
        ${game === 'mlbb' ? `<label class="field" for="cg-${fid}-map">Our map side (optional)${sideSel(`cg-${fid}-map`, g.mapSide, '', MAP_SIDES.mlbb)}</label>` : ''}
        ${game === 'dota' ? `<label class="field" for="cg-${fid}-mid">Match ID (optional)<input type="text" inputmode="numeric" id="cg-${fid}-mid" value="${esc(pend.matchId || '')}"></label>` : ''}
      </div>
      ${game === 'mlbb' ? '<p class="note">The MLBB result screen does not show which base (blue or red) a team played; set it from the draft or your notes, or leave it empty. Blue/red splits on the Patterns tab use only games where it is set.</p>' : ''}
      ${heroBlank ? `<p class="note"><b>${heroBlank} hero${heroBlank > 1 ? 'es' : ''} to pick.</b> Hero portraits are often skins, so the AI fills only heroes it is sure of. Tap a suggestion under the box (the AI's guesses, earlier corrections and the player's usual heroes) or type the name.${ai() && !dr ? ' A draft screenshot fills them too.' : ''}</p>` : ''}
      <div class="tw"><table class="capgrid"><thead><tr><th>Team</th><th>Hero</th><th>Our player</th>${defs.map((d) => `<th class="n">${esc(d.label)}</th>`).join('')}<th>Name on screen</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Highlighted cells are ones the AI was unsure of or that failed a check: hover or tap for the reason. Empty = not shown on the screen. On a phone, swipe the table sideways for the numbers.</p>
      ${draftHtml}
      <div class="toolbar">${block ? '' : `<button class="btn primary" type="button" data-cap-confirm="${esc(title)}">${pend.fix ? 'Save the fix' : 'Confirm game'}</button>`}
        ${ai() && !block && !pend.fix ? `<label class="btn filebtn">Add another screenshot of this game<input type="file" accept="image/*" multiple data-cap-more="${esc(title)}" hidden></label>` : ''}
        ${ai() && !dr && !block ? `<label class="btn filebtn">Add draft screenshot<input type="file" accept="image/*" data-cap-draft="${esc(title)}" hidden></label>` : ''}
        <button class="btn" type="button" data-cap-discard="${esc(title)}">${pend.fix ? 'Cancel' : 'Discard'}</button><span class="msg" id="capMsg-${fid}" role="status"></span></div>
      ${ai() && !block && !pend.fix ? `<p class="note">${game === 'dota' ? 'Dota spreads a game over two screens: add the Scoreboard tab to the Overview (or the other way round) with "Add another screenshot".' : 'The Data tab adds hero damage, damage taken and turret damage: "Add another screenshot".'}</p>` : ''}</div>`;
  }
  function readEditor(title, fid, pend) {
    const game = gameOf(title); const defs = STAT_DEFS[game];
    const edited = JSON.parse(JSON.stringify(pend.base));
    edited.ourSide = val(`cg-${fid}-our`); edited.result = val(`cg-${fid}-result`); edited.durationS = parseDuration(val(`cg-${fid}-dur`));
    edited.mapSide = game === 'mlbb' ? val(`cg-${fid}-map`) : edited.ourSide;
    edited.players = edited.players.map((p, i) => ({ ...p, side: val(`cg-${fid}-${i}-side`), nameSeen: val(`cg-${fid}-${i}-name`).trim(), player: val(`cg-${fid}-${i}-player`), hero: val(`cg-${fid}-${i}-hero`).trim(),
      stats: Object.fromEntries(defs.map((d) => [d.key, val(`cg-${fid}-${i}-${d.key}`)])) }));
    let draft = null;
    if (pend.draft) draft = { firstPick: val(`cd-${fid}-first`), actions: pend.draft.actions.map((a, i) => ({ order: a.order, side: val(`cd-${fid}-${i}-side`), action: val(`cd-${fid}-${i}-action`), hero: val(`cd-${fid}-${i}-hero`).trim() })).filter((a) => a.hero) };
    return { edited, draft, matchId: game === 'dota' ? val(`cg-${fid}-mid`) : '' };
  }
  // Keep what was typed on the check screen when it is redrawn with new data (second screenshot, draft).
  function syncPending(title, fid) {
    const s = st(fid); if (!s.pending || !document.getElementById(`cg-${fid}-our`)) return;
    let r; try { r = readEditor(title, fid, s.pending); } catch { r = null; }   // a half-typed duration: keep the earlier values
    if (!r) return;
    const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));   // empty box = "not shown", not a value
    r.edited.players.forEach((p, i) => { p.stats = Object.fromEntries(Object.entries(p.stats).map(([k, v]) => [k, num(v)])); p.flags = s.pending.base.players[i]?.flags || []; });
    s.pending.base = { ...s.pending.base, ...r.edited, issues: s.pending.base.issues }; s.pending.matchId = r.matchId;
  }

  // One line for the report's correction note: what changed between two versions of a game.
  function describeFix(a, b) {
    const out = [];
    if (a.result !== b.result) out.push(`result ${a.result} → ${b.result}`);
    if (a.durationS !== b.durationS) out.push(`duration ${durationText(a.durationS)} → ${durationText(b.durationS)}`);
    if ((a.mapSide || '') !== (b.mapSide || '')) out.push(`map side ${a.mapSide || '—'} → ${b.mapSide || '—'}`);
    b.players.forEach((p, i) => { const q = a.players[i]; if (!q) return; const who = p.player || p.nameSeen || `row ${i + 1}`;
      if (q.hero !== p.hero) out.push(`${who} hero ${q.hero || '—'} → ${p.hero || '—'}`);
      if (q.player !== p.player) out.push(`row ${i + 1} player ${q.player || '—'} → ${p.player || '—'}`);
      for (const [k, v] of Object.entries(p.stats)) if (q.stats[k] !== v) out.push(`${who} ${k} ${q.stats[k] ?? '—'} → ${v ?? '—'}`); });
    return out.length ? out.slice(0, 8).join('; ') + (out.length > 8 ? `; +${out.length - 8} more` : '') : 'no value changed';
  }
  // Under a saved report: its games, each with a Fix button.
  function reportGames(r) {
    if (!gameOf(r.title)) return '';
    const gs = gamesOf(r.title).filter((g) => g.reportId === r.id).sort((a, b) => a.gameNo - b.gameNo);
    if (!gs.length) return '';
    const fixed = S.games.filter((g) => g.reportId === r.id && g.supersedes).length;
    return `<div class="tw"><table class="repgames"><thead><tr><th>Game</th><th>Result</th><th>Time</th><th>Our heroes (K/D/A)</th>${S.mode === 'demo' ? '' : '<th></th>'}</tr></thead><tbody>${gs.map((g) => `<tr><td>${g.gameNo}${g.mapSide ? ` <span class="note">${esc(g.mapSide)}</span>` : ''}</td><td>${g.result === 'win' ? 'W' : 'L'}</td><td>${esc(durationText(g.durationS))}</td><td>${g.players.filter((p) => p.team === 'ours').map((p) => `${esc(p.hero)} <span class="note">${p.stats.kills}/${p.stats.deaths}/${p.stats.assists}</span>`).join(', ')}</td>${S.mode === 'demo' ? '' : `<td><button type="button" class="linkbtn" data-cap-fix="${esc(`${g.title}|${g.id}`)}">Fix</button></td>`}</tr>`).join('')}</tbody></table></div>${fixed ? `<p class="note">${fixed} game version(s) corrected; earlier versions are kept in the history.</p>` : ''}`;
  }

  // ---------------------------------------------------------------- debrief dump
  // V1.17 microphone for "Say it once": the browser's speech recognition, appended to the note.
  const SR = () => (typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null);
  const micOk = () => !!SR();
  const MIC = { rec: null, fid: null, lang: null };
  function paintMic() {
    for (const b of document.querySelectorAll('[data-cap-mic]')) {
      const [title, lang] = b.dataset.capMic.split('|'); const on = MIC.fid === sid(title) && MIC.lang === lang;
      b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '■ Stop' : lang === 'id-ID' ? '🎙 Bicara (ID)' : '🎙 Speak (EN)';
    }
  }
  function stopMic() { try { MIC.rec?.stop(); } catch { /* already stopped */ } MIC.rec = null; MIC.fid = null; MIC.lang = null; paintMic(); }
  function startMic(fid, lang) {
    stopMic();
    const rec = new (SR())(); rec.lang = lang; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (ev) => {
      const el = document.getElementById(`rp-${fid}-dump`); if (!el) return;
      for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) el.value = `${el.value}${el.value && !/\s$/.test(el.value) ? ' ' : ''}${ev.results[i][0].transcript.trim()}.`;
    };
    rec.onerror = (ev) => { setMsg(`capDbMsg-${fid}`, ev.error === 'not-allowed' ? 'Microphone blocked: allow it for this site in the browser, or type the note.' : `Speech stopped (${ev.error}). Type the rest, or press the microphone again.`, 'err'); stopMic(); };
    rec.onend = () => { if (MIC.rec === rec) { MIC.rec = null; MIC.fid = null; MIC.lang = null; paintMic(); } };
    MIC.rec = rec; MIC.fid = fid; MIC.lang = lang; rec.start(); paintMic();
  }
  function debriefSection(title, fid) {
    const on = !!ai();
    // V1.16: first thing on the form, and open when AI is on: one dictated note replaces typing four boxes.
    return `<details class="capdump"${on ? ' open' : ''}><summary>Say it once: one note, AI fills the fields${on ? '' : ' (website only)'}</summary>
      <p class="note">Dictate with your phone keyboard's microphone or type freely (Indonesian, English or mixed). The AI only moves your own words into the fields below; check them before saving. Performance only: health or personal details are left out.</p>
      <label class="field" for="rp-${fid}-dump">Your note<textarea rows="4" id="rp-${fid}-dump" maxlength="${LIMITS.debriefChars}" placeholder="e.g. Fokus rotasi early ke turtle. Draft bagus, Kevin cepat rotasi. Lord fight masih telat. Next: set up vision sebelum lord."></textarea></label>
      <div class="toolbar">${on && micOk() ? `<button class="btn" type="button" data-cap-mic="${esc(`${title}|id-ID`)}" aria-pressed="${MIC.fid === fid && MIC.lang === 'id-ID'}">${MIC.fid === fid && MIC.lang === 'id-ID' ? '■ Stop' : '🎙 Bicara (ID)'}</button><button class="btn" type="button" data-cap-mic="${esc(`${title}|en-US`)}" aria-pressed="${MIC.fid === fid && MIC.lang === 'en-US'}">${MIC.fid === fid && MIC.lang === 'en-US' ? '■ Stop' : '🎙 Speak (EN)'}</button>` : ''}${on ? `<button class="btn" type="button" data-cap-debrief="${esc(title)}">Fill the fields</button>` : ''}<span class="msg" id="capDbMsg-${fid}" role="status"></span></div>
      ${on && micOk() ? '<p class="note">The microphone buttons turn speech into text in your browser (Chrome uses Google\'s speech service). Speak, press Stop, read the text, then "Fill the fields".</p>' : ''}<div id="capDbOut-${fid}"></div></details>`;
  }

  // ---------------------------------------------------------------- report save hooks
  function beforeSave(title, fid) {
    if (!gameOf(title)) return null;
    const s = st(fid);
    if (s.savedFor) throw new Error('Save the games of the previous report first ("Retry saving games" under Games).');
    if (s.pending) throw new Error('Confirm or discard the game you are checking first (under Games).');
    return s.ready.length ? gamesResult(s.ready) : null;
  }
  async function afterSave(title, fid, report) {
    if (!gameOf(title)) return;
    const s = st(fid); if (!s.ready.length) return;
    // Remember which report the games belong to, so a failed save can be retried without a new report.
    s.savedFor = { id: report.id, date: report.date, partner: report.partner, by: report.by, partnerLabel: report.partner }; s.savedIds ||= []; keep(fid);
    const saved = s.ready.map((g, i) => ({ ...g, reportId: report.id, date: report.date, partner: report.partner, gameNo: i + 1, by: report.by }));
    for (const g of saved) {
      // A screenshot counts as confirmed once a saved game lists it (captureIds): no second write that
      // could fail on a stale copy.
      if (!s.savedIds.includes(g.id)) { await put('scrim_games', g); s.savedIds.push(g.id); keep(fid); }
    }
    let al = aliasesOf(title); for (const g of saved) al = learnAliases(al, g);
    if (JSON.stringify(al) !== JSON.stringify(aliasesOf(title))) {
      const doc = { title, aliases: al, origin: 'operational' }; S.aliases = { ...S.aliases, [title]: doc };
      if (S.db) { try { await S.db.collection('player_aliases').doc(sid(title)).set(doc); } catch { /* names are a convenience */ } }
    }
    S.cap[fid] = { pending: null, ready: [] }; keep(fid);
  }
  async function retrySave(title, fid) {
    const s = st(fid); if (!s.savedFor) return;
    await afterSave(title, fid, s.savedFor);
  }

  // ---------------------------------------------------------------- Patterns tab
  const inPeriod = (gs, p) => (p === 'all' ? gs : gs.filter((g) => g.date >= ctx.shiftDay(localToday(), -(Number(p) - 1))));
  const wlRow = (f) => `<tr><td>${esc(f.label)}</td><td class="n">${f.n}</td><td class="n">${f.won}-${f.lost}</td><td class="n">${f.winRate}%</td><td>${f.lowSample ? tag('k-hypothesis', `under ${MIN_SAMPLE} games`) : ''}</td></tr>`;
  function patternsPage(title) {
    const fid = sid(title); const per = S.patPeriod[title] || '14';
    const all = gamesOf(title); const gs = inPeriod(all, per);
    const F = facts(gs, { reports: S.reports, scrims: S.scrims, partners: S.partners });
    const acc = extractionAccuracy(gs);
    const groups = (names) => F.filter((f) => names.includes(f.group) && f.won != null);
    const heroesT = F.filter((f) => f.group === 'hero').sort((a, b) => b.n - a.n).slice(0, 12);
    const bans = F.filter((f) => f.group === 'bans');
    const players = F.filter((f) => f.group === 'player');
    const finds = S.findings.filter((x) => x.title === title).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const dropped = S.patDropped[title];
    const head = `<div class="panel"><div class="lead">Patterns — <em>${esc(title)}</em></div>
      <p>Computed by the hub from coach-confirmed scrim games only. Numbers are counts, not predictions. The AI can write findings from these numbers; you decide what is useful.</p>
      <div class="form"><label class="field" for="pat-${fid}-period">Period<select id="pat-${fid}-period" data-pat-period="${esc(title)}">${[['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days'], ['all', 'All games']].map(([v, l]) => `<option value="${v}" ${v === per ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="stats"><div class="stat"><span class="k">Confirmed games</span><span class="v">${gs.length}</span></div>
      <div class="stat"><span class="k">From screenshots</span><span class="v">${acc.games}</span></div>
      <div class="stat"><span class="k">AI values corrected</span><span class="v">${acc.rate == null ? '—' : `${acc.rate}%`}</span></div>
      <div class="stat"><span class="k">With a draft</span><span class="v">${gs.filter((g) => g.draft?.length).length}</span></div></div>
      ${!gs.length ? `<p class="empty">No confirmed games in this period. Add games in the <b>Scrim reports</b> tab (screenshot or by hand).</p>` : ''}
      ${gs.length && gs.length < MIN_SAMPLE ? banner('synth', `<div>Only ${gs.length} game(s): every split below is an early sign, not a pattern.</div>`) : ''}</div>`;
    if (!gs.length) return head + findingsPanel(title, fid, finds, dropped, F);
    return `${head}
      <div class="cols"><div class="panel"><h2>Results by split</h2><div class="tw"><table><thead><tr><th>Split</th><th class="n">Games</th><th class="n">W-L</th><th class="n">Win %</th><th></th></tr></thead><tbody>${groups(['overall', 'side', 'length', 'draft']).map(wlRow).join('')}</tbody></table></div></div>
      <div class="panel"><h2>Partners and rival stand-ins</h2>${groups(['partner', 'rival']).length ? `<div class="tw"><table><thead><tr><th>Split</th><th class="n">Games</th><th class="n">W-L</th><th class="n">Win %</th><th></th></tr></thead><tbody>${groups(['partner', 'rival']).map(wlRow).join('')}</tbody></table></div>` : '<p class="note">Set the partner level in reports, or plan scrims with "stand-in for" a WEC rival, to see these splits.</p>'}</div></div>
      <div class="cols"><div class="panel"><h2>Our heroes (2+ games)</h2>${heroesT.length ? `<div class="tw"><table><thead><tr><th>Hero</th><th class="n">Games</th><th class="n">W-L</th><th class="n">Win %</th><th></th></tr></thead><tbody>${heroesT.map((f) => wlRow({ ...f, label: f.label.replace('Our games with ', '') })).join('')}</tbody></table></div>` : '<p class="note">No hero played twice yet.</p>'}</div>
      <div class="panel"><h2>Banned against us</h2>${bans.length ? `<div class="tw"><table><thead><tr><th>Hero</th><th class="n">Banned</th><th class="n">Of drafts</th><th class="n">Share</th></tr></thead><tbody>${bans.map((f) => `<tr><td>${esc(f.label.replace(' banned against us', ''))}</td><td class="n">${f.count}</td><td class="n">${f.n}</td><td class="n">${f.share}%</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Add draft screenshots to see what partners ban against us.</p>'}</div></div>
      <div class="panel"><h2>Players</h2><div class="tw"><table><thead><tr><th>Player</th><th class="n">Games</th><th class="n">K</th><th class="n">D</th><th class="n">A</th><th class="n">Deaths in wins</th><th class="n">Deaths in losses</th><th></th></tr></thead><tbody>${players.map((f) => `<tr><td><b>${esc(f.player)}</b></td><td class="n">${f.n}</td><td class="n">${f.kills ?? '—'}</td><td class="n">${f.deaths ?? '—'}</td><td class="n">${f.assists ?? '—'}</td><td class="n">${f.deathsInWins ?? '—'}</td><td class="n">${f.deathsInLosses ?? '—'}</td><td><button type="button" class="linkbtn" data-pat-player="${esc(`${title}|${f.player}`)}">Trail</button></td></tr>`).join('')}</tbody></table></div>
      <p class="note">Averages per game. Scrim numbers depend on the partner: compare a player with their own earlier games (Trail), not with teammates in other roles.</p></div>
      ${findingsPanel(title, fid, finds, dropped, F)}`;
  }
  function findingsPanel(title, fid, finds, dropped, F) {
    const on = !!ai();
    const card = (x) => `<div class="obj"><header><div><span class="note">${esc(x.period)} · ${esc(x.createdAt.slice(0, 10))} · ${esc(x.kind)}${x.lowSample ? ' · early sign' : ''} · sample ${x.sampleN} game${x.sampleN === 1 ? '' : 's'}</span><h3>${esc(x.claim)}</h3></div>${tag(x.status === 'useful' || x.status === 'promoted' ? 'c-Verified' : x.status === 'wrong' ? 'c-Blocked' : x.status === 'known' ? 'k-observed' : 'c-Low', x.status === 'new' ? 'to review' : x.status)}</header>
      ${x.why ? `<p><b>Why it matters:</b> ${esc(x.why)}</p>` : ''}
      <details><summary class="note">The numbers behind it</summary><ul class="plain">${x.facts.map((f) => `<li>${esc(f.label)}: ${f.won != null ? `${f.won}-${f.lost} (${f.winRate}%) in ${f.n} games` : f.count != null ? `${f.count} of ${f.n} drafts (${f.share}%)` : `${f.n} games; K ${f.kills ?? '—'} / D ${f.deaths ?? '—'} / A ${f.assists ?? '—'}${f.deathsInLosses != null ? `; deaths ${f.deathsInWins ?? '—'} in wins vs ${f.deathsInLosses} in losses` : ''}`}${f.lowSample ? ' — low sample' : ''}</li>`).join('')}</ul></details>
      ${x.status !== 'new' ? `<p class="note">Marked ${esc(x.status)} by ${esc(x.statusBy)}, ${esc((x.statusAt || '').slice(0, 10))}${x.promotedTo ? ` · proposal ${esc(x.promotedTo)}` : ''}</p>` : ''}
      ${x.status === 'promoted' ? '' : `<div class="toolbar">${['useful', 'known', 'wrong'].filter((s) => s !== x.status).map((s) => `<button class="btn small" type="button" data-pat-mark="${esc(`${x.id}|${s}`)}">${s === 'useful' ? 'Useful' : s === 'known' ? 'Already known' : 'Wrong'}</button>`).join('')}<span class="msg" id="patMsg-${x.id}"></span></div>
      <details><summary class="note">Turn into a coaching proposal</summary><div class="form"><label class="field" for="patD-${x.id}">Drill<input type="text" id="patD-${x.id}" value="${esc(x.why)}"></label><label class="field" for="patS-${x.id}">Success criterion (measurable)<input type="text" id="patS-${x.id}" placeholder="e.g. Win 3 of the next 5 games over 20 min"></label></div>
        <div class="toolbar"><button class="btn small" type="button" data-pat-promote="${esc(x.id)}">Send for review</button></div></details>`}</div>`;
    return `<div class="panel"><h2>Findings</h2>
      <p class="note">The AI reads the numbers above plus recent report notes and writes up to ${LIMITS.findings} findings. The hub drops any finding that cites no computed number, uses a number that is not in the facts, or calls something a problem on fewer than ${MIN_SAMPLE} games.</p>
      <div class="toolbar">${on ? `<button class="btn primary" type="button" data-pat-run="${esc(title)}" ${F.length ? '' : 'disabled'}>Look for patterns (AI)</button>` : '<span class="note">AI findings work on the website.</span>'}<span class="msg" id="patRunMsg-${fid}" role="status"></span></div>
      ${dropped?.length ? `<details><summary class="note">${dropped.length} finding(s) from the last run were dropped by the checks</summary><ul class="plain">${dropped.map((d) => `<li>${esc(d.claim || '(no text)')} — <i>${esc(d.why)}</i></li>`).join('')}</ul></details>` : ''}
      ${finds.length ? finds.slice(0, 20).map(card).join('') : '<p class="empty">No findings yet.</p>'}</div>`;
  }

  // ---------------------------------------------------------------- player trail (Player plans page)
  function trailPanel(title, player) {
    if (!gameOf(title)) return '';
    const tr = statTrail(gamesOf(title), player, { reports: S.reports });
    if (!tr) return `<div class="panel"><h2>Scrim trail — ${esc(player)}</h2><p class="empty">No confirmed scrim games for ${esc(player)} yet.</p></div>`;
    const arrow = (s) => (s.better == null ? '' : s.better ? tag('c-Verified', 'better') : tag('c-Blocked', 'worse'));
    return `<div class="panel"><h2>Scrim trail — ${esc(player)}</h2>
      <p class="note">Last ${tr.recentN} confirmed scrim game${tr.recentN === 1 ? '' : 's'} against ${tr.baselineN ? `the ${tr.baselineN} before` : 'nothing yet (needs more games)'}. Win rate in these games: ${tr.winRate}%. Partners: ${Object.entries(tr.levels).map(([k, v]) => `${esc(k)} ×${v}`).join(', ')}. Heroes: ${tr.heroes.map(([h, n]) => `${esc(h)} ×${n}`).join(', ')}.</p>
      ${tr.recentN < MIN_SAMPLE ? banner('synth', `<div>Fewer than ${MIN_SAMPLE} games: read as an early sign only.</div>`) : ''}
      <div class="tw"><table><thead><tr><th>Stat</th><th class="n">Recent (per game)</th><th class="n">Before</th><th class="n">Change</th><th></th></tr></thead><tbody>${tr.stats.map((s) => `<tr><td>${esc(s.label)}</td><td class="n">${s.recent ?? '—'}</td><td class="n">${s.baseline ?? '—'}</td><td class="n">${s.delta == null ? '—' : (s.delta > 0 ? '+' : '') + s.delta}</td><td>${arrow(s)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  const goalStatNote = (title, player, g) => { if (!g.stat || !gameOf(title)) return ''; const p = statGoalProgress(g, statTrail(gamesOf(title), player, { reports: S.reports })); return p ? `<p class="note">${p.met == null ? '' : p.met ? tag('c-Verified', 'on target') : tag('c-Low', 'not yet')} ${esc(p.text)}${p.lowSample ? ' — early sign' : ''}</p>` : ''; };
  const goalStatFields = (title) => (gameOf(title) ? `<div class="form"><label class="field" for="gaSK">Tie to a scrim stat (optional)<select id="gaSK"><option value=""></option>${STAT_DEFS[gameOf(title)].filter((d) => d.trail).map((d) => `<option value="${d.key}">${esc(d.label)} per game</option>`).join('')}</select></label>
      <label class="field" for="gaSO">Target<select id="gaSO"><option value="<=">at most</option><option value=">=">at least</option></select></label><label class="field" for="gaST">Value<input type="number" step="0.1" min="0" id="gaST"></label></div>` : '');

  // Opponent card: our record against partners standing in for this rival.
  function standInLine(title, nation) {
    if (!gameOf(title)) return '';
    const r = standInRecord(gamesOf(title), nation, { reports: S.reports, scrims: S.scrims, partners: S.partners });
    if (!r) return '';
    return `<p class="note"><b>Our scrim record vs stand-ins for ${esc(nation)}:</b> ${r.won}-${r.lost} in ${r.n} confirmed game${r.n === 1 ? '' : 's'} (${r.partners.map(esc).join(', ')})${r.lowSample ? ' — low sample' : ''}.${r.bansAgainst.length ? ` Banned against us: ${r.bansAgainst.map(([h, n]) => `${esc(h)} ×${n}`).join(', ')}.` : ''}</p>`;
  }
  // Today / reports overview: screenshots read but not yet confirmed (older than an hour).
  function waitingCount(title) {
    const hour = Date.now() - 3600_000;
    const used = new Set(S.games.flatMap((g) => g.captureIds || []));
    const open = new Set(Object.values(S.cap).flatMap((x) => [...(x.pending?.captureIds || []), ...x.ready.flatMap((g) => g.captureIds || [])]));
    return Object.entries(S.captures).filter(([id, c]) => c.title === title && !used.has(id) && !open.has(id) && Date.parse(c.createdAt) < hour).length;
  }

  // ---------------------------------------------------------------- events
  async function onChange(e) {
    const t = e.target;
    if (t.dataset?.patPeriod) { S.patPeriod[t.dataset.patPeriod] = t.value; render(); return true; }
    const shot = t.dataset?.capShot; const drft = t.dataset?.capDraft; const more = t.dataset?.capMore;
    if (!shot && !drft && !more) return false;
    const title = shot || drft || more; const fid = sid(title); const files = [...(t.files || [])].slice(0, 4); if (!files.length) return true;
    const heroes = heroesFor(title);
    const day = () => val(`rp-${fid}-date`) || localToday();
    // One screenshot, read as a draft, a second screen of the game, or a new game.
    async function readOne(file, kind, n) {
      const s = st(fid);
      setMsg(`capMsg-${fid}`, `${n ? `Screenshot ${n}: ` : ''}${kind === 'draft' ? 'reading the draft' : 'reading the screenshot'}… (10–20 s)`);
      const image = await prepImage(file);
      const out = await ai().call({ action: kind === 'draft' ? 'draft' : 'scoreboard', title, day: day(), image });
      if (kind !== 'draft' && n > 1 && out.raw?.screen_kind === 'draft_or_loading') return readOne(file, 'draft', n);   // a draft picked together with the result screen
      if (kind === 'draft') {
        if (!s.pending) throw new Error('Add the end-of-game screenshot first, then the draft.');
        const d = proposeDraft({ title, raw: out.raw, heroes });
        if (d.issues.some((i) => i.level === 'block')) throw new Error(d.issues[0].text);
        s.pending.draft = d; s.pending.captureIds = [...(s.pending.captureIds || []), out.captureId];
        s.pending.base = heroesFromDraft(s.pending.base, d, heroes);
        if (s.pending.ai) s.pending.ai = heroesFromDraft(s.pending.ai, d, heroes);
        return 'draft';
      }
      if (kind === 'more') {
        if (!s.pending) throw new Error('Add the end-of-game screenshot first.');
        const b = proposeGame({ title, raw: out.raw, roster: rosterOf(title), aliases: aliasesOf(title), heroes, pools: fillPools(title) });
        if (b.issues.some((i) => i.level === 'block')) throw new Error(b.issues[0].text);
        const m = mergeGames(s.pending.base, b);
        s.pending.base = { ...m.game, issues: m.game.issues };
        if (s.pending.ai) s.pending.ai = mergeGames(s.pending.ai, b).game;
        s.pending.captureIds = [...(s.pending.captureIds || []), out.captureId];
        return 'more';
      }
      const p = proposeGame({ title, raw: out.raw, roster: rosterOf(title), aliases: aliasesOf(title), heroes, pools: fillPools(title) });
      if (p.issues.some((i) => i.level === 'block')) { s.pending = { base: p, ai: JSON.parse(JSON.stringify(p)), captureIds: [out.captureId], draft: null, fromScreenshot: true }; return 'blocked'; }
      const dup = findDuplicate(p, [...s.ready, ...gamesOf(title).filter((g) => g.date === day())]);
      if (dup) p.issues.unshift({ level: 'check', text: `This looks like a game already added (${dup}): same kill score and duration. Discard it if it is the same game.` });
      s.pending = { base: p, ai: JSON.parse(JSON.stringify(p)), captureIds: [out.captureId], draft: null, fromScreenshot: true };
      return 'game';
    }
    try {
      syncPending(title, fid);
      const done = [];
      for (let i = 0; i < files.length; i++) {
        const kind = drft ? 'draft' : more || i > 0 ? 'more' : 'game';
        const r = await readOne(files[i], kind, files.length > 1 ? i + 1 : 0);
        done.push(r); keep(fid); S.capFresh = true; render();
        if (r === 'blocked') break;
      }
      const drafts = done.filter((x) => x === 'draft').length; const extra = done.filter((x) => x === 'more').length;
      if (done.at(-1) !== 'blocked' && (drafts || extra)) setMsg(`capMsg-${fid}`, `${extra ? `${extra} more screen${extra > 1 ? 's' : ''} merged (empty values filled, disagreements highlighted)` : ''}${extra && drafts ? '; ' : ''}${drafts ? 'draft read: heroes filled from it' : ''}.`, 'ok');
    } catch (err) { keep(fid); render(); setMsg(`capMsg-${fid}`, err.message, 'err'); }
    finally { if (t) t.value = ''; }
    return true;
  }
  async function onClick(t) {
    const d = t.dataset || {};
    if (d.capMic) {
      const [title, lang] = d.capMic.split('|'); const fid = sid(title);
      if (MIC.fid === fid && MIC.lang === lang) { stopMic(); return true; }
      try { startMic(fid, lang); setMsg(`capDbMsg-${fid}`, lang === 'id-ID' ? 'Mendengarkan… bicara sekarang, tekan Stop jika selesai.' : 'Listening… speak now, press Stop when done.', 'ok'); }
      catch (err) { setMsg(`capDbMsg-${fid}`, `The microphone could not start (${err.message}). Type the note instead.`, 'err'); }
      return true;
    }
    if (d.capRetry) { const fid = sid(d.capRetry); try { await retrySave(d.capRetry, fid); render(); setMsg(`capMsg-${fid}`, 'Games saved.', 'ok'); } catch (err) { setMsg(`capMsg-${fid}`, err.message, 'err'); } return true; }
    if (d.capManual) { const title = d.capManual; const fid = sid(title); const s = st(fid); s.pending = { base: blankGame(title, rosterOf(title), s.ready.at(-1)?.ourSide), captureIds: [], draft: null, fromScreenshot: false }; keep(fid); render(); return true; }
    if (d.capDiscard) { const fid = sid(d.capDiscard); st(fid).pending = null; keep(fid); render(); return true; }
    if (d.capRemove) { const [fid, i] = d.capRemove.split('|'); const s = st(fid); s.ready.splice(Number(i), 1); keep(fid); const r = gamesResult(s.ready); fillReport(fid, s.ready.length ? { won: String(r.won), lost: String(r.lost) } : { won: '', lost: '' }); render(); return true; }
    if (d.capHero) {
      const [fid, i, hero] = d.capHero.split('|'); const el = document.getElementById(`cg-${fid}-${i}-hero`);
      if (el) { el.value = hero; el.classList.remove('flag'); el.removeAttribute('aria-invalid'); el.closest('td')?.querySelector('.herochips')?.remove(); }
      return true;
    }
    if (d.capFix) {
      const g = gamesOf(d.capFix.split('|')[0]).find((x) => x.id === d.capFix.split('|')[1]); if (!g) return true;
      const fid = sid(g.title); const s = st(fid);
      if (s.pending) { setMsg(`capMsg-${fid}`, 'Finish or discard the game you are checking first, then press Fix again.', 'err'); document.getElementById(`capMsg-${fid}`)?.scrollIntoView?.({ block: 'center' }); return true; }
      s.pending = { base: gameToProposal(g), captureIds: [], draft: null, fromScreenshot: false, fix: { gameId: g.id, reportId: g.reportId, date: g.date, partner: g.partner, gameNo: g.gameNo, by: g.by } };
      keep(fid); render();
      document.getElementById(`cg-${fid}-our`)?.closest('.capedit')?.scrollIntoView?.({ block: 'start' });
      return true;
    }
    if (d.capConfirm) {
      const title = d.capConfirm; const fid = sid(title); const s = st(fid); if (!s.pending) return true;
      try {
        const { edited, draft, matchId } = readEditor(title, fid, s.pending);
        const fx = s.pending.fix;
        const rec = confirmGame(edited, { date: fx ? fx.date : (val(`rp-${fid}-date`) || localToday()), partner: fx ? fx.partner : val(`rp-${fid}-partner`), gameNo: fx ? fx.gameNo : s.ready.length + 1, by: fx ? fx.by : (val(`rp-${fid}-by`) || meName()),
          base: s.pending.fromScreenshot ? (s.pending.ai || s.pending.base) : null, captureIds: s.pending.captureIds || [], heroes: heroesFor(title), draft, externalMatchId: matchId });
        if (fx) {
          const old = gamesOf(title).find((x) => x.id === fx.gameId);
          rec.reportId = fx.reportId; rec.supersedes = fx.gameId; rec.fixedBy = meName() || S.me; rec.source = old?.source || rec.source; rec.captureIds = old?.captureIds || []; rec.corrections = old?.corrections || [];
          if (old && !draft) { rec.draft = old.draft || []; rec.firstPick = old.firstPick || ''; }   // a fix of the numbers keeps the draft
          if (old && !rec.externalMatchId) rec.externalMatchId = old.externalMatchId || '';
          await put('scrim_games', rec);
          const rep = S.reports.find((r) => r.id === fx.reportId);
          const changed = old ? describeFix(old, rec) : 'values updated';
          if (rep) { const n = ctx.reportNote(rep, { text: `Game ${fx.gameNo} corrected: ${changed}`, by: meName() || S.me }); if (S.db) await S.db.collection('scrim_reports').doc(rep.id).set(n); else Object.assign(rep, n); }
          s.pending = null; keep(fid); render(); setMsg(`capMsg-${fid}`, `Game ${fx.gameNo} fixed (${changed}). A correction note was added to the report.`, 'ok');
          return true;
        }
        s.ready.push(rec); s.pending = null; keep(fid);
        const r = gamesResult(s.ready); render(); fillReport(fid, { won: String(r.won), lost: String(r.lost) });
        setMsg(`capMsg-${fid}`, `Game ${s.ready.length} confirmed (${rec.result}). Result above updated to ${r.won}-${r.lost}.`, 'ok');
      } catch (err) { setMsg(`capMsg-${fid}`, err.message, 'err'); }
      return true;
    }
    if (d.capDebrief) {
      const title = d.capDebrief; const fid = sid(title); const out = document.getElementById(`capDbOut-${fid}`);
      try {
        const text = checkDebriefInput(val(`rp-${fid}-dump`));
        setMsg(`capDbMsg-${fid}`, 'Sorting your note into the fields…');
        const res = await ai().call({ action: 'debrief', title, text, roster: rosterOf(title) });
        const { fields, flags, notPlaced } = checkDebriefSplit(text, res.raw, rosterOf(title));
        fillReport(fid, fields);
        if (fields.detail || fields.players) { const det = document.getElementById(`rp-${fid}-detail`)?.closest('details'); if (det) det.open = true; }
        setMsg(`capDbMsg-${fid}`, `Filled ${Object.keys(fields).length} field(s). Check them, then save.`, 'ok');
        if (out) out.innerHTML = flags.length || notPlaced ? banner('synth', `<div><ul class="plain">${flags.map((f) => `<li><b>${esc(f.field)}</b>: ${esc(f.text)}</li>`).join('')}${notPlaced ? `<li>Not placed in any field: ${esc(notPlaced)}</li>` : ''}</ul></div>`) : '';
        for (const f of flags) document.getElementById(`rp-${fid}-${f.field}`)?.setAttribute('aria-invalid', 'true');
      } catch (err) { setMsg(`capDbMsg-${fid}`, err.message, 'err'); }
      return true;
    }
    if (d.patRun) {
      const title = d.patRun; const fid = sid(title); const per = S.patPeriod[title] || '14';
      const gs = inPeriod(gamesOf(title), per); const F = facts(gs, { reports: S.reports, scrims: S.scrims, partners: S.partners });
      const repIds = new Set(gs.map((g) => g.reportId));
      try {
        setMsg(`patRunMsg-${fid}`, 'Looking for patterns… (20–40 s)');
        const earlier = S.findings.filter((f) => f.title === title);
        const pay = digestPayload(F, S.reports.filter((r) => repIds.has(r.id)), { earlier });
        const res = await ai().call({ action: 'digest', title, ...pay });
        const { kept, dropped } = checkFindings(res.raw, F, { reportIds: [...repIds], earlier });
        const period = per === 'all' ? 'all games' : `last ${per} days`;
        const recs = kept.map((f) => findingRecord({ title, period, f, factList: F, model: res.model, by: meName() }));
        for (const r of recs) await put('pattern_findings', r);
        S.patDropped[title] = dropped; render();
        setMsg(`patRunMsg-${fid}`, kept.length ? `${kept.length} finding(s) added${dropped.length ? `, ${dropped.length} dropped by the checks` : ''}. Mark each one.` : `No finding passed the checks${dropped.length ? ` (${dropped.length} dropped)` : ''}. Nothing new to act on.`, kept.length ? 'ok' : '');
      } catch (err) { setMsg(`patRunMsg-${fid}`, err.message, 'err'); }
      return true;
    }
    if (d.patMark) {
      const [fidId, status] = d.patMark.split('|'); const x = S.findings.find((f) => f.id === fidId); if (!x) return true;
      try { await put('pattern_findings', markFinding(x, { status, by: meName() || S.me })); render(); }
      catch (err) { setMsg(`patMsg-${fidId}`, err.message, 'err'); }
      return true;
    }
    if (d.patPromote) {
      const x = S.findings.find((f) => f.id === d.patPromote); if (!x) return true;
      try {
        const drill = val(`patD-${x.id}`).trim(); const success = val(`patS-${x.id}`).trim();
        if (!drill || !success) throw new Error('Add a drill and a measurable success criterion.');
        const ev = ctx.staffObservation({ title: x.title, observation: x.claim, source: `Pattern finding ${x.id} (${x.period})`, kind: x.lowSample ? 'hypothesis' : 'observed', n: x.sampleN, context: 'national', by: meName() || S.me });
        const rec = ctx.recommendationRecord({ problem: x.claim, drill, success, explanation: `From the Patterns tab: ${x.facts.map((f) => f.label).join('; ')}.`, priority: 2, confidence: ev.confidence, area: 'staff', findings: [ev.id] }, [ev]);
        const obj = ctx.propose(rec, { title: x.title, by: meName() || S.me, rulesSnapshot: ctx.rulesFor(x.title) });
        await ctx.saveObj(obj);
        const n = markFinding(x, { status: 'promoted', by: meName() || S.me, promotedTo: obj.id });
        await put('pattern_findings', n);
        render(); setMsg(`patMsg-${x.id}`, `Sent to ${ctx.owner(x.title).name} for review.`, 'ok');
      } catch (err) { setMsg(`patMsg-${x.id}`, err.message, 'err'); }
      return true;
    }
    if (d.patPlayer) { const [title, player] = d.patPlayer.split('|'); S.planTitle = title; S.planPlayer = player; location.hash = 'players'; return true; }
    return false;
  }

  // Subscriptions (website build: the shared database; artifact build: this tab only).
  function subscribe(db) {
    db.collection('scrim_games').onSnapshot((snap) => { S.games = snap.docs.map((x) => x.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('scrim_captures').onSnapshot((snap) => { S.captures = Object.fromEntries(snap.docs.map((x) => [x.id, x.data()]).filter(([, x]) => x?.origin === 'operational')); render(); }, () => {});
    db.collection('pattern_findings').onSnapshot((snap) => { S.findings = snap.docs.map((x) => x.data()).filter((x) => x?.origin === 'operational'); render(); }, () => {});
    db.collection('player_aliases').onSnapshot((snap) => { S.aliases = Object.fromEntries(snap.docs.map((x) => x.data()).filter((x) => x?.origin === 'operational' && x.title).map((x) => [x.title, x])); }, () => {});
  }

  return { gamesSection, reportGames, debriefSection, beforeSave, afterSave, patternsPage, trailPanel, goalStatNote, goalStatFields, standInLine, waitingCount, onChange, onClick, subscribe, prepImage };
}
