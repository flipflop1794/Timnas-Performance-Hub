import type { BarisWearableTim, DataWearable } from "../../src/index.js";
import { tambahHari } from "../../src/domain/tanggal.js";
import { fmtAngka, Info, inisial, Kosong } from "./ui.js";

/**
 * Tampilan data Garmin (Data wearable): 11 metrik harian dengan ikon garis,
 * nilai hari ini, dan tren 7 hari. Metrik yang tidak dikirim setiap hari
 * (komposisi tubuh, tekanan darah) memakai nilai terakhir beserta tanggalnya.
 */

type Kunci =
  | "langkah"
  | "menitIntensitas"
  | "tidur"
  | "kalori"
  | "detakJantung"
  | "stres"
  | "spo2"
  | "bodyBattery"
  | "komposisiTubuh"
  | "respirasi"
  | "tekananDarah"
  | "hrv"
  | "duduk";

interface Metrik {
  kunci: Kunci;
  label: string;
  ikon: string;
  /** Angka utama untuk tren dan rata-rata tim. */
  angka(d: DataWearable): number | null;
  tampil(d: DataWearable): { nilai: string; satuan?: string; ket?: string; perhatian?: boolean };
}

function jamMenit(menit: number): string {
  return `${Math.floor(menit / 60)} j ${String(menit % 60).padStart(2, "0")} m`;
}

/** Pita stres Garmin: 0-25 istirahat, 26-50 rendah, 51-75 sedang, 76-100 tinggi. */
function pitaStres(v: number): string {
  return v <= 25 ? "Istirahat" : v <= 50 ? "Rendah" : v <= 75 ? "Sedang" : "Tinggi";
}

