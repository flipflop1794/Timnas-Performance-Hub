import type { IndeksPerforma, KomponenPerforma, StatusReadiness, ZKomponen } from "../../src/index.js";
import { BASELINE_PERFORMA, BOBOT_PERFORMA, JENDELA_PENGHALUS, LABEL_KOMPONEN_PERFORMA } from "../../src/index.js";
import { fmtAngka, inisial, Kosong, Pesan, StatusBadge, useApp } from "./ui.js";

/**
 * Indeks Performa (eksperimental) dengan tanda lampu lalu lintas. Rumusnya
 * ada di src/modules/performa.ts.
 */

const ARTI_LAMPU: Record<StatusReadiness, string> = {
  merah: "Merah: kondisi jauh di bawah biasanya",
  kuning: "Kuning: kondisi menurun dari biasanya",
  hijau: "Hijau: kondisi sesuai atau lebih baik dari biasanya",
  abu_abu: "Data kurang untuk menghitung indeks",
};

/** Tanda lampu lalu lintas: merah di atas, kuning di tengah, hijau di bawah. */
export function Lampu({ status, ukuran = "besar" }: { status: StatusReadiness; ukuran?: "besar" | "kecil" }) {
  return (
    <div className={`lampu ${ukuran}`} role="img" aria-label={ARTI_LAMPU[status]} title={ARTI_LAMPU[status]}>
      {(["merah", "kuning", "hijau"] as const).map((w) => (
        <span key={w} className={`bola ${w} ${status === w ? "nyala" : ""}`} />
      ))}
    </div>
  );
}

/** Titik status kecil untuk tiap komponen. */
function Titik({ status }: { status: StatusReadiness }) {
  return <span className={`titik ${status}`} aria-hidden />;
}

const LABEL_RINCIAN: Record<string, string> = {
  tidurDurasi: "durasi",
  tidurKualitas: "kualitas",
  tidurInkonsistensi: "konsistensi jam",
  hrvLn: "HRV",
  rhr: "denyut istirahat",
  stres: "stres",
  duduk: "duduk",
};

function fmtZ(z: number | null): string {
  if (z === null) return "–";
  return `${z > 0 ? "+" : ""}${fmtAngka(z, 1)}`;
}

function RincianKomponen({ k }: { k: ZKomponen }) {
  const bagian = Object.entries(k.rincian);
  if (bagian.length <= 1) return null;
  return (
    <span className="muted kecil">
      {bagian.map(([v, z]) => `${LABEL_RINCIAN[v] ?? v} ${fmtZ(z)}`).join(" · ")}
    </span>
  );
}

/** Batang z dari -3 sampai +3 dengan garis tengah = biasanya. */
function BatangZ({ z }: { z: number | null }) {
  const lebar = z === null ? 0 : Math.min(50, (Math.abs(z) / 3) * 50);
  return (
    <span className="batang-z" aria-hidden>
      <i className="tengah" />
      {z !== null && <i className={`isi ${z < 0 ? "minus" : "plus"}`} style={{ width: `${lebar}%`, [z < 0 ? "right" : "left"]: "50%" }} />}
    </span>
  );
}

export function KartuPerforma({ athleteId, judul = "Indeks Performa" }: { athleteId: string; judul?: string }) {
  const { svc, actor, hariIni } = useApp();
  const r = svc.indeksPerforma(actor, { athleteId, tanggal: hariIni });
  if (!r.ok) return null;
  const p = r.data;

  return (
    <div className="card stack performa">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>{judul}</h2>
        <span className="chip">Eksperimental</span>
      </div>
      <div className="performa-atas">
        <Lampu status={p.status} />
        <div className="stack" style={{ gap: 8, flex: "1 1 220px" }}>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span className="performa-skor">{fmtAngka(p.skor, 0)}</span>
            <span className="muted">/ 100</span>
            <StatusBadge status={p.status} />
          </div>
          <p className="ink-2">{p.alasan}</p>
          <TrenTitik tren={p.tren} />
        </div>
      </div>
      <div className="performa-komponen">
        {p.komponen.map((k) => (
          <div key={k.komponen} className="baris-komponen">
            <Titik status={k.status} />
            <span className="stack" style={{ gap: 2, minWidth: 0 }}>
              <b>
                {LABEL_KOMPONEN_PERFORMA[k.komponen]} <span className="muted kecil">· bobot {Math.round(BOBOT_PERFORMA[k.komponen] * 100)}%</span>
              </b>
              <RincianKomponen k={k} />
            </span>
            <BatangZ z={k.z} />
            <span className="num z-teks">{fmtZ(k.z)}</span>
          </div>
        ))}
      </div>
      <p className="muted kecil">
        Dibandingkan dengan baseline atlet sendiri ({BASELINE_PERFORMA.minHari}–{BASELINE_PERFORMA.maksHari} hari). Angka di kanan = z-skor
        (simpangan baku dari biasanya; positif lebih baik). Dihaluskan rata-rata {JENDELA_PENGHALUS} hari. Bobot awal tidur 35%, pemulihan 25%,
        stres 25%, duduk 15%, perlu disesuaikan setelah ada data nyata; ini belum protokol tervalidasi untuk esports.
      </p>
    </div>
  );
}

