import { expect } from "vitest";
import {
  type Actor,
  type CheckInItems,
  type CommandResult,
  FakeClock,
  MemoryNotificationPort,
  MemoryStorage,
  MonitoringService,
  type PetaNyeri,
} from "../src/index.js";

export const TANPA_NYERI: PetaNyeri = {
  leher: 0,
  bahu: 0,
  punggungAtas: 0,
  punggungBawah: 0,
  pergelangan: 0,
  tangan: 0,
  jariKiri: 0,
  jariKanan: 0,
};

/** 07.00 WIB, Senin 2 November 2026. */
export const MULAI = "2026-11-02T00:00:00Z";

export function data<T>(r: CommandResult<T>): T {
  if (!r.ok) throw new Error(`Diharapkan berhasil, ditolak: ${r.reason}`);
  return r.data;
}

export function ditolak<T>(r: CommandResult<T>, pola: RegExp): void {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toMatch(pola);
}

export interface Dunia {
  svc: MonitoringService;
  clock: FakeClock;
  notif: MemoryNotificationPort;
  manajer: Actor;
  pelatih: Actor;
  fisio: Actor;
  psikolog: Actor;
  tambahAtlet(id: string, opsi?: { tanggalLahir?: string; wali?: string; setuju?: boolean }): Actor;
  hariIni(): string;
  majuHari(n?: number): void;
}

export function siapkanTim(): Dunia {
  const storage = new MemoryStorage();
  const clock = new FakeClock(MULAI);
  const notif = new MemoryNotificationPort();
  const svc = new MonitoringService(storage, clock, notif);
  const team = svc.buatTim({ id: "mlbb", nama: "Divisi MLBB", divisi: "MLBB" });

  data(svc.daftarkanManajerAwal({ userId: "manajer", teamId: team.id }));
  const manajer: Actor = { userId: "manajer", teamId: team.id, peran: "manajer_tim" };
  data(svc.undangAnggota(manajer, { userId: "pelatih", peran: "staf_pelatih" }));
  data(svc.undangAnggota(manajer, { userId: "fisio", peran: "tim_support", subPeran: "fisioterapis" }));
  data(svc.undangAnggota(manajer, { userId: "psikolog", peran: "tim_support", subPeran: "psikolog" }));

  return {
    svc,
    clock,
    notif,
    manajer,
    pelatih: { userId: "pelatih", teamId: team.id, peran: "staf_pelatih" },
    fisio: { userId: "fisio", teamId: team.id, peran: "tim_support", subPeran: "fisioterapis" },
    psikolog: { userId: "psikolog", teamId: team.id, peran: "tim_support", subPeran: "psikolog" },
    tambahAtlet(id, opsi = {}) {
      data(
        svc.daftarkanAtlet(manajer, {
          athleteId: id,
          nama: id,
          tanggalLahir: opsi.tanggalLahir ?? "2002-03-15",
          guardianUserId: opsi.wali,
        })
      );
      const atlet: Actor = { userId: id, teamId: team.id, peran: "atlet", athleteId: id };
      if (opsi.setuju !== false) data(svc.berikanPersetujuan(manajer, { athleteId: atlet.athleteId!, jenis: "kuesioner" }));
      return atlet;
    },
    hariIni: () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(clock.nowISO())),
    majuHari: (n = 1) => clock.advanceDays(n),
  };
}

export interface IsianCheckIn {
  /** Enam butir Wellness: kelelahan umum, mata, sakit kepala, stres, mood, motivasi. */
  wellness?: [number, number, number, number, number, number];
  durasiTidur?: number;
  kualitasTidur?: number;
  nyeri?: Partial<PetaNyeri>;
  catatanBebas?: string;
}

export function butir(isian: IsianCheckIn = {}): CheckInItems {
  const [kelelahanUmum, kelelahanMata, sakitKepala, stres, mood, motivasiBerlatih] =
    isian.wellness ?? [4, 4, 4, 4, 4, 4];
  return {
    durasiTidurJam: isian.durasiTidur ?? 8,
    kualitasTidur: isian.kualitasTidur ?? 4,
    kelelahanUmum,
    kelelahanMata,
    sakitKepala,
    stres,
    mood,
    motivasiBerlatih,
  };
}

export function payloadCheckIn(isian: IsianCheckIn = {}) {
  return {
    items: butir(isian),
    petaNyeri: { ...TANPA_NYERI, ...(isian.nyeri ?? {}) },
    screenTimeJamKemarin: 9,
    catatanBebas: isian.catatanBebas,
  };
}

/** Wellness 75 (semua butir 4), indeks tidur 8 x 4 = 32. */
export const HARI_A: IsianCheckIn = { wellness: [4, 4, 4, 4, 4, 4], durasiTidur: 8 };
/** Wellness 50 (semua butir 3), indeks tidur 6 x 4 = 24. */
export const HARI_B: IsianCheckIn = { wellness: [3, 3, 3, 3, 3, 3], durasiTidur: 6 };

/**
 * Delapan hari baseline bergantian A/B: Wellness rata-rata 62,5 SD 12,5;
 * indeks tidur rata-rata 28 SD 4; beban 0 (SD minimum 50 AU).
 */
export function isiBaselineBergantian(d: Dunia, atlet: Actor, hari = 8): void {
  for (let i = 0; i < hari; i++) {
    data(d.svc.kirimCheckIn(atlet, payloadCheckIn(i % 2 === 0 ? HARI_A : HARI_B)));
    d.majuHari();
  }
}
