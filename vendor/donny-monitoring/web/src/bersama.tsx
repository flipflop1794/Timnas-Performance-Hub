import { useMemo, useState } from "react";
import type { Catatan, CheckIn, DailyScore, LinimasaEvent, Sesi, ThreadReply, Visibilitas } from "../../src/index.js";
import { KATEGORI_CATATAN_VALID } from "../../src/modules/kolaborasi.js";
import { tambahHari, tanggalDiZona } from "../../src/domain/tanggal.js";
import { TIMEZONE } from "./demo.js";
import {
  AREA_NYERI_LABEL,
  fmtAngka,
  fmtJam,
  fmtTanggal,
  fmtWaktu,
  JENIS_SESI_LABEL,
  Kosong,
  Pesan,
  StatusBadge,
  TeksSebutan,
  useAksi,
  useApp,
  VISIBILITAS_LABEL,
  VISIBILITAS_PENJELASAN,
} from "./ui.js";

// ───────────────────────── Linimasa ─────────────────────────

const IKON_LINIMASA: Record<LinimasaEvent["type"], string> = {
  check_in: "☀",
  sesi: "🎮",
  skor: "◎",
  catatan: "✎",
  thread_reply: "↳",
};

export function Linimasa({ athleteId, hari = 7 }: { athleteId: string; hari?: number }) {
  const { svc, actor, hariIni, versi } = useApp();
  const dari = tambahHari(hariIni, -(hari - 1));
  // Setiap pembacaan Linimasa tercatat di Log Audit, jadi hanya dimuat ulang
  // saat atlet, rentang, atau data berubah.
  const hasil = useMemo(
    () => svc.linimasaAtlet(actor, { athleteId, dari, sampai: hariIni }),
    [athleteId, dari, hariIni, versi, actor.userId]
  );
  if (!hasil.ok) return <Pesan umpan={{ jenis: "gagal", teks: hasil.reason }} />;
  const events = [...hasil.data].reverse();
  if (events.length === 0) return <Kosong>Belum ada aktivitas dalam {hari} hari terakhir.</Kosong>;

  // Skor dikelompokkan menurut tanggal skornya, bukan waktu penghitungannya:
  // RPE yang diisi hari ini bisa menghitung ulang skor kemarin.
  const perHari = new Map<string, LinimasaEvent[]>();
  for (const e of events) {
    const t = tanggalEvent(e);
    perHari.set(t, [...(perHari.get(t) ?? []), e]);
  }
  const urutHari = [...perHari.keys()].sort().reverse();

  return (
    <div className="lini">
      {urutHari.map((t) => (
        <div key={t}>
          <div className="lini-hari">{t === hariIni ? "Hari ini" : fmtTanggal(t)}</div>
          {perHari.get(t)!.map((e, i) => (
            <div className="lini-item" key={i}>
              <span className="jam">{tanggalDiZona(e.at, TIMEZONE) === t ? fmtJam(e.at) : ""}</span>
              <span className="tipe" aria-hidden>
                {IKON_LINIMASA[e.type]}
              </span>
              <IsiLinimasa e={e} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function tanggalEvent(e: LinimasaEvent): string {
  return e.type === "skor" ? (e.data as DailyScore).tanggal : tanggalDiZona(e.at, TIMEZONE);
}

function IsiLinimasa({ e }: { e: LinimasaEvent }) {
  const { nama } = useApp();
  switch (e.type) {
    case "check_in": {
      const c = e.data as CheckIn;
      const nyeri = Object.entries(c.petaNyeri).filter(([, v]) => v > 0);
      return (
        <div>
          <b>Check-in</b> · tidur {fmtAngka(c.items.durasiTidurJam, 1)} jam (kualitas {c.items.kualitasTidur}/5) · lelah{" "}
          {c.items.kelelahanUmum} · mata {c.items.kelelahanMata} · stres {c.items.stres} · mood {c.items.mood} · motivasi{" "}
          {c.items.motivasiBerlatih}
          {c.items.energi !== undefined && ` · energi ${c.items.energi}`}
          {c.items.fokus !== undefined && ` · fokus ${c.items.fokus}`}
          {nyeri.length > 0 && (
            <div className="ink-2 kecil">
              Nyeri: {nyeri.map(([k, v]) => `${AREA_NYERI_LABEL[k as keyof typeof AREA_NYERI_LABEL]} ${v}/10`).join(", ")}
            </div>
          )}
          {c.catatanLatihan && <div className="ink-2 kecil">Catatan latihan: “{c.catatanLatihan}”</div>}
          {c.catatanBebas && <div className="ink-2 kecil">“{c.catatanBebas}”</div>}
          {c.history.length > 1 && <div className="muted kecil">Diubah {c.history.length - 1} kali</div>}
        </div>
      );
    }
    case "sesi": {
      const s = e.data as Sesi;
      return (
        <div>
          <b>{JENIS_SESI_LABEL[s.jenis]}</b> · {s.durasiMenit} menit
          {s.rpeAktual !== undefined ? (
            <>
              {" "}
              · RPE {s.rpeAktual} · beban {fmtAngka(s.rpeAktual * s.durasiMenit)} AU
            </>
          ) : (
            <span className="muted"> · {s.status === "terjadwal" ? "terjadwal, RPE belum diisi" : ""}</span>
          )}
        </div>
      );
    }
    case "skor": {
      const s = e.data as DailyScore;
      return (
        <div className="row">
          <b>Skor Harian</b>
          <StatusBadge status={s.status} />
          <span className="ink-2">
            Readiness {fmtAngka(s.readiness, 1)} · Wellness {fmtAngka(s.wellnessScore)}
          </span>
          {tanggalDiZona(s.computedAt, TIMEZONE) !== s.tanggal && (
            <span className="muted kecil">dihitung ulang {fmtWaktu(s.computedAt)}</span>
          )}
        </div>
      );
    }
    case "catatan": {
      const c = e.data as Catatan;
      return (
        <div>
          <b>Catatan</b> dari {nama(c.authorId)} <span className={`chip ${c.visibilitas}`}>{VISIBILITAS_LABEL[c.visibilitas]}</span>
          <div className="ink-2">
            <TeksSebutan teks={c.body} />
          </div>
        </div>
      );
    }
    case "thread_reply": {
      const r = e.data as ThreadReply;
      return (
        <div>
          <b>Balasan</b> dari {nama(r.authorId)}
          <div className="ink-2">
            <TeksSebutan teks={r.body} />
          </div>
        </div>
      );
    }
  }
}

// ───────────────────────── Catatan ─────────────────────────

export function CatatanItem({ catatan, tampilkanAtlet = true }: { catatan: Catatan; tampilkanAtlet?: boolean }) {
  const { svc, actor, nama, versi } = useApp();
  const { umpan, jalankan } = useAksi();
  const [buka, setBuka] = useState(false);
  const [balasan, setBalasan] = useState("");
  const [ubah, setUbah] = useState<string | null>(null);
  const [formTl, setFormTl] = useState(false);

  const staf = actor.peran === "staf_pelatih" || actor.peran === "tim_support";
  const replies = useMemo(
    () => (buka ? svc.thread(actor, { catatanId: catatan.id }) : null),
    [buka, catatan.id, versi, actor.userId]
  );
  const tl = catatan.tindakLanjut;

  return (
    <div className="catatan">
      <div className="meta">
        <b style={{ color: "var(--ink)" }}>{nama(catatan.authorId)}</b>
        <span>{fmtWaktu(catatan.createdAt)}</span>
        {tampilkanAtlet && <span>· {catatan.athleteId ? `tentang ${nama(catatan.athleteId)}` : "tingkat tim"}</span>}
        <span className={`chip ${catatan.visibilitas}`} title={VISIBILITAS_PENJELASAN[catatan.visibilitas]}>
          {VISIBILITAS_LABEL[catatan.visibilitas]}
        </span>
        {catatan.kategori.map((k) => (
          <span className="chip" key={k}>
            {k}
          </span>
        ))}
        {catatan.history.length > 0 && <span className="muted">(diubah)</span>}
      </div>

      {ubah === null ? (
        <div className="body">
          <TeksSebutan teks={catatan.body} />
        </div>
      ) : (
        <div className="stack">
          <textarea value={ubah} onChange={(e) => setUbah(e.target.value)} />
          <div className="row">
            <button
              className="btn utama kecil"
              onClick={() => {
                if (jalankan(svc.ubahCatatan(actor, { catatanId: catatan.id, body: ubah }), "Catatan diperbarui.")) setUbah(null);
              }}
            >
              Simpan
            </button>
            <button className="btn kecil" onClick={() => setUbah(null)}>
              Batal
            </button>
          </div>
        </div>
      )}

      {tl && (
        <div className={`tl ${tl.status}`}>
          <b>Tindak Lanjut</b>
          <span>
            {nama(tl.ownerId)} · tenggat {fmtTanggal(tl.dueDate)}
          </span>
          <span className="chip">{tl.status === "terbuka" ? "Terbuka" : `Selesai ${fmtWaktu(tl.selesaiAt!)}`}</span>
          {tl.status === "terbuka" && tl.ownerId === actor.userId && (
            <button
              className="btn kecil"
              onClick={() => jalankan(svc.selesaikanTindakLanjut(actor, { catatanId: catatan.id }), "Tindak Lanjut ditandai selesai.")}
            >
              Tandai selesai
            </button>
          )}
        </div>
      )}

      <div className="row">
        <button className="link kecil" onClick={() => setBuka((v) => !v)}>
          {buka ? "Tutup thread" : "Thread & balas"}
        </button>
        {catatan.authorId === actor.userId && ubah === null && (
          <button className="link kecil" onClick={() => setUbah(catatan.body)}>
            Ubah
          </button>
        )}
        {staf && !tl && (
          <button className="link kecil" onClick={() => setFormTl((v) => !v)}>
            Jadikan Tindak Lanjut
          </button>
        )}
      </div>

      {formTl && <FormTindakLanjut catatanId={catatan.id} selesai={() => setFormTl(false)} />}

      {buka && replies && (
        <div className="thread">
          {!replies.ok ? (
            <Pesan umpan={{ jenis: "gagal", teks: replies.reason }} />
          ) : (
            replies.data.map((r) => (
              <div key={r.id}>
                <div className="meta">
                  <b style={{ color: "var(--ink)" }}>{nama(r.authorId)}</b> <span>{fmtWaktu(r.createdAt)}</span>
                </div>
                <div className="body">
                  <TeksSebutan teks={r.body} />
                </div>
              </div>
            ))
          )}
          <div className="row">
            <input
              type="text"
              style={{ flex: 1 }}
              placeholder="Tulis balasan… (@userId untuk menyebut)"
              value={balasan}
              onChange={(e) => setBalasan(e.target.value)}
            />
            <button
              className="btn kecil"
              onClick={() => {
                if (jalankan(svc.balasThread(actor, { catatanId: catatan.id, body: balasan }), "Balasan terkirim.")) setBalasan("");
              }}
            >
              Kirim
            </button>
          </div>
        </div>
      )}
      <Pesan umpan={umpan} />
    </div>
  );
}

function FormTindakLanjut({ catatanId, selesai }: { catatanId: string; selesai(): void }) {
  const { svc, actor, nama, hariIni } = useApp();
  const { umpan, jalankan } = useAksi();
  const anggota = svc.anggotaTim(actor);
  const staf = anggota.ok ? anggota.data.anggota.filter((m) => m.peran === "staf_pelatih" || m.peran === "tim_support") : [];
  const [owner, setOwner] = useState(actor.userId);
  const [tenggat, setTenggat] = useState(tambahHari(hariIni, 2));
  return (
    <div className="stack" style={{ background: "var(--surface-2)", padding: 10, borderRadius: 8 }}>
      <div className="row">
        <label className="field">
          Penanggung jawab
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            {staf.map((m) => (
              <option key={m.userId} value={m.userId}>
                {nama(m.userId)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Tenggat
          <input type="date" value={tenggat} onChange={(e) => setTenggat(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button
          className="btn utama kecil"
          onClick={() => {
            if (jalankan(svc.buatTindakLanjut(actor, { catatanId, ownerId: owner, tenggat }), "Tindak Lanjut dibuat.")) selesai();
          }}
        >
          Buat Tindak Lanjut
        </button>
        <button className="btn kecil" onClick={selesai}>
          Batal
        </button>
      </div>
      <Pesan umpan={umpan} />
    </div>
  );
}

export function TulisCatatan({ athleteId }: { athleteId?: string }) {
  const { svc, actor, nama } = useApp();
  const { umpan, jalankan } = useAksi();
  const [body, setBody] = useState("");
  const [visibilitas, setVisibilitas] = useState<Visibilitas>("staf");
  const [kategori, setKategori] = useState<string[]>([]);
  const [atlet, setAtlet] = useState(athleteId ?? "");
  const anggota = svc.anggotaTim(actor);
  const daftarAtlet = anggota.ok ? anggota.data.atlet.filter((a) => !a.archived) : [];
  const pilihanVis: Visibilitas[] =
    actor.peran === "tim_support" ? ["staf", "klinis", "bersama_atlet"] : ["staf", "bersama_atlet"];

  return (
    <div className="stack">
      {athleteId === undefined && (
        <label className="field">
          Tentang
          <select value={atlet} onChange={(e) => setAtlet(e.target.value)}>
            <option value="">Tingkat tim (tidak terkait satu atlet)</option>
            {daftarAtlet.map((a) => (
              <option key={a.id} value={a.id}>
                {nama(a.id)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Isi catatan
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tulis pengamatan… Ketik @sari, @budi, atau @dimas untuk menyebut rekan."
        />
      </label>
      <div className="row">
        <label className="field">
          Visibilitas
          <select value={visibilitas} onChange={(e) => setVisibilitas(e.target.value as Visibilitas)}>
            {pilihanVis.map((v) => (
              <option key={v} value={v}>
                {VISIBILITAS_LABEL[v]} — {VISIBILITAS_PENJELASAN[v]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <span className="ink-2 kecil">Kategori:</span>
        {KATEGORI_CATATAN_VALID.map((k) => (
          <label key={k} className="row kecil" style={{ gap: 4 }}>
            <input
              type="checkbox"
              checked={kategori.includes(k)}
              onChange={(e) => setKategori((ks) => (e.target.checked ? [...ks, k] : ks.filter((x) => x !== k)))}
            />
            {k}
          </label>
        ))}
      </div>
      <div className="row">
        <button
          className="btn utama"
          onClick={() => {
            const hasil = svc.tulisCatatan(actor, {
              athleteId: (athleteId ?? atlet) || undefined,
              body,
              visibilitas,
              kategori,
            });
            if (jalankan(hasil, "Catatan tersimpan.")) {
              setBody("");
              setKategori([]);
            }
          }}
        >
          Simpan catatan
        </button>
      </div>
      <Pesan umpan={umpan} />
    </div>
  );
}
