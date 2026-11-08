import { describe, expect, it } from "vitest";
import type { Actor } from "../src/index.js";
import { data, ditolak, HARI_A, HARI_B, payloadCheckIn, siapkanTim } from "./helpers.js";

describe("Papan Tim", () => {
  it("mengurutkan Merah, Kuning, Abu-abu, lalu Hijau, dan menandai siapa yang belum Check-in", () => {
    const d = siapkanTim();
    const atlet: Record<string, Actor> = {
      hijau: d.tambahAtlet("andi"),
      merah: d.tambahAtlet("budi"),
      kuning: d.tambahAtlet("citra"),
      belum: d.tambahAtlet("dewa"),
    };
    for (let i = 0; i < 8; i++) {
      for (const a of Object.values(atlet)) {
        data(d.svc.kirimCheckIn(a, payloadCheckIn(i % 2 === 0 ? HARI_A : HARI_B)));
      }
      d.majuHari();
    }
    data(d.svc.kirimCheckIn(atlet.hijau!, payloadCheckIn({ wellness: [4, 4, 4, 3, 3, 3], durasiTidur: 7 })));
    data(d.svc.kirimCheckIn(atlet.merah!, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 5 })));
    data(d.svc.kirimCheckIn(atlet.kuning!, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 7 })));

    const papan = data(d.svc.papanTim(d.pelatih, { tanggal: d.hariIni() }));
    expect(papan.map((b) => [b.nama, b.status, b.sudahCheckIn])).toEqual([
      ["budi", "merah", true],
      ["citra", "kuning", true],
      ["dewa", "abu_abu", false],
      ["andi", "hijau", true],
    ]);
    expect(papan[0]?.komponen.wellness?.z).toBeCloseTo(-2, 10);
  });
});

describe("Log Audit", () => {
  it("membaca Linimasa menambah entri Log Audit yang bisa dibaca Manajer Tim", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    data(d.svc.linimasaAtlet(d.pelatih, { athleteId: "rizky", dari: "2026-11-01", sampai: "2026-11-30" }));
    const entri = data(d.svc.logAudit(d.manajer)).filter((e) => e.action === "bacaLinimasa");
    expect(entri).toEqual([
      expect.objectContaining({ actorId: "pelatih", targetType: "athlete", targetId: "rizky" }),
    ]);
  });

  it("Atlet melihat entri Log Audit tentang datanya sendiri saja; Staf Pelatih tidak punya akses", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    d.tambahAtlet("budi");
    data(d.svc.linimasaAtlet(d.pelatih, { athleteId: "rizky", dari: "2026-11-01", sampai: "2026-11-30" }));
    data(d.svc.linimasaAtlet(d.pelatih, { athleteId: "budi", dari: "2026-11-01", sampai: "2026-11-30" }));

    const milikRizky = data(d.svc.logAudit(rizky));
    expect(milikRizky.every((e) => e.targetId === "rizky")).toBe(true);
    expect(milikRizky.some((e) => e.action === "bacaLinimasa" && e.actorId === "pelatih")).toBe(true);
    ditolak(d.svc.logAudit(d.pelatih), /tidak memiliki akses/);
  });
});

describe("Linimasa Atlet", () => {
  it("menyusun Check-in, Sesi, skor, Catatan, dan balasan Thread secara kronologis", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    d.clock.advanceHours(1);
    const mulaiScrim = d.clock.nowISO();
    d.clock.advanceHours(1);
    data(d.svc.catatSesi(rizky, { jenis: "scrim", durasiMenit: 60, mulaiAt: mulaiScrim, rpeAktual: 6 }));
    d.clock.advanceHours(1);
    const c = data(d.svc.tulisCatatan(d.pelatih, { athleteId: "rizky", body: "Bagus", visibilitas: "staf" }));
    d.clock.advanceHours(1);
    data(d.svc.balasThread(d.fisio, { catatanId: c.id, body: "Setuju" }));

    const urutan = data(
      d.svc.linimasaAtlet(d.pelatih, { athleteId: "rizky", dari: "2026-11-02", sampai: "2026-11-02" })
    ).map((e) => e.type);
    expect(urutan).toEqual(["check_in", "sesi", "skor", "catatan", "thread_reply"]);
  });
});

describe("Info dan anggota Tim", () => {
  it("memberi konfigurasi skor yang berlaku ke semua anggota", () => {
    const d = siapkanTim();
    const atlet = d.tambahAtlet("andi");
    data(d.svc.ubahKonfigurasiSkor(d.pelatih, { ambangMerah: 30 }));
    const info = data(d.svc.infoTim(atlet));
    expect(info.nama).toBe("Divisi MLBB");
    expect(info.scoreConfigBerlaku.ambangMerah).toBe(30);
    expect(info.scoreConfigBerlaku.ambangKuning).toBe(45);
  });

  it("menolak infoTim dari pengguna yang bukan anggota", () => {
    const d = siapkanTim();
    ditolak(d.svc.infoTim({ userId: "orang_luar", teamId: "mlbb", peran: "staf_pelatih" }), /tidak ditemukan/);
  });

  it("memberi daftar anggota ke staf dan Manajer, tetapi tidak ke Atlet", () => {
    const d = siapkanTim();
    const atlet = d.tambahAtlet("andi");
    const hasil = data(d.svc.anggotaTim(d.manajer));
    expect(hasil.atlet.map((a) => a.id)).toEqual(["andi"]);
    expect(hasil.anggota.map((m) => m.userId).sort()).toEqual(["andi", "fisio", "manajer", "pelatih", "psikolog"]);
    data(d.svc.anggotaTim(d.fisio));
    ditolak(d.svc.anggotaTim(atlet), /tidak berwenang/);
  });
});