export const METRIK_GARMIN: Metrik[] = [
  {
    kunci: "langkah",
    label: "Steps",
    ikon: "M8 3c1.8 0 2.8 1.8 2.8 4S9.8 11 8 11 5.2 9.2 5.2 7 6.2 3 8 3zM5.8 13.5h4.4l-.4 2.8a2 2 0 01-3.6 0zM16 6c1.8 0 2.8 1.8 2.8 4s-1 4-2.8 4-2.8-1.8-2.8-4S14.2 6 16 6zM13.8 16.5h4.4l-.4 2.8a2 2 0 01-3.6 0z",
    angka: (d) => d.langkah,
    tampil: (d) => ({ nilai: fmtAngka(d.langkah), satuan: "langkah" }),
  },
  {
    kunci: "menitIntensitas",
    label: "Intensity Minutes",
    ikon: "M15 8.5a6 6 0 100 12 6 6 0 000-12zM15 11.5v3l2 1.5M13 4.5h4M15 4.5v4M19.5 7l1-1M2.5 11.5h5M3.5 14.5h4M4.5 17.5h3",
    angka: (d) => d.menitIntensitas,
    tampil: (d) => ({ nilai: fmtAngka(d.menitIntensitas), satuan: "menit" }),
  },
  {
    kunci: "duduk",
    label: "Sedentary Time",
    ikon: "M9 4a1.8 1.8 0 100 3.6A1.8 1.8 0 009 4zM8 9.5v5h6l1.5 5.5M8 14.5l-2 5.5M5 12h3M17 13v7M12 14.5V20",
    angka: (d) => d.durasiDudukMenit ?? null,
    tampil: (d) =>
      d.durasiDudukMenit != null
        ? { nilai: jamMenit(d.durasiDudukMenit), ket: "Durasi duduk saat terjaga", perhatian: d.durasiDudukMenit > 600 }
        : { nilai: "–" },
  },
  {
    kunci: "tidur",
    label: "Sleep",
    ikon: "M19 15.5A8.5 8.5 0 018.5 5a8.5 8.5 0 1010.5 10.5z",
    angka: (d) => (d.tidur ? d.tidur.durasiMenit / 60 : null),
    tampil: (d) =>
      d.tidur
        ? {
            nilai: jamMenit(d.tidur.durasiMenit),
            ket: [d.tidur.mulai && d.tidur.bangun && `${d.tidur.mulai.replace(":", ".")}–${d.tidur.bangun.replace(":", ".")}`, d.tidur.skor !== null && `Skor ${d.tidur.skor}`]
              .filter(Boolean)
              .join(" · ") || undefined,
            perhatian: d.tidur.durasiMenit < 360,
          }
        : { nilai: "–" },
  },
  {
    kunci: "kalori",
    label: "Calories",
    ikon: "M12 3c.8 3.4 5.5 5.6 5.5 10.3A5.5 5.5 0 016.5 13.6c0-2.5 1.4-4 2.5-5 .2 1.6.9 2.6 2 3.1.3-3.2-.6-5.8 1-8.7z",
    angka: (d) => d.kalori,
    tampil: (d) => ({ nilai: fmtAngka(d.kalori), satuan: "kkal" }),
  },
  {
    kunci: "detakJantung",
    label: "Heart Rate",
    ikon: "M5.2 10A4.5 4.5 0 0112 5.6 4.5 4.5 0 0118.8 10M2.5 12.5h4.5l1.5-2.5 2.5 5 2-4 1 1.5h7.5M6.5 15.5L12 20.5l5.5-5",
    angka: (d) => d.detakJantung?.istirahat ?? null,
    tampil: (d) =>
      d.detakJantung
        ? { nilai: String(d.detakJantung.istirahat), satuan: "bpm istirahat", ket: `Rata-rata ${d.detakJantung.rataRata} · maks ${d.detakJantung.maks}` }
        : { nilai: "–" },
  },
  {
    kunci: "hrv",
    label: "HRV",
    ikon: "M2.5 12h3l1.5-4 2.5 9 2.5-12 2.5 10 1.5-3h5.5",
    angka: (d) => d.hrvRmssd ?? null,
    tampil: (d) => (d.hrvRmssd != null ? { nilai: String(d.hrvRmssd), satuan: "ms RMSSD", ket: "Variabilitas detak jantung malam" } : { nilai: "–" }),
  },
  {
    kunci: "stres",
    label: "Stress",
    ikon: "M3 10a2 2 0 104 0 2 2 0 00-4 0zM8 15a2 2 0 104 0 2 2 0 00-4 0zM13 9a2 2 0 104 0 2 2 0 00-4 0zM6.5 11.5l2 2M11.5 13.5l2-3M17.5 13.3a1.6 1.6 0 012.7-1.6 1.6 1.6 0 012.3 2.2l-2.5 2.6-2.5-2.6z",
    angka: (d) => d.stres,
    tampil: (d) => (d.stres !== null ? { nilai: String(d.stres), satuan: "/ 100", ket: pitaStres(d.stres), perhatian: d.stres > 50 } : { nilai: "–" }),
  },
  {
    kunci: "spo2",
    label: "Pulse Ox",
    ikon: "M12 3a9 9 0 100 18 9 9 0 000-18zM3.2 12.5h3.6l2.7-5 4.5 9 2.7-4h4.1",
    angka: (d) => d.spo2,
    tampil: (d) => (d.spo2 !== null ? { nilai: String(d.spo2), satuan: "%", perhatian: d.spo2 < 95 } : { nilai: "–" }),
  },
  {
    kunci: "bodyBattery",
    label: "Body Battery",
    ikon: "M7 3.5a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6zM5 21l1-6.5-1.5-1V9.5h5v2M8.5 21l-.5-4M15.5 10a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM16.2 11.8l-1.8 2.7h2.2l-1.8 2.7",
    angka: (d) => d.bodyBattery?.tertinggi ?? null,
    tampil: (d) =>
      d.bodyBattery
        ? { nilai: String(d.bodyBattery.tertinggi), satuan: "/ 100", ket: `Terendah ${d.bodyBattery.terendah}`, perhatian: d.bodyBattery.tertinggi < 40 }
        : { nilai: "–" },
  },
  {
    kunci: "komposisiTubuh",
    label: "Body Composition",
    ikon: "M7 3.5a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6zM5 21l1-6.5-1.5-1V9.5h5v2M8.5 21l-.5-4M15.5 10a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM13.8 16.7l3.4-3.4M14 13.2h.1M17 16.8h.1",
    angka: (d) => d.komposisiTubuh?.beratKg ?? null,
    tampil: (d) =>
      d.komposisiTubuh ? { nilai: fmtAngka(d.komposisiTubuh.beratKg, 1), satuan: "kg", ket: `Lemak ${fmtAngka(d.komposisiTubuh.lemakPersen, 1)}%` } : { nilai: "–" },
  },
  {
    kunci: "respirasi",
    label: "Respiration",
    ikon: "M3 9.5h10.5a3 3 0 10-3-3M3 13h15a3 3 0 11-3 3M3 16.5h7",
    angka: (d) => d.respirasi,
    tampil: (d) => (d.respirasi !== null ? { nilai: fmtAngka(d.respirasi, 1), satuan: "napas/mnt" } : { nilai: "–" }),
  },
  {
    kunci: "tekananDarah",
    label: "Blood Pressure",
    ikon: "M11 19.5L4.6 13A4.4 4.4 0 0111 7a4.4 4.4 0 017.6 4.2M16.5 13a3 3 0 100 6 3 3 0 000-6zM16.5 19v2.5M17.6 16.9l.9.9",
    angka: (d) => d.tekananDarah?.sistolik ?? null,
    tampil: (d) =>
      d.tekananDarah
        ? { nilai: `${d.tekananDarah.sistolik}/${d.tekananDarah.diastolik}`, satuan: "mmHg", perhatian: d.tekananDarah.sistolik >= 130 || d.tekananDarah.diastolik >= 85 }
        : { nilai: "–" },
  },
];

