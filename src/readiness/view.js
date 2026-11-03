// Athlete Readiness — UI preview. Pure rendering: takes what a provider returned (contract.js)
// and returns HTML in the Timnas Hub design system. No scoring, no storage, no network.

import { PREVIEW_LABEL } from './contract.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { red: ['rd-red', '●', 'Red'], amber: ['rd-amber', '▲', 'Amber'], green: ['rd-green', '✓', 'Ready'], none: ['rd-none', '–', 'No score'] };
const pill = (s) => { const [c, i, l] = STATUS[s] || STATUS.none; return `<span class="rd-pill ${c}"><span aria-hidden="true">${i}</span> ${l}</span>`; };
const initials = (name) => name.split('·').pop().trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const fmt = (v, d = 1) => (v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ring(a, scale) {
  const r = 52, c = 2 * Math.PI * r, f = a.readiness == null ? 0 : Math.max(0, Math.min(1, (a.readiness - scale.min) / (scale.max - scale.min)));
  return `<svg class="rd-ring ${STATUS[a.status][0]}" viewBox="0 0 132 132" role="img" aria-label="Readiness ${fmt(a.readiness)} of ${scale.max}">
    <circle cx="66" cy="66" r="${r}" class="track"/><circle cx="66" cy="66" r="${r}" class="val" stroke-dasharray="${(f * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 66 66)"/>
    <text x="66" y="66" class="num">${fmt(a.readiness, 0)}</text><text x="66" y="88" class="lbl">readiness</text></svg>`;
}

export function trendChart(trend, thresholds) {
  const W = 560, H = 240, L = 40, R = 18, T = 22, B = 30;
  const vals = trend.map((p) => p.avg).filter((v) => v != null);
  if (!vals.length) return '<p class="empty">No scored days in this window.</p>';
  const lo = Math.floor((Math.min(...vals, thresholds.ready) - 5) / 10) * 10, hi = Math.ceil((Math.max(...vals, thresholds.ready) + 5) / 10) * 10;
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, trend.length - 1), y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const pts = trend.map((p, i) => ({ ...p, i, cx: x(i), cy: p.avg == null ? null : y(p.avg) }));
  const scored = pts.filter((p) => p.cy != null);
  const path = scored.map((p, k) => `${k ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
  const maxP = scored.reduce((a, b) => (b.avg > a.avg ? b : a)), minP = scored.reduce((a, b) => (b.avg < a.avg ? b : a)), last = scored.at(-1);
  const labelled = new Set([maxP.i, minP.i, last.i]);
  const grid = []; for (let v = lo; v <= hi; v += 10) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`);
  return `<figure class="rd-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Team readiness, last ${trend.length} days, from ${fmt(scored[0].avg)} to ${fmt(last.avg)}">
    ${grid.join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(thresholds.ready)}" y2="${y(thresholds.ready)}" class="thr"/><text x="${L + 6}" y="${y(thresholds.ready) - 6}" class="thr-l">Ready ${thresholds.ready}</text>
    <path d="${path}" class="line"/>
    ${pts.map((p) => `<text x="${p.cx}" y="${H - 8}" class="ax" text-anchor="middle">${DOW[new Date(`${p.date}T00:00:00Z`).getUTCDay()]}</text>`).join('')}
    ${scored.map((p) => `<g class="pt${p.i === last.i ? ' last' : ''}" tabindex="0"><title>${esc(p.date)}: ${fmt(p.avg)} (${p.n} athletes with a score)</title><circle cx="${p.cx}" cy="${p.cy}" r="14" class="hit"/><circle cx="${p.cx}" cy="${p.cy}" r="${p.i === last.i ? 5.5 : 4}" class="dot"/>${labelled.has(p.i) ? `<text x="${p.cx}" y="${p.cy - 12}" class="val" text-anchor="middle">${fmt(p.avg)}</text>` : ''}</g>`).join('')}
  </svg><details><summary class="note">Show as table</summary><div class="tw"><table><thead><tr><th>Date</th><th class="n">Team average</th><th class="n">Athletes with a score</th></tr></thead><tbody>${trend.map((p) => `<tr><td>${esc(p.date)}</td><td class="n">${fmt(p.avg)}</td><td class="n">${p.n}</td></tr>`).join('')}</tbody></table></div></details></figure>`;
}

