import { type ReactNode, useState } from "react";
import type { CheckInItems, CheckInPayload, JenisSesi, KomponenSkor, Laporan, PetaNyeri, Sesi } from "../../../src/index.js";
import { AREA_NYERI, BATAS_LAPORAN, RPE_LABELS } from "../../../src/index.js";
import { tambahHari } from "../../../src/domain/tanggal.js";
import { CatatanItem, Linimasa } from "../bersama.js";
import { KartuGarmin } from "../garmin.js";
import { KartuPerforma } from "../performa.js";
import { TrenChart } from "../TrenChart.js";
import {
  AREA_NYERI_LABEL,
  CincinReadiness,
  dariInputWaktu,
  fmtAngka,
  fmtJam,
  fmtTanggal,
  fmtWaktu,
  Info,
  Jendela,
  JENIS_SESI_LABEL,
  keInputWaktu,
  fmtBeban,
  Kosong,
  NilaiBeban,
  Pesan,
  Skala,
  StatusBadge,
  useAksi,
  useApp,
} from "../ui.js";
import { LogAudit } from "./manajer.js";

export type HalamanAtlet = "hari_ini" | "checkin" | "lapor" | "tren" | "catatan" | "audit";

export const MENU_ATLET: { id: HalamanAtlet; label: string }[] = [
  { id: "hari_ini", label: "Hari Ini" },
  { id: "checkin", label: "Check-in" },
  { id: "lapor", label: "Lapor!" },
  { id: "tren", label: "Tren Saya" },
  { id: "catatan", label: "Catatan untuk Saya" },
  { id: "audit", label: "Siapa Mengakses Data Saya" },
];

export function HalamanAtlet({ halaman, pindah }: { halaman: HalamanAtlet; pindah(h: HalamanAtlet): void }) {
  switch (halaman) {
    case "hari_ini":
      return <HariIni pindah={pindah} />;
    case "checkin":
      return (
        <>
          <Judul judul="Check-in pagi" sub="Isi setiap pagi sebelum latihan. Jawaban jujur membantu staf menyesuaikan beban latihan Anda." />
          <PersetujuanDiperlukan />
          <div className="card" style={{ maxWidth: 820 }}>
            <FormCheckIn />
          </div>
          <BebanManual />
        </>
      );
    case "lapor":
      return <Lapor />;
    case "tren":
      return <TrenSaya />;
    case "catatan":
      return <CatatanSaya />;
    case "audit":
      return (
        <>
          <Judul judul="Siapa mengakses data saya" sub="Setiap pembacaan dan perubahan data Anda tercatat di sini." />
          <div className="card">
            <LogAudit />
          </div>
        </>
      );
  }
}

function Judul({ judul, sub }: { judul: string; sub?: string }) {
  return (
    <div className="judul">
      <div>
        <h1>{judul}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </div>
  );
}

// ───────────────────────── Hari Ini ─────────────────────────

