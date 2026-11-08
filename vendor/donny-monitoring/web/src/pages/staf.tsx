import { useState } from "react";
import type { BarisPapanTim, JenisSesi, KomponenSkor, StatusReadiness } from "../../../src/index.js";
import { DEFAULT_SCORE_CONFIG } from "../../../src/index.js";
import { KATEGORI_CATATAN_VALID } from "../../../src/modules/kolaborasi.js";
import { tambahHari } from "../../../src/domain/tanggal.js";
import { CatatanItem, Linimasa, TulisCatatan } from "../bersama.js";
import { GarminTim, KartuGarmin } from "../garmin.js";
import { KartuPerforma, PerformaTim } from "../performa.js";
import { TrenChart } from "../TrenChart.js";
import { HalamanIntegrasiGarmin } from "./integrasi.js";
import { ItemLaporan } from "./atlet.js";
import { Anggota, HalamanLogAudit } from "./manajer.js";
import { DaftarAtlet } from "./roster.js";
import {
  CincinReadiness,
  dariInputWaktu,
  fmtAngka,
  fmtTanggal,
  fmtWaktu,
  Info,
  inisial,
  JENIS_SESI_LABEL,
  keInputWaktu,
  KOMPONEN_LABEL,
  fmtBeban,
  Kosong,
  NilaiBeban,
  Pesan,
  SkorBar,
  StatusBadge,
  Tabs,
  useAksi,
  useApp,
} from "../ui.js";

export type HalamanStaf =
  | { id: "papan" }
  | { id: "roster" }
  | { id: "atlet"; athleteId: string }
  | { id: "catatan" }
  | { id: "sesi" }
  | { id: "kotak_masuk" }
  | { id: "konfigurasi" }
  | { id: "anggota" }
  | { id: "audit" }
  | { id: "integrasi" };

/** Item dengan `kontrol` hanya tampil untuk staf berstatus Admin. */
export const MENU_STAF: { id: HalamanStaf["id"]; label: string; kontrol?: true }[] = [
  { id: "papan", label: "Papan Tim" },
  { id: "roster", label: "Atlet" },
  { id: "catatan", label: "Catatan" },
  { id: "sesi", label: "Jadwalkan Sesi" },
  { id: "kotak_masuk", label: "Kotak Masuk" },
  { id: "konfigurasi", label: "Konfigurasi Skor" },
  { id: "anggota", label: "Anggota Tim", kontrol: true },
  { id: "audit", label: "Log Audit", kontrol: true },
  { id: "integrasi", label: "Integrasi Garmin", kontrol: true },
];

export function HalamanStaf({ halaman, pindah }: { halaman: HalamanStaf; pindah(h: HalamanStaf): void }) {
  switch (halaman.id) {
    case "papan":
      return <PapanTim buka={(athleteId) => pindah({ id: "atlet", athleteId })} />;
    case "roster":
      return <DaftarAtlet bukaReadiness={(athleteId) => pindah({ id: "atlet", athleteId })} />;
    case "atlet":
      return <DetailAtlet athleteId={halaman.athleteId} kembali={() => pindah({ id: "papan" })} />;
    case "catatan":
      return <SemuaCatatan />;
    case "sesi":
      return <JadwalkanSesi />;
    case "kotak_masuk":
      return <KotakMasuk />;
    case "konfigurasi":
      return <Konfigurasi />;
    case "anggota":
      return <Anggota />;
    case "audit":
      return <HalamanLogAudit />;
    case "integrasi":
      return <HalamanIntegrasiGarmin />;
  }
}

/** Jumlah Tindak Lanjut terbuka dan notifikasi, untuk lencana di menu. */
export function hitungKotakMasuk(ctx: ReturnType<typeof useApp>): number {
  const tl = ctx.svc.tindakLanjutSaya(ctx.actor);
  const lap = ctx.svc.laporanTim(ctx.actor);
  return (tl.ok ? tl.data.length : 0) + (lap.ok ? lap.data.filter((l) => l.status === "baru").length : 0);
}

// ───────────────────────── Papan Tim ─────────────────────────

const URUTAN: StatusReadiness[] = ["merah", "kuning", "abu_abu", "hijau"];

