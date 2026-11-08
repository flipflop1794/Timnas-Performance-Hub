import type { CheckInItems, JenisSesi, PetaNyeri } from "../domain/types.js";

/**
 * Modul Instrumen — definisi butir Check-in, skala RPE, dan aturan
 * validitas. Fungsi murni dan berversi; tidak menyentuh penyimpanan.
 */
export const INSTRUMEN_VERSION = "v1";

export const SKALA_1_5 = [1, 2, 3, 4, 5] as const;

export const AREA_NYERI: (keyof PetaNyeri)[] = [
  "leher",
  "bahu",
  "punggungAtas",
  "punggungBawah",
  "pergelangan",
  "tangan",
  "jariKiri",
  "jariKanan",
];

export const RPE_LABELS: Record<number, string> = {
  0: "istirahat",
  1: "sangat ringan",
  2: "ringan",
  3: "ringan",
  4: "sedang",
  5: "agak berat",
  6: "berat",
  7: "berat",
  8: "sangat berat",
  9: "sangat berat",
  10: "maksimal",
};

export const JENIS_SESI_VALID: JenisSesi[] = [
  "individu",
  "scrim",
  "pertandingan",
  "ranked",
  "review_vod",
  "fisik",
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function inScale1to5(nilai: number): boolean {
  return Number.isFinite(nilai) && nilai >= 1 && nilai <= 5;
}

export function validasiCheckInItems(items: CheckInItems): ValidationResult {
  const errors: string[] = [];
  if (!(items.durasiTidurJam >= 0 && items.durasiTidurJam <= 24)) {
    errors.push("Durasi tidur harus di antara 0 dan 24 jam.");
  }
  const skalaFields: [string, number][] = [
    ["kualitasTidur", items.kualitasTidur],
    ["kelelahanUmum", items.kelelahanUmum],
    ["kelelahanMata", items.kelelahanMata],
    ["sakitKepala", items.sakitKepala],
    ["stres", items.stres],
    ["mood", items.mood],
    ["motivasiBerlatih", items.motivasiBerlatih],
  ];
  for (const [nama, nilai] of skalaFields) {
    if (!inScale1to5(nilai)) {
      errors.push(`Butir ${nama} harus berskala 1-5.`);
    }
  }
  for (const [nama, nilai] of [["energi", items.energi], ["fokus", items.fokus]] as const) {
    if (nilai !== undefined && !inScale1to5(nilai)) errors.push(`Butir ${nama} harus berskala 1-5.`);
  }
  return { valid: errors.length === 0, errors };
}

export function validasiPetaNyeri(peta: PetaNyeri): ValidationResult {
  const errors: string[] = [];
  for (const area of AREA_NYERI) {
    const nilai = peta[area];
    if (!(Number.isFinite(nilai) && nilai >= 0 && nilai <= 10)) {
      errors.push(`Nyeri area ${area} harus berskala 0-10.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validasiRpe(rpe: number): ValidationResult {
  const ok = Number.isFinite(rpe) && rpe >= 0 && rpe <= 10;
  return { valid: ok, errors: ok ? [] : ["RPE harus berskala 0-10."] };
}

export function validasiJenisSesi(jenis: string): ValidationResult {
  const ok = (JENIS_SESI_VALID as string[]).includes(jenis);
  return {
    valid: ok,
    errors: ok ? [] : [`Jenis sesi tidak dikenal: ${jenis}.`],
  };
}

/** Enam butir 1-5 yang masuk Wellness Score (kualitas tidur tidak termasuk). */
export function enamButirWellness(items: CheckInItems): number[] {
  return [
    items.kelelahanUmum,
    items.kelelahanMata,
    items.sakitKepala,
    items.stres,
    items.mood,
    items.motivasiBerlatih,
  ];
}

/** Indeks tidur = durasi (jam) x kualitas tidur (1-5). */
export function indeksTidur(items: CheckInItems): number {
  return items.durasiTidurJam * items.kualitasTidur;
}
