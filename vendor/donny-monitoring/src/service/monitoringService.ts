import type {
  Actor,
  Athlete,
  JenisKelamin,
  AuditEntry,
  Catatan,
  CheckIn,
  CheckInItems,
  CheckInVersion,
  ConsentRecord,
  DailyScore,
  DataWearable,
  GuardianApproval,
  IntegrasiGarmin,
  JenisDataGarmin,
  KoneksiGarmin,
  Laporan,
  LampiranLaporan,
  JenisPersetujuan,
  JenisSesi,
  LinimasaEvent,
  Membership,
  Notification,
  Peran,
  PetaNyeri,
  ScoreConfig,
  Sesi,
  StatusReadiness,
  SubPeranTimSupport,
  Team,
  ThreadReply,
  Visibilitas,
} from "../domain/types.js";
import { tambahHari, tanggalDiZona } from "../domain/tanggal.js";
import type { Clock } from "../ports/clock.js";
import type { NotificationPort, OutgoingNotification } from "../ports/notification.js";
import type { StoragePort } from "../ports/storage.js";
import {
  bisaMembacaCatatan,
  bisaMembacaJawabanCheckIn,
  bisaMembacaTeksBebasCheckIn,
  bisaMenulisVisibilitas,
  cekPeran,
  cekPersetujuanBerlaku,
  jenisPersetujuanValid,
} from "../modules/akses.js";
import {
  validasiCheckInItems,
  validasiJenisSesi,
  validasiPetaNyeri,
  validasiRpe,
} from "../modules/instrumen.js";
import { ambilSebutan, kategoriValid } from "../modules/kolaborasi.js";
import {
  BASELINE_PERFORMA,
  type HariPerforma,
  hitungIndeksPerforma,
  type IndeksPerforma,
  jamKeMenitMalam,
  JENDELA_PENGHALUS,
} from "../modules/performa.js";
import {
  type BaselineStat,
  type ComponentInput,
  DEFAULT_SCORE_CONFIG,
  hitungBaseline,
  MIN_STD_BEBAN_GARMIN,
  hitungIndeksTidur,
  hitungReadiness,
  hitungWellnessScore,
  JUMLAH_HARI_BASELINE,
  SKOR_FORMULA_VERSION,
  tentukanStatus,
  validasiKonfigurasiSkor,
} from "../modules/skor.js";
import { type CommandResult, fail, ok } from "./result.js";

export interface CheckInPayload {
  items: CheckInItems;
  petaNyeri: PetaNyeri;
  screenTimeJamKemarin: number;
  catatanBebas?: string;
  /** Catatan latihan singkat; dibaca staf (berbeda dengan catatan bebas). */
  catatanLatihan?: string;
}

export interface BarisPapanTim {
  athleteId: string;
  nama: string;
  sudahCheckIn: boolean;
  status: StatusReadiness;
  statusReason: string;
  readiness: number | null;
  wellnessScore: number | null;
  komponen: DailyScore["komponen"];
}

export type DataWearableInput = Omit<DataWearable, "diterimaAt" | "sumber"> & { sumber?: "garmin" };

export interface BarisWearableTim {
  athleteId: string;
  nama: string;
  /** False bila Atlet belum memberi (atau sudah mencabut) persetujuan Data wearable. */
  persetujuanBerlaku: boolean;
  data: DataWearable | null;
}

/** Rentang wajar tiap metrik; nilai di luar rentang dianggap galat sinkronisasi. */
function validasiDataWearable(d: DataWearableInput): string | null {
  const di = (v: number | null | undefined, min: number, maks: number) => v === null || v === undefined || (v >= min && v <= maks);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.tanggal)) return "Tanggal data wearable tidak valid.";
  if (!di(d.langkah, 0, 100_000)) return "Jumlah langkah di luar rentang.";
  if (!di(d.menitIntensitas, 0, 1440)) return "Menit intensitas di luar rentang.";
  if (d.tidur && (!di(d.tidur.durasiMenit, 0, 1440) || !di(d.tidur.skor, 0, 100))) return "Data tidur di luar rentang.";
  if (!di(d.kalori, 0, 15_000)) return "Kalori di luar rentang.";
  if (d.detakJantung && [d.detakJantung.istirahat, d.detakJantung.rataRata, d.detakJantung.maks].some((v) => !di(v, 25, 230))) {
    return "Detak jantung di luar rentang.";
  }
  if (!di(d.stres, 0, 100)) return "Tingkat stres di luar rentang.";
  if (!di(d.spo2, 50, 100)) return "Pulse Ox di luar rentang.";
  if (d.bodyBattery && (!di(d.bodyBattery.tertinggi, 0, 100) || !di(d.bodyBattery.terendah, 0, 100))) return "Body Battery di luar rentang.";
  if (d.komposisiTubuh && (!di(d.komposisiTubuh.beratKg, 20, 250) || !di(d.komposisiTubuh.lemakPersen, 2, 70))) {
    return "Komposisi tubuh di luar rentang.";
  }
  if (!di(d.respirasi, 4, 60)) return "Respirasi di luar rentang.";
  if (d.tekananDarah && (!di(d.tekananDarah.sistolik, 60, 260) || !di(d.tekananDarah.diastolik, 30, 160))) {
    return "Tekanan darah di luar rentang.";
  }
  if (!di(d.hrvRmssd, 5, 300)) return "HRV (RMSSD) di luar rentang.";
  if (!di(d.durasiDudukMenit, 0, 1440)) return "Durasi duduk di luar rentang.";
  const jam = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (d.tidur && ((d.tidur.mulai && !jam.test(d.tidur.mulai)) || (d.tidur.bangun && !jam.test(d.tidur.bangun)))) {
    return "Jam tidur/bangun harus berformat HH:mm.";
  }
  return null;
}

export const BATAS_LAPORAN = { karakter: 2000, lampiran: 5, fotoByte: 10_000_000, videoByte: 100_000_000 } as const;

/** Data struktur anggota staf/pengurus. */
export interface ProfilStafInput {
  nama?: string;
  jabatan?: string;
  unit?: string;
  kelompok?: string;
}

export interface ProfilAtletInput {
  tempatLahir?: string;
  jenisKelamin?: JenisKelamin;
  kelompok?: string;
}

function validasiProfilAtlet(p: { nama?: string; tanggalLahir?: string; jenisKelamin?: string; kelompok?: string }): string | null {
  if (p.nama !== undefined && !p.nama.trim()) return "Nama lengkap wajib diisi.";
  if (p.tanggalLahir && !/^\d{4}-\d{2}-\d{2}$/.test(p.tanggalLahir)) {
    return "Tanggal lahir wajib diisi dengan format YYYY-MM-DD.";
  }
  if (p.jenisKelamin !== undefined && p.jenisKelamin !== "laki_laki" && p.jenisKelamin !== "perempuan") {
    return "Jenis kelamin tidak dikenal.";
  }
  if (p.kelompok !== undefined && !p.kelompok.trim()) return "Number of event (kelompok) wajib diisi.";
  return null;
}

const URUTAN_STATUS: Record<StatusReadiness, number> = {
  merah: 0,
  kuning: 1,
  abu_abu: 2,
  hijau: 3,
};

const BASELINE_KOSONG: BaselineStat = { mean: NaN, std: 0, n: 0, ready: false };

export function resolveScoreConfig(team: Team | undefined): ScoreConfig {
  const base = DEFAULT_SCORE_CONFIG;
  const o = team?.scoreConfig;
  if (!o) return base;
  return {
    bobot: { ...base.bobot, ...(o.bobot ?? {}) },
    ambangMerah: o.ambangMerah ?? base.ambangMerah,
    ambangKuning: o.ambangKuning ?? base.ambangKuning,
    minStdDev: { ...base.minStdDev, ...(o.minStdDev ?? {}) },
  };
}

/**
 * Layanan Monitoring — fasad tunggal dan satu-satunya seam uji. UI, webhook
 * wearable, dan penjadwal pengingat hanya memanggil kelas ini; tidak ada yang
 * menyentuh penyimpanan secara langsung.
 *
 * Penyederhanaan Tahap 1: satu Atlet = satu pengguna, sehingga athleteId juga
 * dipakai sebagai userId Atlet.
 */
export class MonitoringService {
  constructor(
    private readonly storage: StoragePort,
    private readonly clock: Clock,
    private readonly notification: NotificationPort
  ) {}

  // ───────────────────────── Tim & anggota ─────────────────────────

  buatTim(payload: { id?: string; nama: string; divisi: string; timezone?: string }): Team {
    const team: Team = {
      id: payload.id ?? this.storage.nextId("team"),
      nama: payload.nama,
      divisi: payload.divisi,
      timezone: payload.timezone ?? "Asia/Jakarta",
    };
    this.storage.saveTeam(team);
    return team;
  }

  /** Bootstrap Manajer Tim pertama sebuah Tim (belum ada Manajer yang bisa mengundang). */
  daftarkanManajerAwal(payload: { userId: string; teamId: string }): CommandResult<Membership> {
    if (!this.storage.getTeam(payload.teamId)) return fail("Tim tidak ditemukan.");
    const sudahAda = this.storage
      .listMembershipsByTeam(payload.teamId)
      .some((m) => m.peran === "manajer_tim");
    if (sudahAda) return fail("Tim ini sudah punya Manajer; gunakan undangAnggota.");
    const m: Membership = { userId: payload.userId, teamId: payload.teamId, peran: "manajer_tim" };
    this.storage.saveMembership(m);
    return ok(m);
  }