export function readinessView({ data, titles, title, date }) {
  if (!data) return `<div class="panel"><p>Loading the readiness preview…</p></div>`;
  const { team, trend, alerts, provider } = data; const A = team.athletes;
  const done = A.filter((a) => a.checkedIn), scored = A.filter((a) => a.readiness != null);
  const red = A.filter((a) => a.status === 'red'), amber = A.filter((a) => a.status === 'amber');
  const avg = scored.length ? scored.reduce((s, a) => s + a.readiness, 0) / scored.length : null; // display of the provider's numbers, not a score
  const focus = A[0];
  const head = `<div class="panel rd-head"><span class="rd-preview" role="note">${esc(PREVIEW_LABEL)}</span>
    <div class="lead">Athlete <em>readiness</em></div>
    <p>How ready each athlete is today, the team trend and who needs a conversation. ${provider.preview ? '<b>Dummy data:</b> invented athletes and numbers, nothing is saved, and no score is calculated by the hub.' : ''} Scoring, thresholds, check-ins and alerts will come from Coach Donny's system.</p>
    <div class="form"><label class="field" for="rdT">Group<select id="rdT">${['All titles', ...titles].map((t) => `<option ${t === title ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><label class="field" for="rdD">Date<input type="date" id="rdD" value="${esc(date)}"></label></div>
    <p class="note">Source: ${esc(provider.label)} · ${done.length} of ${A.length} athletes checked in · thresholds: red &lt; ${team.thresholds.red}, ready ≥ ${team.thresholds.ready} (${esc(team.thresholds.label || '')})</p></div>`;
  const kpis = `<div class="stats rd-kpis"><div class="stat"><span class="k">Checked in</span><span class="v">${done.length}<small> / ${A.length}</small></span><span class="note">${A.length - done.length ? `${A.length - done.length} not yet` : 'everyone'}</span></div>
    <div class="stat"><span class="k">Red</span><span class="v rd-t-red">${red.length}<small> athletes</small></span><span class="note">${esc(red.slice(0, 2).map((a) => a.name).join(', ') + (red.length > 2 ? ` +${red.length - 2}` : '') || '—')}</span></div>
    <div class="stat"><span class="k">Amber</span><span class="v rd-t-amber">${amber.length}<small> athletes</small></span><span class="note">${esc(amber.slice(0, 2).map((a) => a.name).join(', ') + (amber.length > 2 ? ` +${amber.length - 2}` : '') || '—')}</span></div>
    <div class="stat"><span class="k">Average readiness</span><span class="v">${fmt(avg, 0)}<small> / ${team.scale.max}</small></span><span class="note">from ${scored.length} athletes with a score</span></div></div>`;
  const focusCard = focus ? `<div class="panel rd-focus"><header><span class="rd-av">${esc(initials(focus.name))}</span><div><h2>${esc(focus.name)}</h2><span class="note">${focus.checkedIn ? `Checked in ${esc(focus.checkInTime)}` : 'Not checked in'}</span></div>${pill(focus.status)}</header>
    <div class="rd-focus-b">${ring(focus, team.scale)}<dl><div><dt>Wellness</dt><dd>${fmt(focus.wellness, 0)}</dd></div><div><dt>Sleep (z)</dt><dd>${fmt(focus.sleepZ)}</dd></div><div><dt>Load</dt><dd>${fmt(focus.loadAU, 0)} <small>AU</small></dd></div></dl></div>
    ${focus.reason ? `<p>${esc(focus.reason)}</p>` : ''}<div class="toolbar"><button class="btn primary" type="button" disabled title="Available after integration">Open profile &amp; write note</button><span class="note">Opens in Coach Donny's system after integration.</span></div></div>` : '';
  const chart = `<div class="panel"><div class="rd-ph"><h2>Team readiness, 7 days</h2><span class="note">Average of athletes with a score</span></div>${trendChart(trend, team.thresholds)}</div>`;
  const table = `<div class="panel"><div class="rd-ph"><h2>Athletes</h2><span class="note">Most in need of attention first</span></div><div class="tw"><table class="rd-table"><thead><tr><th>Athlete</th><th>Readiness</th><th>Status</th><th>Check-in</th><th class="n">Wellness</th><th class="n">Sleep z</th><th class="n">Load (AU)</th></tr></thead><tbody>
    ${A.map((a) => `<tr><td><span class="rd-av sm">${esc(initials(a.name))}</span> <b>${esc(a.name)}</b></td><td><span class="rd-bar"><b>${fmt(a.readiness)}</b><span class="rd-track"><span class="${STATUS[a.status][0]}" style="width:${a.readiness == null ? 0 : Math.round(((a.readiness - team.scale.min) / (team.scale.max - team.scale.min)) * 100)}%"></span></span></span></td><td>${pill(a.status)}</td><td>${a.checkedIn ? esc(a.checkInTime) : '<span class="note">missing</span>'}</td><td class="n">${fmt(a.wellness, 0)}</td><td class="n">${fmt(a.sleepZ)}</td><td class="n">${fmt(a.loadAU, 0)}</td></tr>`).join('')}</tbody></table></div></div>`;
  const checkins = `<div class="panel"><h2>Daily check-ins</h2><div class="rd-prog" role="img" aria-label="${done.length} of ${A.length} checked in"><span style="width:${A.length ? Math.round((done.length / A.length) * 100) : 0}%"></span></div><p class="note">${done.length} of ${A.length} checked in.</p>
    <ul class="plain rd-alerts">${A.filter((a) => !a.checkedIn).map((a) => `<li><b>${esc(a.name)}</b><span class="note">not checked in</span></li>`).join('') || '<li class="note">Everyone has checked in.</li>'}</ul>
    <div class="toolbar"><button class="btn" type="button" disabled title="Available after integration">Open check-in form</button><span class="note">Athletes check in through Coach Donny's system.</span></div></div>`;
  const alertBox = `<div class="panel"><h2>Needs follow-up</h2>${alerts.length ? `<ul class="plain rd-alerts">${alerts.slice(0, 8).map((x) => `<li><div><b>${esc(x.name)}</b> ${pill(x.status)}</div><div>${esc(x.text)}</div>${x.action ? `<div class="note">${esc(x.action)}</div>` : ''}</li>`).join('')}</ul>${alerts.length > 8 ? `<p class="note">+${alerts.length - 8} more in the athlete table.</p>` : ''}` : '<p class="empty">No alerts.</p>'}</div>`;
  const integ = `<div class="panel rd-integ"><h2>Integration point</h2><p class="note">This screen reads from one provider (now: <b>${esc(provider.label)}</b>). When Coach Donny's system is ready, it plugs in here through his API, using the same data shapes, or as an embedded dashboard. Nothing in the hub needs rebuilding. See docs/READINESS_INTEGRATION.md.</p></div>`;
  return `${head}${kpis}<div class="cols rd-two">${focusCard}${chart}</div><div class="rd-main">${table}<div class="rd-side">${alertBox}${checkins}</div></div>${integ}`;
}
