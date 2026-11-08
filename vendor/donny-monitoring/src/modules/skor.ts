import type {
  CheckInItems,
  KomponenSkor,
  ScoreConfig,
  StatusReadiness,
} from "../domain/types.js";
import { enamButirWellness, indeksTidur } from "./instrumen.js";

/**
 * Modul Skor — Baseline Individu, Wellness Score, Readiness Score, Status
 * Readiness. Fungsi murni dan berversi (lihat SKOR_FORMULA_VERSION). Tidak
 * menyentuh penyimpanan; menerima histori sebagai argumen.
 *
 * Tahap 1 hanya mengaktifkan komponen Wellness, Tidur, dan Beban karena Tes
 * Reaksi (komponen Reaksi) dan adapter wearable (komponen Fisiologis) belum
 * dibangun (lihat PRD, rilis Tahap 2 dan 3). Struktur rumus v1 tetap
 * mengikuti PRD secara utuh, sehingga menambah Reaksi/Fisiologis di tahap
 * berikutnya tidak mengubah fungsi-fungsi di sini.
 */
export const SKOR_FORMULA_VERSION = "v1.1";

/**
 * Riwayat versi rumus:
 * - v1: Beban = jumlah RPE x menit Sesi 3 hari.
 * - v1.1: Beban dua mode. Bila ada data Garmin dan baseline-nya siap, Beban =
 *   total menit intensitas Garmin 3 hari; selain itu kembali ke RPE x menit.
 *   Tiap mode dibandingkan dengan baseline-nya sendiri karena satuannya beda.
 */
export const MIN_STD_BEBAN_GARMIN = 10;

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  bobot: {
    wellness: 0.35,
    tidur: 0.15,
    reaksi: 0.2,
    fisiologis: 0.2,
    beban: 0.1,
  },
  ambangMerah: 35,
  ambangKuning: 45,
  minStdDev: {
    wellness: 5,
    tidur: 1,
    reaksi: 10,
    fisiologis: 0.3,
    beban: 50,
  },
};

export const MIN_HARI_VALID_BASELINE = 7;
export const JUMLAH_HARI_BASELINE = 28;

export function hitungWellnessScore(items: CheckInItems): number {
  const butir = enamButirWellness(items);
  const avg = butir.reduce((a, b) => a + b, 0) / butir.length;
  return ((avg - 1) / 4) * 100;
}

export function hitungIndeksTidur(items: CheckInItems): number {
  return indeksTidur(items);
}

export interface BaselineStat {
  mean: number;
  std: number;
  n: number;
  ready: boolean;
}

/**
 * Baseline Individu dari nilai valid dalam 28 hari terakhir. Minimal 7 nilai
 * agar `ready`.
 */
export function hitungBaseline(
  nilaiValid: number[],
  minValidDays: number = MIN_HARI_VALID_BASELINE
): BaselineStat {
  const n = nilaiValid.length;
  if (n === 0) {
    return { mean: NaN, std: 0, n: 0, ready: false };
  }
  const mean = nilaiValid.reduce((a, b) => a + b, 0) / n;
  const variance =
    nilaiValid.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return { mean, std, n, ready: n >= minValidDays };
}

export function hitungZ(
  nilai: number,
  baseline: BaselineStat,
  minStd: number,
  lebihTinggiLebihBaik: boolean
): number {
  const std = Math.max(baseline.std, minStd);
  let z = (nilai - baseline.mean) / std;
  z = Math.max(-3, Math.min(3, z));
  return lebihTinggiLebihBaik ? z : -z;
}

export type KomponenKey = "wellness" | "tidur" | "reaksi" | "fisiologis" | "beban";

export interface ComponentInput {
  key: KomponenKey;
  nilaiHariIni: number | null; // null bila tidak ada data hari ini
  baseline: BaselineStat;
  lebihTinggiLebihBaik: boolean;
  /** Mengganti batas bawah simpangan baku dari konfigurasi, mis. untuk satuan Beban Garmin. */
  minStd?: number;
  sumber?: KomponenSkor["sumber"];
}

