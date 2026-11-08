import type { StatusReadiness } from "../domain/types.js";

/**
 * Modul Indeks Performa (eksperimental). Fungsi murni; tidak menyentuh
 * penyimpanan.
 *
 * Ini pendekatan praktis, bukan protokol tervalidasi untuk esports. Langkahnya:
 * 1. Bandingkan atlet dengan dirinya sendiri: baseline 14-28 hari per variabel.
 * 2. Ubah nilai harian jadi z-skor terhadap baseline itu (HRV memakai ln RMSSD).
 * 3. Balik tanda variabel yang makin tinggi makin buruk: denyut jantung
 *    istirahat, stres, durasi duduk, dan ketidakkonsistenan jam tidur.
 * 4. Gabungkan empat komponen dengan bobot awal: tidur 35%, pemulihan (HRV +
 *    denyut istirahat) 25%, stres 25%, durasi duduk 15%. Bobot ini tebakan awal
 *    dan perlu disesuaikan setelah ada data nyata.
 * 5. Haluskan dengan rata-rata bergerak 3 hari, ubah ke skala 0-100
 *    (50 + 10 x z), lalu beri pita hijau/kuning/merah.
 */

export const PERFORMA_VERSI = "p1";

export const BOBOT_PERFORMA = { tidur: 0.35, pemulihan: 0.25, stres: 0.25, duduk: 0.15 } as const;
export type KomponenPerforma = keyof typeof BOBOT_PERFORMA;

export const BASELINE_PERFORMA = { minHari: 14, maksHari: 28 } as const;
export const JENDELA_PENGHALUS = 3;

/** Batas bawah simpangan baku per variabel, agar baseline yang sangat stabil tidak membesar-besarkan z. */
const MIN_STD = {
  tidurDurasi: 15, // menit
  tidurKualitas: 3, // skor 0-100
  tidurInkonsistensi: 10, // menit
  hrvLn: 0.05,
  rhr: 1.5, // bpm
  stres: 3,
  duduk: 15, // menit
} as const;
type Variabel = keyof typeof MIN_STD;

/** Satu hari data mentah per atlet. Null bila tidak tercatat. */
export interface HariPerforma {
  tanggal: string;
  tidurDurasi: number | null; // menit
  tidurKualitas: number | null; // 0-100
  /** Jam mulai tidur dalam menit sejak 18.00, agar tidur lewat tengah malam tetap berurutan. */
  tidurMulai: number | null;
  hrvRmssd: number | null; // ms
  rhr: number | null; // bpm
  stres: number | null; // 0-100
  duduk: number | null; // menit
}

export interface ZKomponen {
  komponen: KomponenPerforma;
  z: number | null;
  status: StatusReadiness;
  /** z per variabel penyusun, setelah tanda dibalik (positif = lebih baik dari biasanya). */
  rincian: Partial<Record<Variabel, number>>;
}

export interface HasilHarian {
  tanggal: string;
  /** Rata-rata berbobot z komponen; null bila kurang dari 2 komponen tersedia. */
  zGabungan: number | null;
  komponen: ZKomponen[];
}

export interface IndeksPerforma {
  tanggal: string;
  skor: number | null;
  status: StatusReadiness;
  alasan: string;
  komponen: ZKomponen[];
  versi: string;
}

/** "23:40" -> menit sejak 18.00 (23:40 = 340, 01:10 = 430). */
export function jamKeMenitMalam(jam: string): number {
  const [h, m] = jam.split(":").map(Number) as [number, number];
  return (h * 60 + m - 18 * 60 + 1440) % 1440;
}

function rataSd(nilai: number[]): { mean: number; std: number } {
  const mean = nilai.reduce((a, b) => a + b, 0) / nilai.length;
  const std = Math.sqrt(nilai.reduce((a, b) => a + (b - mean) ** 2, 0) / nilai.length);
  return { mean, std };
}

/** Pita status dari z: sama dengan ambang skor (50 + 10z) merah < 35, kuning < 45. */
export function statusDariSkor(skor: number | null, ambang: { merah: number; kuning: number }): StatusReadiness {
  if (skor === null) return "abu_abu";
  if (skor < ambang.merah) return "merah";
  if (skor < ambang.kuning) return "kuning";
  return "hijau";
}

const LABEL: Record<KomponenPerforma, string> = {
  tidur: "Tidur",
  pemulihan: "Pemulihan (HRV & denyut istirahat)",
  stres: "Stres",
  duduk: "Durasi duduk",
};

/**
 * Menghitung z gabungan satu hari. `riwayat` berisi hari-hari sebelum dan
 * termasuk `tanggal`, urut naik; hari lain di luar jendela baseline diabaikan.
 */