function zTeks(k: KomponenSkor | undefined): string {
  if (!k || !k.tersedia || k.z === null) return "–";
  return (k.z > 0 ? "+" : "") + fmtAngka(k.z, 1);
}

function PapanTim({ buka }: { buka(athleteId: string): void }) {
  const { svc, actor, hariIni, kelompok, kelompokAtlet } = useApp();
  const [tanggal, setTanggal] = useState(hariIni);
  const [pilih, setPilih] = useState<string | null>(null);
  const r = svc.papanTim(actor, { tanggal });
  const wearable = svc.wearableTim(actor, { tanggal });
  const info = svc.infoTim(actor);
  const baris: BarisPapanTim[] = r.ok ? r.data.filter((b) => !kelompok || kelompokAtlet.get(b.athleteId) === kelompok) : [];
  const dengan = (s: StatusReadiness) => baris.filter((b) => b.status === s);
  const sudah = baris.filter((b) => b.sudahCheckIn).length;
  const berskor = baris.filter((b) => b.readiness !== null);
  const rataRata = berskor.length ? berskor.reduce((t, b) => t + b.readiness!, 0) / berskor.length : null;
  const terpilih = baris.find((b) => b.athleteId === pilih) ?? baris[0];
  const perhatian = baris.filter((b) => b.status === "merah" || b.status === "kuning");
  const ambangKuning = info.ok ? info.data.scoreConfigBerlaku.ambangKuning : DEFAULT_SCORE_CONFIG.ambangKuning;

  const namaDaftar = (l: BarisPapanTim[]) =>
    l.length === 0 ? "Tidak ada" : l.length <= 2 ? l.map((b) => b.nama.split(" ")[0]).join(" dan ") : `${l[0]!.nama.split(" ")[0]} dan ${l.length - 1} lainnya`;

  return (
    <>
      <div className="judul">
        <div>
          <h1>Papan Tim</h1>
          <p>
            {fmtTanggal(tanggal)} · {sudah} dari {baris.length} atlet sudah check-in
          </p>
        </div>
        <label className="row">
          <span className="ink-2">Tanggal</span>
          <input type="date" value={tanggal} max={hariIni} onChange={(e) => setTanggal(e.target.value || hariIni)} />
        </label>
      </div>
      {!r.ok && <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />}

      <div className="tiles">
        <div className="tile">
          <div className="label">Sudah check-in</div>
          <div className="nilai">
            {sudah}
            <small>/ {baris.length}</small>
          </div>
          <div className="ket">{baris.length - sudah === 0 ? "Semua atlet sudah mengisi" : `${baris.length - sudah} atlet belum mengisi`}</div>
        </div>
        <div className="tile">
          <div className="label">Status Merah</div>
          <div className="nilai" style={{ color: "var(--merah)" }}>
            {dengan("merah").length}
            <small>atlet</small>
          </div>
          <div className="ket">{namaDaftar(dengan("merah"))}</div>
        </div>
        <div className="tile">
          <div className="label">Status Kuning</div>
          <div className="nilai" style={{ color: "var(--kuning)" }}>
            {dengan("kuning").length}
            <small>atlet</small>
          </div>
          <div className="ket">{namaDaftar(dengan("kuning"))}</div>
        </div>
        <div className="tile">
          <div className="label">Rata-rata readiness</div>
          <div className="nilai">
            {fmtAngka(rataRata, 0)}
            <small>/ 100</small>
          </div>
          <div className="ket">Dari {berskor.length} atlet yang punya skor</div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}>
        {terpilih && (
          <div className="card stack" style={{ gap: 18 }}>
            <div className="row" style={{ gap: 12 }}>
              <span className="avatar besar">{inisial(terpilih.nama)}</span>
              <div>
                <h2>{terpilih.nama}</h2>
                <span className="muted">{terpilih.sudahCheckIn ? "Sudah check-in" : "Belum check-in"}</span>
              </div>
              <span style={{ marginLeft: "auto" }}>
                <StatusBadge status={terpilih.status} />
              </span>
            </div>
            <div className="ringkas">
              <CincinReadiness skor={terpilih.readiness} status={terpilih.status} />
              <div className="trio">
                <div>
                  <span className="k">Wellness</span>
                  <span className="v">{fmtAngka(terpilih.wellnessScore)}</span>
                </div>
                <div>
                  <span className="k">Tidur (z)</span>
                  <span className="v">{zTeks(terpilih.komponen.tidur)}</span>
                </div>
                <div>
                  <span className="k">Beban{fmtBeban(terpilih.komponen.beban).sumber && ` · ${fmtBeban(terpilih.komponen.beban).sumber}`}</span>
                  <span className="v">
                    <NilaiBeban k={terpilih.komponen.beban} />
                  </span>
                </div>
              </div>
            </div>
            <p className="ink-2">{terpilih.statusReason}</p>
            <div>
              <button className="btn utama" onClick={() => buka(terpilih.athleteId)}>
                Buka profil & tulis catatan
              </button>
            </div>
          </div>
        )}
        <div className="card">
          <div className="card-head">
            <h2>Readiness tim 7 hari</h2>
            <span className="muted kecil">Rata-rata atlet yang punya skor</span>
          </div>
          <TrenTim sampai={tanggal} ambang={ambangKuning} />
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 2.2fr) minmax(min(300px, 100%), 1fr)" }}>
        <div className="card flush">
          <div className="card-head">
            <h2>Atlet</h2>
            <span className="muted kecil">Diurutkan dari yang paling butuh perhatian</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Atlet</th>
                  <th>Readiness</th>
                  <th>Status</th>
                  <th className="num">Wellness</th>
                  <th className="num" title="Skor z terhadap baseline pribadi; positif = lebih baik dari biasanya">
                    z Tidur
                  </th>
                  <th className="num" title="Menit intensitas Garmin 3 hari, atau RPE × menit (AU) bila tanpa Garmin">
                    Beban
                  </th>
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => (
                  <tr
                    key={b.athleteId}
                    className="klik"
                    aria-selected={b.athleteId === terpilih?.athleteId}
                    style={b.athleteId === terpilih?.athleteId ? { background: "rgba(255,255,255,0.07)" } : undefined}
                    onClick={() => setPilih(b.athleteId)}
                    onDoubleClick={() => buka(b.athleteId)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && buka(b.athleteId)}
                  >
                    <td>
                      <span className="atlet-sel">
                        <span className="avatar gelap">{inisial(b.nama)}</span>
                        <span>
                          <b>{b.nama}</b>
                          {!b.sudahCheckIn && <span className="muted kecil">Belum check-in</span>}
                        </span>
                      </span>
                    </td>
                    <td>
                      <SkorBar skor={b.readiness} />
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="num">{fmtAngka(b.wellnessScore)}</td>
                    <td className="num">{zTeks(b.komponen.tidur)}</td>
                    <td className="num">
                      <NilaiBeban k={b.komponen.beban} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="catatan-kaki">
            Klik baris untuk melihat ringkasan, klik dua kali atau tekan Enter untuk membuka profil. "Data kurang" berarti check-in atau
            baseline pribadi belum cukup untuk menghitung skor. Tahap 1: komponen Reaksi (Tahap 2) dan Fisiologis (Tahap 3) belum punya
            data, jadi bobotnya dibagi ulang ke Wellness, Tidur, dan Beban.
          </p>
        </div>
        <aside className="card stack" aria-label="Perlu tindak lanjut">
          <h2>Perlu tindak lanjut</h2>
          {perhatian.length === 0 ? (
            <Kosong>Tidak ada atlet berstatus Merah atau Kuning.</Kosong>
          ) : (
            perhatian.map((b) => (
              <div key={b.athleteId} className="catatan">
                <div className="meta">
                  <b>{b.nama}</b>
                  <StatusBadge status={b.status} />
                </div>
                <div className="ink-2">{b.statusReason}</div>
                <div>
                  <button className="link kecil" onClick={() => buka(b.athleteId)}>
                    Buka profil →
                  </button>
                </div>
              </div>
            ))
          )}
        </aside>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Indeks Performa</h2>
          <span className="chip">Eksperimental</span>
        </div>
        <PerformaTim tanggal={tanggal} buka={buka} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Kondisi Atlet</h2>
          <span className="muted kecil">Klik baris untuk membuka profil atlet</span>
        </div>
        <GarminTim
          baris={wearable.ok ? wearable.data.filter((b) => !kelompok || kelompokAtlet.get(b.athleteId) === kelompok) : []}
          buka={buka}
        />
      </div>
    </>
  );
}

