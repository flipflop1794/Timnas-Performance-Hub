// V1.51 Whoop in the hub (Coach Donny's device integration, MLBB Women first).
// Coach Donny, the Head Coach and admins: "Kesiapan pagi" on the support page — each athlete's recovery ring, sleep,
// strain, HRV and Donny's readiness index (IKB), a link to send each athlete, pull now, disconnect, and the one-time
// setup of the Whoop app. A title's coaches: one line per connected athlete (recovery % and sleep) in My team.
// Numbers come from the "whoop" server function only (src/web/main.ts → PLATFORM.whoop); logic in src/core/wearable.js.
import { wearSummary, recoveryBand, hours, inviteText } from '../core/wearable.js';
import { playersOf, coachesOf, fullName } from '../core/people.js';

export function wearableUi(ctx) {
  const { S, esc, tag, setMsg, render, PLATFORM, today } = ctx;
  S.wear ||= { cache: {}, title: 'MLBB Women', open: '', arm: '' };
  const W = S.wear;
  const T = (en, id) => (S.lang === 'id' ? id : en);
  const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] };
  const dm = (d) => `${Number(d.slice(8, 10))} ${MON[S.lang === 'id' ? 'id' : 'en'][Number(d.slice(5, 7)) - 1]}`;
  const ago = (at) => { const m = Math.round((Date.now() - Date.parse(at)) / 60000); if (!Number.isFinite(m)) return ''; return m < 60 ? T(`${Math.max(1, m)} min ago`, `${Math.max(1, m)} menit lalu`) : m < 1440 ? T(`${Math.round(m / 60)} h ago`, `${Math.round(m / 60)} jam lalu`) : dm(at.slice(0, 10)); };
  const athletesOf = (t) => [...new Set([...playersOf(t).map((p) => p.name), ...(S.roster?.[t] || []).filter(Boolean).map((x) => fullName(t, x)).filter((n) => !coachesOf(t).some((c) => c.name === n))])];

  // ---- data: one cached answer per view, refreshed after 5 minutes
  function load(key, body) {
    const c = (W.cache[key] ||= { res: null, at: 0, err: '', busy: false });
    if (!PLATFORM?.whoop || c.busy || Date.now() - c.at < 300000) return c;
    c.busy = true;
    PLATFORM.whoop.call({ action: 'read', ...body }).then((res) => { c.res = res; c.err = ''; }, (e) => { c.err = e.message; c.off = e.status === 404 || e.status === 403; })
      .finally(() => { c.busy = false; c.at = Date.now(); render(); });
    return c;
  }
  const refresh = () => { for (const c of Object.values(W.cache)) c.at = 0; };

  const ring = (v) => { const b = recoveryBand(v); return `<span class="wr-ring ${b}" style="--p:${v ?? 0}" aria-label="${esc(T(`Recovery ${v ?? '—'}%`, `Recovery ${v ?? '—'}%`))}"><b>${v ?? '—'}</b></span>`; };
  const IKB_LABEL = { normal: ['normal', 'normal'], watch: ['watch', 'perhatian'], low: ['low', 'rendah'] };
  const ikbTag = (k) => (k?.value == null ? '' : tag(k.band === 'normal' ? 'c-Verified' : k.band === 'watch' ? 'c-Medium' : 'c-Blocked', `IKB ${Math.round(k.value)} · ${IKB_LABEL[k.band][S.lang === 'id' ? 1 : 0]}`));
  const dots = (a) => `<span class="dots wr-dots">${a.days14.map((d) => `<i class="${recoveryBand(d.recovery) || ''}" title="${esc(`${dm(d.day)}: ${d.recovery ?? '—'}`)}"></i>`).join('')}</span>`;

  // ---- Coach Donny, Head Coach, admins
  function donnyPanel() {
    if (!PLATFORM?.whoop) return '';
    const c = load('all', {});
    if (c.off || (!c.res && c.err)) return '';
    if (!c.res) return `<div class="panel sw"><h2 data-no-tr>${esc(T('Morning readiness · Whoop', 'Kesiapan pagi · Whoop'))}</h2><p class="note">${esc(T('Loading…', 'Memuat…'))}</p></div>`;
    const R = c.res; const list = wearSummary(R.days, R.links, today());
    const titles = [...new Set(['MLBB Women', ...list.map((a) => a.title)])];
    const t = titles.includes(W.title) ? W.title : titles[0];
    const mine = list.filter((a) => a.title === t); const linked = new Set(mine.filter((a) => a.link).map((a) => a.athlete));
    const waiting = athletesOf(t).filter((n) => !linked.has(n));
    const lastSync = mine.map((a) => a.link?.last_sync).filter(Boolean).sort().at(-1);
    const row = (a) => {
      const d = a.today; const k = `${a.title}|${a.athlete}`; const open = W.open === k;
      const line = d ? [`${T('Sleep', 'Tidur')} ${hours(d.sleepMin, S.lang)}`, d.strain != null && `Strain ${d.strain}`, d.hrv != null && `HRV ${Math.round(d.hrv)}`].filter(Boolean).join(' · ')
        : a.link?.needs_reconnect ? '' : T(`no data today${a.lastDay ? ` (last ${dm(a.lastDay)})` : ''}`, `belum ada data hari ini${a.lastDay ? ` (terakhir ${dm(a.lastDay)})` : ''}`);
      return `<li class="wr-a${open ? ' open' : ''}"><button type="button" class="wr-row" data-wr-open="${esc(k)}" aria-expanded="${open}">${ring(d?.recovery ?? null)}
        <span class="wr-txt"><b data-no-tr>${esc(a.athlete)}</b><span class="note" data-no-tr>${esc(line)}</span></span>
        <span class="wr-tags">${a.link?.needs_reconnect ? tag('c-Blocked', T('Log in again', 'Perlu login ulang')) : ikbTag(a.ikb)}</span></button>
        ${open ? `<div class="wr-more">${dots(a)}<p class="note" data-no-tr>${esc(T('Recovery, last 14 days', 'Recovery 14 hari terakhir'))}${a.avg7 != null ? ` · ${esc(T(`7-day average ${a.avg7}%`, `rata-rata 7 hari ${a.avg7}%`))}` : ''}</p>
          ${d ? `<p class="note" data-no-tr>${esc([d.rhr != null && `RHR ${d.rhr}`, d.spo2 != null && `SpO2 ${d.spo2}%`, d.sleepPerf != null && `${T('Sleep performance', 'Performa tidur')} ${d.sleepPerf}%`, d.resp != null && `${T('Breathing', 'Napas')} ${d.resp}/min`].filter(Boolean).join(' · '))}${d.calibrating ? ` · ${esc(T('Whoop still calibrating', 'Whoop masih kalibrasi'))}` : ''}</p>` : ''}
          <div class="toolbar">${a.link?.needs_reconnect ? `<button type="button" class="btn small" data-wr-copy="${esc(k)}">${esc(T('Copy a new link', 'Salin link baru'))}</button>` : ''}
          <button type="button" class="btn small" data-wr-off="${esc(k)}">${esc(W.arm === k ? T('Sure? Tap again', 'Yakin? Ketuk lagi') : T('Disconnect', 'Putuskan'))}</button></div></div>` : ''}</li>`;
    };
    const setup = !R.configured ? `<div class="wr-setup"><div class="h3">${esc(T('One-time setup: the Whoop app', 'Sekali saja: aplikasi Whoop'))}</div>
      <p class="note">${esc(T('From developer-dashboard.whoop.com (the app Coach Donny already made): copy its Client ID and Client Secret here, and add this Redirect URL to that app.', 'Dari developer-dashboard.whoop.com (aplikasi yang sudah dibuat Coach Donny): salin Client ID dan Client Secret ke sini, dan tambahkan Redirect URL ini ke aplikasi itu.'))}</p>
      <p class="wr-url" data-no-tr><code>${esc(R.redirectUri || '')}</code> <button type="button" class="linkbtn" data-wr-copyurl="1">${esc(T('Copy', 'Salin'))}</button></p>
      <div class="form"><label class="field" for="wrCid">Client ID<input type="text" id="wrCid" autocomplete="off"></label>
      <label class="field" for="wrSec">Client Secret<input type="password" id="wrSec" autocomplete="off"></label></div>
      <div class="toolbar"><button type="button" class="btn primary" data-wr-save="1">${esc(T('Save', 'Simpan'))}</button><span class="msg" id="wrSetMsg" role="status"></span></div></div>` : '';
    return `<div class="panel sw wr"><h2 data-no-tr>${esc(T('Morning readiness · Whoop', 'Kesiapan pagi · Whoop'))}${lastSync ? ` <span class="note">${esc(T(`updated ${ago(lastSync)}`, `diperbarui ${ago(lastSync)}`))}</span>` : ''}</h2>
      ${titles.length > 1 ? `<nav class="subnav" aria-label="Team">${titles.map((x) => `<button type="button" data-wr-title="${esc(x)}" aria-pressed="${x === t}">${esc(x)}</button>`).join('')}</nav>` : ''}
      ${setup}
      ${linked.size ? `<ul class="plain wr-list">${mine.filter((a) => a.link).map(row).join('')}</ul>` : `<p class="note" data-no-tr>${esc(T(`No ${t} athlete connected yet: send each one their link below.`, `Belum ada atlet ${t} yang terhubung: kirim link masing-masing di bawah.`))}</p>`}
      ${R.configured && waiting.length ? `<details class="sw-more" ${linked.size ? '' : 'open'}><summary data-no-tr>${esc(T(`Not connected yet (${waiting.length})`, `Belum terhubung (${waiting.length})`))}</summary>
        <p class="note">${esc(T('Copy the link and send it to the athlete on WhatsApp: they open it on their phone and sign in to Whoop once. Each link works once, for 7 days.', 'Salin link lalu kirim ke atlet lewat WhatsApp: atlet membukanya di HP dan login Whoop sekali. Satu link untuk satu kali, berlaku 7 hari.'))}</p>
        <ul class="plain wr-wait">${waiting.map((n) => `<li><span data-no-tr>${esc(n)}</span><button type="button" class="btn small" data-wr-copy="${esc(`${t}|${n}`)}">${esc(T('Copy Whoop link', 'Salin link Whoop'))}</button></li>`).join('')}</ul></details>` : ''}
      ${linked.size ? `<div class="toolbar"><button type="button" class="btn" data-wr-sync="1">${esc(T('Pull data now', 'Tarik data sekarang'))}</button></div>` : ''}<span class="msg" id="wrMsg" role="status"></span>
      <p class="note">${esc(T('Recovery colours are Whoop\'s: green 67–100, yellow 34–66, red 0–33. IKB (readiness to play) is Coach Donny\'s index against the athlete\'s own baseline: a proposal, not yet validated for esports. Data pulls itself every 3 hours.', 'Warna recovery dari Whoop: hijau 67–100, kuning 34–66, merah 0–33. IKB (Indeks Kesiapan Bermain) adalah indeks Coach Donny dibanding basis atlet sendiri: usulan, belum divalidasi untuk esports. Data ditarik otomatis tiap 3 jam.'))}</p></div>`;
  }

  // ---- a title's coaches: recovery and sleep, only when someone is connected
  function coachPanel(title) {
    if (!PLATFORM?.whoop) return '';
    const c = load(`t:${title}`, { titles: [title] });
    if (!c.res) return '';
    const list = wearSummary(c.res.days, c.res.links, today()).filter((a) => a.title === title && a.link);
    if (!list.length) return '';
    return `<div class="panel wr wr-coach"><h2 data-no-tr>${esc(T('Morning readiness · Whoop', 'Kesiapan pagi · Whoop'))}</h2>
      <ul class="plain wr-list">${list.map((a) => `<li class="wr-a"><div class="wr-row">${ring(a.today?.recovery ?? null)}<span class="wr-txt"><b data-no-tr>${esc(a.athlete)}</b><span class="note" data-no-tr>${esc(a.today ? `${T('Sleep', 'Tidur')} ${hours(a.today.sleepMin, S.lang)}` : T('no data today', 'belum ada data hari ini'))}</span></span></div></li>`).join('')}</ul>
      <p class="note">${esc(T('Recovery from Whoop (green 67+, yellow 34–66, red below 34). Details stay with Coach Donny.', 'Recovery dari Whoop (hijau 67+, kuning 34–66, merah di bawah 34). Detail ada di Coach Donny.'))}</p></div>`;
  }

  async function copy(text, msgId, ok) {
    try { await navigator.clipboard.writeText(text); setMsg(msgId, ok, 'ok'); } catch { setMsg(msgId, `${T('Copy did not work here; long-press to copy:', 'Salin tidak berhasil di sini; tekan lama untuk menyalin:')} ${text}`, 'err'); }
  }
  async function onClick(t) {
    const ds = t.dataset;
    if ('wrTitle' in ds) { W.title = ds.wrTitle; W.open = ''; render(); return true; }
    if ('wrOpen' in ds) { W.open = W.open === ds.wrOpen ? '' : ds.wrOpen; W.arm = ''; render(); return true; }
    if ('wrCopyurl' in ds) { await copy(W.cache.all?.res?.redirectUri || '', 'wrSetMsg', T('Copied.', 'Tersalin.')); return true; }
    if ('wrSave' in ds) {
      const id = document.getElementById('wrCid')?.value || ''; const sec = document.getElementById('wrSec')?.value || '';
      try { await PLATFORM.whoop.call({ action: 'config', clientId: id, clientSecret: sec }); refresh(); render(); setMsg('wrMsg', T('Saved. Now send each athlete their link.', 'Tersimpan. Sekarang kirim link ke tiap atlet.'), 'ok'); } catch (e) { setMsg('wrSetMsg', e.message, 'err'); }
      return true;
    }
    if ('wrCopy' in ds) {
      const [title, athlete] = ds.wrCopy.split('|');
      try { const r = await PLATFORM.whoop.call({ action: 'invite', title, athlete }); await copy(inviteText(athlete, r.url, S.lang), 'wrMsg', T(`Link for ${athlete} copied: paste it in WhatsApp.`, `Link untuk ${athlete} tersalin: tempel di WhatsApp.`)); } catch (e) { setMsg('wrMsg', e.message, 'err'); }
      return true;
    }
    if ('wrSync' in ds) {
      setMsg('wrMsg', T('Pulling from Whoop…', 'Menarik data dari Whoop…'));
      try { const r = await PLATFORM.whoop.call({ action: 'sync' }); refresh(); render(); setMsg('wrMsg', T(`Updated ${r.synced} athlete(s)${r.reconnect ? `; ${r.reconnect} must log in again` : ''}.`, `${r.synced} atlet diperbarui${r.reconnect ? `; ${r.reconnect} perlu login ulang` : ''}.`), r.failed || r.reconnect ? 'err' : 'ok'); } catch (e) { setMsg('wrMsg', e.message, 'err'); }
      return true;
    }
    if ('wrOff' in ds) {
      if (W.arm !== ds.wrOff) { W.arm = ds.wrOff; render(); return true; }
      const [title, athlete] = ds.wrOff.split('|'); W.arm = '';
      try { await PLATFORM.whoop.call({ action: 'disconnect', title, athlete }); W.open = ''; refresh(); render(); setMsg('wrMsg', T(`${athlete} disconnected; their Whoop numbers are deleted from the hub.`, `${athlete} diputus; data Whoop-nya dihapus dari hub.`), 'ok'); } catch (e) { setMsg('wrMsg', e.message, 'err'); }
      return true;
    }
    return false;
  }
  return { donnyPanel, coachPanel, onClick };
}
