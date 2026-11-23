// TEST BRANCH (test/wearables) — real WHOOP and Garmin connections for Coach Donny's system, owned by the hub
// (his code stays unchanged). Shown at the top of his "Integrasi" page for Coach Donny and admins:
//   - per athlete: make a personal WHOOP / Garmin link (sent by WhatsApp), see if it is connected, disconnect;
//   - "Sync WHOOP now" asks the server to fetch the last 7 days again;
//   - new days are handed to his system through his own terimaDataWearable(), so his consent check decides.
import { useEffect, useState } from 'react';
import type { DataWearableInput } from '../../../vendor/donny-monitoring/src/index.js';
import { TEAM_ID } from '../../../vendor/donny-monitoring/web/src/demo.js';
import type { HubStorage } from './store.js';

type Doc = Record<string, unknown>;
export type Wearables = {
  invite(x: { athleteId: string; athleteName: string; provider: 'whoop' | 'garmin' }): Promise<string>;
  links(): Promise<Doc[]>;
  daily(sinceDay: string): Promise<Doc[]>;
  call(path: 'sync' | 'disconnect', body?: Doc): Promise<Doc>;
};
type Svc = { terimaDataWearable(p: DataWearableInput): { ok: boolean; reason?: string } };
type Row = { athlete_id: string; provider: 'whoop' | 'garmin'; day: string; data: Partial<DataWearableInput> };

const EMPTY: Omit<DataWearableInput, 'athleteId' | 'tanggal'> = { langkah: null, menitIntensitas: null, tidur: null, kalori: null, detakJantung: null, stres: null, spo2: null,
  bodyBattery: null, komposisiTubuh: null, respirasi: null, tekananDarah: null, hrvRmssd: null, durasiDudukMenit: null };
const METRICS = Object.keys(EMPTY);
const same = (a: Doc, b: Doc) => METRICS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));

/**
 * The days from WHOOP and Garmin as his wearable days: one per athlete and date (Garmin first where both have a value).
 * Heart rate needs all three numbers in his format; a missing one is filled from the other source or the day is
 * sent without heart rate. Only days that differ from what his system already holds are sent.
 */
export function importWearables(svc: Svc, storage: HubStorage, rows: Row[]) {
  const byKey = new Map<string, { athleteId: string; tanggal: string; src: Set<string>; d: Doc }>();
  for (const r of [...rows].sort((a, b) => (a.provider === b.provider ? 0 : a.provider === 'whoop' ? -1 : 1))) {
    const k = `${r.athlete_id}|${r.day}`; const x = byKey.get(k) || { athleteId: r.athlete_id, tanggal: String(r.day).slice(0, 10), src: new Set<string>(), d: {} };
    for (const [m, v] of Object.entries(r.data || {})) {
      if (v == null) continue;
      x.d[m] = m === 'detakJantung' && x.d[m] ? { ...(x.d[m] as Doc), ...(v as Doc) } : v;
    }
    x.src.add(r.provider); byKey.set(k, x);
  }
  const out = { sent: 0, unchanged: 0, refused: [] as string[] };
  for (const x of byKey.values()) {
    const hr = x.d.detakJantung as { istirahat?: number; rataRata?: number; maks?: number } | undefined;
    const d: Doc = { ...EMPTY, ...x.d, detakJantung: hr && hr.istirahat != null && hr.rataRata != null && hr.maks != null ? hr : null };
    const have = storage.listDataWearableByAthlete(x.athleteId, x.tanggal, x.tanggal)[0] as Doc | undefined;
    if (have && same(have, d)) { out.unchanged++; continue; }
    const r = svc.terimaDataWearable({ ...(d as object), athleteId: x.athleteId, tanggal: x.tanggal, sumber: (x.src.has('garmin') ? 'garmin' : 'whoop') as 'garmin' } as DataWearableInput);
    if (r.ok) out.sent++; else out.refused.push(`${x.tanggal}: ${r.reason || 'refused'}`);
  }
  return out;
}

