import { describe, expect, it } from "vitest";
import type { DataWearableInput } from "../src/index.js";
import { tambahHari } from "../src/domain/tanggal.js";
import { type HariPerforma, hitungHarian, hitungIndeksPerforma, jamKeMenitMalam } from "../src/modules/performa.js";
import { data, ditolak, payloadCheckIn, siapkanTim } from "./helpers.js";

const AMBANG = { merah: 35, kuning: 45 };
const AWAL = "2026-10-01";

/** Hari "biasa" dengan sedikit variasi bergantian agar baseline punya simpangan baku. */
function hariBiasa(i: number, ubah: Partial<HariPerforma> = {}): HariPerforma {
  const v = i % 2 === 0 ? 1 : -1;
  return {
    tanggal: tambahHari(AWAL, i),
    tidurDurasi: 450 + 20 * v,
    tidurKualitas: 75 + 5 * v,
    tidurMulai: jamKeMenitMalam("23:30") + 10 * v,
    hrvRmssd: 60 + 4 * v,
    rhr: 58 + v,
    stres: 30 + 4 * v,
    duduk: 420 + 30 * v,
    ...ubah,
  };
}
const riwayat = (n: number, akhir: Partial<HariPerforma> = {}) =>
  Array.from({ length: n }, (_, i) => hariBiasa(i, i === n - 1 ? akhir : {}));
const jendela = (n: number) => [tambahHari(AWAL, n - 3), tambahHari(AWAL, n - 2), tambahHari(AWAL, n - 1)];

describe("Indeks Performa (modul murni)", () => {
  it("jam tidur lewat tengah malam tetap berurutan", () => {
    expect(jamKeMenitMalam("23:40")).toBe(340);
    expect(jamKeMenitMalam("01:10")).toBe(430);
  });

  it("hari biasa terhadap baseline sendiri memberi pita hijau di sekitar 50", () => {
    const r = hitungIndeksPerforma(riwayat(22), jendela(22), AMBANG);
    expect(r.status).toBe("hijau");
    expect(r.skor).toBeGreaterThan(40);
    expect(r.skor).toBeLessThan(60);
  });

  it("arah tanda: stres, denyut istirahat, dan duduk tinggi menurunkan; HRV tinggi menaikkan", () => {
    const n = 22;
    const z = (ubah: Partial<HariPerforma>) => hitungHarian(riwayat(n, ubah), tambahHari(AWAL, n - 1), AMBANG);
    const komp = (h: ReturnType<typeof z>, k: string) => h.komponen.find((x) => x.komponen === k)!.z!;
    expect(komp(z({ stres: 70 }), "stres")).toBeLessThan(-1);
    expect(komp(z({ duduk: 700 }), "duduk")).toBeLessThan(-1);
    expect(komp(z({ rhr: 68, hrvRmssd: 60 }), "pemulihan")).toBeLessThan(-1);
    expect(komp(z({ hrvRmssd: 90, rhr: 58 }), "pemulihan")).toBeGreaterThan(1);
    expect(komp(z({ tidurMulai: jamKeMenitMalam("02:30") }), "tidur")).toBeLessThan(0);
  });

  it("baseline kurang dari 14 hari memberi Data kurang", () => {
    const r = hitungIndeksPerforma(riwayat(10), jendela(10), AMBANG);
    expect(r.status).toBe("abu_abu");
    expect(r.alasan).toMatch(/14 hari/);
  });

  it("kurang dari 2 komponen tersedia memberi Data kurang; komponen hilang dinormalisasi ulang", () => {
    const tanpa = (h: HariPerforma): HariPerforma => ({ ...h, hrvRmssd: null, rhr: null, stres: null, duduk: null });
    const hanyaTidur = riwayat(22).map(tanpa);
    expect(hitungIndeksPerforma(hanyaTidur, jendela(22), AMBANG).status).toBe("abu_abu");
    const tanpaDuduk = riwayat(22).map((h) => ({ ...h, duduk: null }));
    const r = hitungIndeksPerforma(tanpaDuduk, jendela(22), AMBANG);
    expect(r.status).toBe("hijau");
    expect(r.komponen.find((k) => k.komponen === "duduk")!.z).toBeNull();
  });

  it("hari buruk beruntun memberi merah; satu malam buruk diredam rata-rata bergerak", () => {
    const buruk: Partial<HariPerforma> = { tidurDurasi: 300, tidurKualitas: 40, hrvRmssd: 42, rhr: 66, stres: 65, duduk: 650 };
    const tigaHariBuruk = Array.from({ length: 22 }, (_, i) => hariBiasa(i, i >= 19 ? buruk : {}));
    expect(hitungIndeksPerforma(tigaHariBuruk, jendela(22), AMBANG).status).toBe("merah");

    const satuMalam = riwayat(22, buruk);
    const halus = hitungIndeksPerforma(satuMalam, jendela(22), AMBANG).skor!;
    const mentah = 50 + 10 * hitungHarian(satuMalam, tambahHari(AWAL, 21), AMBANG).zGabungan!;
    expect(halus).toBeGreaterThan(mentah);
  });
});

