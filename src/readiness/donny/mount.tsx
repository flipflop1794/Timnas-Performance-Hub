// Mounts Coach Donny's screens (his React pages, unchanged) inside the hub, in a shadow root so his styles and
// the hub's never mix. The hub supplies the shell: who is signed in (hub sign-in, staff only), the data (hub
// database via store.ts) and the persona switch for admins. His own permission checks run on every command.
import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useMemo, useState } from 'react';
import type { Actor, Membership } from '../../../vendor/donny-monitoring/src/index.js';
import { buatDemo, hariIniTim, TEAM_ID } from '../../../vendor/donny-monitoring/web/src/demo.js';
import { AkunStore } from '../../../vendor/donny-monitoring/web/src/akun.js';
import { HalamanStaf, hitungKotakMasuk, MENU_STAF } from '../../../vendor/donny-monitoring/web/src/pages/staf.js';
import { HalamanManajer, MENU_MANAJER } from '../../../vendor/donny-monitoring/web/src/pages/manajer.js';
import { HalamanAtlet, MENU_ATLET } from '../../../vendor/donny-monitoring/web/src/pages/atlet.js';
import { type AppCtx, AppContext, fmtTanggal, Ikon, labelOtoritas, labelPeran } from '../../../vendor/donny-monitoring/web/src/ui.js';
import donnyCss from '../../../vendor/donny-monitoring/web/src/styles.css';
import { createDonnyStore, fromRows, toRows, type HubDb } from './store.js';

// Hub staff keys whose user id in his team list differs from the first name.
export const HUB_TO_DONNY: Record<string, string> = { aufa: 'aufa', donny: 'donny', fayad: 'muslih' };

export type HubPerson = { staffKey?: string | null; name?: string; isAdmin: boolean };
type Store = ReturnType<typeof createDonnyStore>;

/** His staff (not athletes): who a hub user can be in his system. */
export function staffActors(store: Store): Actor[] {
  return store.storage.listMembershipsByTeam(TEAM_ID).filter((m) => m.peran !== 'atlet').map((m) => ({ ...m }) as Actor);
}
export function actorFor(person: HubPerson, staff: Actor[]): Actor | null {
  const key = (person.staffKey || '').toLowerCase();
  const id = HUB_TO_DONNY[key] || key;
  const byId = staff.find((a) => a.userId === id);
  if (byId) return byId;
  const first = (person.name || '').toLowerCase().replace(/^(dr|coach)\.?\s+/, '').split(/\s+/)[0] || '';
  return staff.find((a) => a.userId === first) || null;
}

/** Fill an empty store with his clean team structure (staff and athletes per title; no scores). */
export function seedStructure(store: Store, contoh = false) {
  const demo = buatDemo({ contoh });
  fromRows(store.storage, toRows((demo.svc as unknown as { storage: object }).storage));
  store.storage.dirty = true;
}

// Menu icons, as in his App.tsx.
const IKON: Record<string, string> = { papan: 'papan', sesi: 'sesi', kotak_masuk: 'kotak', konfigurasi: 'gerigi', anggota: 'tim', roster: 'atlet', atlet: 'atlet', integrasi: 'tautan', audit: 'daftar', catatan: 'catatan', lapor: 'lapor', tren: 'tren', persetujuan: 'perisai' };

type Halaman = { peran: 'staf'; h: Parameters<typeof HalamanStaf>[0]['halaman'] } | { peran: 'manajer'; h: Parameters<typeof HalamanManajer>[0]['halaman'] } | { peran: 'atlet'; h: Parameters<typeof HalamanAtlet>[0]['halaman'] };
const awal = (a: Actor): Halaman => (a.peran === 'manajer_tim' ? { peran: 'manajer', h: 'atlet' } : { peran: 'staf', h: { id: 'papan' } });