export function hitungHarian(
  riwayat: HariPerforma[],
  tanggal: string,
  ambang: { merah: number; kuning: number }
): HasilHarian {
  const urut = [...riwayat].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const iHari = urut.findIndex((h) => h.tanggal === tanggal);
  const hari = iHari >= 0 ? urut[iHari]! : undefined;
  const sebelum = (iHari >= 0 ? urut.slice(0, iHari) : urut.filter((h) => h.tanggal < tanggal)).slice(-BASELINE_PERFORMA.maksHari);

  // Ketidakkonsistenan jam tidur = selisih jam tidur hari itu dari rata-rata 7 hari sebelumnya.
  const inkonsistensi = (idx: number, daftar: HariPerforma[]): number | null => {
    const h = daftar[idx];
    if (!h || h.tidurMulai === null) return null;
    const lalu = daftar.slice(Math.max(0, idx - 7), idx).map((x) => x.tidurMulai).filter((x): x is number => x !== null);
    if (lalu.length < 3) return null;
    return Math.abs(h.tidurMulai - rataSd(lalu).mean);
  };

  const ambil: Record<Variabel, (h: HariPerforma, idx: number) => number | null> = {
    tidurDurasi: (h) => h.tidurDurasi,
    tidurKualitas: (h) => h.tidurKualitas,
    tidurInkonsistensi: (_h, idx) => inkonsistensi(idx, urut),
    hrvLn: (h) => (h.hrvRmssd && h.hrvRmssd > 0 ? Math.log(h.hrvRmssd) : null),
    rhr: (h) => h.rhr,
    stres: (h) => h.stres,
    duduk: (h) => h.duduk,
  };
  /** Variabel yang makin tinggi makin buruk (tandanya dibalik). */
  const dibalik: Record<Variabel, boolean> = {
    tidurDurasi: false,
    tidurKualitas: false,
    tidurInkonsistensi: true,
    hrvLn: false,
    rhr: true,
    stres: true,
    duduk: true,
  };

  const z = (v: Variabel): number | null => {
    if (!hari) return null;
    const x = ambil[v](hari, iHari);
    if (x === null) return null;
    const offset = iHari - sebelum.length;
    const base = sebelum.map((h, i) => ambil[v](h, offset + i)).filter((n): n is number => n !== null);
    if (base.length < BASELINE_PERFORMA.minHari) return null;
    const { mean, std } = rataSd(base);
    const nilai = (x - mean) / Math.max(std, MIN_STD[v]);
    return dibalik[v] ? -nilai : nilai;
  };

  const gabung = (vars: Variabel[]): { z: number | null; rincian: Partial<Record<Variabel, number>> } => {
    const rincian: Partial<Record<Variabel, number>> = {};
    for (const v of vars) {
      const n = z(v);
      if (n !== null) rincian[v] = n;
    }
    const ada = Object.values(rincian);
    return { z: ada.length ? ada.reduce((a, b) => a + b, 0) / ada.length : null, rincian };
  };

  const susun: Record<KomponenPerforma, Variabel[]> = {
    tidur: ["tidurDurasi", "tidurKualitas", "tidurInkonsistensi"],
    pemulihan: ["hrvLn", "rhr"],
    stres: ["stres"],
    duduk: ["duduk"],
  };

  const komponen: ZKomponen[] = (Object.keys(susun) as KomponenPerforma[]).map((k) => {
    const g = gabung(susun[k]);
    return { komponen: k, z: g.z, rincian: g.rincian, status: statusDariSkor(g.z === null ? null : 50 + 10 * g.z, ambang) };
  });

  const ada = komponen.filter((k) => k.z !== null);
  if (ada.length < 2) return { tanggal, zGabungan: null, komponen };
  const totalBobot = ada.reduce((s, k) => s + BOBOT_PERFORMA[k.komponen], 0);
  const zGabungan = ada.reduce((s, k) => s + BOBOT_PERFORMA[k.komponen] * k.z!, 0) / totalBobot;
  return { tanggal, zGabungan, komponen };
}

/**
 * Indeks Performa satu tanggal: rata-rata bergerak z gabungan selama
 * JENDELA_PENGHALUS hari (yang tersedia), diubah ke 0-100 dan diberi pita.
 */
export function hitungIndeksPerforma(
  riwayat: HariPerforma[],
  tanggalJendela: string[],
  ambang: { merah: number; kuning: number }
): IndeksPerforma {
  const tanggal = tanggalJendela[tanggalJendela.length - 1]!;
  const harian = tanggalJendela.map((t) => hitungHarian(riwayat, t, ambang));
  const hariIni = harian[harian.length - 1]!;

  if (hariIni.zGabungan === null) {
    const adaData = riwayat.some((h) => h.tanggal === tanggal && (h.tidurDurasi !== null || h.hrvRmssd !== null || h.stres !== null));
    const adaDataJam = riwayat.some((h) => h.hrvRmssd !== null || h.rhr !== null || h.stres !== null || h.duduk !== null);
    return {
      tanggal,
      skor: null,
      status: "abu_abu",
      alasan: !adaData
        ? "Belum ada data jam (tidur, HRV, stres, duduk) untuk tanggal ini."
        : !adaDataJam
          ? "Hanya ada data tidur dari check-in. Hubungkan jam Garmin agar HRV, stres, dan durasi duduk ikut dihitung."
          : `Baseline belum cukup: butuh minimal ${BASELINE_PERFORMA.minHari} hari data untuk 2 komponen atau lebih.`,
      komponen: hariIni.komponen,
      versi: PERFORMA_VERSI,
    };
  }

  const nilai = harian.map((h) => h.zGabungan).filter((z): z is number => z !== null);
  const zHalus = nilai.reduce((a, b) => a + b, 0) / nilai.length;
  const skor = Math.max(0, Math.min(100, 50 + 10 * zHalus));
  const status = statusDariSkor(skor, ambang);

  // Alasan: komponen dengan z terendah hari ini, bila di bawah biasanya.
  const terlemah = [...hariIni.komponen].filter((k) => k.z !== null).sort((a, b) => a.z! - b.z!)[0];
  const alasan =
    status === "hijau"
      ? `Indeks ${skor.toFixed(1)}: kondisi sesuai atau lebih baik dari biasanya.`
      : `Indeks ${skor.toFixed(1)}${terlemah && terlemah.z! < 0 ? `; paling turun: ${LABEL[terlemah.komponen]}` : ""}.`;

  return { tanggal, skor, status, alasan, komponen: hariIni.komponen, versi: PERFORMA_VERSI };
}

export const LABEL_KOMPONEN_PERFORMA = LABEL;