function garmin(athleteId: string, tanggal: string, i: number): DataWearableInput {
  const v = i % 2 === 0 ? 1 : -1;
  return {
    athleteId, tanggal, langkah: 5000, menitIntensitas: 20, kalori: 2200,
    tidur: { durasiMenit: 450 + 20 * v, skor: 75 + 5 * v, mulai: v > 0 ? "23:40" : "23:20", bangun: "07:00" },
    detakJantung: { istirahat: 58 + v, rataRata: 75, maks: 140 }, stres: 30 + 4 * v, spo2: 97,
    bodyBattery: { tertinggi: 80, terendah: 20 }, komposisiTubuh: null, respirasi: 14, tekananDarah: null,
    hrvRmssd: 60 + 4 * v, durasiDudukMenit: 420 + 30 * v,
  };
}

describe("Indeks Performa (layanan)", () => {
  it("staf dan atlet sendiri bisa membaca; Manajer dan atlet lain tidak", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const andi = d.tambahAtlet("andi");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: "rizky", jenis: "wearable" }));
    for (let i = 0; i < 20; i++) {
      data(d.svc.terimaDataWearable(garmin("rizky", d.hariIni(), i)));
      d.majuHari();
    }
    data(d.svc.terimaDataWearable(garmin("rizky", d.hariIni(), 20)));
    const r = data(d.svc.indeksPerforma(d.pelatih, { athleteId: "rizky", tanggal: d.hariIni() }));
    expect(r.status).toBe("hijau");
    expect(r.tren).toHaveLength(7);
    expect(data(d.svc.indeksPerforma(rizky, { athleteId: "rizky", tanggal: d.hariIni() })).skor).toBe(r.skor);
    ditolak(d.svc.indeksPerforma(d.manajer, { athleteId: "rizky", tanggal: d.hariIni() }), /Manajer/);
    ditolak(d.svc.indeksPerforma(andi, { athleteId: "rizky", tanggal: d.hariIni() }), /sendiri/);
    expect(data(d.svc.performaTim(d.fisio, { tanggal: d.hariIni() })).map((p) => p.athleteId)).toContain("rizky");
    ditolak(d.svc.performaTim(d.manajer, { tanggal: d.hariIni() }), /.+/);
  });

  it("tanpa persetujuan wearable, data jam tidak dipakai (hanya tidur dari check-in, jadi Data kurang)", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    for (let i = 0; i < 16; i++) {
      data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ durasiTidur: i % 2 ? 7 : 8 })));
      d.majuHari();
    }
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    const r = data(d.svc.indeksPerforma(d.pelatih, { athleteId: "rizky", tanggal: d.hariIni() }));
    expect(r.status).toBe("abu_abu");
    expect(r.komponen.find((k) => k.komponen === "tidur")!.z).not.toBeNull();
    expect(r.alasan).toMatch(/Hubungkan jam Garmin/);
  });

  it("check-in menyimpan energi, fokus, dan catatan latihan; catatan latihan terbaca Staf Pelatih", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const p = payloadCheckIn({ catatanBebas: "rahasia" });
    const c = data(
      d.svc.kirimCheckIn(rizky, { ...p, items: { ...p.items, energi: 4, fokus: 2 }, catatanLatihan: "  Latihan rotasi 2 jam. " })
    ).checkIn;
    expect(c).toMatchObject({ items: { energi: 4, fokus: 2 }, catatanLatihan: "Latihan rotasi 2 jam." });
    const rentang = { athleteId: "rizky", dari: d.hariIni(), sampai: d.hariIni() };
    const versiPelatih = data(d.svc.linimasaAtlet(d.pelatih, rentang)).find((e) => e.type === "check_in")!.data as typeof c;
    expect(versiPelatih.catatanLatihan).toBe("Latihan rotasi 2 jam.");
    expect(versiPelatih.catatanBebas).toBeUndefined();
    ditolak(d.svc.ubahCheckIn(rizky, { ...p, items: { ...p.items, fokus: 7 } }), /fokus/);
    expect(data(d.svc.subjektifHarian(d.pelatih, { athleteId: "rizky", tanggal: d.hariIni() }))).toEqual({
      mood: 4, energi: 4, fokus: 2, catatanLatihan: "Latihan rotasi 2 jam.",
    });
    ditolak(d.svc.subjektifHarian(d.manajer, { athleteId: "rizky", tanggal: d.hariIni() }), /Manajer/);
  });
});
