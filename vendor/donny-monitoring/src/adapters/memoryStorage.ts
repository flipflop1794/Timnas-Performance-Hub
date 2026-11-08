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
import type { StoragePort } from "../ports/storage.js";

function inRange(tanggal: string, from: string, to: string): boolean {
  return tanggal >= from && tanggal <= to;
}

/** Penyimpanan versi memori. Dipakai di tes dan bisa dipakai untuk prototipe lokal. */
export class MemoryStorage implements StoragePort {
  private teams = new Map<string, Team>();
  private memberships = new Map<string, Membership>(); // key `${userId}:${teamId}`
  private athletes = new Map<string, Athlete>();
  private guardianApprovals = new Map<string, GuardianApproval>(); // key athleteId
  private consents = new Map<string, ConsentRecord>(); // key `${athleteId}:${jenis}`
  private checkIns = new Map<string, CheckIn>(); // key `${athleteId}:${tanggal}`
  private sesiList = new Map<string, Sesi>(); // key sesiId
  private dailyScores = new Map<string, DailyScore>(); // key `${athleteId}:${tanggal}`
  private dataWearable = new Map<string, DataWearable>(); // key `${athleteId}:${tanggal}`
  private integrasiGarmin = new Map<string, IntegrasiGarmin>(); // key teamId
  private rahasia = new Map<string, string>();
  private koneksiGarmin = new Map<string, KoneksiGarmin>(); // key athleteId
  private laporanList = new Map<string, Laporan>(); // key laporanId
  private catatanList = new Map<string, Catatan>(); // key catatanId
  private threadReplies = new Map<string, ThreadReply[]>(); // key catatanId
  private notifications = new Map<string, Notification[]>(); // key userId
  private auditByTeam = new Map<string, AuditEntry[]>(); // key teamId
  private counters = new Map<string, number>();

  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }
  saveTeam(team: Team): void {
    this.teams.set(team.id, team);
  }
  getMembership(userId: string, teamId: string): Membership | undefined {
    return this.memberships.get(`${userId}:${teamId}`);
  }
  saveMembership(m: Membership): void {
    this.memberships.set(`${m.userId}:${m.teamId}`, m);
  }
  listMembershipsByTeam(teamId: string): Membership[] {
    return [...this.memberships.values()].filter((m) => m.teamId === teamId);
  }

  deleteMembership(userId: string, teamId: string): void {
    this.memberships.delete(`${userId}:${teamId}`);
  }

  deleteAthleteCascade(athleteId: string): void {
    this.athletes.delete(athleteId);
    for (const [k, m] of this.memberships) if (m.athleteId === athleteId) this.memberships.delete(k);
    this.guardianApprovals.delete(athleteId);
    for (const map of [this.consents, this.checkIns, this.dailyScores, this.dataWearable]) {
      for (const k of map.keys()) if (k.startsWith(`${athleteId}:`)) map.delete(k);
    }
    for (const [k, s] of this.sesiList) if (s.athleteId === athleteId) this.sesiList.delete(k);
    for (const [k, c] of this.catatanList) {
      if (c.athleteId !== athleteId) continue;
      this.catatanList.delete(k);
      this.threadReplies.delete(k);
    }
    this.notifications.delete(athleteId);
    this.koneksiGarmin.delete(athleteId);
    for (const [k, l] of this.laporanList) if (l.athleteId === athleteId) this.laporanList.delete(k);
  }

  getAthlete(athleteId: string): Athlete | undefined {
    return this.athletes.get(athleteId);
  }
  saveAthlete(a: Athlete): void {
    this.athletes.set(a.id, a);
  }
  listAthletesByTeam(teamId: string): Athlete[] {
    return [...this.athletes.values()].filter((a) => a.teamId === teamId);
  }

  getGuardianApproval(athleteId: string): GuardianApproval | undefined {
    return this.guardianApprovals.get(athleteId);
  }
  saveGuardianApproval(g: GuardianApproval): void {
    this.guardianApprovals.set(g.athleteId, g);
  }

  getConsent(
    athleteId: string,
    jenis: ConsentRecord["jenis"]
  ): ConsentRecord | undefined {
    return this.consents.get(`${athleteId}:${jenis}`);
  }
  saveConsent(c: ConsentRecord): void {
    this.consents.set(`${c.athleteId}:${c.jenis}`, c);
  }

  getCheckIn(athleteId: string, tanggal: string): CheckIn | undefined {
    return this.checkIns.get(`${athleteId}:${tanggal}`);
  }
  saveCheckIn(c: CheckIn): void {
    this.checkIns.set(`${c.athleteId}:${c.tanggal}`, c);
  }
  listCheckInsByAthlete(
    athleteId: string,
    fromTanggal: string,
    toTanggal: string
  ): CheckIn[] {
    return [...this.checkIns.values()]
      .filter((c) => c.athleteId === athleteId && inRange(c.tanggal, fromTanggal, toTanggal))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }

  getSesi(sesiId: string): Sesi | undefined {
    return this.sesiList.get(sesiId);
  }
  saveSesi(s: Sesi): void {
    this.sesiList.set(s.id, s);
  }
  listSesiByAthlete(
    athleteId: string,
    fromTanggal: string,
    toTanggal: string
  ): Sesi[] {
    return [...this.sesiList.values()]
      .filter((s) => s.athleteId === athleteId && inRange(s.tanggal, fromTanggal, toTanggal))
      .sort((a, b) => a.mulaiAt.localeCompare(b.mulaiAt));
  }

  getDailyScore(athleteId: string, tanggal: string): DailyScore | undefined {
    return this.dailyScores.get(`${athleteId}:${tanggal}`);
  }
  saveDailyScore(s: DailyScore): void {
    this.dailyScores.set(`${s.athleteId}:${s.tanggal}`, s);
  }
  listDailyScoresByAthlete(
    athleteId: string,
    fromTanggal: string,
    toTanggal: string
  ): DailyScore[] {
    return [...this.dailyScores.values()]
      .filter((s) => s.athleteId === athleteId && inRange(s.tanggal, fromTanggal, toTanggal))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }

  getDataWearable(athleteId: string, tanggal: string): DataWearable | undefined {
    return this.dataWearable.get(`${athleteId}:${tanggal}`);
  }
  saveDataWearable(d: DataWearable): void {
    this.dataWearable.set(`${d.athleteId}:${d.tanggal}`, d);
  }
  listDataWearableByAthlete(athleteId: string, fromTanggal: string, toTanggal: string): DataWearable[] {
    return [...this.dataWearable.values()]
      .filter((d) => d.athleteId === athleteId && inRange(d.tanggal, fromTanggal, toTanggal))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }

  getIntegrasiGarmin(teamId: string): IntegrasiGarmin | undefined {
    return this.integrasiGarmin.get(teamId);
  }
  saveIntegrasiGarmin(i: IntegrasiGarmin): void {
    this.integrasiGarmin.set(i.teamId, i);
  }
  simpanRahasia(kunci: string, nilai: string): void {
    this.rahasia.set(kunci, nilai);
  }
  getKoneksiGarmin(athleteId: string): KoneksiGarmin | undefined {
    return this.koneksiGarmin.get(athleteId);
  }
  saveKoneksiGarmin(k: KoneksiGarmin): void {
    this.koneksiGarmin.set(k.athleteId, k);
  }
  deleteKoneksiGarmin(athleteId: string): void {
    this.koneksiGarmin.delete(athleteId);
  }

  getLaporan(laporanId: string): Laporan | undefined {
    return this.laporanList.get(laporanId);
  }
  saveLaporan(l: Laporan): void {
    this.laporanList.set(l.id, l);
  }
  listLaporanByTeam(teamId: string): Laporan[] {
    return [...this.laporanList.values()]
      .filter((l) => l.teamId === teamId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getCatatan(catatanId: string): Catatan | undefined {
    return this.catatanList.get(catatanId);
  }
  saveCatatan(c: Catatan): void {
    this.catatanList.set(c.id, c);
  }
  listCatatanByAthlete(athleteId: string): Catatan[] {
    return [...this.catatanList.values()]
      .filter((c) => c.athleteId === athleteId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  listCatatanByTeam(teamId: string): Catatan[] {
    return [...this.catatanList.values()]
      .filter((c) => c.teamId === teamId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  saveThreadReply(r: ThreadReply): void {
    const list = this.threadReplies.get(r.catatanId) ?? [];
    list.push(r);
    this.threadReplies.set(r.catatanId, list);
  }
  listThreadReplies(catatanId: string): ThreadReply[] {
    return [...(this.threadReplies.get(catatanId) ?? [])];
  }

  saveNotification(n: Notification): void {
    const list = this.notifications.get(n.userId) ?? [];
    list.push(n);
    this.notifications.set(n.userId, list);
  }
  listNotificationsByUser(userId: string): Notification[] {
    return [...(this.notifications.get(userId) ?? [])];
  }

  appendAudit(entry: AuditEntry): void {
    const list = this.auditByTeam.get(entry.teamId) ?? [];
    list.push(entry);
    this.auditByTeam.set(entry.teamId, list);
  }
  listAudit(teamId: string): AuditEntry[] {
    return [...(this.auditByTeam.get(teamId) ?? [])];
  }

  nextId(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}_${next}`;
  }
}
