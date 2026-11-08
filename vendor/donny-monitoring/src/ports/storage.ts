import type {
  Athlete,
  AuditEntry,
  Catatan,
  CheckIn,
  ConsentRecord,
  DailyScore,
  DataWearable,
  GuardianApproval,
  IntegrasiGarmin,
  KoneksiGarmin,
  Laporan,
  Membership,
  Notification,
  Sesi,
  Team,
  ThreadReply,
} from "../domain/types.js";

/**
 * Port Penyimpanan. Satu-satunya cara modul lain membaca/menulis data
 * persisten. Diganti versi memori (lihat adapters/memoryStorage.ts) saat tes,
 * sehingga tes tidak bergantung pada database sungguhan.
 */
export interface StoragePort {
  // Team & membership
  getTeam(teamId: string): Team | undefined;
  saveTeam(team: Team): void;
  getMembership(userId: string, teamId: string): Membership | undefined;
  saveMembership(m: Membership): void;
  listMembershipsByTeam(teamId: string): Membership[];
  deleteMembership(userId: string, teamId: string): void;

  // Athlete
  getAthlete(athleteId: string): Athlete | undefined;
  saveAthlete(a: Athlete): void;
  listAthletesByTeam(teamId: string): Athlete[];
  /**
   * Menghapus permanen seorang Atlet beserta seluruh datanya: keanggotaan,
   * persetujuan, Check-in, Sesi, Skor Harian, Data Wearable, Laporan, dan
   * Catatan tentang Atlet itu.
   * Log Audit tidak ikut dihapus.
   */
  deleteAthleteCascade(athleteId: string): void;

  // Guardian approval
  getGuardianApproval(athleteId: string): GuardianApproval | undefined;
  saveGuardianApproval(g: GuardianApproval): void;

  // Consent
  getConsent(
    athleteId: string,
    jenis: ConsentRecord["jenis"]
  ): ConsentRecord | undefined;
  saveConsent(c: ConsentRecord): void;

  // Check-in
  getCheckIn(athleteId: string, tanggal: string): CheckIn | undefined;
  saveCheckIn(c: CheckIn): void;
  listCheckInsByAthlete(
    athleteId: string,
    fromTanggal: string,
    toTanggal: string
  ): CheckIn[];

  // Sesi
  getSesi(sesiId: string): Sesi | undefined;
  saveSesi(s: Sesi): void;
  listSesiByAthlete(
    athleteId: string,
    fromTanggal: string,
    toTanggal: string
  ): Sesi[];

  // Daily score
  getDailyScore(athleteId: string, tanggal: string): DailyScore | undefined;
  saveDailyScore(s: DailyScore): void;
  listDailyScoresByAthlete(
    athleteId: string,
    fromTanggal: string,
    toTanggal: string
  ): DailyScore[];

  // Data wearable
  getDataWearable(athleteId: string, tanggal: string): DataWearable | undefined;
  saveDataWearable(d: DataWearable): void;
  listDataWearableByAthlete(athleteId: string, fromTanggal: string, toTanggal: string): DataWearable[];

  // Integrasi Garmin
  getIntegrasiGarmin(teamId: string): IntegrasiGarmin | undefined;
  saveIntegrasiGarmin(i: IntegrasiGarmin): void;
  /** Rahasia disimpan terpisah dari konfigurasi (di produksi: secret manager), hanya bisa ditulis. */
  simpanRahasia(kunci: string, nilai: string): void;
  getKoneksiGarmin(athleteId: string): KoneksiGarmin | undefined;
  saveKoneksiGarmin(k: KoneksiGarmin): void;
  deleteKoneksiGarmin(athleteId: string): void;

  // Laporan atlet
  getLaporan(laporanId: string): Laporan | undefined;
  saveLaporan(l: Laporan): void;
  listLaporanByTeam(teamId: string): Laporan[];

  // Catatan & Thread
  getCatatan(catatanId: string): Catatan | undefined;
  saveCatatan(c: Catatan): void;
  listCatatanByAthlete(athleteId: string): Catatan[];
  listCatatanByTeam(teamId: string): Catatan[];
  saveThreadReply(r: ThreadReply): void;
  listThreadReplies(catatanId: string): ThreadReply[];

  // Notifications
  saveNotification(n: Notification): void;
  listNotificationsByUser(userId: string): Notification[];

  // Audit
  appendAudit(entry: AuditEntry): void;
  listAudit(teamId: string): AuditEntry[];

  // Id generation
  nextId(prefix: string): string;
}
