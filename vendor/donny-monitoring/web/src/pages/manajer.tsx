import { useState } from "react";
import type { Membership, Peran, SubPeranTimSupport } from "../../../src/index.js";
import { NOMOR, UNIT } from "../demo.js";
import { HalamanIntegrasiGarmin } from "./integrasi.js";
import { DaftarAtlet } from "./roster.js";
import { fmtWaktu, Info, Jendela, Kosong, labelOtoritas, labelPeran, PERAN_LABEL, Pesan, SUBPERAN_LABEL, useAksi, useApp } from "../ui.js";

export type HalamanManajer = "atlet" | "anggota" | "audit" | "integrasi";

export const MENU_MANAJER: { id: HalamanManajer; label: string }[] = [
  { id: "atlet", label: "Atlet" },
  { id: "anggota", label: "Anggota Tim" },
  { id: "audit", label: "Log Audit" },
  { id: "integrasi", label: "Integrasi Garmin" },
];

export function HalamanManajer({ halaman }: { halaman: HalamanManajer }) {
  if (halaman === "audit") return <HalamanLogAudit />;
  if (halaman === "integrasi") return <HalamanIntegrasiGarmin />;
  if (halaman === "atlet") return <DaftarAtlet />;
  return <Anggota />;
}

export function HalamanLogAudit() {
  return (
    <>
      <div className="judul">
        <div>
          <h1>Log Audit</h1>
          <p>Semua perubahan dan pembacaan data sensitif di Tim ini.</p>
        </div>
      </div>
      <div className="card">
        <LogAudit />
      </div>
    </>
  );
}

// ───────────────────────── Anggota ─────────────────────────

const PERAN_STAF: Peran[] = ["staf_pelatih", "tim_support", "manajer_tim"];