  undangAnggota(
    actor: Actor,
    payload: { userId: string; peran: Peran; subPeran?: SubPeranTimSupport } & ProfilStafInput
  ): CommandResult<Membership> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    if (payload.peran === "atlet") return fail("Gunakan daftarkanAtlet untuk menambah Atlet.");
    const m: Membership = {
      userId: payload.userId,
      teamId: actor.teamId,
      peran: payload.peran,
      subPeran: payload.subPeran,
      nama: payload.nama?.trim() || undefined,
      jabatan: payload.jabatan?.trim() || undefined,
      unit: payload.unit?.trim() || undefined,
      kelompok: payload.kelompok?.trim() || undefined,
    };
    this.storage.saveMembership(m);
    this.audit(actor, "undangAnggota", "membership", payload.userId, payload.peran);
    return ok(m);
  }

  ubahPeran(
    actor: Actor,
    payload: { userId: string; peran: Peran; subPeran?: SubPeranTimSupport }
  ): CommandResult<Membership> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const existing = this.storage.getMembership(payload.userId, actor.teamId);
    if (!existing) return fail("Anggota tidak ditemukan di Tim ini.");
    if (existing.peran === "atlet" || payload.peran === "atlet") {
      return fail("Peran Atlet tidak bisa diubah lewat ubahPeran.");
    }
    if (existing.peran === "manajer_tim") return fail("Peran Super admin (Manajer Tim) tidak bisa diubah.");
    const m: Membership = { ...existing, peran: payload.peran, subPeran: payload.subPeran };
    this.storage.saveMembership(m);
    this.audit(actor, "ubahPeran", "membership", payload.userId, `${existing.peran} -> ${payload.peran}`);
    return ok(m);
  }

  daftarkanAtlet(
    actor: Actor,
    payload: { athleteId?: string; nama: string; tanggalLahir?: string; guardianUserId?: string } & ProfilAtletInput
  ): CommandResult<Athlete> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const v = validasiProfilAtlet(payload);
    if (v) return fail(v);
    const id = payload.athleteId ?? this.storage.nextId("atlet");
    const athlete: Athlete = {
      id,
      teamId: actor.teamId,
      nama: payload.nama.trim(),
      tanggalLahir: payload.tanggalLahir || undefined,
      tempatLahir: payload.tempatLahir?.trim() || undefined,
      jenisKelamin: payload.jenisKelamin,
      kelompok: payload.kelompok?.trim(),
      guardianUserId: payload.guardianUserId,
      archived: false,
    };
    this.storage.saveAthlete(athlete);
    this.storage.saveMembership({ userId: id, teamId: actor.teamId, peran: "atlet", athleteId: id });
    this.audit(actor, "daftarkanAtlet", "athlete", id);
    return ok(athlete);
  }

  /** Mengubah data profil Atlet. Field yang tidak dikirim tetap seperti semula. */
  ubahProfilAtlet(
    actor: Actor,
    payload: { athleteId: string; nama?: string; tanggalLahir?: string; guardianUserId?: string } & ProfilAtletInput
  ): CommandResult<Athlete> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    if (athlete.archived) return fail("Atlet yang sudah diarsipkan tidak bisa diubah.");
    const baru: Athlete = {
      ...athlete,
      nama: payload.nama !== undefined ? payload.nama.trim() : athlete.nama,
      tanggalLahir: payload.tanggalLahir !== undefined ? payload.tanggalLahir || undefined : athlete.tanggalLahir,
      tempatLahir: payload.tempatLahir !== undefined ? payload.tempatLahir.trim() || undefined : athlete.tempatLahir,
      jenisKelamin: payload.jenisKelamin ?? athlete.jenisKelamin,
      kelompok: payload.kelompok !== undefined ? payload.kelompok.trim() : athlete.kelompok,
      guardianUserId: payload.guardianUserId !== undefined ? payload.guardianUserId || undefined : athlete.guardianUserId,
    };
    const v = validasiProfilAtlet(baru);
    if (v) return fail(v);
    const berubah = (["nama", "tanggalLahir", "tempatLahir", "jenisKelamin", "kelompok", "guardianUserId"] as const).filter(
      (k) => baru[k] !== athlete[k]
    );
    this.storage.saveAthlete(baru);
    this.audit(actor, "ubahProfilAtlet", "athlete", athlete.id, berubah.join(", "));
    return ok(baru);
  }

  arsipkanAtlet(actor: Actor, payload: { athleteId: string }): CommandResult<Athlete> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    const updated = { ...athlete, archived: true };
    this.storage.saveAthlete(updated);
    this.audit(actor, "arsipkanAtlet", "athlete", athlete.id);
    return ok(updated);
  }

  /**
   * Menghapus permanen Atlet dan seluruh datanya. Berbeda dengan arsip, ini
   * tidak bisa dibatalkan; Log Audit tetap mencatat siapa yang menghapus.
   */
  hapusAtlet(actor: Actor, payload: { athleteId: string }): CommandResult<{ id: string; nama: string }> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    this.storage.deleteAthleteCascade(athlete.id);
    this.audit(actor, "hapusAtlet", "athlete", athlete.id, athlete.nama);
    return ok({ id: athlete.id, nama: athlete.nama });
  }

  /** Menghapus anggota staf (Staf Pelatih atau Tim Support) dari Tim. */
  hapusAnggota(actor: Actor, payload: { userId: string }): CommandResult<Membership> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    if (payload.userId === actor.userId) return fail("Anda tidak bisa menghapus akun sendiri.");
    const m = this.storage.getMembership(payload.userId, actor.teamId);
    if (!m) return fail("Anggota tidak ditemukan di Tim ini.");
    if (m.peran === "atlet") return fail("Gunakan hapusAtlet untuk menghapus Atlet.");
    if (m.peran === "manajer_tim") return fail("Super admin (Manajer Tim) tidak bisa dihapus.");
    this.storage.deleteMembership(m.userId, m.teamId);
    this.audit(actor, "hapusAnggota", "membership", m.userId, m.peran);
    return ok(m);
  }

  /**
   * Mengubah profil anggota staf: nama tampilan dan status Admin. Status Admin
   * Super admin tidak bisa diubah, dan tidak ada yang bisa mengubah status
   * Admin dirinya sendiri.
   */
  ubahProfilAnggota(actor: Actor, payload: { userId: string; admin?: boolean } & ProfilStafInput): CommandResult<Membership> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const m = this.storage.getMembership(payload.userId, actor.teamId);
    if (!m) return fail("Anggota tidak ditemukan di Tim ini.");
    if (m.peran === "atlet") return fail("Gunakan ubahProfilAtlet untuk mengubah profil Atlet.");
    if (payload.nama !== undefined && !payload.nama.trim()) return fail("Nama lengkap wajib diisi.");
    const adminBerubah = payload.admin !== undefined && payload.admin !== !!m.admin;
    if (adminBerubah && m.peran === "manajer_tim") return fail("Super admin selalu memiliki otoritas penuh.");
    if (adminBerubah && m.userId === actor.userId) return fail("Anda tidak bisa mengubah status Admin akun sendiri.");
    const baru: Membership = {
      ...m,
      nama: payload.nama !== undefined ? payload.nama.trim() : m.nama,
      jabatan: payload.jabatan !== undefined ? payload.jabatan.trim() || undefined : m.jabatan,
      unit: payload.unit !== undefined ? payload.unit.trim() || undefined : m.unit,
      kelompok: payload.kelompok !== undefined ? payload.kelompok.trim() || undefined : m.kelompok,
      admin: m.peran === "manajer_tim" ? undefined : (payload.admin ?? m.admin) || undefined,
    };
    const berubah = (["nama", "jabatan", "unit", "kelompok", "admin"] as const).filter((k) => baru[k] !== m[k]);
    this.storage.saveMembership(baru);
    this.audit(actor, "ubahProfilAnggota", "membership", m.userId, berubah.join(", "));
    return ok(baru);
  }

  /** True bila Aktor adalah Super admin (Manajer Tim) atau staf berstatus Admin. */
  punyaKontrol(actor: Actor): boolean {
    const m = this.storage.getMembership(actor.userId, actor.teamId);
    return !!m && (m.peran === "manajer_tim" || (m.admin === true && m.peran !== "atlet"));
  }

  private cekKontrol(actor: Actor): CommandResult<true> {
    if (this.punyaKontrol(actor)) return ok(true);
    return fail("Hanya Super admin (Manajer Tim) atau anggota berstatus Admin yang bisa melakukan ini.");
  }

  /** Data Tim beserta konfigurasi skor yang berlaku. Bisa dibaca semua anggota. */
  infoTim(actor: Actor): CommandResult<Team & { scoreConfigBerlaku: ScoreConfig }> {
    const team = this.storage.getTeam(actor.teamId);
    if (!team || !this.storage.getMembership(actor.userId, actor.teamId)) {
      return fail("Tim tidak ditemukan.");
    }
    return ok({ ...team, scoreConfigBerlaku: resolveScoreConfig(team) });
  }

  /**
   * Daftar anggota dan Atlet Tim untuk staf dan Manajer. Atlet tidak diberi
   * akses karena daftar ini memuat tanggal lahir rekan setimnya.
   */
  anggotaTim(actor: Actor): CommandResult<{ anggota: Membership[]; atlet: Athlete[] }> {
    const cek = cekPeran(actor, ["staf_pelatih", "tim_support", "manajer_tim"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    return ok({
      anggota: this.storage.listMembershipsByTeam(actor.teamId),
      atlet: this.storage.listAthletesByTeam(actor.teamId),
    });
  }

  // ───────────────────────── Persetujuan ─────────────────────────

  /**
   * Persetujuan data dicatat oleh Super admin atau Admin berdasarkan kontrak
   * yang ditandatangani atlet (dan wali bila di bawah umur) sebelum memakai
   * aplikasi. Atlet tidak bisa memberi atau mencabut persetujuan sendiri.
   */
  berikanPersetujuan(actor: Actor, payload: { athleteId: string; jenis: JenisPersetujuan }): CommandResult<ConsentRecord> {
    return this.simpanPersetujuan(actor, payload.athleteId, payload.jenis, true);
  }

  cabutPersetujuan(actor: Actor, payload: { athleteId: string; jenis: JenisPersetujuan }): CommandResult<ConsentRecord> {
    return this.simpanPersetujuan(actor, payload.athleteId, payload.jenis, false);
  }

  private simpanPersetujuan(
    actor: Actor,
    athleteId: string,
    jenis: JenisPersetujuan,
    granted: boolean
  ): CommandResult<ConsentRecord> {
    if (actor.peran === "atlet") return fail("Persetujuan data diatur oleh Super admin berdasarkan kontrak atlet.");
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    if (!jenisPersetujuanValid(jenis)) return fail("Jenis persetujuan tidak dikenal.");
    const athlete = this.storage.getAthlete(athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    const rec: ConsentRecord = {
      athleteId,
      jenis,
      granted,
      grantedBy: actor.userId,
      at: this.clock.nowISO(),
    };
    this.storage.saveConsent(rec);
    this.audit(actor, granted ? "berikanPersetujuan" : "cabutPersetujuan", "athlete", athleteId, jenis);
    return ok(rec);
  }

  /** Status tiap jenis Persetujuan seorang Atlet, untuk form profil di sisi Super admin/Admin. */
  persetujuanAtlet(actor: Actor, payload: { athleteId: string }): ReturnType<MonitoringService["statusPersetujuan"]> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    return this.statusPersetujuan(athlete);
  }

  /** Super admin/Admin mencatat bahwa wali sudah menandatangani kontrak atlet di bawah umur. */
  catatPersetujuanWali(actor: Actor, payload: { athleteId: string }): CommandResult<GuardianApproval> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    if (!athlete.guardianUserId) return fail("Atlet ini belum punya wali terdaftar.");
    const rec: GuardianApproval = { athleteId: athlete.id, guardianUserId: athlete.guardianUserId, at: this.clock.nowISO() };
    this.storage.saveGuardianApproval(rec);
    this.audit(actor, "catatPersetujuanWali", "athlete", athlete.id, athlete.guardianUserId);
    return ok(rec);
  }

  /** Status tiap jenis Persetujuan milik Atlet sendiri, termasuk apakah sedang berlaku. */
  persetujuanSaya(actor: Actor): ReturnType<MonitoringService["statusPersetujuan"]> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const athlete = this.storage.getAthlete(actor.athleteId ?? "");
    if (!athlete) return fail("Atlet tidak ditemukan.");
    return this.statusPersetujuan(athlete);
  }

  private statusPersetujuan(athlete: Athlete): CommandResult<{
    persetujuan: {
      jenis: JenisPersetujuan;
      granted: boolean;
      at?: string;
      berlaku: boolean;
      alasan?: string;
    }[];
    wali: { userId: string; disetujuiAt?: string } | null;
  }> {
    const team = this.storage.getTeam(athlete.teamId);
    if (!team) return fail("Tim tidak ditemukan.");
    const tanggal = tanggalDiZona(this.clock.nowISO(), team.timezone);
    const approval = this.storage.getGuardianApproval(athlete.id);
    const semuaJenis: JenisPersetujuan[] = ["kuesioner", "tes_reaksi", "wearable"];
    return ok({
      persetujuan: semuaJenis.map((jenis) => {
        const consent = this.storage.getConsent(athlete.id, jenis);
        const keputusan = cekPersetujuanBerlaku({
          athlete,
          tanggal,
          consent,
          guardianApprovalAt: approval?.at,
        });
        return {
          jenis,
          granted: consent?.granted ?? false,
          at: consent?.at,
          berlaku: keputusan.diizinkan,
          alasan: keputusan.alasan,
        };
      }),
      wali: athlete.guardianUserId ? { userId: athlete.guardianUserId, disetujuiAt: approval?.at } : null,
    });
  }

  setujuiSebagaiWali(payload: { athleteId: string; guardianUserId: string }): CommandResult<GuardianApproval> {
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete) return fail("Atlet tidak ditemukan.");
    if (!athlete.guardianUserId || athlete.guardianUserId !== payload.guardianUserId) {
      return fail("Pengguna ini bukan wali terdaftar untuk Atlet tersebut.");
    }
    const rec: GuardianApproval = {
      athleteId: athlete.id,
      guardianUserId: payload.guardianUserId,
      at: this.clock.nowISO(),
    };
    this.storage.saveGuardianApproval(rec);
    this.storage.appendAudit({
      id: this.storage.nextId("audit"),
      teamId: athlete.teamId,
      actorId: payload.guardianUserId,
      action: "setujuiSebagaiWali",
      targetType: "athlete",
      targetId: athlete.id,
      at: rec.at,
    });
    return ok(rec);
  }

  // ───────────────────────── Check-in ─────────────────────────

  kirimCheckIn(
    actor: Actor,
    payload: CheckInPayload
  ): CommandResult<{ checkIn: CheckIn; skorHarian: DailyScore }> {
    return this.simpanCheckIn(actor, payload, false);
  }

  ubahCheckIn(
    actor: Actor,
    payload: CheckInPayload
  ): CommandResult<{ checkIn: CheckIn; skorHarian: DailyScore }> {
    return this.simpanCheckIn(actor, payload, true);
  }

  private simpanCheckIn(
    actor: Actor,
    payload: CheckInPayload,
    ubah: boolean
  ): CommandResult<{ checkIn: CheckIn; skorHarian: DailyScore }> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const athlete = this.storage.getAthlete(actor.athleteId ?? "");
    if (!athlete || athlete.archived) return fail("Atlet tidak ditemukan atau sudah diarsipkan.");
    const team = this.storage.getTeam(athlete.teamId);
    if (!team) return fail("Tim tidak ditemukan.");

    const now = this.clock.nowISO();
    const tanggal = tanggalDiZona(now, team.timezone);

    const persetujuan = this.cekPersetujuan(athlete, "kuesioner", tanggal);
    if (!persetujuan.ok) return persetujuan;

    const vItems = validasiCheckInItems(payload.items);
    if (!vItems.valid) return fail(vItems.errors.join(" "));
    const vPeta = validasiPetaNyeri(payload.petaNyeri);
    if (!vPeta.valid) return fail(vPeta.errors.join(" "));
    if (!(payload.screenTimeJamKemarin >= 0 && payload.screenTimeJamKemarin <= 24)) {
      return fail("Screen time harus di antara 0 dan 24 jam.");
    }
    const catatanLatihan = payload.catatanLatihan?.trim() || undefined;
    if (catatanLatihan && catatanLatihan.length > 1000) return fail("Catatan latihan maksimal 1000 karakter.");

    const existing = this.storage.getCheckIn(athlete.id, tanggal);
    if (ubah && !existing) return fail("Check-in hari ini belum ada; gunakan kirimCheckIn.");
    if (!ubah && existing) return fail("Check-in hari ini sudah ada; gunakan ubahCheckIn.");
    if (this.sesiPertamaSudahMulai(athlete.id, tanggal, now)) {
      return fail(
        "Check-in terkunci karena Sesi pertama hari ini sudah dimulai. Perubahan butuh Catatan koreksi."
      );
    }

    const version: CheckInVersion = {
      items: payload.items,
      petaNyeri: payload.petaNyeri,
      screenTimeJamKemarin: payload.screenTimeJamKemarin,
      catatanBebas: payload.catatanBebas,
      catatanLatihan,
      editedAt: now,
      editedBy: actor.userId,
    };
    const checkIn: CheckIn = {
      id: existing?.id ?? this.storage.nextId("checkin"),
      athleteId: athlete.id,
      teamId: athlete.teamId,
      tanggal,
      items: payload.items,
      petaNyeri: payload.petaNyeri,
      screenTimeJamKemarin: payload.screenTimeJamKemarin,
      catatanBebas: payload.catatanBebas,
      catatanLatihan,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      history: [...(existing?.history ?? []), version],
    };
    this.storage.saveCheckIn(checkIn);
    const skorHarian = this.hitungDanSimpanSkorHarian(athlete.id, tanggal);
    this.audit(actor, ubah ? "ubahCheckIn" : "kirimCheckIn", "athlete", athlete.id, checkIn.id);
    return ok({ checkIn, skorHarian });
  }

  /** Jawaban kemarin sebagai titik awal pengisian (user story 6). */
  checkInKemarin(actor: Actor): CommandResult<CheckIn | null> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const team = this.storage.getTeam(actor.teamId);
    if (!team) return fail("Tim tidak ditemukan.");
    const hariIni = tanggalDiZona(this.clock.nowISO(), team.timezone);
    return ok(this.storage.getCheckIn(actor.athleteId!, tambahHari(hariIni, -1)) ?? null);
  }

  /** Check-in hari ini milik Atlet sendiri, dan apakah sudah terkunci oleh Sesi pertama. */
  checkInHariIni(actor: Actor): CommandResult<{ checkIn: CheckIn | null; terkunci: boolean }> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const team = this.storage.getTeam(actor.teamId);
    if (!team) return fail("Tim tidak ditemukan.");
    const now = this.clock.nowISO();
    const hariIni = tanggalDiZona(now, team.timezone);
    return ok({
      checkIn: this.storage.getCheckIn(actor.athleteId!, hariIni) ?? null,
      terkunci: this.sesiPertamaSudahMulai(actor.athleteId!, hariIni, now),
    });
  }

  private sesiPertamaSudahMulai(athleteId: string, tanggal: string, now: string): boolean {
    return this.storage
      .listSesiByAthlete(athleteId, tanggal, tanggal)
      .some((s) => new Date(s.mulaiAt).getTime() <= new Date(now).getTime());
  }

  private cekPersetujuan(
    athlete: Athlete,
    jenis: JenisPersetujuan,
    tanggal: string
  ): CommandResult<true> {
    const keputusan = cekPersetujuanBerlaku({
      athlete,
      tanggal,
      consent: this.storage.getConsent(athlete.id, jenis),
      guardianApprovalAt: this.storage.getGuardianApproval(athlete.id)?.at,
    });
    return keputusan.diizinkan ? ok(true) : fail(keputusan.alasan!);
  }

  // ───────────────────────── Data Wearable ─────────────────────────

  /**
   * Menerima ringkasan harian dari adapter wearable (Garmin). Dipanggil oleh
   * sistem, bukan oleh pengguna. Ditolak bila persetujuan Data wearable Atlet
   * tidak berlaku pada tanggal data itu. Kiriman ulang untuk tanggal yang sama
   * menimpa data sebelumnya.
   */
  terimaDataWearable(payload: DataWearableInput): CommandResult<DataWearable> {
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete) return fail("Atlet tidak ditemukan.");
    if (athlete.archived) return fail("Atlet sudah diarsipkan.");
    const v = validasiDataWearable(payload);
    if (v) return fail(v);
    const izin = this.cekPersetujuan(athlete, "wearable", payload.tanggal);
    if (!izin.ok) return izin;
    const data: DataWearable = { ...payload, sumber: payload.sumber ?? "garmin", diterimaAt: this.clock.nowISO() };
    this.storage.saveDataWearable(data);
    const koneksi = this.storage.getKoneksiGarmin(athlete.id);
    if (koneksi?.status === "terhubung") this.storage.saveKoneksiGarmin({ ...koneksi, sinkronTerakhirAt: data.diterimaAt });
    // Beban mode Garmin memakai jendela 3 hari, jadi skor yang sudah ada untuk
    // hari ini dan 2 hari berikutnya dihitung ulang.
    for (let i = 0; i <= 2; i++) {
      const t = tambahHari(data.tanggal, i);
      if (this.storage.getDailyScore(athlete.id, t)) this.hitungDanSimpanSkorHarian(athlete.id, t);
    }
    return ok(data);
  }

  // ───────────────────────── Laporan atlet ─────────────────────────

  /**
   * Atlet melapor sesuatu ke staf, boleh dengan foto atau video. Laporan
   * dibaca Staf Pelatih dan Tim Support; Manajer Tim tidak (sesuai PRD).
   */
  kirimLaporan(actor: Actor, payload: { isi: string; lampiran?: LampiranLaporan[] }): CommandResult<Laporan> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const athlete = this.storage.getAthlete(actor.athleteId ?? "");
    if (!athlete || athlete.archived) return fail("Atlet tidak ditemukan.");
    const isi = payload.isi.trim();
    const lampiran = payload.lampiran ?? [];
    if (!isi && lampiran.length === 0) return fail("Tulis laporan atau lampirkan foto/video.");
    if (isi.length > BATAS_LAPORAN.karakter) return fail(`Laporan maksimal ${BATAS_LAPORAN.karakter} karakter.`);
    if (lampiran.length > BATAS_LAPORAN.lampiran) return fail(`Maksimal ${BATAS_LAPORAN.lampiran} lampiran per laporan.`);
    for (const l of lampiran) {
      const foto = l.tipe.startsWith("image/");
      const video = l.tipe.startsWith("video/");
      if (!foto && !video) return fail(`${l.nama}: hanya foto atau video yang bisa dilampirkan.`);
      const maks = foto ? BATAS_LAPORAN.fotoByte : BATAS_LAPORAN.videoByte;
      if (l.ukuranByte > maks) return fail(`${l.nama}: ukuran ${foto ? "foto" : "video"} maksimal ${maks / 1_000_000} MB.`);
    }
    const laporan: Laporan = {
      id: this.storage.nextId("laporan"),
      teamId: athlete.teamId,
      athleteId: athlete.id,
      isi,
      lampiran,
      createdAt: this.clock.nowISO(),
      status: "baru",
    };
    this.storage.saveLaporan(laporan);
    this.audit(actor, "kirimLaporan", "athlete", athlete.id, laporan.id);
    return ok(laporan);
  }

  laporanSaya(actor: Actor): CommandResult<Laporan[]> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    return ok(this.storage.listLaporanByTeam(actor.teamId).filter((l) => l.athleteId === actor.athleteId));
  }

  laporanTim(actor: Actor): CommandResult<Laporan[]> {
    const cek = cekPeran(actor, ["staf_pelatih", "tim_support"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    return ok(this.storage.listLaporanByTeam(actor.teamId));
  }

  tandaiLaporanDibaca(actor: Actor, payload: { laporanId: string }): CommandResult<Laporan> {
    const cek = cekPeran(actor, ["staf_pelatih", "tim_support"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const l = this.storage.getLaporan(payload.laporanId);
    if (!l || l.teamId !== actor.teamId) return fail("Laporan tidak ditemukan.");
    if (l.status === "dibaca") return ok(l);
    const baru: Laporan = { ...l, status: "dibaca", dibacaOleh: actor.userId, dibacaAt: this.clock.nowISO() };
    this.storage.saveLaporan(baru);
    this.audit(actor, "tandaiLaporanDibaca", "athlete", l.athleteId, l.id);
    return ok(baru);
  }

  // ───────────────────────── Indeks Performa ─────────────────────────

  /**
   * Indeks Performa (eksperimental) satu Atlet: tidur, pemulihan (HRV + denyut
   * istirahat), stres, dan durasi duduk dibandingkan dengan baseline atlet itu
   * sendiri. Lihat modules/performa.ts untuk rumusnya. Aturan baca sama
   * dengan skor readiness.
   */
  indeksPerforma(
    actor: Actor,
    payload: { athleteId: string; tanggal: string }
  ): CommandResult<IndeksPerforma & { tren: { tanggal: string; skor: number | null; status: StatusReadiness }[] }> {
    const akses = this.cekBacaSkorIndividu(actor, payload.athleteId);
    if (!akses.ok) return akses;
    const athlete = this.storage.getAthlete(payload.athleteId)!;
    return ok(this.hitungPerforma(athlete, payload.tanggal, 7));
  }

  /**
   * Data subjektif singkat satu hari (mood, energi, fokus, catatan latihan).
   * Aturan baca sama dengan skor; teks bebas Check-in tidak ikut.
   */
  subjektifHarian(
    actor: Actor,
    payload: { athleteId: string; tanggal: string }
  ): CommandResult<{ mood: number; energi?: number; fokus?: number; catatanLatihan?: string } | null> {
    const akses = this.cekBacaSkorIndividu(actor, payload.athleteId);
    if (!akses.ok) return akses;
    const c = this.storage.getCheckIn(payload.athleteId, payload.tanggal);
    if (!c) return ok(null);
    return ok({ mood: c.items.mood, energi: c.items.energi, fokus: c.items.fokus, catatanLatihan: c.catatanLatihan });
  }

  /** Indeks Performa seluruh Atlet aktif pada satu tanggal, untuk dashboard staf. */
  performaTim(actor: Actor, payload: { tanggal: string }): CommandResult<(IndeksPerforma & { athleteId: string; nama: string })[]> {
    const cek = cekPeran(actor, ["staf_pelatih", "tim_support"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const urutan: Record<StatusReadiness, number> = { merah: 0, kuning: 1, abu_abu: 2, hijau: 3 };
    return ok(
      this.storage
        .listAthletesByTeam(actor.teamId)
        .filter((a) => !a.archived)
        .map((a) => {
          const { tren: _tren, ...p } = this.hitungPerforma(a, payload.tanggal, 1);
          return { ...p, athleteId: a.id, nama: a.nama };
        })
        .sort((a, b) => urutan[a.status] - urutan[b.status] || a.nama.localeCompare(b.nama))
    );
  }

  private hitungPerforma(athlete: Athlete, tanggal: string, hariTren: number) {
    const config = resolveScoreConfig(this.storage.getTeam(athlete.teamId));
    const ambang = { merah: config.ambangMerah, kuning: config.ambangKuning };
    // Baseline 28 hari + jendela penghalus + 7 hari untuk konsistensi jam tidur + panjang tren.
    const dari = tambahHari(tanggal, -(BASELINE_PERFORMA.maksHari + JENDELA_PENGHALUS + 7 + hariTren));
    const riwayat = this.hariPerforma(athlete, dari, tanggal);
    const jendela = (t: string) => Array.from({ length: JENDELA_PENGHALUS }, (_, i) => tambahHari(t, i - JENDELA_PENGHALUS + 1));
    const tren = Array.from({ length: hariTren }, (_, i) => {
      const t = tambahHari(tanggal, i - hariTren + 1);
      const h = hitungIndeksPerforma(riwayat, jendela(t), ambang);
      return { tanggal: t, skor: h.skor, status: h.status };
    });
    return { ...hitungIndeksPerforma(riwayat, jendela(tanggal), ambang), tren };
  }

  /**
   * Data harian untuk Indeks Performa. Tidur memakai data Garmin bila ada;
   * tanpa Garmin, durasi dan kualitas tidur diambil dari Check-in. Data
   * wearable hanya dipakai bila persetujuannya berlaku.
   */
  private hariPerforma(athlete: Athlete, dari: string, sampai: string): HariPerforma[] {
    const wearableBoleh = this.cekPersetujuan(athlete, "wearable", sampai).ok;
    const wearable = new Map(
      (wearableBoleh ? this.storage.listDataWearableByAthlete(athlete.id, dari, sampai) : []).map((d) => [d.tanggal, d])
    );
    const checkIn = new Map(this.storage.listCheckInsByAthlete(athlete.id, dari, sampai).map((c) => [c.tanggal, c]));
    const hasil: HariPerforma[] = [];
    for (let t = dari; t <= sampai; t = tambahHari(t, 1)) {
      const w = wearable.get(t);
      const c = checkIn.get(t);
      if (!w && !c) continue;
      hasil.push({
        tanggal: t,
        tidurDurasi: w?.tidur?.durasiMenit ?? (c ? Math.round(c.items.durasiTidurJam * 60) : null),
        tidurKualitas: w?.tidur?.skor ?? (c ? ((c.items.kualitasTidur - 1) / 4) * 100 : null),
        tidurMulai: w?.tidur?.mulai ? jamKeMenitMalam(w.tidur.mulai) : null,
        hrvRmssd: w?.hrvRmssd ?? null,
        rhr: w?.detakJantung?.istirahat ?? null,
        stres: w?.stres ?? null,
        duduk: w?.durasiDudukMenit ?? null,
      });
    }
    return hasil;
  }

  // ───────────────────────── Integrasi Garmin ─────────────────────────

  /** Pengaturan integrasi (tanpa rahasia) dan status koneksi tiap Atlet aktif. */
  integrasiGarmin(actor: Actor): CommandResult<{
    pengaturan: IntegrasiGarmin | null;
    atlet: { athleteId: string; nama: string; persetujuanBerlaku: boolean; koneksi: KoneksiGarmin | null }[];
  }> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const tanggal = this.hariIniTim(actor.teamId);
    return ok({
      pengaturan: this.storage.getIntegrasiGarmin(actor.teamId) ?? null,
      atlet: this.storage
        .listAthletesByTeam(actor.teamId)
        .filter((a) => !a.archived)
        .sort((a, b) => a.nama.localeCompare(b.nama))
        .map((a) => ({
          athleteId: a.id,
          nama: a.nama,
          persetujuanBerlaku: this.cekPersetujuan(a, "wearable", tanggal).ok,
          koneksi: this.storage.getKoneksiGarmin(a.id) ?? null,
        })),
    });
  }

  aturIntegrasiGarmin(
    actor: Actor,
    payload: {
      aktif: boolean;
      lingkungan: IntegrasiGarmin["lingkungan"];
      consumerKey: string;
      /** Kosong atau tidak dikirim berarti rahasia lama tetap dipakai. */
      consumerSecret?: string;
      jenisData: JenisDataGarmin[];
    }
  ): CommandResult<IntegrasiGarmin> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const lama = this.storage.getIntegrasiGarmin(actor.teamId);
    const key = payload.consumerKey.trim();
    const secretBaru = payload.consumerSecret?.trim() ?? "";
    if (payload.lingkungan !== "evaluasi" && payload.lingkungan !== "produksi") return fail("Lingkungan tidak dikenal.");
    if (payload.aktif) {
      if (!key) return fail("Consumer Key wajib diisi untuk mengaktifkan integrasi.");
      if (!secretBaru && !lama?.consumerSecretTersimpan) return fail("Consumer Secret wajib diisi untuk mengaktifkan integrasi.");
      if (payload.jenisData.length === 0) return fail("Pilih minimal satu jenis data.");
    }
    if (secretBaru) this.storage.simpanRahasia(`garmin:${actor.teamId}:consumerSecret`, secretBaru);
    const baru: IntegrasiGarmin = {
      teamId: actor.teamId,
      aktif: payload.aktif,
      lingkungan: payload.lingkungan,
      consumerKey: key,
      consumerSecretTersimpan: !!secretBaru || !!lama?.consumerSecretTersimpan,
      jenisData: [...new Set(payload.jenisData)],
      diubahAt: this.clock.nowISO(),
      diubahOleh: actor.userId,
      ujiTerakhir: lama?.ujiTerakhir,
    };
    this.storage.saveIntegrasiGarmin(baru);
    // Detail audit tidak pernah memuat rahasia.
    this.audit(
      actor,
      "aturIntegrasiGarmin",
      "team",
      actor.teamId,
      `${baru.aktif ? "aktif" : "nonaktif"}, ${baru.lingkungan}${secretBaru ? ", rahasia diganti" : ""}`
    );
    return ok(baru);
  }

  /** Menyimpan hasil uji koneksi yang dijalankan adapter Garmin. */
  catatUjiKoneksiGarmin(actor: Actor, payload: { ok: boolean; pesan: string }): CommandResult<IntegrasiGarmin> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const lama = this.storage.getIntegrasiGarmin(actor.teamId);
    if (!lama) return fail("Integrasi Garmin belum diatur.");
    const baru = { ...lama, ujiTerakhir: { at: this.clock.nowISO(), ok: payload.ok, pesan: payload.pesan } };
    this.storage.saveIntegrasiGarmin(baru);
    return ok(baru);
  }

  /** Staf berwenang mengundang Atlet menghubungkan akun Garmin-nya. */
  undangHubungkanGarmin(actor: Actor, payload: { athleteId: string }): CommandResult<KoneksiGarmin> {
    const kontrol = this.cekKontrol(actor);
    if (!kontrol.ok) return kontrol;
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId || athlete.archived) return fail("Atlet tidak ditemukan.");
    if (!this.storage.getIntegrasiGarmin(actor.teamId)?.aktif) return fail("Aktifkan integrasi Garmin terlebih dahulu.");
    if (this.storage.getKoneksiGarmin(athlete.id)?.status === "terhubung") return fail("Akun Garmin atlet ini sudah terhubung.");
    const k: KoneksiGarmin = { athleteId: athlete.id, status: "diundang", diundangAt: this.clock.nowISO() };
    this.storage.saveKoneksiGarmin(k);
    this.audit(actor, "undangHubungkanGarmin", "athlete", athlete.id);
    return ok(k);
  }

  /**
   * Dipanggil setelah Atlet menyelesaikan otorisasi di Garmin Connect.
   * Butuh integrasi aktif dan persetujuan Data wearable yang berlaku.
   */
  hubungkanAkunGarmin(actor: Actor, payload: { garminUserId: string }): CommandResult<KoneksiGarmin> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const athlete = this.storage.getAthlete(actor.athleteId ?? "");
    if (!athlete || athlete.archived) return fail("Atlet tidak ditemukan.");
    if (!this.storage.getIntegrasiGarmin(athlete.teamId)?.aktif) return fail("Integrasi Garmin Tim belum aktif.");
    const izin = this.cekPersetujuan(athlete, "wearable", this.hariIniTim(athlete.teamId));
    if (!izin.ok) return fail(`Berikan persetujuan Data wearable terlebih dahulu. ${izin.reason}`);
    if (!payload.garminUserId.trim()) return fail("ID pengguna Garmin tidak valid.");
    const k: KoneksiGarmin = {
      ...this.storage.getKoneksiGarmin(athlete.id),
      athleteId: athlete.id,
      status: "terhubung",
      terhubungAt: this.clock.nowISO(),
      garminUserId: payload.garminUserId.trim(),
    };
    this.storage.saveKoneksiGarmin(k);
    this.audit(actor, "hubungkanAkunGarmin", "athlete", athlete.id);
    return ok(k);
  }

  /** Memutus koneksi Garmin. Bisa oleh Atlet sendiri atau staf berwenang. Data lama tetap tersimpan. */
  putuskanGarmin(actor: Actor, payload: { athleteId: string }): CommandResult<true> {
    const diriSendiri = actor.peran === "atlet" && actor.athleteId === payload.athleteId;
    if (!diriSendiri) {
      const kontrol = this.cekKontrol(actor);
      if (!kontrol.ok) return kontrol;
    }
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    if (!this.storage.getKoneksiGarmin(athlete.id)) return fail("Atlet ini belum terhubung ke Garmin.");
    this.storage.deleteKoneksiGarmin(athlete.id);
    this.audit(actor, "putuskanGarmin", "athlete", athlete.id);
    return ok(true);
  }

  /** Status koneksi Garmin milik Atlet sendiri, untuk halaman Persetujuan Data. */
  koneksiGarminSaya(actor: Actor): CommandResult<{ integrasiAktif: boolean; koneksi: KoneksiGarmin | null }> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    return ok({
      integrasiAktif: !!this.storage.getIntegrasiGarmin(actor.teamId)?.aktif,
      koneksi: this.storage.getKoneksiGarmin(actor.athleteId ?? "") ?? null,
    });
  }

  private hariIniTim(teamId: string): string {
    const team = this.storage.getTeam(teamId);
    return tanggalDiZona(this.clock.nowISO(), team?.timezone ?? "Asia/Jakarta");
  }

  /** Data wearable seorang Atlet dalam rentang tanggal, dengan aturan baca yang sama seperti skor. */
  dataWearableAtlet(
    actor: Actor,
    payload: { athleteId: string; dari: string; sampai: string }
  ): CommandResult<{ persetujuanBerlaku: boolean; alasan?: string; data: DataWearable[] }> {
    const akses = this.cekBacaSkorIndividu(actor, payload.athleteId);
    if (!akses.ok) return akses;
    const athlete = this.storage.getAthlete(payload.athleteId)!;
    const izin = this.cekPersetujuan(athlete, "wearable", payload.sampai);
    return ok({
      persetujuanBerlaku: izin.ok,
      alasan: izin.ok ? undefined : izin.reason,
      data: this.storage.listDataWearableByAthlete(payload.athleteId, payload.dari, payload.sampai),
    });
  }

  /** Data wearable seluruh Atlet aktif pada satu tanggal, untuk dashboard staf. */
  wearableTim(actor: Actor, payload: { tanggal: string }): CommandResult<BarisWearableTim[]> {
    const cek = cekPeran(actor, ["staf_pelatih", "tim_support"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    return ok(
      this.storage
        .listAthletesByTeam(actor.teamId)
        .filter((a) => !a.archived)
        .map((a) => ({
          athleteId: a.id,
          nama: a.nama,
          persetujuanBerlaku: this.cekPersetujuan(a, "wearable", payload.tanggal).ok,
          data: this.storage.getDataWearable(a.id, payload.tanggal) ?? null,
        }))
        .sort((a, b) => a.nama.localeCompare(b.nama))
    );
  }

  // ───────────────────────── Sesi ─────────────────────────

  jadwalkanSesi(
    actor: Actor,
    payload: {
      athleteId: string;
      jenis: JenisSesi;
      durasiMenit: number;
      mulaiAt: string;
      rpeRencana?: number;
    }
  ): CommandResult<Sesi> {
    const cek = cekPeran(actor, ["staf_pelatih"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    const team = this.storage.getTeam(athlete.teamId)!;
    const vJenis = validasiJenisSesi(payload.jenis);
    if (!vJenis.valid) return fail(vJenis.errors.join(" "));
    if (!(payload.durasiMenit > 0)) return fail("Durasi sesi harus lebih dari 0 menit.");
    if (payload.rpeRencana !== undefined) {
      const vRpe = validasiRpe(payload.rpeRencana);
      if (!vRpe.valid) return fail(vRpe.errors.join(" "));
    }
    const sesi: Sesi = {
      id: this.storage.nextId("sesi"),
      athleteId: athlete.id,
      teamId: athlete.teamId,
      tanggal: tanggalDiZona(payload.mulaiAt, team.timezone),
      jenis: payload.jenis,
      durasiMenit: payload.durasiMenit,
      rpeRencana: payload.rpeRencana,
      mulaiAt: payload.mulaiAt,
      status: "terjadwal",
      createdBy: actor.userId,
      createdAt: this.clock.nowISO(),
    };
    this.storage.saveSesi(sesi);
    this.audit(actor, "jadwalkanSesi", "athlete", athlete.id, sesi.id);
    return ok(sesi);
  }

  /** Sesi terjadwal milik Atlet yang belum diisi RPE-nya (user story 15). */
  sesiMenungguRpe(actor: Actor): CommandResult<Sesi[]> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const team = this.storage.getTeam(actor.teamId);
    if (!team) return fail("Tim tidak ditemukan.");
    const now = this.clock.nowISO();
    const hariIni = tanggalDiZona(now, team.timezone);
    const list = this.storage
      .listSesiByAthlete(actor.athleteId!, tambahHari(hariIni, -1), hariIni)
      .filter((s) => s.status === "terjadwal" && s.mulaiAt <= now);
    return ok(list);
  }

  catatSesi(
    actor: Actor,
    payload: {
      sesiId?: string;
      jenis?: JenisSesi;
      durasiMenit?: number;
      mulaiAt?: string;
      selesaiAt?: string;
      rpeAktual: number;
    }
  ): CommandResult<{ sesi: Sesi; skorHarian: DailyScore }> {
    const cek = cekPeran(actor, ["atlet"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const athlete = this.storage.getAthlete(actor.athleteId ?? "");
    if (!athlete || athlete.archived) return fail("Atlet tidak ditemukan atau sudah diarsipkan.");
    const team = this.storage.getTeam(athlete.teamId)!;
    const persetujuan = this.cekPersetujuan(athlete, "kuesioner", tanggalDiZona(this.clock.nowISO(), team.timezone));
    if (!persetujuan.ok) return persetujuan;
    const vRpe = validasiRpe(payload.rpeAktual);
    if (!vRpe.valid) return fail(vRpe.errors.join(" "));

    const now = this.clock.nowISO();
    let sesi: Sesi;
    if (payload.sesiId) {
      const existing = this.storage.getSesi(payload.sesiId);
      if (!existing || existing.athleteId !== athlete.id) return fail("Sesi tidak ditemukan.");
      sesi = {
        ...existing,
        durasiMenit: payload.durasiMenit ?? existing.durasiMenit,
        rpeAktual: payload.rpeAktual,
        selesaiAt: payload.selesaiAt ?? now,
        status: "selesai",
      };
    } else {
      if (!payload.jenis || !payload.durasiMenit || !payload.mulaiAt) {
        return fail("Jenis, durasi, dan waktu mulai wajib diisi bila tidak memakai Sesi terjadwal.");
      }
      const vJenis = validasiJenisSesi(payload.jenis);
      if (!vJenis.valid) return fail(vJenis.errors.join(" "));
      if (!(payload.durasiMenit > 0)) return fail("Durasi sesi harus lebih dari 0 menit.");
      sesi = {
        id: this.storage.nextId("sesi"),
        athleteId: athlete.id,
        teamId: athlete.teamId,
        tanggal: tanggalDiZona(payload.mulaiAt, team.timezone),
        jenis: payload.jenis,
        durasiMenit: payload.durasiMenit,
        rpeAktual: payload.rpeAktual,
        mulaiAt: payload.mulaiAt,
        selesaiAt: payload.selesaiAt ?? now,
        status: "selesai",
        createdBy: actor.userId,
        createdAt: now,
      };
    }
    this.storage.saveSesi(sesi);
    const skorHarian = this.hitungDanSimpanSkorHarian(athlete.id, sesi.tanggal);
    this.audit(actor, "catatSesi", "athlete", athlete.id, sesi.id);
    return ok({ sesi, skorHarian });
  }

  // ───────────────────────── Skor ─────────────────────────

  /**
   * Menghitung ulang Skor Harian satu hari dari data yang tersimpan. Skor
   * hari lain tidak disentuh, sehingga perubahan konfigurasi tidak mengubah
   * skor historis.
   */
  private hitungDanSimpanSkorHarian(athleteId: string, tanggal: string): DailyScore {
    const athlete = this.storage.getAthlete(athleteId)!;
    const config = resolveScoreConfig(this.storage.getTeam(athlete.teamId));
    const checkIn = this.storage.getCheckIn(athleteId, tanggal);

    const baselineWellness = hitungBaseline(
      this.riwayatCheckIn(athleteId, tanggal, (c) => hitungWellnessScore(c.items))
    );
    const baselineTidur = hitungBaseline(
      this.riwayatCheckIn(athleteId, tanggal, (c) => hitungIndeksTidur(c.items))
    );

    const wellnessHariIni = checkIn ? hitungWellnessScore(checkIn.items) : null;
    const inputs: ComponentInput[] = [
      { key: "wellness", nilaiHariIni: wellnessHariIni, baseline: baselineWellness, lebihTinggiLebihBaik: true },
      {
        key: "tidur",
        nilaiHariIni: checkIn ? hitungIndeksTidur(checkIn.items) : null,
        baseline: baselineTidur,
        lebihTinggiLebihBaik: true,
      },
      // Tahap 2: median waktu reaksi dari Tes Reaksi.
      { key: "reaksi", nilaiHariIni: null, baseline: BASELINE_KOSONG, lebihTinggiLebihBaik: false },
      // Tahap 3: ln(HRV) dan RHR dari Data Wearable.
      { key: "fisiologis", nilaiHariIni: null, baseline: BASELINE_KOSONG, lebihTinggiLebihBaik: true },
      this.inputBeban(athleteId, tanggal),
    ];

    const { readiness, komponen, jumlahTersedia } = hitungReadiness(inputs, config);
    const { status, reason } = tentukanStatus({
      readiness,
      jumlahTersedia,
      wellnessTersediaHariIni: wellnessHariIni !== null,
      baselineUtamaSiap: baselineWellness.ready,
      config,
    });

    const skor: DailyScore = {
      athleteId,
      tanggal,
      wellnessScore: wellnessHariIni,
      readiness: status === "abu_abu" ? null : readiness,
      status,
      komponen,
      formulaVersion: SKOR_FORMULA_VERSION,
      configUsed: config,
      computedAt: this.clock.nowISO(),
      statusReason: reason,
    };
    this.storage.saveDailyScore(skor);
    return skor;
  }

  private riwayatCheckIn(
    athleteId: string,
    tanggal: string,
    extract: (c: CheckIn) => number
  ): number[] {
    return this.storage
      .listCheckInsByAthlete(
        athleteId,
        tambahHari(tanggal, -JUMLAH_HARI_BASELINE),
        tambahHari(tanggal, -1)
      )
      .map(extract);
  }

  /**
   * Beban dua mode (rumus v1.1). Mode Garmin dipakai bila hari ini ada data
   * Garmin dan baseline Garmin sudah siap (minimal 7 hari); selain itu
   * mode manual dari RPE x menit. Mode berbeda tidak dicampur dalam satu baseline.
   */
  private inputBeban(athleteId: string, tanggal: string): ComponentInput {
    const garminHariIni = this.bebanGarmin3Hari(athleteId, tanggal);
    if (garminHariIni !== null) {
      const baseline = hitungBaseline(this.riwayatBebanGarmin(athleteId, tanggal));
      if (baseline.ready) {
        return {
          key: "beban",
          nilaiHariIni: garminHariIni,
          baseline,
          lebihTinggiLebihBaik: false,
          minStd: MIN_STD_BEBAN_GARMIN,
          sumber: "garmin",
        };
      }
    }
    return {
      key: "beban",
      nilaiHariIni: this.beban3Hari(athleteId, tanggal),
      baseline: hitungBaseline(this.riwayatBeban(athleteId, tanggal)),
      lebihTinggiLebihBaik: false,
      sumber: "manual",
    };
  }

  /** Total menit intensitas Garmin hari ini dan 2 hari sebelumnya; null bila hari ini tidak ada data Garmin. */
  private bebanGarmin3Hari(athleteId: string, tanggal: string): number | null {
    const data = this.storage.listDataWearableByAthlete(athleteId, tambahHari(tanggal, -2), tanggal);
    const hariIni = data.find((d) => d.tanggal === tanggal);
    if (!hariIni || hariIni.menitIntensitas === null) return null;
    return data.reduce((sum, d) => sum + (d.menitIntensitas ?? 0), 0);
  }

  private riwayatBebanGarmin(athleteId: string, tanggal: string): number[] {
    const hasil: number[] = [];
    for (let i = JUMLAH_HARI_BASELINE; i >= 1; i--) {
      const v = this.bebanGarmin3Hari(athleteId, tambahHari(tanggal, -i));
      if (v !== null) hasil.push(v);
    }
    return hasil;
  }

  /** Jumlah beban sRPE (RPE x menit) dari Sesi yang sudah diisi RPE, hari ini dan 2 hari sebelumnya. */
  private beban3Hari(athleteId: string, tanggal: string): number {
    return this.storage
      .listSesiByAthlete(athleteId, tambahHari(tanggal, -2), tanggal)
      .filter((s) => s.rpeAktual !== undefined)
      .reduce((sum, s) => sum + (s.rpeAktual as number) * s.durasiMenit, 0);
  }

  /**
   * Baseline Beban hanya memakai hari-hari yang punya Check-in, agar hari
   * sebelum atlet bergabung (tanpa data apa pun) tidak terhitung sebagai
   * beban nol.
   */
  private riwayatBeban(athleteId: string, tanggal: string): number[] {
    return this.storage
      .listCheckInsByAthlete(
        athleteId,
        tambahHari(tanggal, -JUMLAH_HARI_BASELINE),
        tambahHari(tanggal, -1)
      )
      .map((c) => this.beban3Hari(athleteId, c.tanggal));
  }

  ubahKonfigurasiSkor(
    actor: Actor,
    payload: { bobot?: Partial<ScoreConfig["bobot"]>; ambangMerah?: number; ambangKuning?: number }
  ): CommandResult<ScoreConfig> {
    const cek = cekPeran(actor, ["staf_pelatih"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const team = this.storage.getTeam(actor.teamId);
    if (!team) return fail("Tim tidak ditemukan.");
    const sebelum = resolveScoreConfig(team);
    const baru: ScoreConfig = {
      bobot: { ...sebelum.bobot, ...(payload.bobot ?? {}) },
      ambangMerah: payload.ambangMerah ?? sebelum.ambangMerah,
      ambangKuning: payload.ambangKuning ?? sebelum.ambangKuning,
      minStdDev: sebelum.minStdDev,
    };
    const v = validasiKonfigurasiSkor(baru);
    if (!v.valid) return fail(v.errors.join(" "));
    this.storage.saveTeam({ ...team, scoreConfig: baru });
    this.audit(
      actor,
      "ubahKonfigurasiSkor",
      "team",
      team.id,
      JSON.stringify({ sebelum, sesudah: baru })
    );
    return ok(baru);
  }

  skorHarian(actor: Actor, payload: { athleteId: string; tanggal: string }): CommandResult<DailyScore> {
    const akses = this.cekBacaSkorIndividu(actor, payload.athleteId);
    if (!akses.ok) return akses;
    const skor = this.storage.getDailyScore(payload.athleteId, payload.tanggal);
    if (!skor) return fail("Skor Harian untuk tanggal ini belum tersedia.");
    return ok(skor);
  }

  trenAtlet(
    actor: Actor,
    payload: { athleteId: string; dari: string; sampai: string }
  ): CommandResult<DailyScore[]> {
    const akses = this.cekBacaSkorIndividu(actor, payload.athleteId);
    if (!akses.ok) return akses;
    return ok(this.storage.listDailyScoresByAthlete(payload.athleteId, payload.dari, payload.sampai));
  }

  private cekBacaSkorIndividu(actor: Actor, athleteId: string): CommandResult<true> {
    if (actor.peran === "manajer_tim") {
      return fail("Manajer Tim hanya melihat agregat skor, bukan skor per atlet.");
    }
    if (actor.peran === "atlet" && actor.athleteId !== athleteId) {
      return fail("Atlet hanya bisa melihat skornya sendiri.");
    }
    const athlete = this.storage.getAthlete(athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    return ok(true);
  }

  papanTim(actor: Actor, payload: { tanggal: string }): CommandResult<BarisPapanTim[]> {
    const cek = cekPeran(actor, ["staf_pelatih", "tim_support"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const baris = this.storage
      .listAthletesByTeam(actor.teamId)
      .filter((a) => !a.archived)
      .map((a): BarisPapanTim => {
        const skor = this.storage.getDailyScore(a.id, payload.tanggal);
        const sudahCheckIn = !!this.storage.getCheckIn(a.id, payload.tanggal);
        return {
          athleteId: a.id,
          nama: a.nama,
          sudahCheckIn,
          status: skor?.status ?? "abu_abu",
          statusReason: skor?.statusReason ?? "Check-in hari ini belum terisi.",
          readiness: skor?.readiness ?? null,
          wellnessScore: skor?.wellnessScore ?? null,
          komponen: skor?.komponen ?? {},
        };
      });
    baris.sort(
      (a, b) => URUTAN_STATUS[a.status] - URUTAN_STATUS[b.status] || a.nama.localeCompare(b.nama)
    );
    return ok(baris);
  }

  // ───────────────────────── Catatan, Thread, Tindak Lanjut ─────────────────────────

  tulisCatatan(
    actor: Actor,
    payload: {
      athleteId?: string;
      body: string;
      visibilitas: Visibilitas;
      kategori?: string[];
      attachments?: string[];
    }
  ): CommandResult<Catatan> {
    const cek = bisaMenulisVisibilitas(actor, payload.visibilitas);
    if (!cek.diizinkan) return fail(cek.alasan!);
    if (payload.athleteId) {
      const athlete = this.storage.getAthlete(payload.athleteId);
      if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    } else if (payload.visibilitas === "bersama_atlet") {
      return fail("Catatan Bersama Atlet harus terkait dengan satu Atlet.");
    }
    if (!payload.body.trim()) return fail("Isi Catatan tidak boleh kosong.");
    const kategori = payload.kategori ?? [];
    if (!kategoriValid(kategori)) return fail("Kategori Catatan tidak dikenal.");

    const now = this.clock.nowISO();
    const catatan: Catatan = {
      id: this.storage.nextId("catatan"),
      teamId: actor.teamId,
      athleteId: payload.athleteId,
      authorId: actor.userId,
      body: payload.body,
      visibilitas: payload.visibilitas,
      kategori,
      attachments: payload.attachments ?? [],
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    this.storage.saveCatatan(catatan);
    this.audit(actor, "tulisCatatan", "catatan", catatan.id);
    this.beritahuSebutan(actor, catatan, payload.body);
    return ok(catatan);
  }

  ubahCatatan(
    actor: Actor,
    payload: { catatanId: string; body?: string; visibilitas?: Visibilitas }
  ): CommandResult<Catatan> {
    const existing = this.storage.getCatatan(payload.catatanId);
    if (!existing || existing.teamId !== actor.teamId) return fail("Catatan tidak ditemukan.");
    if (existing.authorId !== actor.userId) return fail("Catatan hanya bisa diubah oleh penulisnya.");
    if (payload.visibilitas) {
      const cek = bisaMenulisVisibilitas(actor, payload.visibilitas);
      if (!cek.diizinkan) return fail(cek.alasan!);
    }
    const now = this.clock.nowISO();
    const updated: Catatan = {
      ...existing,
      body: payload.body ?? existing.body,
      visibilitas: payload.visibilitas ?? existing.visibilitas,
      updatedAt: now,
      history: [
        ...existing.history,
        { body: existing.body, visibilitas: existing.visibilitas, editedAt: existing.updatedAt },
      ],
    };
    this.storage.saveCatatan(updated);
    this.audit(actor, "ubahCatatan", "catatan", updated.id);
    return ok(updated);
  }

  balasThread(actor: Actor, payload: { catatanId: string; body: string }): CommandResult<ThreadReply> {
    const catatan = this.storage.getCatatan(payload.catatanId);
    if (!catatan || catatan.teamId !== actor.teamId || !bisaMembacaCatatan(actor, catatan)) {
      return fail("Catatan tidak ditemukan atau tidak bisa diakses.");
    }
    if (!payload.body.trim()) return fail("Isi balasan tidak boleh kosong.");
    const reply: ThreadReply = {
      id: this.storage.nextId("balasan"),
      catatanId: catatan.id,
      authorId: actor.userId,
      body: payload.body,
      mentions: ambilSebutan(payload.body),
      createdAt: this.clock.nowISO(),
    };
    this.storage.saveThreadReply(reply);
    this.audit(actor, "balasThread", "catatan", catatan.id);
    this.beritahuSebutan(actor, catatan, payload.body);
    return ok(reply);
  }

  thread(actor: Actor, payload: { catatanId: string }): CommandResult<ThreadReply[]> {
    const catatan = this.storage.getCatatan(payload.catatanId);
    if (!catatan || catatan.teamId !== actor.teamId || !bisaMembacaCatatan(actor, catatan)) {
      return fail("Catatan tidak ditemukan atau tidak bisa diakses.");
    }
    return ok(this.storage.listThreadReplies(catatan.id));
  }

  buatTindakLanjut(
    actor: Actor,
    payload: { catatanId: string; ownerId: string; tenggat: string }
  ): CommandResult<Catatan> {
    const cek = cekPeran(actor, ["staf_pelatih", "tim_support"]);
    if (!cek.diizinkan) return fail(cek.alasan!);
    const catatan = this.storage.getCatatan(payload.catatanId);
    if (!catatan || catatan.teamId !== actor.teamId || !bisaMembacaCatatan(actor, catatan)) {
      return fail("Catatan tidak ditemukan atau tidak bisa diakses.");
    }
    const owner = this.storage.getMembership(payload.ownerId, actor.teamId);
    if (!owner || !["staf_pelatih", "tim_support"].includes(owner.peran)) {
      return fail("Penanggung jawab harus anggota staf Tim ini.");
    }
    if (!bisaMembacaCatatan({ ...owner, userId: owner.userId }, catatan)) {
      return fail("Penanggung jawab tidak berhak membaca Catatan ini.");
    }
    const now = this.clock.nowISO();
    const updated: Catatan = {
      ...catatan,
      tindakLanjut: { ownerId: payload.ownerId, dueDate: payload.tenggat, status: "terbuka", createdAt: now },
      updatedAt: now,
    };
    this.storage.saveCatatan(updated);
    this.audit(actor, "buatTindakLanjut", "catatan", catatan.id, payload.ownerId);
    if (payload.ownerId !== actor.userId) {
      this.kirimNotifikasi({
        userId: payload.ownerId,
        teamId: actor.teamId,
        type: "tindak_lanjut",
        message: `${actor.userId} menugaskan Tindak Lanjut kepada Anda, tenggat ${payload.tenggat}.`,
        relatedId: catatan.id,
      });
    }
    return ok(updated);
  }

  selesaikanTindakLanjut(actor: Actor, payload: { catatanId: string }): CommandResult<Catatan> {
    const catatan = this.storage.getCatatan(payload.catatanId);
    if (!catatan || catatan.teamId !== actor.teamId) return fail("Catatan tidak ditemukan.");
    if (!catatan.tindakLanjut) return fail("Catatan ini bukan Tindak Lanjut.");
    if (catatan.tindakLanjut.ownerId !== actor.userId) {
      return fail("Hanya penanggung jawab yang bisa menyelesaikan Tindak Lanjut.");
    }
    const now = this.clock.nowISO();
    const updated: Catatan = {
      ...catatan,
      tindakLanjut: { ...catatan.tindakLanjut, status: "selesai", selesaiAt: now },
      updatedAt: now,
    };
    this.storage.saveCatatan(updated);
    this.audit(actor, "selesaikanTindakLanjut", "catatan", catatan.id);
    return ok(updated);
  }

  tindakLanjutSaya(actor: Actor): CommandResult<Catatan[]> {
    return ok(
      this.storage
        .listCatatanByTeam(actor.teamId)
        .filter(
          (c) =>
            c.tindakLanjut?.ownerId === actor.userId &&
            c.tindakLanjut.status === "terbuka" &&
            bisaMembacaCatatan(actor, c)
        )
        .sort((a, b) => a.tindakLanjut!.dueDate.localeCompare(b.tindakLanjut!.dueDate))
    );
  }

  cariCatatan(
    actor: Actor,
    payload: {
      athleteId?: string;
      authorId?: string;
      kategori?: string;
      dari?: string;
      sampai?: string;
    } = {}
  ): CommandResult<Catatan[]> {
    const team = this.storage.getTeam(actor.teamId);
    if (!team) return fail("Tim tidak ditemukan.");
    const tgl = (c: Catatan) => tanggalDiZona(c.createdAt, team.timezone);
    return ok(
      this.storage
        .listCatatanByTeam(actor.teamId)
        .filter((c) => bisaMembacaCatatan(actor, c))
        .filter((c) => !payload.athleteId || c.athleteId === payload.athleteId)
        .filter((c) => !payload.authorId || c.authorId === payload.authorId)
        .filter((c) => !payload.kategori || c.kategori.includes(payload.kategori))
        .filter((c) => !payload.dari || tgl(c) >= payload.dari)
        .filter((c) => !payload.sampai || tgl(c) <= payload.sampai)
    );
  }

  private beritahuSebutan(actor: Actor, catatan: Catatan, body: string): void {
    for (const userId of ambilSebutan(body)) {
      if (userId === actor.userId) continue;
      const m = this.storage.getMembership(userId, actor.teamId);
      // Sebutan hanya diteruskan ke anggota yang berhak membaca Catatan itu.
      if (!m || !bisaMembacaCatatan({ ...m }, catatan)) continue;
      this.kirimNotifikasi({
        userId,
        teamId: actor.teamId,
        type: "sebutan",
        message: `${actor.userId} menyebut Anda di sebuah Catatan.`,
        relatedId: catatan.id,
      });
    }
  }

  notifikasiSaya(actor: Actor): CommandResult<Notification[]> {
    return ok(this.storage.listNotificationsByUser(actor.userId).filter((n) => n.teamId === actor.teamId));
  }

  // ───────────────────────── Linimasa & Audit ─────────────────────────

  linimasaAtlet(
    actor: Actor,
    payload: { athleteId: string; dari: string; sampai: string }
  ): CommandResult<LinimasaEvent[]> {
    if (actor.peran === "atlet" && actor.athleteId !== payload.athleteId) {
      return fail("Atlet hanya bisa melihat Linimasa miliknya sendiri.");
    }
    if (actor.peran === "manajer_tim") {
      return fail("Manajer Tim tidak memiliki akses ke Linimasa Atlet.");
    }
    const athlete = this.storage.getAthlete(payload.athleteId);
    if (!athlete || athlete.teamId !== actor.teamId) return fail("Atlet tidak ditemukan.");
    const team = this.storage.getTeam(athlete.teamId)!;

    const events: LinimasaEvent[] = [];
    for (const s of this.storage.listDailyScoresByAthlete(athlete.id, payload.dari, payload.sampai)) {
      events.push({ type: "skor", at: s.computedAt, data: s });
    }
    if (bisaMembacaJawabanCheckIn(actor)) {
      const bolehTeksBebas = bisaMembacaTeksBebasCheckIn(actor, athlete.id);
      for (const c of this.storage.listCheckInsByAthlete(athlete.id, payload.dari, payload.sampai)) {
        events.push({ type: "check_in", at: c.createdAt, data: bolehTeksBebas ? c : sembunyikanTeksBebas(c) });
      }
    }
    for (const s of this.storage.listSesiByAthlete(athlete.id, payload.dari, payload.sampai)) {
      events.push({ type: "sesi", at: s.mulaiAt, data: s });
    }
    for (const c of this.storage.listCatatanByAthlete(athlete.id)) {
      if (!bisaMembacaCatatan(actor, c)) continue;
      const tgl = tanggalDiZona(c.createdAt, team.timezone);
      if (tgl < payload.dari || tgl > payload.sampai) continue;
      events.push({ type: "catatan", at: c.createdAt, data: c });
      for (const r of this.storage.listThreadReplies(c.id)) {
        events.push({ type: "thread_reply", at: r.createdAt, data: r });
      }
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    this.audit(actor, "bacaLinimasa", "athlete", athlete.id);
    return ok(events);
  }

  logAudit(actor: Actor): CommandResult<AuditEntry[]> {
    const semua = this.storage.listAudit(actor.teamId);
    if (this.punyaKontrol(actor)) return ok(semua);
    if (actor.peran === "atlet") {
      return ok(semua.filter((e) => e.targetType === "athlete" && e.targetId === actor.athleteId));
    }
    return fail("Peran ini tidak memiliki akses ke Log Audit.");
  }

  private audit(actor: Actor, action: string, targetType: string, targetId: string, detail?: string): void {
    this.storage.appendAudit({
      id: this.storage.nextId("audit"),
      teamId: actor.teamId,
      actorId: actor.userId,
      action,
      targetType,
      targetId,
      detail,
      at: this.clock.nowISO(),
    });
  }

  private kirimNotifikasi(n: OutgoingNotification): void {
    this.storage.saveNotification({
      id: this.storage.nextId("notif"),
      userId: n.userId,
      teamId: n.teamId,
      type: n.type,
      message: n.message,
      relatedId: n.relatedId,
      at: this.clock.nowISO(),
      read: false,
    });
    void this.notification.send(n);
  }
}

function sembunyikanTeksBebas(c: CheckIn): CheckIn {
  const { catatanBebas: _hidden, history, ...rest } = c;
  return {
    ...rest,
    history: history.map(({ catatanBebas: _h, ...v }) => v),
  };
}