/** Rata-rata readiness tim per hari, 7 hari sampai tanggal terpilih. */
function TrenTim({ sampai, ambang }: { sampai: string; ambang: number }) {
  const { svc, actor, kelompok, kelompokAtlet } = useApp();
  const hari = Array.from({ length: 7 }, (_, i) => tambahHari(sampai, i - 6));
  const nilai = hari.map((t) => {
    const r = svc.papanTim(actor, { tanggal: t });
    const ada = r.ok ? r.data.filter((b) => b.readiness !== null && (!kelompok || kelompokAtlet.get(b.athleteId) === kelompok)) : [];
    return ada.length ? ada.reduce((s, b) => s + b.readiness!, 0) / ada.length : null;
  });
  const ada = nilai.filter((v): v is number => v !== null);
  const W = 520;
  const H = 250;
  const kiri = 36;
  const kanan = 16;
  const atas = 28;
  const bawah = 30;
  const min = Math.floor(Math.min(ambang, ...ada) / 10) * 10 - 10;
  const max = Math.ceil(Math.max(ambang, ...ada) / 10) * 10 + 10;
  const lo = Math.max(0, min);
  const hi = Math.min(100, max);
  const x = (i: number) => kiri + (i / 6) * (W - kiri - kanan);
  const y = (v: number) => atas + (1 - (v - lo) / (hi - lo)) * (H - atas - bawah);
  const garis: number[] = [];
  for (let v = lo; v <= hi; v += 10) garis.push(v);
  const titik = nilai.map((v, i) => (v === null ? null : { i, v }));
  let d = "";
  titik.forEach((p, k) => {
    if (!p) return;
    d += `${k > 0 && titik[k - 1] ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`;
  });
  const terakhir = [...titik].reverse().find(Boolean);

  if (ada.length === 0) return <Kosong>Belum ada skor dalam 7 hari ini.</Kosong>;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Rata-rata readiness tim 7 hari, terakhir ${fmtAngka(terakhir?.v ?? null, 1)}`}
      style={{ display: "block" }}
    >
      {garis.map((v) => (
        <g key={v}>
          <line x1={kiri} x2={W - kanan} y1={y(v)} y2={y(v)} stroke="#fff" strokeOpacity={0.1} />
          <text x={kiri - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
            {v}
          </text>
        </g>
      ))}
      <line x1={kiri} x2={W - kanan} y1={y(ambang)} y2={y(ambang)} stroke="var(--siap)" strokeWidth={1.5} strokeDasharray="5 5" />
      <text x={kiri + 6} y={y(ambang) + 16} fontSize={12} fill="var(--siap)">
        Siap {ambang}
      </text>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {titik.map((p) =>
        p ? (
          <g key={p.i}>
            <circle cx={x(p.i)} cy={y(p.v)} r={p === terakhir ? 7 : 4} fill={p === terakhir ? "var(--accent)" : "#fff"} />
            <text x={x(p.i)} y={y(p.v) - 14} textAnchor="middle" fontSize={13} fontWeight={600} fill="#fff">
              {fmtAngka(p.v, 1)}
            </text>
          </g>
        ) : null
      )}
      {hari.map((t, i) => (
        <text key={t} x={x(i)} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">
          {new Date(t + "T12:00:00Z").toLocaleDateString("id-ID", { weekday: "short", timeZone: "UTC" })}
        </text>
      ))}
    </svg>
  );
}

// ───────────────────────── Detail Atlet ─────────────────────────

function DetailAtlet({ athleteId, kembali }: { athleteId: string; kembali(): void }) {
  const { svc, actor, hariIni, nama } = useApp();
  const [tab, setTab] = useState<"linimasa" | "catatan">("linimasa");
  const dari = tambahHari(hariIni, -27);
  const tren = svc.trenAtlet(actor, { athleteId, dari, sampai: hariIni });
  const info = svc.infoTim(actor);
  const skor = svc.skorHarian(actor, { athleteId, tanggal: hariIni });
  const catatan = svc.cariCatatan(actor, { athleteId });
  const garmin = svc.dataWearableAtlet(actor, { athleteId, dari, sampai: hariIni });

  return (
    <>
      <div className="judul">
        <div>
          <button className="link kecil" onClick={kembali}>
            ← Papan Tim
          </button>
          <h1 style={{ marginTop: 4 }}>{nama(athleteId)}</h1>
        </div>
      </div>
      {!tren.ok && <Pesan umpan={{ jenis: "gagal", teks: tren.reason }} />}

      <div className="card ringkas">
        <CincinReadiness skor={skor.ok ? skor.data.readiness : null} status={skor.ok ? skor.data.status : "abu_abu"} />
        <div className="stack" style={{ flex: "1 1 280px" }}>
          <div className="row">
            <h2>Hari ini</h2>
            <StatusBadge status={skor.ok ? skor.data.status : "abu_abu"} />
          </div>
          <p className="ink-2">{skor.ok ? skor.data.statusReason : "Check-in hari ini belum terisi."}</p>
          <div className="trio">
            <div>
              <span className="k">Readiness</span>
              <span className="v">{fmtAngka(skor.ok ? skor.data.readiness : null, 1)}</span>
            </div>
            <div>
              <span className="k">Wellness</span>
              <span className="v">{fmtAngka(skor.ok ? skor.data.wellnessScore : null)}</span>
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
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>Tren 28 hari</h2>
          {tren.ok && info.ok && (
            <TrenChart
              skor={tren.data}
              dari={dari}
              sampai={hariIni}
              ambangMerah={info.data.scoreConfigBerlaku.ambangMerah}
              ambangKuning={info.data.scoreConfigBerlaku.ambangKuning}
            />
          )}
        </div>
        <div className="card">
          <h2>Komponen skor hari ini</h2>
          {skor.ok ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Komponen</th>
                    <th className="num">Nilai</th>
                    <th className="num">z</th>
                    <th className="num">Bobot</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(skor.data.komponen).map(([k, v]) => (
                    <tr key={k}>
                      <td>
                        {KOMPONEN_LABEL[k] ?? k}
                        {k === "beban" && v.sumber && <span className="muted kecil"> · {fmtBeban(v).sumber}</span>}
                        {!v.tersedia && <div className="muted kecil">tidak tersedia</div>}
                      </td>
                      <td className="num">{k === "beban" ? <NilaiBeban k={v} /> : fmtAngka(v.nilai, 1)}</td>
                      <td className="num">{zTeks(v)}</td>
                      <td className="num">{fmtAngka(v.bobot, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Kosong>{skor.reason}</Kosong>
          )}
          <p className="muted kecil" style={{ marginTop: 8 }}>
            Rumus {skor.ok ? skor.data.formulaVersion : "v1"}. Readiness = 50 + 10 × rata-rata berbobot z. Beban = menit intensitas Garmin 3 hari bila tersedia; tanpa Garmin, jumlah RPE × menit 3 hari (AU).
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(min(300px, 100%), 1fr)" }}>
        <KartuPerforma athleteId={athleteId} />
        <SubjektifHariIni athleteId={athleteId} />
      </div>

      <div className="card">
        <h2>Kondisi Atlet</h2>
        {garmin.ok ? (
          <KartuGarmin data={garmin.data.data} tanggal={hariIni} persetujuanBerlaku={garmin.data.persetujuanBerlaku} alasan={garmin.data.alasan} />
        ) : (
          <Pesan umpan={{ jenis: "gagal", teks: garmin.reason }} />
        )}
      </div>

      <div className="card stack">
        <Tabs<"linimasa" | "catatan">
          nilai={tab}
          ubah={setTab}
          pilihan={[
            { id: "linimasa", label: "Linimasa 7 hari" },
            { id: "catatan", label: `Catatan (${catatan.ok ? catatan.data.length : 0})` },
          ]}
        />
        {tab === "linimasa" ? (
          <>
            {actor.peran === "staf_pelatih" && (
              <p className="muted kecil">Catatan bebas Check-in tidak ditampilkan untuk Staf Pelatih; hanya Tim Support yang bisa membacanya.</p>
            )}
            <Linimasa athleteId={athleteId} />
          </>
        ) : (
          <div className="stack">
            <TulisCatatan athleteId={athleteId} />
            {catatan.ok && [...catatan.data].reverse().map((c) => <CatatanItem key={c.id} catatan={c} tampilkanAtlet={false} />)}
          </div>
        )}
      </div>
    </>
  );
}

/** Data subjektif singkat dari check-in hari ini: mood, energi, fokus, dan catatan latihan. */
function SubjektifHariIni({ athleteId }: { athleteId: string }) {
  const { svc, actor, hariIni } = useApp();
  const r = svc.subjektifHarian(actor, { athleteId, tanggal: hariIni });
  const c = r.ok ? r.data : null;
  const butir: [string, number | undefined][] = c
    ? [
        ["Mood", c.mood],
        ["Energi", c.energi],
        ["Fokus", c.fokus],
      ]
    : [];
  return (
    <div className="card stack">
      <h2>Subjektif hari ini</h2>
      {!c ? (
        <Kosong>Belum check-in hari ini.</Kosong>
      ) : (
        <>
          <div className="trio">
            {butir.map(([k, v]) => (
              <div key={k}>
                <span className="k">{k}</span>
                <span className={`v ${v !== undefined && v <= 2 ? "perhatian-teks" : ""}`}>
                  {v ?? "–"}
                  <small> / 5</small>
                </span>
              </div>
            ))}
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="muted kecil">Catatan latihan</span>
            <p className="ink-2">{c.catatanLatihan ? `“${c.catatanLatihan}”` : "Tidak ada catatan latihan hari ini."}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Catatan ─────────────────────────

function SemuaCatatan() {
  const { svc, actor, nama } = useApp();
  const [athleteId, setAthleteId] = useState("");
  const [kategori, setKategori] = useState("");
  const [authorId, setAuthorId] = useState("");
  const anggota = svc.anggotaTim(actor);
  const r = svc.cariCatatan(actor, {
    athleteId: athleteId || undefined,
    kategori: kategori || undefined,
    authorId: authorId || undefined,
  });
  const staf = anggota.ok ? anggota.data.anggota.filter((m) => m.peran === "staf_pelatih" || m.peran === "tim_support") : [];

  return (
    <>
      <div className="judul">
        <div>
          <h1>Catatan</h1>
          <p>Hanya catatan yang boleh Anda baca sesuai Visibilitas yang ditampilkan.</p>
        </div>
      </div>
      <div className="grid-2">
        <div className="card">
          <h2>Tulis catatan</h2>
          <TulisCatatan />
        </div>
        <div className="card stack">
          <div className="row">
            <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
              <option value="">Semua atlet</option>
              {anggota.ok &&
                anggota.data.atlet.map((a) => (
                  <option key={a.id} value={a.id}>
                    {nama(a.id)}
                  </option>
                ))}
            </select>
            <select value={kategori} onChange={(e) => setKategori(e.target.value)}>
              <option value="">Semua kategori</option>
              {KATEGORI_CATATAN_VALID.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select value={authorId} onChange={(e) => setAuthorId(e.target.value)}>
              <option value="">Semua penulis</option>
              {staf.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {nama(m.userId)}
                </option>
              ))}
            </select>
          </div>
          {!r.ok ? (
            <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />
          ) : r.data.length === 0 ? (
            <Kosong>Tidak ada catatan yang cocok.</Kosong>
          ) : (
            [...r.data].reverse().map((c) => <CatatanItem key={c.id} catatan={c} />)
          )}
        </div>
      </div>
    </>
  );
}

// ───────────────────────── Sesi ─────────────────────────

function JadwalkanSesi() {
  const { svc, actor, nama } = useApp();
  const { umpan, jalankan, setUmpan } = useAksi();
  const anggota = svc.anggotaTim(actor);
  const atlet = anggota.ok ? anggota.data.atlet.filter((a) => !a.archived) : [];
  const [pilih, setPilih] = useState<string[]>([]);
  const [jenis, setJenis] = useState<JenisSesi>("scrim");
  const [mulai, setMulai] = useState(() => keInputWaktu(new Date(Math.ceil(Date.now() / 3600_000 + 24) * 3600_000).toISOString()));
  const [durasi, setDurasi] = useState(120);
  const [rpe, setRpe] = useState<string>("6");

  if (actor.peran !== "staf_pelatih") {
    return (
      <>
        <div className="judul">
          <h1>Jadwalkan sesi</h1>
        </div>
        <Info>Hanya Staf Pelatih yang bisa menjadwalkan Sesi.</Info>
      </>
    );
  }

  function simpan() {
    if (pilih.length === 0) {
      setUmpan({ jenis: "gagal", teks: "Pilih minimal satu atlet." });
      return;
    }
    const mulaiAt = dariInputWaktu(mulai);
    for (const athleteId of pilih) {
      const hasil = svc.jadwalkanSesi(actor, {
        athleteId,
        jenis,
        durasiMenit: durasi,
        mulaiAt,
        rpeRencana: rpe === "" ? undefined : Number(rpe),
      });
      if (!jalankan(hasil, `${JENIS_SESI_LABEL[jenis]} ${fmtWaktu(mulaiAt)} dijadwalkan untuk ${pilih.length} atlet.`)) return;
    }
    setPilih([]);
  }

  return (
    <>
      <div className="judul">
        <div>
          <h1>Jadwalkan sesi</h1>
          <p>Atlet akan diminta mengisi RPE setelah sesi dimulai. Check-in atlet terkunci begitu sesi pertama hari itu dimulai.</p>
        </div>
      </div>
      <div className="card stack" style={{ maxWidth: 720 }}>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row spread">
            <b>Atlet</b>
            <button className="link kecil" onClick={() => setPilih(pilih.length === atlet.length ? [] : atlet.map((a) => a.id))}>
              {pilih.length === atlet.length ? "Batalkan semua" : "Pilih semua"}
            </button>
          </div>
          <div className="row">
            {atlet.map((a) => (
              <label key={a.id} className="chip row" style={{ gap: 6, padding: "4px 10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={pilih.includes(a.id)}
                  onChange={(e) => setPilih((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))}
                />
                {nama(a.id)}
              </label>
            ))}
          </div>
        </div>
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
          <label className="field">
            RPE rencana
            <span className="hint">0-10, opsional</span>
            <input type="number" min={0} max={10} value={rpe} onChange={(e) => setRpe(e.target.value)} />
          </label>
        </div>
        <div>
          <button className="btn utama" onClick={simpan}>
            Jadwalkan
          </button>
        </div>
        <Pesan umpan={umpan} />
      </div>
    </>
  );
}

// ───────────────────────── Kotak Masuk ─────────────────────────

function KotakMasuk() {
  const { svc, actor } = useApp();
  const { umpan, jalankan } = useAksi();
  const tl = svc.tindakLanjutSaya(actor);
  const notif = svc.notifikasiSaya(actor);
  const laporan = svc.laporanTim(actor);
  const baru = laporan.ok ? laporan.data.filter((l) => l.status === "baru").length : 0;
  return (
    <>
      <div className="judul">
        <h1>Kotak masuk</h1>
      </div>
      <div className="card stack">
        <div className="card-head" style={{ marginBottom: 0 }}>
          <h2>Laporan atlet</h2>
          <span className="muted kecil">{baru > 0 ? `${baru} laporan baru` : "Semua laporan sudah dibaca"}</span>
        </div>
        <Pesan umpan={umpan} />
        {!laporan.ok ? (
          <Pesan umpan={{ jenis: "gagal", teks: laporan.reason }} />
        ) : laporan.data.length === 0 ? (
          <Kosong>Belum ada laporan dari atlet.</Kosong>
        ) : (
          laporan.data.map((l) => (
            <ItemLaporan
              key={l.id}
              laporan={l}
              tampilkanAtlet
              aksi={
                l.status === "baru" && (
                  <button className="btn kecil" onClick={() => jalankan(svc.tandaiLaporanDibaca(actor, { laporanId: l.id }), "Laporan ditandai dibaca.")}>
                    Tandai dibaca
                  </button>
                )
              }
            />
          ))
        )}
      </div>
      <div className="grid-2">
        <div className="card stack">
          <h2>Tindak Lanjut saya</h2>
          {tl.ok && tl.data.length === 0 && <Kosong>Tidak ada Tindak Lanjut terbuka.</Kosong>}
          {tl.ok && tl.data.map((c) => <CatatanItem key={c.id} catatan={c} />)}
        </div>
        <div className="card stack">
          <h2>Notifikasi</h2>
          {notif.ok && notif.data.length === 0 && <Kosong>Belum ada notifikasi.</Kosong>}
          {notif.ok &&
            [...notif.data].reverse().map((n) => (
              <div key={n.id} className="catatan">
                <div className="meta">
                  <span className="chip">{n.type === "sebutan" ? "Sebutan" : "Tindak Lanjut"}</span>
                  <span>{fmtWaktu(n.at)}</span>
                </div>
                <div>{n.message}</div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

// ───────────────────────── Konfigurasi ─────────────────────────

function Konfigurasi() {
  const { svc, actor } = useApp();
  const { umpan, jalankan } = useAksi();
  const info = svc.infoTim(actor);
  const cfg = info.ok ? info.data.scoreConfigBerlaku : DEFAULT_SCORE_CONFIG;
  const [bobot, setBobot] = useState(cfg.bobot);
  const [ambangMerah, setAmbangMerah] = useState(cfg.ambangMerah);
  const [ambangKuning, setAmbangKuning] = useState(cfg.ambangKuning);
  const bisaUbah = actor.peran === "staf_pelatih";

  return (
    <>
      <div className="judul">
        <div>
          <h1>Konfigurasi skor</h1>
          <p>
            Perubahan hanya berlaku untuk skor yang dihitung setelahnya; skor historis tidak berubah. Setiap perubahan tercatat di Log Audit.
          </p>
        </div>
      </div>
      {!bisaUbah && <Info>Hanya Staf Pelatih yang bisa mengubah konfigurasi. Anda melihat nilai yang berlaku.</Info>}
      <div className="grid-2">
        <div className="card stack">
          <h2>Bobot komponen</h2>
          <p className="muted kecil">0 sampai 0,5 per komponen. Bobot komponen yang tidak tersedia dibagi ulang secara otomatis.</p>
          {(Object.keys(bobot) as (keyof typeof bobot)[]).map((k) => (
            <label key={k} className="row spread">
              <span>
                {KOMPONEN_LABEL[k]}
                {(k === "reaksi" || k === "fisiologis") && <span className="muted kecil"> · {k === "reaksi" ? "Tahap 2" : "Tahap 3"}</span>}
              </span>
              <input
                type="number"
                min={0}
                max={0.5}
                step={0.05}
                disabled={!bisaUbah}
                style={{ width: 90 }}
                value={bobot[k]}
                onChange={(e) => setBobot((b) => ({ ...b, [k]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
        <div className="card stack">
          <h2>Ambang status</h2>
          <p className="muted kecil">
            Boleh bergeser ±10 poin dari bawaan (merah {DEFAULT_SCORE_CONFIG.ambangMerah}, kuning {DEFAULT_SCORE_CONFIG.ambangKuning}).
          </p>
          <label className="row spread">
            <StatusBadge status="merah" />
            <span className="row">
              di bawah
              <input type="number" disabled={!bisaUbah} style={{ width: 90 }} value={ambangMerah} onChange={(e) => setAmbangMerah(Number(e.target.value))} />
            </span>
          </label>
          <label className="row spread">
            <StatusBadge status="kuning" />
            <span className="row">
              di bawah
              <input type="number" disabled={!bisaUbah} style={{ width: 90 }} value={ambangKuning} onChange={(e) => setAmbangKuning(Number(e.target.value))} />
            </span>
          </label>
          {bisaUbah && (
            <div className="row">
              <button
                className="btn utama"
                onClick={() => jalankan(svc.ubahKonfigurasiSkor(actor, { bobot, ambangMerah, ambangKuning }), "Konfigurasi tersimpan.")}
              >
                Simpan konfigurasi
              </button>
              <button
                className="btn"
                onClick={() => {
                  setBobot(DEFAULT_SCORE_CONFIG.bobot);
                  setAmbangMerah(DEFAULT_SCORE_CONFIG.ambangMerah);
                  setAmbangKuning(DEFAULT_SCORE_CONFIG.ambangKuning);
                }}
              >
                Kembalikan bawaan
              </button>
            </div>
          )}
          <Pesan umpan={umpan} />
        </div>
      </div>
    </>
  );
}