function HariIni({ pindah }: { pindah(h: HalamanAtlet): void }) {
  const { svc, actor, hariIni } = useApp();
  const skor = svc.skorHarian(actor, { athleteId: actor.athleteId!, tanggal: hariIni });
  const checkIn = svc.checkInHariIni(actor);
  const sudahCheckIn = checkIn.ok && !!checkIn.data.checkIn;
  const garmin = svc.dataWearableAtlet(actor, { athleteId: actor.athleteId!, dari: tambahHari(hariIni, -27), sampai: hariIni });

  return (
    <>
      <Judul judul="Hari ini" sub={fmtTanggal(hariIni)} />
      <PersetujuanDiperlukan />
      <div className="card ringkas">
        <CincinReadiness skor={skor.ok ? skor.data.readiness : null} status={skor.ok ? skor.data.status : "abu_abu"} />
        <div className="stack" style={{ flex: "1 1 280px" }}>
          <div className="row">
            <h2>{skor.ok && skor.data.readiness !== null ? `Readiness ${fmtAngka(skor.data.readiness, 1)}` : "Readiness hari ini"}</h2>
            <StatusBadge status={skor.ok ? skor.data.status : "abu_abu"} />
          </div>
          <p className="ink-2">{skor.ok ? skor.data.statusReason : "Check-in hari ini belum terisi."}</p>
          <div className="trio">
            <div>
              <span className="k">Wellness</span>
              <span className="v">{fmtAngka(skor.ok ? skor.data.wellnessScore : null)}</span>
            </div>
            <div>
              <span className="k">Tidur (z)</span>
              <span className="v">{zTeks(skor.ok ? skor.data.komponen.tidur : undefined)}</span>
            </div>
            <div>
              <span className="k">
                Beban{skor.ok && skor.data.komponen.beban?.sumber && ` · ${fmtBeban(skor.data.komponen.beban).sumber}`}
              </span>
              <span className="v">
                <NilaiBeban k={skor.ok ? skor.data.komponen.beban : undefined} />
              </span>
            </div>
          </div>
          <div className="row">
            <button className={`btn ${sudahCheckIn ? "" : "utama"}`} onClick={() => pindah("checkin")}>
              {sudahCheckIn ? "Lihat check-in" : "Isi check-in pagi"}
            </button>
            <button className="btn" onClick={() => pindah("lapor")}>
              Lapor!
            </button>
          </div>
        </div>
      </div>
      <KartuPerforma athleteId={actor.athleteId!} judul="Indeks performa saya" />
      <div className="card">
        <div className="card-head">
          <h2>Kondisi saya</h2>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <KoneksiGarminSaya />
          {garmin.ok ? (
            (garmin.data.data.length > 0 || garmin.data.persetujuanBerlaku) && (
              <KartuGarmin data={garmin.data.data} tanggal={hariIni} persetujuanBerlaku={garmin.data.persetujuanBerlaku} alasan={garmin.data.alasan} />
            )
          ) : (
            <Pesan umpan={{ jenis: "gagal", teks: garmin.reason }} />
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Menggantikan halaman Persetujuan Data: hanya muncul bila persetujuan
 * Kuesioner belum berlaku, karena tanpa itu Check-in ditolak.
 */
function PersetujuanDiperlukan() {
  const { svc, actor } = useApp();
  const r = svc.persetujuanSaya(actor);
  if (!r.ok) return null;
  const kuesioner = r.data.persetujuan.find((p) => p.jenis === "kuesioner");
  if (!kuesioner || kuesioner.berlaku) return null;
  const menungguWali = kuesioner.granted && r.data.wali && !r.data.wali.disetujuiAt;

  return (
    <div className="card stack persetujuan-perlu">
      <h2>Persetujuan data belum dicatat</h2>
      <p className="ink-2">
        {menungguWali
          ? "Karena Anda berusia di bawah 18 tahun, data baru diproses setelah persetujuan wali dicatat oleh Super admin."
          : "Check-in dan skor readiness baru diproses setelah Super admin mencatat persetujuan data sesuai kontrak Anda. Hubungi manajer tim."}
      </p>
    </div>
  );
}

function zTeks(k: KomponenSkor | undefined): string {
  if (!k || !k.tersedia || k.z === null) return "–";
  return (k.z > 0 ? "+" : "") + fmtAngka(k.z, 1);
}

const BUTIR: { key: keyof CheckInItems; label: string; rendah: string; tinggi: string }[] = [
  { key: "kualitasTidur", label: "Kualitas tidur", rendah: "sangat buruk", tinggi: "sangat baik" },
  { key: "kelelahanUmum", label: "Kelelahan umum", rendah: "sangat lelah", tinggi: "sangat segar" },
  { key: "kelelahanMata", label: "Kelelahan mata", rendah: "sangat lelah", tinggi: "segar" },
  { key: "sakitKepala", label: "Sakit kepala", rendah: "sangat sakit", tinggi: "tidak ada" },
  { key: "stres", label: "Stres", rendah: "sangat stres", tinggi: "sangat rileks" },
  { key: "mood", label: "Mood", rendah: "sangat buruk", tinggi: "sangat baik" },
  { key: "energi", label: "Energi", rendah: "sangat lemas", tinggi: "sangat berenergi" },
  { key: "fokus", label: "Fokus", rendah: "sulit fokus", tinggi: "sangat fokus" },
  { key: "motivasiBerlatih", label: "Motivasi berlatih", rendah: "sangat rendah", tinggi: "sangat tinggi" },
];

const NYERI_NOL = Object.fromEntries(AREA_NYERI.map((a) => [a, 0])) as unknown as PetaNyeri;

const ISIAN_AWAL: CheckInPayload = {
  items: {
    durasiTidurJam: 7,
    kualitasTidur: 3,
    kelelahanUmum: 3,
    kelelahanMata: 3,
    sakitKepala: 3,
    stres: 3,
    mood: 3,
    motivasiBerlatih: 3,
    energi: 3,
    fokus: 3,
  },
  petaNyeri: NYERI_NOL,
  screenTimeJamKemarin: 8,
  catatanBebas: "",
  catatanLatihan: "",
};

function FormCheckIn() {
  const { svc, actor } = useApp();
  const { umpan, setUmpan, jalankan } = useAksi();
  const status = svc.checkInHariIni(actor);
  const sudah = status.ok ? status.data.checkIn : null;
  const terkunci = status.ok && status.data.terkunci;
  const [mengubah, setMengubah] = useState(false);
  const [isian, setIsian] = useState<CheckInPayload>(ISIAN_AWAL);

  const setItem = (key: keyof CheckInItems, v: number) => setIsian((s) => ({ ...s, items: { ...s.items, [key]: v } }));
  const setNyeri = (key: keyof PetaNyeri, v: number) => setIsian((s) => ({ ...s, petaNyeri: { ...s.petaNyeri, [key]: v } }));

  function pakaiKemarin() {
    const r = svc.checkInKemarin(actor);
    if (r.ok && r.data) {
      setIsian({
        items: { energi: 3, fokus: 3, ...r.data.items },
        petaNyeri: r.data.petaNyeri,
        screenTimeJamKemarin: r.data.screenTimeJamKemarin,
        catatanBebas: "",
        catatanLatihan: "",
      });
      setUmpan({ jenis: "ok", teks: "Jawaban kemarin dimuat. Sesuaikan dengan kondisi pagi ini." });
    } else {
      setUmpan({ jenis: "gagal", teks: r.ok ? "Tidak ada Check-in kemarin." : r.reason });
    }
  }

  if (sudah && !mengubah) {
    return (
      <div className="stack">
        <div className="terkirim">
          <span className="centang" aria-hidden>
            ✓
          </span>
          <h2>Check-in terkirim</h2>
          <span className="muted">Terkirim pukul {fmtJam(sudah.updatedAt)}</span>
        </div>
        <div className="ink-2">
          Tidur {fmtAngka(sudah.items.durasiTidurJam, 1)} jam, kualitas {sudah.items.kualitasTidur}/5 · kelelahan{" "}
          {sudah.items.kelelahanUmum} · mata {sudah.items.kelelahanMata} · sakit kepala {sudah.items.sakitKepala} · stres{" "}
          {sudah.items.stres} · mood {sudah.items.mood} · motivasi {sudah.items.motivasiBerlatih}
          {sudah.items.energi !== undefined && ` · energi ${sudah.items.energi}`}
          {sudah.items.fokus !== undefined && ` · fokus ${sudah.items.fokus}`}
        </div>
        {sudah.catatanLatihan && <div className="ink-2">Catatan latihan: “{sudah.catatanLatihan}”</div>}
        {terkunci ? (
          <Info>Check-in terkunci karena Sesi pertama hari ini sudah dimulai. Minta staf menulis Catatan koreksi bila ada yang salah.</Info>
        ) : (
          <div>
            <button
              className="btn lebar"
              onClick={() => {
                setIsian({
                  items: { energi: 3, fokus: 3, ...sudah.items },
                  petaNyeri: sudah.petaNyeri,
                  screenTimeJamKemarin: sudah.screenTimeJamKemarin,
                  catatanBebas: sudah.catatanBebas ?? "",
                  catatanLatihan: sudah.catatanLatihan ?? "",
                });
                setMengubah(true);
                setUmpan(null);
              }}
            >
              Ubah check-in
            </button>
            <p className="muted kecil" style={{ marginTop: 6 }}>
              Bisa diubah sampai Sesi pertama hari ini dimulai.
            </p>
          </div>
        )}
        <Pesan umpan={umpan} />
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const payload = {
          ...isian,
          catatanBebas: isian.catatanBebas?.trim() || undefined,
          catatanLatihan: isian.catatanLatihan?.trim() || undefined,
        };
        const hasil = mengubah ? svc.ubahCheckIn(actor, payload) : svc.kirimCheckIn(actor, payload);
        if (jalankan(hasil, mengubah ? "Check-in diperbarui." : "Check-in terkirim. Terima kasih!")) setMengubah(false);
      }}
    >
      <div className="card-head">
        <h2>{mengubah ? "Ubah check-in" : "Check-in pagi"}</h2>
        {!mengubah && (
          <button type="button" className="link kecil" onClick={pakaiKemarin}>
            Isi dari jawaban kemarin
          </button>
        )}
      </div>
      {terkunci && <Info jenis="peringatan">Sesi pertama hari ini sudah dimulai, jadi Check-in tidak bisa dikirim lagi.</Info>}

      <div className="butir-grid">
        <div className="butir">
          <div className="judul-butir">
            <b id="label-tidur">Durasi tidur semalam</b>
            <span className="anchor">Naik-turun per 30 menit</span>
          </div>
          <div className="stepper" role="group" aria-labelledby="label-tidur">
            <button
              type="button"
              aria-label="Kurangi 30 menit"
              onClick={() => setItem("durasiTidurJam", Math.max(0, isian.items.durasiTidurJam - 0.5))}
            >
              −
            </button>
            <output aria-live="polite">
              {fmtAngka(isian.items.durasiTidurJam, 1)}
              <small>jam</small>
            </output>
            <button
              type="button"
              aria-label="Tambah 30 menit"
              onClick={() => setItem("durasiTidurJam", Math.min(24, isian.items.durasiTidurJam + 0.5))}
            >
              +
            </button>
          </div>
        </div>
        <div className="butir">
          <div className="judul-butir">
            <b id="label-layar">Screen time kemarin</b>
            <span className="anchor">Total jam di depan layar, termasuk latihan</span>
          </div>
          <div className="stepper" role="group" aria-labelledby="label-layar">
            <button
              type="button"
              aria-label="Kurangi 30 menit"
              onClick={() => setIsian((s) => ({ ...s, screenTimeJamKemarin: Math.max(0, s.screenTimeJamKemarin - 0.5) }))}
            >
              −
            </button>
            <output aria-live="polite">
              {fmtAngka(isian.screenTimeJamKemarin, 1)}
              <small>jam</small>
            </output>
            <button
              type="button"
              aria-label="Tambah 30 menit"
              onClick={() => setIsian((s) => ({ ...s, screenTimeJamKemarin: Math.min(24, s.screenTimeJamKemarin + 0.5) }))}
            >
              +
            </button>
          </div>
        </div>
        {BUTIR.map((b) => (
          <div className="butir" key={b.key}>
            <div className="judul-butir">
              <b>{b.label}</b>
              <span className="anchor">
                1 = {b.rendah}, 5 = {b.tinggi}
              </span>
            </div>
            <Skala label={b.label} nilai={isian.items[b.key] ?? 3} dari={1} sampai={5} ubah={(n) => setItem(b.key, n)} />
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <h3>Peta nyeri</h3>
        <span className="muted kecil">0 = tidak nyeri, 10 = sangat nyeri</span>
        <div className="nyeri">
          {AREA_NYERI.map((a) => (
            <label key={a}>
              <span>{AREA_NYERI_LABEL[a]}</span>
              <input type="range" min={0} max={10} value={isian.petaNyeri[a]} onChange={(e) => setNyeri(a, Number(e.target.value))} />
              <b className="num">{isian.petaNyeri[a]}</b>
            </label>
          ))}
        </div>
      </div>

      <label className="field">
        Catatan latihan (opsional)
        <span className="hint">Apa yang Anda latih kemarin atau rencana hari ini. Dibaca staf pelatih.</span>
        <textarea
          id="catatan-latihan"
          rows={2}
          maxLength={1000}
          placeholder="Mis. drill rotasi 30 menit, lanjut scrim 3 game."
          value={isian.catatanLatihan ?? ""}
          onChange={(e) => setIsian((s) => ({ ...s, catatanLatihan: e.target.value }))}
        />
      </label>

      <label className="field">
        Catatan bebas (opsional)
        <span className="hint">Hanya terlihat oleh Anda dan Tim Support, tidak oleh Staf Pelatih.</span>
        <textarea value={isian.catatanBebas ?? ""} onChange={(e) => setIsian((s) => ({ ...s, catatanBebas: e.target.value }))} />
      </label>

      <div className="stack" style={{ gap: 8 }}>
        <button className="btn utama lebar" type="submit">
          {mengubah ? "Simpan perubahan" : "Kirim check-in"}
        </button>
        {mengubah && (
          <button type="button" className="btn lebar" onClick={() => setMengubah(false)}>
            Batal
          </button>
        )}
        <p className="muted kecil" style={{ textAlign: "center" }}>
          Check-in bisa diubah sampai Sesi pertama hari ini dimulai.
        </p>
      </div>
      <Pesan umpan={umpan} />
    </form>
  );
}

// ───────────────────────── Beban manual (RPE) ─────────────────────────

/**
 * Mode manual Beban: atlet tanpa jam Garmin mencatat RPE tiap sesi. Atlet
 * yang terhubung ke Garmin tidak melihat bagian ini, karena bebannya diambil
 * dari menit intensitas Garmin.
 */
function BebanManual() {
  const { svc, actor } = useApp();
  const k = svc.koneksiGarminSaya(actor);
  if (k.ok && k.data.koneksi?.status === "terhubung") return null;
  return (
    <>
      <div className="judul" style={{ marginTop: 8 }}>
        <div>
          <h2>Beban latihan (mode manual)</h2>
          <p>Anda belum terhubung ke Garmin, jadi beban latihan dihitung dari RPE setiap sesi: seberapa berat sesi itu terasa.</p>
        </div>
      </div>
      <div className="grid-2" style={{ maxWidth: 1100 }}>
      <div className="card">
        <SesiMenungguRpe />
      </div>
      <div className="card">
        <CatatSesiLain />
      </div>
      </div>
    </>
  );
}

function PilihRpe({ nilai, ubah }: { nilai: number | null; ubah(n: number): void }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <Skala label="RPE" nilai={nilai ?? -1} dari={0} sampai={10} ubah={ubah} lebar />
      <span className="muted kecil">
        {nilai === null ? "Seberapa berat sesi ini terasa? 0 = istirahat, 10 = maksimal." : `RPE ${nilai}: ${RPE_LABELS[nilai]}`}
      </span>
    </div>
  );
}

function SesiMenungguRpe() {
  const { svc, actor } = useApp();
  // Umpan balik disimpan di sini, bukan di kartu sesi, karena kartu itu
  // hilang dari daftar begitu RPE-nya tersimpan.
  const aksi = useAksi();
  const r = svc.sesiMenungguRpe(actor);
  return (
    <div className="stack">
      <h2>Sesi menunggu RPE</h2>
      {!r.ok ? (
        <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />
      ) : r.data.length === 0 ? (
        <Kosong>Semua sesi sudah diisi RPE-nya.</Kosong>
      ) : (
        r.data.map((s) => <IsiRpe key={s.id} sesi={s} jalankan={aksi.jalankan} />)
      )}
      <Pesan umpan={aksi.umpan} />
    </div>
  );
}

function IsiRpe({ sesi, jalankan }: { sesi: Sesi; jalankan: ReturnType<typeof useAksi>["jalankan"] }) {
  const { svc, actor } = useApp();
  const [rpe, setRpe] = useState<number | null>(null);
  const [durasi, setDurasi] = useState(sesi.durasiMenit);
  return (
    <div className="catatan">
      <div className="row spread">
        <b>{JENIS_SESI_LABEL[sesi.jenis]}</b>
        <span className="ink-2 kecil">
          {fmtWaktu(sesi.mulaiAt)}
          {sesi.rpeRencana !== undefined && ` · rencana RPE ${sesi.rpeRencana}`}
        </span>
      </div>
      <label className="row kecil">
        Durasi aktual
        <input type="number" min={1} style={{ width: 80 }} value={durasi} onChange={(e) => setDurasi(Number(e.target.value))} />
        menit
      </label>
      <PilihRpe nilai={rpe} ubah={setRpe} />
      <div>
        <button
          className="btn utama kecil"
          disabled={rpe === null}
          onClick={() => rpe !== null && jalankan(
                svc.catatSesi(actor, { sesiId: sesi.id, rpeAktual: rpe, durasiMenit: durasi }),
                `RPE ${JENIS_SESI_LABEL[sesi.jenis].toLowerCase()} ${fmtWaktu(sesi.mulaiAt)} tersimpan.`
              )}
        >
          Simpan RPE
        </button>
      </div>
    </div>
  );
}

function CatatSesiLain() {
  const { svc, actor } = useApp();
  const { umpan, jalankan } = useAksi();
  const [buka, setBuka] = useState(false);
  const [jenis, setJenis] = useState<JenisSesi>("ranked");
  const [mulai, setMulai] = useState(() => keInputWaktu(new Date(Date.now() - 2 * 3600_000).toISOString()));
  const [durasi, setDurasi] = useState(90);
  const [rpe, setRpe] = useState<number | null>(null);

  return (
    <div className="stack">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>Catat sesi lain</h2>
        <button className="link kecil" onClick={() => setBuka((v) => !v)}>
          {buka ? "Tutup" : "Tambah sesi"}
        </button>
      </div>
      {!buka ? (
        <p className="muted kecil">Untuk latihan yang tidak dijadwalkan staf, misalnya ranked malam.</p>
      ) : (
        <>
          <div className="fields">
            <label className="field">
              Jenis
              <select value={jenis} onChange={(e) => setJenis(e.target.value as JenisSesi)}>
                {Object.entries(JENIS_SESI_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Mulai (WIB)
              <input type="datetime-local" value={mulai} onChange={(e) => setMulai(e.target.value)} />
            </label>
            <label className="field">
              Durasi (menit)
              <input type="number" min={1} value={durasi} onChange={(e) => setDurasi(Number(e.target.value))} />
            </label>
          </div>
          <PilihRpe nilai={rpe} ubah={setRpe} />
          <div>
            <button
              className="btn utama"
              disabled={rpe === null}
              onClick={() => {
                if (rpe === null) return;
                const mulaiAt = dariInputWaktu(mulai);
                const selesaiAt = new Date(new Date(mulaiAt).getTime() + durasi * 60_000).toISOString();
                if (jalankan(svc.catatSesi(actor, { jenis, durasiMenit: durasi, mulaiAt, selesaiAt, rpeAktual: rpe }), "Sesi tercatat.")) {
                  setRpe(null);
                  setBuka(false);
                }
              }}
            >
              Simpan sesi
            </button>
          </div>
        </>
      )}
      <Pesan umpan={umpan} />
    </div>
  );
}

// ───────────────────────── Tren ─────────────────────────

function TrenSaya() {
  const { svc, actor, hariIni } = useApp();
  const dari = tambahHari(hariIni, -27);
  const tren = svc.trenAtlet(actor, { athleteId: actor.athleteId!, dari, sampai: hariIni });
  const info = svc.infoTim(actor);
  return (
    <>
      <Judul judul="Tren saya" sub="28 hari terakhir. Readiness dibandingkan dengan baseline pribadi Anda, bukan dengan atlet lain." />
      <div className="card">
        <h2>Readiness dan Wellness Score</h2>
        {tren.ok && info.ok ? (
          <TrenChart
            skor={tren.data}
            dari={dari}
            sampai={hariIni}
            ambangMerah={info.data.scoreConfigBerlaku.ambangMerah}
            ambangKuning={info.data.scoreConfigBerlaku.ambangKuning}
          />
        ) : (
          <Pesan umpan={{ jenis: "gagal", teks: !tren.ok ? tren.reason : !info.ok ? info.reason : "" }} />
        )}
      </div>
      <div className="card">
        <h2>Linimasa 7 hari</h2>
        <Linimasa athleteId={actor.athleteId!} />
      </div>
    </>
  );
}

// ───────────────────────── Catatan ─────────────────────────

function CatatanSaya() {
  const { svc, actor } = useApp();
  const r = svc.cariCatatan(actor, { athleteId: actor.athleteId });
  return (
    <>
      <Judul judul="Catatan untuk saya" sub="Catatan yang dibagikan staf kepada Anda (Visibilitas Bersama Atlet). Anda bisa membalas di thread." />
      <div className="card stack">
        {!r.ok ? (
          <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />
        ) : r.data.length === 0 ? (
          <Kosong>Belum ada catatan yang dibagikan kepada Anda.</Kosong>
        ) : (
          [...r.data].reverse().map((c) => <CatatanItem key={c.id} catatan={c} tampilkanAtlet={false} />)
        )}
      </div>
    </>
  );
}

// ───────────────────────── Akun Garmin ─────────────────────────

/**
 * Menghubungkan akun Garmin milik atlet sendiri. Menghubungkan sekaligus
 * memberi persetujuan Data wearable; otorisasi Garmin Connect disimulasikan.
 */
function KoneksiGarminSaya() {
  const { svc, actor } = useApp();
  const { umpan, jalankan } = useAksi();
  const [otorisasi, setOtorisasi] = useState(false);
  const r = svc.koneksiGarminSaya(actor);
  if (!r.ok) return null;
  const { integrasiAktif, koneksi } = r.data;
  if (koneksi?.status === "terhubung") return umpan ? <Pesan umpan={umpan} /> : null;
  const p = svc.persetujuanSaya(actor);
  const wearableBerlaku = p.ok && !!p.data.persetujuan.find((x) => x.jenis === "wearable")?.berlaku;

  return (
    <div className="hubungkan-garmin">
      <div className="stack" style={{ gap: 4 }}>
        <b>Hubungkan jam Garmin</b>
        <span className="muted kecil">
          {!integrasiAktif
            ? "Tim belum mengaktifkan integrasi Garmin."
            : !wearableBerlaku
              ? "Persetujuan data wearable belum dicatat oleh Super admin. Sementara itu, beban latihan dicatat manual lewat RPE di tab Check-in."
              : koneksi?.status === "diundang"
              ? "Staf mengundang Anda menghubungkan akun Garmin agar langkah, tidur, detak jantung, dan stres terisi otomatis."
              : "Langkah, tidur, detak jantung, stres, dan data lain akan terisi otomatis setiap pagi."}
        </span>
      </div>
      {integrasiAktif && wearableBerlaku && (
        <button className="btn utama" onClick={() => setOtorisasi(true)}>
          Hubungkan akun Garmin
        </button>
      )}
      <Pesan umpan={umpan} />
      {otorisasi && (
        <Jendela judul="Otorisasi Garmin Connect" tutup={() => setOtorisasi(false)}>
          <div className="stack">
            <h2>Izinkan akses Garmin Connect</h2>
            <p className="ink-2">
              Data Garmin (langkah, tidur, kalori, detak jantung, stres, Pulse Ox, Body Battery, komposisi tubuh, respirasi, dan tekanan darah)
              akan masuk otomatis sesuai persetujuan dalam kontrak Anda.
            </p>
            <p className="muted kecil">
              Di aplikasi sungguhan, Anda akan diarahkan ke halaman masuk Garmin Connect. Di prototipe ini langkah itu disimulasikan.
            </p>
            <div className="row">
              <button
                className="btn utama"
                style={{ flex: "1 1 140px" }}
                onClick={() => {
                  setOtorisasi(false);
                  jalankan(svc.hubungkanAkunGarmin(actor, { garminUserId: `garmin-${actor.athleteId}` }), "Akun Garmin terhubung.");
                }}
              >
                Hubungkan (simulasi)
              </button>
              <button className="btn" style={{ flex: "1 1 140px" }} onClick={() => setOtorisasi(false)}>
                Batal
              </button>
            </div>
          </div>
        </Jendela>
      )}
    </div>
  );
}

// ───────────────────────── Lapor! ─────────────────────────

interface BerkasPilihan {
  berkas: File;
  url: string;
}

function ukuranTeks(byte: number): string {
  return byte >= 1_000_000 ? `${fmtAngka(byte / 1_000_000, 1)} MB` : `${fmtAngka(Math.max(1, Math.round(byte / 1000)))} KB`;
}

function Lapor() {
  const { svc, actor } = useApp();
  const { umpan, jalankan, setUmpan } = useAksi();
  const [isi, setIsi] = useState("");
  const [berkas, setBerkas] = useState<BerkasPilihan[]>([]);
  const riwayat = svc.laporanSaya(actor);

  // Galat lama hilang begitu atlet mulai memperbaiki isiannya.
  const bersihkanGalat = () => umpan?.jenis === "gagal" && setUmpan(null);

  function pilihBerkas(daftar: FileList | null) {
    if (!daftar) return;
    bersihkanGalat();
    const baru = [...daftar].map((f) => ({ berkas: f, url: URL.createObjectURL(f) }));
    setBerkas((b) => [...b, ...baru].slice(0, BATAS_LAPORAN.lampiran));
    if (berkas.length + baru.length > BATAS_LAPORAN.lampiran) {
      setUmpan({ jenis: "gagal", teks: `Maksimal ${BATAS_LAPORAN.lampiran} lampiran per laporan.` });
    }
  }

  return (
    <>
      <Judul
        judul="Lapor!"
        sub="Ceritakan apa saja yang perlu diketahui staf: nyeri, cedera, kendala tidur, alat rusak, atau hal lain. Laporan dibaca Staf Pelatih dan Tim Support."
      />
      <form
        className="card stack"
        style={{ maxWidth: 820 }}
        onSubmit={(e) => {
          e.preventDefault();
          const lampiran = berkas.map((b) => ({ nama: b.berkas.name, tipe: b.berkas.type, ukuranByte: b.berkas.size, url: b.url }));
          if (jalankan(svc.kirimLaporan(actor, { isi, lampiran }), "Laporan terkirim ke staf.")) {
            setIsi("");
            setBerkas([]);
          }
        }}
      >
        <label className="field">
          Apa yang ingin Anda laporkan?
          <textarea
            id="lapor-isi"
            rows={5}
            maxLength={BATAS_LAPORAN.karakter}
            placeholder="Mis. pergelangan kanan nyeri sejak scrim kemarin, terutama saat klik cepat."
            value={isi}
            onChange={(e) => {
              setIsi(e.target.value);
              bersihkanGalat();
            }}
          />
          <span className="hint">
            {isi.length}/{BATAS_LAPORAN.karakter} karakter
          </span>
        </label>

        <div className="field">
          <span>Foto atau video (opsional)</span>
          <span className="hint">
            Maksimal {BATAS_LAPORAN.lampiran} berkas. Foto hingga {BATAS_LAPORAN.fotoByte / 1_000_000} MB, video hingga{" "}
            {BATAS_LAPORAN.videoByte / 1_000_000} MB.
          </span>
          <label className="unggah">
            <input
              id="lapor-berkas"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(e) => {
                pilihBerkas(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="unggah-isi">
              <b>Pilih foto atau video</b>
              <span className="muted kecil">atau ambil langsung dari kamera di HP</span>
            </span>
          </label>
          {berkas.length > 0 && (
            <div className="lampiran-grid">
              {berkas.map((b, i) => (
                <figure key={b.url} className="lampiran">
                  {b.berkas.type.startsWith("video/") ? <video src={b.url} muted /> : <img src={b.url} alt={b.berkas.name} />}
                  <figcaption>
                    <span>{b.berkas.name}</span>
                    <span className="muted">{ukuranTeks(b.berkas.size)}</span>
                  </figcaption>
                  <button
                    type="button"
                    className="lampiran-hapus"
                    aria-label={`Hapus ${b.berkas.name}`}
                    onClick={() => setBerkas((daftar) => daftar.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div>
          <button type="submit" className="btn utama lebar">
            Kirim laporan
          </button>
        </div>
        <Pesan umpan={umpan} />
      </form>

      <div className="card stack" style={{ maxWidth: 820 }}>
        <h2>Laporan saya</h2>
        {!riwayat.ok ? (
          <Pesan umpan={{ jenis: "gagal", teks: riwayat.reason }} />
        ) : riwayat.data.length === 0 ? (
          <Kosong>Belum ada laporan.</Kosong>
        ) : (
          riwayat.data.map((l) => <ItemLaporan key={l.id} laporan={l} />)
        )}
      </div>
    </>
  );
}

/** Satu laporan beserta lampirannya; dipakai di halaman atlet dan Kotak Masuk staf. */
export function ItemLaporan({ laporan, tampilkanAtlet, aksi }: { laporan: Laporan; tampilkanAtlet?: boolean; aksi?: ReactNode }) {
  const { nama } = useApp();
  return (
    <article className="catatan">
      <div className="meta">
        {tampilkanAtlet && <b>{nama(laporan.athleteId)}</b>}
        <span>{fmtWaktu(laporan.createdAt)}</span>
        <span className={`status ${laporan.status === "baru" ? "kuning" : "hijau"}`}>
          {laporan.status === "baru" ? (tampilkanAtlet ? "Baru" : "Terkirim") : `Dibaca${laporan.dibacaOleh ? ` oleh ${nama(laporan.dibacaOleh)}` : ""}`}
        </span>
        {aksi && <span style={{ marginLeft: "auto" }}>{aksi}</span>}
      </div>
      {laporan.isi && <div className="body">{laporan.isi}</div>}
      {laporan.lampiran.length > 0 && (
        <div className="lampiran-grid">
          {laporan.lampiran.map((l) => (
            <figure key={l.url} className="lampiran">
              {l.tipe.startsWith("video/") ? <video src={l.url} controls preload="metadata" /> : <img src={l.url} alt={l.nama} />}
              <figcaption>
                <span>{l.nama}</span>
                <span className="muted">{ukuranTeks(l.ukuranByte)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </article>
  );
}