export interface ReadinessResult {
  readiness: number | null;
  komponen: Record<string, KomponenSkor>;
  jumlahTersedia: number;
}

export function hitungReadiness(
  inputs: ComponentInput[],
  config: ScoreConfig
): ReadinessResult {
  const komponen: Record<string, KomponenSkor> = {};
  let weightedSum = 0;
  let weightTotal = 0;
  let jumlahTersedia = 0;

  for (const input of inputs) {
    const bobot = config.bobot[input.key];
    const ada = input.nilaiHariIni !== null && input.baseline.ready;
    if (!ada) {
      komponen[input.key] = {
        nilai: input.nilaiHariIni,
        z: null,
        bobot,
        tersedia: false,
        ...(input.sumber && { sumber: input.sumber }),
      };
      continue;
    }
    const minStd = input.minStd ?? config.minStdDev[input.key] ?? 0;
    const z = hitungZ(
      input.nilaiHariIni as number,
      input.baseline,
      minStd,
      input.lebihTinggiLebihBaik
    );
    komponen[input.key] = {
      nilai: input.nilaiHariIni,
      z,
      bobot,
      tersedia: true,
      ...(input.sumber && { sumber: input.sumber }),
    };
    weightedSum += bobot * z;
    weightTotal += bobot;
    jumlahTersedia += 1;
  }

  if (weightTotal === 0) {
    return { readiness: null, komponen, jumlahTersedia };
  }

  const raw = 50 + 10 * (weightedSum / weightTotal);
  const readiness = Math.max(0, Math.min(100, raw));
  return { readiness, komponen, jumlahTersedia };
}

export function tentukanStatus(params: {
  readiness: number | null;
  jumlahTersedia: number;
  wellnessTersediaHariIni: boolean;
  baselineUtamaSiap: boolean;
  config: ScoreConfig;
}): { status: StatusReadiness; reason: string } {
  if (!params.baselineUtamaSiap) {
    return {
      status: "abu_abu",
      reason: "Baseline individu belum siap (kurang dari 7 hari data valid).",
    };
  }
  if (!params.wellnessTersediaHariIni) {
    return { status: "abu_abu", reason: "Check-in hari ini belum terisi." };
  }
  if (params.jumlahTersedia < 3) {
    return {
      status: "abu_abu",
      reason: "Kurang dari 3 komponen tersedia hari ini.",
    };
  }
  const r = params.readiness as number;
  if (r < params.config.ambangMerah) {
    return {
      status: "merah",
      reason: `Readiness ${r.toFixed(1)} di bawah ambang merah (${params.config.ambangMerah}).`,
    };
  }
  if (r < params.config.ambangKuning) {
    return {
      status: "kuning",
      reason: `Readiness ${r.toFixed(1)} di bawah ambang kuning (${params.config.ambangKuning}).`,
    };
  }
  return { status: "hijau", reason: `Readiness ${r.toFixed(1)} di atas ambang.` };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Bobot 0-0,5 per komponen; ambang ±10 poin dari bawaan (PRD). */
export function validasiKonfigurasiSkor(
  config: ScoreConfig,
  bawaan: ScoreConfig = DEFAULT_SCORE_CONFIG
): ValidationResult {
  const errors: string[] = [];
  for (const [key, bobot] of Object.entries(config.bobot)) {
    if (bobot < 0 || bobot > 0.5) {
      errors.push(`Bobot ${key} harus di antara 0 dan 0,5.`);
    }
  }
  if (Math.abs(config.ambangMerah - bawaan.ambangMerah) > 10) {
    errors.push("Ambang merah hanya boleh berubah ±10 poin dari bawaan.");
  }
  if (Math.abs(config.ambangKuning - bawaan.ambangKuning) > 10) {
    errors.push("Ambang kuning hanya boleh berubah ±10 poin dari bawaan.");
  }
  if (config.ambangKuning <= config.ambangMerah) {
    errors.push("Ambang kuning harus lebih tinggi dari ambang merah.");
  }
  return { valid: errors.length === 0, errors };
}