function TrenTitik({ tren }: { tren: { tanggal: string; skor: number | null; status: StatusReadiness }[] }) {
  return (
    <div className="tren-titik" aria-label="Indeks 7 hari terakhir">
      {tren.map((t) => (
        <span key={t.tanggal} className="tren-hari" title={`${t.tanggal}: ${t.skor === null ? "data kurang" : fmtAngka(t.skor, 0)}`}>
          <Titik status={t.status} />
          <span className="muted kecil">
            {new Date(t.tanggal + "T12:00:00Z").toLocaleDateString("id-ID", { weekday: "short", timeZone: "UTC" })}
          </span>
        </span>
      ))}
    </div>
  );
}

const URUT_KOMPONEN: KomponenPerforma[] = ["tidur", "pemulihan", "stres", "duduk"];

/** Tabel Indeks Performa seluruh atlet untuk dashboard staf. */
export function PerformaTim({ tanggal, buka }: { tanggal: string; buka(athleteId: string): void }) {
  const { svc, actor, kelompok, kelompokAtlet } = useApp();
  const r = svc.performaTim(actor, { tanggal });
  if (!r.ok) return <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />;
  const baris = r.data.filter((b) => !kelompok || kelompokAtlet.get(b.athleteId) === kelompok);
  const hitung = (s: StatusReadiness) => baris.filter((b) => b.status === s).length;
  if (baris.length === 0) return <Kosong>Tidak ada atlet di kelompok ini.</Kosong>;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="ringkas-lampu">
        {(["merah", "kuning", "hijau", "abu_abu"] as const).map((s) => (
          <span key={s} className="row" style={{ gap: 8 }}>
            <Titik status={s} />
            <b>{hitung(s)}</b>
            <span className="muted">{{ merah: "merah", kuning: "kuning", hijau: "hijau", abu_abu: "data kurang" }[s]}</span>
          </span>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Atlet</th>
              <th>Lampu</th>
              <th className="num">Indeks</th>
              {URUT_KOMPONEN.map((k) => (
                <th key={k} className="num" title={`${LABEL_KOMPONEN_PERFORMA[k]}, bobot ${Math.round(BOBOT_PERFORMA[k] * 100)}%`}>
                  {LABEL_KOMPONEN_PERFORMA[k].split(" (")[0]}
                </th>
              ))}
              <th>Keterangan</th>
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
                <td>
                  <Lampu status={b.status} ukuran="kecil" />
                </td>
                <td className="num">
                  <b>{fmtAngka(b.skor, 0)}</b>
                </td>
                {URUT_KOMPONEN.map((k) => {
                  const z = b.komponen.find((x) => x.komponen === k)!;
                  return (
                    <td key={k} className="num">
                      <span className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        {z.z !== null && <Titik status={z.status} />}
                        {fmtZ(z.z)}
                      </span>
                    </td>
                  );
                })}
                <td className="ink-2 kecil">{b.alasan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="catatan-kaki" style={{ padding: 0 }}>
        Indeks eksperimental dari tidur, pemulihan (HRV & denyut istirahat), stres, dan durasi duduk, masing-masing dibandingkan dengan baseline
        atlet sendiri. Angka komponen = z-skor (positif lebih baik dari biasanya). Klik baris untuk membuka profil atlet.
      </p>
    </div>
  );
}

export type { IndeksPerforma };