function Shell({ store, person, demo, saved }: { store: Store; person: HubPerson; demo: boolean; saved: boolean }) {
  const [versi, setVersi] = useState(0);
  useEffect(() => { const f = () => setVersi((v) => v + 1); (store as unknown as { _redraw?: () => void })._redraw = f; return () => { (store as unknown as { _redraw?: () => void })._redraw = undefined; }; }, [store]);
  const staff = useMemo(() => staffActors(store), [store, versi]);
  const me = useMemo(() => actorFor(person, staff), [person, staff]);
  const [asId, setAsId] = useState<string>('');
  // Staff entry: athletes have no hub accounts, so staff open an athlete's own screens (check-in, session RPE,
  // consent) and enter for them. His audit log names the athlete; the hub's database audit names the staff member.
  const [forAthlete, setForAthlete] = useState<string>('');
  const staffActor = (person.isAdmin && asId && staff.find((a) => a.userId === asId)) || me || (person.isAdmin ? staff.find((a) => a.peran === 'staf_pelatih' && a.admin) || staff[0] : null);
  const athleteMember = forAthlete ? store.storage.getMembership(forAthlete, TEAM_ID) : undefined;
  const actor = (staffActor && athleteMember ? ({ ...athleteMember } as Actor) : staffActor);
  const [halaman, setHalaman] = useState<Halaman | null>(null);
  const page = halaman || (actor ? awal(actor) : null);
  const akun = useMemo(() => new AkunStore(), []);
  const info = useMemo(() => {
    const atlet = store.storage.listAthletesByTeam(TEAM_ID);
    const named = store.storage.listMembershipsByTeam(TEAM_ID).filter((m) => m.nama);
    return {
      nama: new Map<string, string>([...named.map((m) => [m.userId, m.nama!] as [string, string]), ...atlet.map((a) => [a.id, a.nama] as [string, string])]),
      kelompokAtlet: new Map(atlet.flatMap((a) => (a.kelompok ? [[a.id, a.kelompok] as [string, string]] : []))),
      daftarKelompok: [...new Set(atlet.filter((a) => !a.archived && a.kelompok).map((a) => a.kelompok!))].sort((a, b) => a.localeCompare(b)),
    };
  }, [store, versi]);
  const [pilihan, setPilihan] = useState('');
  if (!actor || !page) {
    return <div className="hub-note"><b>Your hub account is not in Coach Donny's team list.</b> Ask Coach Donny (or an admin) to add you as staff in his system; athletes do not use the hub.</div>;
  }
  const kelompok = info.daftarKelompok.includes(pilihan) ? pilihan : '';
  const ctx: AppCtx = {
    svc: store.svc, actor, hariIni: hariIniTim(), versi, segarkan: () => { void store.persist(); setVersi((v) => v + 1); },
    nama: (id) => info.nama.get(id) ?? id, kelompok, daftarKelompok: info.daftarKelompok, kelompokAtlet: info.kelompokAtlet, pilihKelompok: setPilihan,
    akun, kontrol: store.svc.punyaKontrol(actor),
  };
  const kotak = page.peran === 'staf' ? hitungKotakMasuk(ctx) : 0;
  const otoritas = labelOtoritas({ peran: actor.peran, admin: ctx.kontrol && actor.peran !== 'manajer_tim' });
  const menu = page.peran === 'staf' ? MENU_STAF.filter((m) => !m.kontrol || ctx.kontrol) : page.peran === 'atlet' ? MENU_ATLET.filter((m) => m.id !== 'audit') : MENU_MANAJER;
  const athletes = store.storage.listAthletesByTeam(TEAM_ID).filter((a) => !a.archived && (!kelompok || a.kelompok === kelompok)).sort((a, b) => a.nama.localeCompare(b.nama));
  const enterFor = (id: string) => { setForAthlete(id); const m = id ? store.storage.getMembership(id, TEAM_ID) : undefined; setHalaman(m ? { peran: 'atlet', h: 'checkin' } : staffActor ? awal(staffActor) : null); };
  return (
    <AppContext.Provider value={ctx}>
      <div className="app hub-embedded">
        <aside className="side">
          <label className="kelompok"><span>Number of event</span>
            <select value={kelompok} onChange={(e) => setPilihan(e.target.value)}>
              <option value="">Semua kelompok</option>
              {info.daftarKelompok.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <nav className="nav">
            {menu.map((m) => {
              const on = page.peran === 'staf' ? (page.h as { id: string }).id === m.id || (m.id === 'papan' && (page.h as { id: string }).id === 'atlet') : page.h === m.id;
              const go = (): Halaman => (page.peran === 'staf' ? { peran: 'staf', h: { id: m.id } } : { peran: page.peran, h: m.id }) as Halaman;
              return (
                <button key={m.id} className={on ? 'aktif' : ''} onClick={() => setHalaman(go())}>
                  <Ikon nama={IKON[m.id] || 'catatan'} />
                  {m.label}{m.id === 'kotak_masuk' && kotak > 0 && <span className="hitung">{kotak}</span>}
                </button>
              );
            })}
          </nav>
          <label className="kelompok hub-for"><span>Enter for an athlete (staff entry)</span>
            <select value={forAthlete} onChange={(e) => enterFor(e.target.value)}>
              <option value="">— Staff screens —</option>
              {athletes.map((a) => <option key={a.id} value={a.id}>{a.nama}{a.kelompok ? ` · ${a.kelompok}` : ''}</option>)}
            </select>
          </label>
          <div className="side-foot">{demo ? 'Demo sandbox: Coach Donny\'s sample data, not saved.' : saved ? 'Saved in the Timnas Hub database. Staff only.' : 'Not saved: this page has no database (open the hub website to save).'}</div>
        </aside>
        <div className="main">
          {forAthlete && athleteMember && <div className="spanduk-contoh hub-entry" role="note"><b>Staff entry for {ctx.nama(forAthlete)}.</b> You are filling in this athlete's own screens on their behalf. <button className="link" onClick={() => enterFor('')}>Back to staff screens</button></div>}
          {demo && <div className="spanduk-contoh" role="note"><b>Data contoh.</b> Generated sample data for the demo sandbox, not real athlete data.</div>}
          <header className="top">
            <span className="tanggal">{fmtTanggal(ctx.hariIni)}</span>
            {person.isAdmin && !forAthlete && (
              <label className="persona"><span>View as (admin)</span>
                <select value={actor.userId} onChange={(e) => { setAsId(e.target.value); const a = staff.find((x) => x.userId === e.target.value); if (a) setHalaman(awal(a)); }}>
                  {staff.map((p) => <option key={p.userId} value={p.userId}>{ctx.nama(p.userId)} — {labelPeran(p)}</option>)}
                </select>
              </label>
            )}
            <div className="siapa"><div><b>{ctx.nama(actor.userId)}</b><div className="kecil">{labelPeran(actor)}{otoritas && <span className={`lencana-otoritas ${actor.peran === 'manajer_tim' ? 'super' : ''}`}>{otoritas}</span>}</div></div></div>
          </header>
          <main className="konten" key={actor.userId}>
            {page.peran === 'staf' && <HalamanStaf halaman={page.h as never} pindah={(h) => setHalaman({ peran: 'staf', h } as Halaman)} />}
            {page.peran === 'manajer' && <HalamanManajer halaman={page.h as never} />}
            {page.peran === 'atlet' && <HalamanAtlet halaman={page.h as never} pindah={(h) => setHalaman({ peran: 'atlet', h } as Halaman)} />}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}

// His stylesheet, scoped to the shadow root, plus a few lines so it sits inside a hub panel.
const SCOPED = String(donnyCss).replace(/:root\b/g, ':host').replace(/(^|\})\s*(html|body)\s*\{/g, '$1 .shadow-body {');
const HUB_FIT = `.shadow-body{display:block;font-family:"Plus Jakarta Sans",system-ui,sans-serif}.hub-embedded{min-height:640px;height:auto}.hub-embedded .side{position:sticky;top:0;align-self:flex-start;max-height:100vh;overflow:auto}
.hub-for{margin-top:12px}.hub-entry{background:#ffc940;color:#2b1d00}.hub-note{padding:18px;border:1px solid #6b3a40;background:#2a0d11;color:#fff;border-radius:6px;font:14px/1.5 system-ui,sans-serif}
@media (max-width:760px){.hub-embedded{display:block}.hub-embedded .side{position:static;max-height:none}}`;

export type Mounted = { node: HTMLElement; store: Store; root: Root; unmount(): void };
/**
 * Create the mount once per page and per mode; the hub moves `node` into its page on every redraw, so React
 * state (open page, form input) survives the hub's re-renders.
 */
export function mountDonny({ db, sid, person, demo, onError }: { db: HubDb | null; sid?: (s: string) => string; person: HubPerson; demo: boolean; onError?: (e: unknown) => void }): Mounted {
  const node = document.createElement('div'); node.className = 'donny-host';
  const shadow = node.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = SCOPED + HUB_FIT; shadow.appendChild(style);
  const body = document.createElement('div'); body.className = 'shadow-body'; shadow.appendChild(body);
  let store: Store | null = null;
  const redraw = () => (store as unknown as { _redraw?: () => void } | null)?._redraw?.();
  const onChange = () => {
    // Data arrived from the database (first load or another device). An empty database gets his clean team structure once.
    queueMicrotask(() => { if (!store) return; if (store.loaded && store.empty) { seedStructure(store); void store.persist(); } redraw(); });
  };
  store = createDonnyStore(demo ? null : db, { sid, onChange, onError });
  // Every command the screens run is written through to the hub database.
  const svc = store!.svc as unknown as Record<string, unknown>;
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(svc))) {
    const f = svc[k]; if (k === 'constructor' || typeof f !== 'function') continue;
    svc[k] = (...a: unknown[]) => { const r = (f as (...x: unknown[]) => unknown).apply(svc, a); if (store!.storage.dirty) void store!.persist(); return r; };
  }
  if (demo) seedStructure(store!, true);
  else if (!db) seedStructure(store!);
  const root = createRoot(body);
  root.render(<Shell store={store!} person={person} demo={demo} saved={!demo && !!db} />);
  return { node, store: store!, root, unmount: () => root.unmount() };
}
