import type { Actor, Athlete, Catatan, ConsentRecord, JenisPersetujuan, Visibilitas } from "../domain/types.js";

/**
 * Modul Akses & Persetujuan — peran, Visibilitas, Persetujuan per jenis
 * data, wali untuk atlet di bawah 18 tahun. Dipanggil di setiap perintah
 * oleh Layanan Monitoring; modul ini sendiri tidak menyimpan apa pun,
 * hanya memutuskan izin dari data yang diberikan.
 */

export const USIA_DEWASA = 18;

export function usiaPadaTanggal(tanggalLahir: string, tanggal: string): number {
  const lahir = new Date(tanggalLahir + "T00:00:00Z");
  const acuan = new Date(tanggal + "T00:00:00Z");
  let usia = acuan.getUTCFullYear() - lahir.getUTCFullYear();
  const belumUlangTahun =
    acuan.getUTCMonth() < lahir.getUTCMonth() ||
    (acuan.getUTCMonth() === lahir.getUTCMonth() &&
      acuan.getUTCDate() < lahir.getUTCDate());
  if (belumUlangTahun) usia -= 1;
  return usia;
}

export function masihDiBawahUmur(athlete: Athlete, tanggal: string): boolean {
  // Tanggal lahir kosong diperlakukan sebagai belum pasti dewasa (lihat cekPersetujuanBerlaku).
  if (!athlete.tanggalLahir) return true;
  return usiaPadaTanggal(athlete.tanggalLahir, tanggal) < USIA_DEWASA;
}

export interface KeputusanAkses {
  diizinkan: boolean;
  alasan?: string;
}

/**
 * Atlet di bawah 18 tahun butuh persetujuan wali sebelum persetujuannya
 * sendiri untuk jenis data apa pun berlaku (UU PDP Pasal 25). Saat atlet
 * mencapai usia 18 tahun, persetujuan lama (atas nama wali) tidak lagi
 * cukup — sistem meminta persetujuan ulang dari atlet sendiri.
 */
export function cekPersetujuanBerlaku(params: {
  athlete: Athlete;
  tanggal: string;
  consent: ConsentRecord | undefined;
  guardianApprovalAt: string | undefined;
}): KeputusanAkses {
  const { athlete, tanggal, consent, guardianApprovalAt } = params;

  if (!consent || !consent.granted) {
    return { diizinkan: false, alasan: "Belum ada persetujuan untuk jenis data ini." };
  }
  if (!athlete.tanggalLahir) {
    return {
      diizinkan: false,
      alasan: "Tanggal lahir atlet belum diisi, jadi status usia (dan kebutuhan persetujuan wali) belum bisa dipastikan.",
    };
  }

  const diBawahUmurSaatPersetujuan = masihDiBawahUmur(athlete, consent.at.slice(0, 10));
  if (diBawahUmurSaatPersetujuan) {
    if (!guardianApprovalAt) {
      return {
        diizinkan: false,
        alasan: "Atlet di bawah 18 tahun butuh persetujuan wali sebelum data diproses.",
      };
    }
    const sudahDewasaSekarang = !masihDiBawahUmur(athlete, tanggal);
    if (sudahDewasaSekarang) {
      return {
        diizinkan: false,
        alasan:
          "Atlet kini berusia 18 tahun; sistem butuh persetujuan ulang dari atlet sendiri.",
      };
    }
  }

  return { diizinkan: true };
}

export function cekPeran(actor: Actor, diizinkanUntuk: Actor["peran"][]): KeputusanAkses {
  if (!diizinkanUntuk.includes(actor.peran)) {
    return {
      diizinkan: false,
      alasan: `Peran ${actor.peran} tidak berwenang untuk operasi ini.`,
    };
  }
  return { diizinkan: true };
}

export function bisaMenulisVisibilitas(actor: Actor, visibilitas: Visibilitas): KeputusanAkses {
  if (visibilitas === "klinis" && actor.peran !== "tim_support") {
    return {
      diizinkan: false,
      alasan: "Hanya Tim Support yang bisa menulis Catatan Visibilitas Klinis.",
    };
  }
  if (
    (visibilitas === "staf" || visibilitas === "bersama_atlet") &&
    !["staf_pelatih", "tim_support"].includes(actor.peran)
  ) {
    return {
      diizinkan: false,
      alasan: "Hanya Staf Pelatih atau Tim Support yang bisa menulis Catatan ini.",
    };
  }
  return { diizinkan: true };
}

export function bisaMembacaCatatan(actor: Actor, catatan: Catatan): boolean {
  if (actor.peran === "manajer_tim") return false; // tidak pernah melihat isi Catatan
  if (catatan.visibilitas === "klinis") return actor.peran === "tim_support";
  if (catatan.visibilitas === "staf") {
    return actor.peran === "staf_pelatih" || actor.peran === "tim_support";
  }
  // bersama_atlet
  if (actor.peran === "staf_pelatih" || actor.peran === "tim_support") return true;
  if (actor.peran === "atlet") return actor.athleteId === catatan.athleteId;
  return false;
}

export function bisaMembacaTeksBebasCheckIn(actor: Actor, athleteId: string): boolean {
  if (actor.peran === "atlet") return actor.athleteId === athleteId;
  if (actor.peran === "tim_support") return true;
  return false; // Staf Pelatih dan Manajer Tim tidak melihat teks bebas
}

export function bisaMembacaJawabanCheckIn(actor: Actor): boolean {
  return actor.peran !== "manajer_tim";
}

export function bisaMembacaLogAudit(actor: Actor, untukAthleteId?: string): boolean {
  if (actor.peran === "manajer_tim") return true;
  if (actor.peran === "atlet") return actor.athleteId === untukAthleteId;
  return false;
}

export function jenisPersetujuanValid(jenis: string): jenis is JenisPersetujuan {
  return jenis === "kuesioner" || jenis === "tes_reaksi" || jenis === "wearable";
}
