import { describe, expect, it } from "vitest";
import { data, ditolak, isiBaselineBergantian, payloadCheckIn, siapkanTim } from "./helpers.js";
import { SKOR_FORMULA_VERSION } from "../src/modules/skor.js";

describe("Skor", () => {
  it("Wellness Score adalah rata-rata enam butir 1-5 yang diskalakan ke 0-100", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const hasil = data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [5, 4, 4, 3, 3, 2] })));
    // rata-rata 3,5 -> (3,5 - 1) / 4 x 100 = 62,5
    expect(hasil.skorHarian.wellnessScore).toBeCloseTo(62.5, 10);
  });

  it("kualitas tidur tidak masuk Wellness Score", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const hasil = data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ kualitasTidur: 1 })));
    expect(hasil.skorHarian.wellnessScore).toBe(75);
  });

  it("Readiness Abu-abu sampai atlet punya 7 hari data valid", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    for (let hari = 1; hari <= 7; hari++) {
      const skor = data(d.svc.kirimCheckIn(rizky, payloadCheckIn())).skorHarian;
      expect(skor.status).toBe("abu_abu");
      expect(skor.readiness).toBeNull();
      d.majuHari();
    }
    const hariKe8 = data(d.svc.kirimCheckIn(rizky, payloadCheckIn())).skorHarian;
    expect(hariKe8.status).not.toBe("abu_abu");
  });

  it("Readiness tepat 50 dan Hijau bila semua komponen sama dengan baseline", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    isiBaselineBergantian(d, rizky);
    // Wellness 62,5 (jumlah butir 21), indeks tidur 7 x 4 = 28, beban 0
    const skor = data(
      d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [4, 4, 4, 3, 3, 3], durasiTidur: 7 }))
    ).skorHarian;
    expect(skor.readiness).toBeCloseTo(50, 10);
    expect(skor.status).toBe("hijau");
  });

  it("Readiness tepat 30 dan Merah saat semua komponen tersedia 2 SD lebih buruk dari baseline", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    isiBaselineBergantian(d, rizky);
    // Wellness 37,5 = 62,5 - 2 x 12,5; indeks tidur 20 = 28 - 2 x 4
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 5 })));
    // Beban 100 AU = 0 + 2 x SD minimum 50
    const skor = data(
      d.svc.catatSesi(rizky, { jenis: "scrim", durasiMenit: 20, mulaiAt: d.clock.nowISO(), rpeAktual: 5 })
    ).skorHarian;
    expect(skor.komponen.wellness?.z).toBeCloseTo(-2, 10);
    expect(skor.komponen.tidur?.z).toBeCloseTo(-2, 10);
    expect(skor.komponen.beban?.z).toBeCloseTo(-2, 10);
    expect(skor.readiness).toBeCloseTo(30, 10);
    expect(skor.status).toBe("merah");
  });

  it("Readiness Kuning bila hanya Wellness 2 SD lebih buruk", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    isiBaselineBergantian(d, rizky);
    const skor = data(
      d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 7 }))
    ).skorHarian;
    // 50 + 10 x (0,35 x -2) / (0,35 + 0,15 + 0,10) = 38,33
    expect(skor.readiness).toBeCloseTo(50 - 70 / 6, 10);
    expect(skor.status).toBe("kuning");
  });

  it("komponen tanpa data dikeluarkan dan bobot sisanya dinormalisasi ulang", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    isiBaselineBergantian(d, rizky);
    const skor = data(
      d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 5 }))
    ).skorHarian;
    expect(skor.komponen.reaksi?.tersedia).toBe(false);
    expect(skor.komponen.fisiologis?.tersedia).toBe(false);
    // (0,35 x -2 + 0,15 x -2 + 0,10 x 0) / 0,60 = -1,667 -> 33,33
    expect(skor.readiness).toBeCloseTo(50 - 100 / 6, 10);
  });

  it("skor-z dibatasi ±3", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    isiBaselineBergantian(d, rizky);
    const skor = data(
      d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [1, 1, 1, 1, 1, 1], durasiTidur: 7 }))
    ).skorHarian;
    expect(skor.komponen.wellness?.z).toBe(-3);
  });

  it("Check-in yang terlambat masuk menghitung ulang skor hari itu", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    isiBaselineBergantian(d, rizky);
    const tanggal = d.hariIni();
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [4, 4, 4, 3, 3, 3], durasiTidur: 7 })));
    data(d.svc.ubahCheckIn(rizky, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 7 })));
    const skor = data(d.svc.skorHarian(d.pelatih, { athleteId: "rizky", tanggal }));
    expect(skor.status).toBe("kuning");
  });

  it("perubahan bobot oleh Staf Pelatih tidak mengubah skor hari sebelumnya, dan setiap skor menyimpan versi rumus", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    isiBaselineBergantian(d, rizky);
    const kemarin = d.hariIni();
    const skorKemarin = data(
      d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 7 }))
    ).skorHarian;

    data(d.svc.ubahKonfigurasiSkor(d.pelatih, { bobot: { wellness: 0.5 } }));
    d.majuHari();
    const skorHariIni = data(
      d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [3, 3, 3, 2, 2, 2], durasiTidur: 7 }))
    ).skorHarian;

    const tersimpanKemarin = data(d.svc.skorHarian(d.pelatih, { athleteId: "rizky", tanggal: kemarin }));
    expect(tersimpanKemarin.readiness).toBe(skorKemarin.readiness);
    expect(tersimpanKemarin.configUsed.bobot.wellness).toBe(0.35);
    expect(skorHariIni.configUsed.bobot.wellness).toBe(0.5);
    expect(tersimpanKemarin.formulaVersion).toBe(SKOR_FORMULA_VERSION);
    expect(skorHariIni.formulaVersion).toBe(SKOR_FORMULA_VERSION);
  });

  it("perubahan bobot dan ambang di luar batas ditolak, dan perubahan yang sah tercatat di Log Audit", () => {
    const d = siapkanTim();
    ditolak(d.svc.ubahKonfigurasiSkor(d.pelatih, { bobot: { wellness: 0.6 } }), /0,5/);
    ditolak(d.svc.ubahKonfigurasiSkor(d.pelatih, { ambangMerah: 24 }), /±10/);
    ditolak(d.svc.ubahKonfigurasiSkor(d.fisio, { ambangKuning: 50 }), /tidak berwenang/);

    data(d.svc.ubahKonfigurasiSkor(d.pelatih, { ambangKuning: 50 }));
    const log = data(d.svc.logAudit(d.manajer)).filter((e) => e.action === "ubahKonfigurasiSkor");
    expect(log).toHaveLength(1);
    expect(log[0]?.actorId).toBe("pelatih");
    expect(log[0]?.detail).toContain('"ambangKuning":50');
  });
});