const NAME = { whoop: 'WHOOP', garmin: 'Garmin' } as const;
const fmt = (iso?: unknown) => { const d = new Date(String(iso || '')); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

export function WearablePanel({ wear, svc, storage, onImported }: { wear: Wearables; svc: Svc; storage: HubStorage; onImported(): void }) {
  const [links, setLinks] = useState<Doc[]>([]);
  const [made, setMade] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const athletes = storage.listAthletesByTeam(TEAM_ID).filter((a) => !a.archived).sort((a, b) => a.nama.localeCompare(b.nama));
  async function refresh(importToo = true) {
    try {
      setLinks(await wear.links());
      if (importToo) {
        const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
        const r = importWearables(svc, storage, (await wear.daily(since)) as unknown as Row[]);
        if (r.sent) onImported();
        setMsg(r.sent || r.refused.length ? `${r.sent} hari data masuk ke sistem.${r.refused.length ? ` ${r.refused.length} ditolak (cek persetujuan Data wearable atlet): ${r.refused.slice(0, 3).join('; ')}` : ''}` : '');
      }
    } catch (e) { setMsg((e as Error).message); }
  }
  useEffect(() => { void refresh(); }, []);
  const linkOf = (id: string, p: string) => links.find((l) => l.athlete_id === id && l.provider === p);
  async function make(athleteId: string, athleteName: string, provider: 'whoop' | 'garmin') {
    setBusy(true);
    try {
      const t = await wear.invite({ athleteId, athleteName, provider });
      const url = `${location.origin}/connect.html?t=${t}&p=${provider}`;
      setMade((m) => ({ ...m, [`${athleteId}|${provider}`]: url }));
      try { await navigator.clipboard.writeText(url); setMsg(`Link ${NAME[provider]} untuk ${athleteName} disalin. Kirim lewat WhatsApp (berlaku 14 hari, satu kali pakai).`); }
      catch { setMsg(`Link ${NAME[provider]} untuk ${athleteName} dibuat: salin dari tabel.`); }
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function cut(athleteId: string, athleteName: string, provider: 'whoop' | 'garmin') {
    if (!confirm(`Putuskan ${NAME[provider]} ${athleteName}? Data yang sudah masuk tetap tersimpan.`)) return;
    setBusy(true);
    try { await wear.call('disconnect', { athleteId, provider }); await refresh(false); setMsg(`${NAME[provider]} ${athleteName} diputus.`); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true); setMsg('Mengambil data WHOOP…');
    try { const r = await wear.call('sync'); await refresh(); setMsg(`WHOOP: ${r.days ?? 0} hari diperbarui.${(r.errors as string[] | undefined)?.length ? ` Masalah: ${(r.errors as string[]).join('; ')}` : ''}`); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  const cell = (a: { id: string; nama: string }, p: 'whoop' | 'garmin') => {
    const l = linkOf(a.id, p); const url = made[`${a.id}|${p}`];
    if (l?.status === 'connected') return <span><b className="hub-ok">Terhubung</b><br /><span className="kecil">data terakhir {fmt(l.last_data_at)}</span><br /><button className="link" disabled={busy} onClick={() => cut(a.id, a.nama, p)}>Putuskan</button></span>;
    return <span>{l?.status === 'disconnected' && <span className="kecil">Terputus{l.note ? ` (${String(l.note)})` : ''}<br /></span>}
      <button className="tombol kecil" disabled={busy} onClick={() => make(a.id, a.nama, p)}>Buat link {NAME[p]}</button>
      {url && <input className="hub-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />}</span>;
  };
  return (
    <section className="kartu hub-wear">
      <h2>WHOOP &amp; Garmin — koneksi nyata (uji coba)</h2>
      <p className="kecil">Buat link pribadi untuk atlet dan kirim lewat WhatsApp. Atlet menyetujui di halaman resmi WHOOP / Garmin: password tidak pernah masuk ke hub. Data masuk otomatis dan hanya Coach Donny dan admin yang bisa melihatnya. Data dipakai hanya bila atlet sudah memberi persetujuan <b>Data wearable</b> di sistem ini.</p>
      <div className="hub-wear-bar"><button className="tombol" disabled={busy} onClick={sync}>Sinkron WHOOP sekarang</button> <button className="tombol" disabled={busy} onClick={() => refresh()}>Muat ulang</button></div>
      {msg && <p className="kecil hub-msg" role="status">{msg}</p>}
      <table><thead><tr><th>Atlet</th><th>WHOOP</th><th>Garmin</th></tr></thead>
        <tbody>{athletes.map((a) => <tr key={a.id}><td>{a.nama}{a.kelompok ? <span className="kecil"> · {a.kelompok}</span> : null}</td><td>{cell(a, 'whoop')}</td><td>{cell(a, 'garmin')}</td></tr>)}</tbody></table>
    </section>
  );
}