export function Anggota() {
  const { svc, actor, nama, akun } = useApp();
  const { umpan, jalankan } = useAksi();
  const [edit, setEdit] = useState<string | null>(null);
  const r = svc.anggotaTim(actor);
  if (!r.ok) return <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />;
  // Dalam satu unit, urutan mengikuti struktur (urutan pendaftaran): Ketua sebelum Wakil, dst.
  const staf = r.data.anggota.filter((m) => m.peran !== "atlet").sort((a, b) => urutanOtoritas(a) - urutanOtoritas(b));
  const atletAktif = r.data.atlet.filter((a) => !a.archived);
  const sedangEdit = staf.find((m) => m.userId === edit);

  // Nomor pertandingan: urutan struktur dulu, lalu nomor baru yang ditambahkan Super admin.
  const nomor = [
    ...new Set([...NOMOR.map((n) => n.nomor), ...staf.map((m) => m.kelompok ?? ""), ...atletAktif.map((a) => a.kelompok ?? "")]),
  ].filter((n) => n && (staf.some((m) => m.kelompok === n) || atletAktif.some((a) => a.kelompok === n)));
  const pengurus = Object.values(UNIT).map((u) => ({ unit: u, anggota: staf.filter((m) => m.unit === u) }));
  const lainnya = staf.filter((m) => !Object.values(UNIT).includes(m.unit as never) && !(m.kelompok && nomor.includes(m.kelompok)));

  const baris = (m: Membership) => {
    const otoritas = labelOtoritas(m);
    const superAdmin = m.peran === "manajer_tim";
    return (
      <tr key={m.userId}>
        <td>
          <b>{nama(m.userId)}</b>
          {otoritas && <span className={`lencana-otoritas ${superAdmin ? "super" : ""}`}>{otoritas}</span>}
          <div className="muted kecil">
            {m.jabatan ?? labelPeran(m)} · @{akun.username(m.userId) || m.userId}
          </div>
        </td>
        <td>
          {m.userId === actor.userId || superAdmin ? (
            <span className="ink-2">{labelPeran(m)}</span>
          ) : (
            <select
              aria-label={`Peran ${nama(m.userId)}`}
              value={m.subPeran ? `${m.peran}:${m.subPeran}` : m.peran}
              onChange={(e) => {
                const [peran, subPeran] = e.target.value.split(":") as [Peran, SubPeranTimSupport | undefined];
                jalankan(svc.ubahPeran(actor, { userId: m.userId, peran, subPeran }), `Peran ${nama(m.userId)} diubah.`);
              }}
            >
              {pilihanPeran().map((p) => (
                <option key={p.nilai} value={p.nilai}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </td>
        <td>
          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
            <button className="btn utama kecil" aria-label={`Edit ${nama(m.userId)}`} onClick={() => setEdit(m.userId)}>
              Edit
            </button>
            {m.userId !== actor.userId && !superAdmin && (
              <button
                className="btn bahaya kecil"
                aria-label={`Hapus ${nama(m.userId)}`}
                onClick={() => {
                  if (confirm(`Hapus ${nama(m.userId)} (${m.jabatan ?? labelPeran(m)}) dari Tim? Akun ini tidak bisa lagi masuk ke Tim.`)) {
                    if (jalankan(svc.hapusAnggota(actor, { userId: m.userId }), `${nama(m.userId)} dihapus dari Tim.`)) {
                      akun.hapus(m.userId);
                    }
                  }
                }}
              >
                Hapus
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };
  const tabel = (anggota: Membership[]) => (
    <div className="table-wrap">
      <table>
        <tbody>{anggota.map(baris)}</tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="judul">
        <div>
          <h1>Anggota Tim</h1>
          <p>Struktur pengurus, pelatih, dan atlet Tim Nasional Esports Indonesia. Profil atlet dikelola di menu Atlet.</p>
        </div>
      </div>
      <Info>
        <span>
          <b>Super admin</b> (Manajer Tim) dan staf berstatus <b>Admin</b> punya otoritas kontrol yang sama: mengelola atlet dan anggota
          serta membaca Log Audit. Super admin tidak bisa dihapus.
        </span>
      </Info>
      <Pesan umpan={umpan} />

      <div className="struktur-grid">
        {pengurus.map((g) => (
          <section key={g.unit} className="card struktur-unit" aria-label={g.unit}>
            <h2>{g.unit}</h2>
            {g.anggota.length === 0 ? <Kosong>Belum ada anggota.</Kosong> : tabel(g.anggota)}
          </section>
        ))}
      </div>

      <h2 className="judul-bagian">Pelatih nomor dan atlet</h2>
      <div className="struktur-grid">
        {nomor.map((n) => {
          const atlet = atletAktif.filter((a) => a.kelompok === n).sort((a, b) => a.nama.localeCompare(b.nama));
          return (
            <section key={n} className="card struktur-unit" aria-label={n}>
              <div className="card-head">
                <h2>{n}</h2>
                <span className="muted kecil">{atlet.length} atlet</span>
              </div>
              {tabel(staf.filter((m) => m.kelompok === n))}
              <div className="daftar-atlet-nomor">
                {atlet.length === 0 ? (
                  <span className="muted kecil">Belum ada atlet.</span>
                ) : (
                  atlet.map((a) => (
                    <span key={a.id} className="chip">
                      {a.nama}
                    </span>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="grid-2">
        {lainnya.length > 0 && (
          <section className="card" aria-label="Anggota lain">
            <h2>Anggota lain</h2>
            {tabel(lainnya)}
          </section>
        )}
        <div className="card">
          <h2>Undang anggota</h2>
          <FormUndang daftarUnit={[...Object.values(UNIT), ...nomor]} />
        </div>
      </div>

      {sedangEdit && (
        <Jendela judul={`Edit profil ${nama(sedangEdit.userId)}`} tutup={() => setEdit(null)}>
          <FormProfilStaf
            anggota={sedangEdit}
            daftarUnit={[...Object.values(UNIT), ...nomor]}
            batal={() => setEdit(null)}
            simpan={(isi) => {
              const galat = akun.validasi(sedangEdit.userId, isi.username, isi.password);
              if (galat) return galat;
              const h = svc.ubahProfilAnggota(actor, {
                userId: sedangEdit.userId,
                nama: isi.nama,
                admin: isi.admin,
                jabatan: isi.jabatan,
                unit: isi.unit,
                kelompok: nomor.includes(isi.unit.trim()) ? isi.unit.trim() : "",
              });
              if (!h.ok) return h.reason;
              akun.simpan(sedangEdit.userId, isi.username, isi.password);
              jalankan(h, `Profil ${isi.nama.trim()} tersimpan.`);
              setEdit(null);
              return null;
            }}
          />
        </Jendela>
      )}
    </>
  );
}

function urutanOtoritas(m: Membership): number {
  return m.peran === "manajer_tim" ? 0 : m.admin ? 1 : 2;
}

function FormProfilStaf(props: {
  anggota: Membership;
  daftarUnit: string[];
  batal(): void;
  simpan(isi: { nama: string; admin: boolean; jabatan: string; unit: string; username: string; password: string }): string | null;
}) {
  const { actor, nama: namaDari, akun } = useApp();
  const m = props.anggota;
  const superAdmin = m.peran === "manajer_tim";
  const diriSendiri = m.userId === actor.userId;
  const [nama, setNama] = useState(namaDari(m.userId));
  const [admin, setAdmin] = useState(!!m.admin);
  const [jabatan, setJabatan] = useState(m.jabatan ?? "");
  const [unit, setUnit] = useState(m.unit ?? "");
  const [username, setUsername] = useState(akun.username(m.userId));
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState("");

  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!nama.trim()) return setGalat("Isi nama lengkap.");
        setGalat(props.simpan({ nama, admin, jabatan, unit, username, password: sandi }) ?? "");
      }}
    >
      <h2>Edit profil {namaDari(m.userId)}</h2>
      <label className="field">
        Nama lengkap
        <input id="staf-nama" type="text" autoFocus value={nama} onChange={(e) => setNama(e.target.value)} />
      </label>
      <div className="fields">
        <label className="field">
          Jabatan
          <input id="staf-jabatan" type="text" value={jabatan} onChange={(e) => setJabatan(e.target.value)} placeholder="mis. Pelatih" />
        </label>
        <label className="field">
          Unit / nomor
          <input id="staf-unit" type="text" list="daftar-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <datalist id="daftar-unit">
            {props.daftarUnit.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="field">
        <span>Peran</span>
        <span style={{ fontWeight: 400 }}>{labelPeran(m)}</span>
      </div>
      <div className="field">
        <span>Otoritas</span>
        {superAdmin ? (
          <span className="hint">
            <span className="lencana-otoritas super">Super admin</span> Otoritas penuh. Tidak bisa dihapus dan statusnya tidak bisa dicabut.
          </span>
        ) : (
          <label className="centang-admin">
            <input id="staf-admin" type="checkbox" checked={admin} disabled={diriSendiri} onChange={(e) => setAdmin(e.target.checked)} />
            <span>
              <b>Admin</b>
              <span className="hint">
                {diriSendiri
                  ? "Anda tidak bisa mengubah status Admin akun sendiri."
                  : "Otoritas kontrol sama seperti Super admin: kelola atlet, anggota, dan Log Audit."}
              </span>
            </span>
          </label>
        )}
      </div>
      <fieldset className="akun-masuk">
        <legend>Akun masuk (halaman landing)</legend>
        <p className="hint">Nama pengguna dan kata sandi ini dipakai untuk masuk di halaman awal.</p>
        <label className="field">
          Username
          <input id="staf-username" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          Password
          {akun.username(m.userId) && <span className="hint">Kosongkan bila kata sandi tidak diubah.</span>}
          <span className="sandi-baris">
            <input id="staf-password" type={lihat ? "text" : "password"} autoComplete="new-password" value={sandi} onChange={(e) => setSandi(e.target.value)} />
            <button type="button" className="btn kecil" aria-pressed={lihat} onClick={() => setLihat((v) => !v)}>
              {lihat ? "Sembunyikan" : "Tampilkan"}
            </button>
          </span>
        </label>
      </fieldset>
      {galat && (
        <div className="pesan gagal" role="alert">
          {galat}
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn utama" style={{ flex: "1 1 140px" }}>
          Simpan
        </button>
        <button type="button" className="btn" style={{ flex: "1 1 140px" }} onClick={props.batal}>
          Batal
        </button>
      </div>
    </form>
  );
}

function pilihanPeran(): { nilai: string; label: string }[] {
  const hasil: { nilai: string; label: string }[] = [];
  for (const p of PERAN_STAF) {
    if (p === "tim_support") {
      for (const s of Object.keys(SUBPERAN_LABEL) as SubPeranTimSupport[]) {
        hasil.push({ nilai: `${p}:${s}`, label: `${PERAN_LABEL[p]} · ${SUBPERAN_LABEL[s]}` });
      }
    } else {
      hasil.push({ nilai: p, label: PERAN_LABEL[p] });
    }
  }
  return hasil;
}

function FormUndang({ daftarUnit }: { daftarUnit: string[] }) {
  const { svc, actor } = useApp();
  const { umpan, jalankan } = useAksi();
  const [userId, setUserId] = useState("");
  const [namaLengkap, setNamaLengkap] = useState("");
  const [jabatan, setJabatan] = useState("Pelatih");
  const [unit, setUnit] = useState("");
  const [peran, setPeran] = useState("staf_pelatih");
  return (
    <div className="stack">
      <div className="fields">
        <label className="field">
          Nama lengkap
          <input type="text" value={namaLengkap} onChange={(e) => setNamaLengkap(e.target.value)} />
        </label>
        <label className="field">
          ID pengguna
          <span className="hint">Dipakai juga untuk sebutan @</span>
          <input type="text" value={userId} onChange={(e) => setUserId(e.target.value.trim())} placeholder="mis. lina" />
        </label>
        <label className="field">
          Jabatan
          <input type="text" value={jabatan} onChange={(e) => setJabatan(e.target.value)} />
        </label>
        <label className="field">
          Unit / nomor
          <input type="text" list="daftar-unit-undang" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <datalist id="daftar-unit-undang">
            {daftarUnit.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Peran
          <select value={peran} onChange={(e) => setPeran(e.target.value)}>
            {pilihanPeran().map((p) => (
              <option key={p.nilai} value={p.nilai}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <button
          className="btn utama"
          onClick={() => {
            if (!userId) return;
            const [p, sp] = peran.split(":") as [Peran, SubPeranTimSupport | undefined];
            const u = unit.trim();
            const hasil = svc.undangAnggota(actor, {
              userId,
              peran: p,
              subPeran: sp,
              nama: namaLengkap,
              jabatan,
              unit: u,
              kelompok: Object.values(UNIT).includes(u as never) ? undefined : u || undefined,
            });
            if (jalankan(hasil, `${namaLengkap.trim() || "@" + userId} ditambahkan ke Tim.`)) {
              setUserId("");
              setNamaLengkap("");
            }
          }}
        >
          Undang
        </button>
      </div>
      <Pesan umpan={umpan} />
    </div>
  );
}

// ───────────────────────── Log Audit ─────────────────────────

const AKSI_LABEL: Record<string, string> = {
  undangAnggota: "Mengundang anggota",
  ubahPeran: "Mengubah peran",
  daftarkanAtlet: "Mendaftarkan atlet",
  arsipkanAtlet: "Mengarsipkan atlet",
  hapusAtlet: "Menghapus atlet",
  hapusAnggota: "Menghapus anggota staf",
  ubahProfilAtlet: "Mengubah profil atlet",
  ubahProfilAnggota: "Mengubah profil anggota",
  aturIntegrasiGarmin: "Mengubah pengaturan integrasi Garmin",
  undangHubungkanGarmin: "Mengundang atlet menghubungkan Garmin",
  hubungkanAkunGarmin: "Menghubungkan akun Garmin",
  putuskanGarmin: "Memutus koneksi Garmin",
  kirimLaporan: "Mengirim laporan",
  catatPersetujuanWali: "Mencatat persetujuan wali",
  tandaiLaporanDibaca: "Membaca laporan atlet",
  berikanPersetujuan: "Mencatat persetujuan data",
  cabutPersetujuan: "Mencabut persetujuan data",
  setujuiSebagaiWali: "Persetujuan wali",
  kirimCheckIn: "Mengirim Check-in",
  ubahCheckIn: "Mengubah Check-in",
  jadwalkanSesi: "Menjadwalkan Sesi",
  catatSesi: "Mencatat Sesi",
  ubahKonfigurasiSkor: "Mengubah konfigurasi skor",
  tulisCatatan: "Menulis Catatan",
  ubahCatatan: "Mengubah Catatan",
  balasThread: "Membalas Thread",
  buatTindakLanjut: "Membuat Tindak Lanjut",
  selesaikanTindakLanjut: "Menyelesaikan Tindak Lanjut",
  bacaLinimasa: "Membaca Linimasa",
};

export function LogAudit() {
  const { svc, actor, nama } = useApp();
  const [aksi, setAksi] = useState("");
  const [batas, setBatas] = useState(50);
  const r = svc.logAudit(actor);
  if (!r.ok) return <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />;
  const semua = [...r.data].reverse();
  const daftarAksi = [...new Set(semua.map((e) => e.action))].sort();
  const tersaring = semua.filter((e) => !aksi || e.action === aksi);

  return (
    <div className="stack">
      <div className="row spread">
        <select value={aksi} onChange={(e) => setAksi(e.target.value)}>
          <option value="">Semua aksi ({semua.length})</option>
          {daftarAksi.map((a) => (
            <option key={a} value={a}>
              {AKSI_LABEL[a] ?? a}
            </option>
          ))}
        </select>
        <span className="muted kecil">Terbaru di atas</span>
      </div>
      {tersaring.length === 0 ? (
        <Kosong>Belum ada entri.</Kosong>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Oleh</th>
                <th>Aksi</th>
                <th>Sasaran</th>
              </tr>
            </thead>
            <tbody>
              {tersaring.slice(0, batas).map((e) => (
                <tr key={e.id}>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    {fmtWaktu(e.at)}
                  </td>
                  <td>{nama(e.actorId)}</td>
                  <td>{AKSI_LABEL[e.action] ?? e.action}</td>
                  <td className="ink-2">
                    {e.targetType === "athlete" ? nama(e.targetId) : e.targetType === "membership" ? `@${e.targetId}` : e.targetType}
                    {e.detail && e.action !== "ubahKonfigurasiSkor" && <span className="muted kecil"> · {e.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tersaring.length > batas && (
        <button className="btn" onClick={() => setBatas((b) => b + 100)}>
          Tampilkan lebih banyak ({tersaring.length - batas} lagi)
        </button>
      )}
    </div>
  );
}
