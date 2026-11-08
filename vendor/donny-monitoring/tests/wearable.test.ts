import { describe, expect, it } from "vitest";
import type { DataWearableInput } from "../src/index.js";
import { data, ditolak, siapkanTim } from "./helpers.js";

function contoh(athleteId: string, tanggal: string, ubah: Partial<DataWearableInput> = {}): DataWearableInput {
  return {
    athleteId,
    tanggal,
    langkah: 6200,
    menitIntensitas: 25,
    tidur: { durasiMenit: 450, skor: 78 },
    kalori: 2350,
    detakJantung: { istirahat: 58, rataRata: 76, maks: 142 },
    stres: 31,
    spo2: 97,
    bodyBattery: { tertinggi: 82, terendah: 18 },
    komposisiTubuh: null,
    respirasi: 14.5,
    tekananDarah: { sistolik: 118, diastolik: 76 },
    ...ubah,
  };
}

describe("Data wearable (Garmin)", () => {
  it("ditolak tanpa persetujuan Data wearable, diterima setelah atlet memberi persetujuan", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(d.svc.terimaDataWearable(contoh("rizky", d.hariIni())), /persetujuan/);
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    const r = data(d.svc.terimaDataWearable(contoh("rizky", d.hariIni())));
    expect(r).toMatchObject({ sumber: "garmin", langkah: 6200, spo2: 97 });
  });

  it("menolak nilai di luar rentang wajar", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    ditolak(d.svc.terimaDataWearable(contoh("rizky", d.hariIni(), { spo2: 140 })), /Pulse Ox/);
    ditolak(d.svc.terimaDataWearable(contoh("rizky", d.hariIni(), { detakJantung: { istirahat: 10, rataRata: 70, maks: 150 } })), /Detak jantung/);
    ditolak(d.svc.terimaDataWearable(contoh("rizky", d.hariIni(), { stres: -1 })), /stres/);
  });

  it("kiriman ulang untuk tanggal yang sama menimpa data sebelumnya", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    data(d.svc.terimaDataWearable(contoh("rizky", d.hariIni())));
    data(d.svc.terimaDataWearable(contoh("rizky", d.hariIni(), { langkah: 9000 })));
    const r = data(d.svc.dataWearableAtlet(d.pelatih, { athleteId: "rizky", dari: d.hariIni(), sampai: d.hariIni() }));
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.langkah).toBe(9000);
  });

  it("akses baca mengikuti aturan skor: staf dan atlet sendiri boleh, Manajer dan atlet lain tidak", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const budi = d.tambahAtlet("budi");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    data(d.svc.terimaDataWearable(contoh("rizky", d.hariIni())));
    const rentang = { athleteId: "rizky", dari: d.hariIni(), sampai: d.hariIni() };
    expect(data(d.svc.dataWearableAtlet(d.fisio, rentang)).data).toHaveLength(1);
    expect(data(d.svc.dataWearableAtlet(rizky, rentang)).persetujuanBerlaku).toBe(true);
    ditolak(d.svc.dataWearableAtlet(d.manajer, rentang), /Manajer/);
    ditolak(d.svc.dataWearableAtlet(budi, rentang), /sendiri/);
  });

  it("wearableTim menandai atlet tanpa persetujuan dan tanpa data", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    d.tambahAtlet("andi");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    data(d.svc.terimaDataWearable(contoh("rizky", d.hariIni())));
    const baris = data(d.svc.wearableTim(d.pelatih, { tanggal: d.hariIni() }));
    expect(baris.find((b) => b.athleteId === "rizky")).toMatchObject({ persetujuanBerlaku: true, data: { langkah: 6200 } });
    expect(baris.find((b) => b.athleteId === "andi")).toMatchObject({ persetujuanBerlaku: false, data: null });
    ditolak(d.svc.wearableTim(d.manajer, { tanggal: d.hariIni() }), /.+/);
  });

  it("menghapus atlet ikut menghapus data wearable-nya", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    data(d.svc.terimaDataWearable(contoh("rizky", d.hariIni())));
    data(d.svc.hapusAtlet(d.manajer, { athleteId: "rizky" }));
    d.tambahAtlet("rizky");
    expect(data(d.svc.dataWearableAtlet(d.pelatih, { athleteId: "rizky", dari: d.hariIni(), sampai: d.hariIni() })).data).toEqual([]);
  });
});