export function IkonGarmin({ path, ukuran = 24 }: { path: string; ukuran?: number }) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 24 24" aria-hidden className="ikon-garmin">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Garis({ nilai }: { nilai: (number | null)[] }) {
  const ada = nilai.filter((v): v is number => v !== null);
  if (ada.length < 2) return <span className="garis-kosong" />;
  const min = Math.min(...ada);
  const maks = Math.max(...ada);
  const W = 96;
  const H = 26;
  const x = (i: number) => 3 + (i / (nilai.length - 1)) * (W - 6);
  const y = (v: number) => (maks === min ? H / 2 : 3 + (1 - (v - min) / (maks - min)) * (H - 6));
  let d = "";
  nilai.forEach((v, i) => {
    if (v === null) return;
    d += `${d && nilai[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const akhir = nilai.length - 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="garis">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {nilai[akhir] != null && <circle cx={x(akhir)} cy={y(nilai[akhir]!)} r="3" fill="var(--accent)" />}
    </svg>
  );
}

function tglPendek(t: string): string {
  return new Date(t + "T12:00:00Z").toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * 11 kartu metrik untuk satu atlet. `data` boleh memuat beberapa minggu;
 * yang dipakai adalah nilai pada `tanggal` (atau nilai terakhir sebelumnya)
 * dan tren 7 hari sampai `tanggal`.
 */
export function KartuGarmin(props: { data: DataWearable[]; tanggal: string; persetujuanBerlaku: boolean; alasan?: string }) {
  const { data, tanggal } = props;
  if (!props.persetujuanBerlaku && data.length === 0) {
    return <Info>Belum ada data Garmin. {props.alasan ?? "Atlet belum memberi persetujuan Data wearable."}</Info>;
  }
  const perHari = new Map(data.map((d) => [d.tanggal, d]));
  const hari = Array.from({ length: 7 }, (_, i) => tambahHari(tanggal, i - 6));
  const hariIni = perHari.get(tanggal);

  return (
    <div className="stack">
      <div className="row spread">
        <span className="muted kecil">
          {hariIni
            ? `Update pukul ${new Date(hariIni.diterimaAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}`
            : "Belum ada update hari ini; menampilkan data terakhir yang ada."}
        </span>
        {!props.persetujuanBerlaku && <span className="status kuning">Persetujuan dicabut</span>}
      </div>
      <div className="garmin-grid">
        {METRIK_GARMIN.map((m) => {
          // Nilai pada tanggal itu, atau nilai terakhir sebelumnya (mis. timbangan mingguan).
          const terakhir = [...data].reverse().find((d) => d.tanggal <= tanggal && m.angka(d) !== null);
          const t = terakhir ? m.tampil(terakhir) : { nilai: "–" };
          return (
            <div key={m.kunci} className="garmin-kartu">
              <div className="garmin-kepala">
                <IkonGarmin path={m.ikon} />
                <span>{m.label}</span>
              </div>
              <div className={`garmin-nilai ${t.perhatian ? "perhatian" : ""}`}>
                {t.nilai}
                {t.satuan && <small> {t.satuan}</small>}
              </div>
              <div className="garmin-kaki">
                <span className="muted kecil">
                  {t.ket}
                  {terakhir && terakhir.tanggal !== tanggal && `${t.ket ? " · " : ""}per ${tglPendek(terakhir.tanggal)}`}
                </span>
                <Garis nilai={hari.map((h) => (perHari.get(h) ? m.angka(perHari.get(h)!) : null))} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Rata-rata tim dan tabel per atlet untuk dashboard. */
export function GarminTim({ baris, buka }: { baris: BarisWearableTim[]; buka(athleteId: string): void }) {
  const ada = baris.filter((b) => b.data).map((b) => b.data!);
  const belumSetuju = baris.filter((b) => !b.persetujuanBerlaku);
  const belumSinkron = baris.filter((b) => b.persetujuanBerlaku && !b.data);
  const rata = (m: Metrik) => {
    const v = ada.map((d) => m.angka(d)).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const fmtRata = (m: Metrik, v: number | null): string => {
    if (v === null) return "–";
    if (m.kunci === "tidur") return jamMenit(Math.round(v * 60));
    if (m.kunci === "duduk") return jamMenit(Math.round(v));
    if (m.kunci === "respirasi" || m.kunci === "komposisiTubuh") return fmtAngka(v, 1);
    return fmtAngka(v, 0);
  };
  const SATUAN_RATA: Partial<Record<Kunci, string>> = {
    langkah: "langkah",
    menitIntensitas: "menit",
    kalori: "kkal",
    detakJantung: "bpm istirahat",
    stres: "/ 100",
    spo2: "%",
    bodyBattery: "/ 100",
    komposisiTubuh: "kg",
    respirasi: "napas/mnt",
    tekananDarah: "mmHg sistolik",
    hrv: "ms",
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <p className="muted kecil">
        {ada.length} dari {baris.length} atlet sudah sinkron hari ini
        {belumSinkron.length > 0 && ` · belum sinkron: ${belumSinkron.map((b) => b.nama.split(" ")[0]).join(", ")}`}
        {belumSetuju.length > 0 && ` · tanpa persetujuan Data wearable: ${belumSetuju.map((b) => b.nama.split(" ")[0]).join(", ")}`}
      </p>
      <div className="garmin-grid ringkas-tim">
        {METRIK_GARMIN.map((m) => (
          <div key={m.kunci} className="garmin-kartu">
            <div className="garmin-kepala">
              <IkonGarmin path={m.ikon} />
              <span>{m.label}</span>
            </div>
            <div className="garmin-nilai">
              {fmtRata(m, rata(m))}
              {SATUAN_RATA[m.kunci] && <small> {SATUAN_RATA[m.kunci]}</small>}
            </div>
            <span className="muted kecil">Rata-rata tim</span>
          </div>
        ))}
      </div>
      {baris.length === 0 ? (
        <Kosong>Tidak ada atlet di kelompok ini.</Kosong>
      ) : (
        <div className="table-wrap">
          <table className="tabel-garmin">
            <thead>
              <tr>
                <th>Atlet</th>
                {METRIK_GARMIN.map((m) => (
                  <th key={m.kunci} className="num" title={m.label}>
                    <span className="th-garmin">
                      <IkonGarmin path={m.ikon} ukuran={18} />
                      <span>{m.label}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={b.athleteId} className="klik" tabIndex={0} onClick={() => buka(b.athleteId)} onKeyDown={(e) => e.key === "Enter" && buka(b.athleteId)}>
                  <td>
                    <span className="atlet-sel">
                      <span className="avatar gelap">{inisial(b.nama)}</span>
                      <b>{b.nama}</b>
                    </span>
                  </td>
                  {!b.data ? (
                    <td colSpan={METRIK_GARMIN.length} className="muted">
                      {b.persetujuanBerlaku ? "Belum sinkron hari ini" : "Belum memberi persetujuan Data wearable"}
                    </td>
                  ) : (
                    METRIK_GARMIN.map((m) => {
                      const t = m.tampil(b.data!);
                      return (
                        <td key={m.kunci} className={`num ${t.perhatian ? "perhatian" : ""}`}>
                          {t.nilai}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
