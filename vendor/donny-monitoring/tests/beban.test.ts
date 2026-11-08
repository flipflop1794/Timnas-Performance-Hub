import { describe, expect, it } from "vitest";
import type { Actor, DataWearableInput } from "../src/index.js";
import { data, type Dunia, payloadCheckIn, siapkanTim } from "./helpers.js";

function garmin(athleteId: string, tanggal: string, menitIntensitas: number): DataWearableInput {
  return {
    athleteId, tanggal, langkah: 5000, menitIntensitas, tidur: null, kalori: null, detakJantung: null, stres: null,
    spo2: null, bodyBattery: null, komposisiTubuh: null, respirasi: null, tekananDarah: null,
  };
}

/** Check-in harian selama `hari` hari; bila `menit` diberikan, data Garmin ikut dikirim tiap hari. */
function jalankanHari(d: Dunia, atlet: Actor, hari: number, menit?: (i: number) => number): void {
  for (let i = 0; i < hari; i++) {
    data(d.svc.kirimCheckIn(atlet, payloadCheckIn({ wellness: i % 2 ? [3, 3, 3, 3, 3, 3] : [4, 4, 4, 4, 4, 4] })));
    if (menit) data(d.svc.terimaDataWearable(garmin(atlet.athleteId!, d.hariIni(), menit(i))));
    d.majuHari();
  }
}

describe("Beban dua mode (rumus v1.1)", () => {
  it("tanpa data Garmin, Beban memakai mode manual (RPE x menit)", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    jalankanHari(d, rizky, 8);
    const skor = data(d.svc.kirimCheckIn(rizky, payloadCheckIn())).skorHarian;
    expect(skor.komponen.beban).toMatchObject({ sumber: "manual", tersedia: true, nilai: 0 });
  });

  it("dengan data Garmin dan baseline siap, Beban = total menit intensitas 3 hari", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: "rizky", jenis: "wearable" }));
    jalankanHari(d, rizky, 9, (i) => (i % 2 ? 20 : 40));
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    const skor = data(d.svc.terimaDataWearable(garmin("rizky", d.hariIni(), 30))) && data(d.svc.skorHarian(d.pelatih, { athleteId: "rizky", tanggal: d.hariIni() }));
    // Hari ini 30 + kemarin (i=8 → 40) + lusa (i=7 → 20) = 90 menit.
    expect(skor.komponen.beban).toMatchObject({ sumber: "garmin", tersedia: true, nilai: 90 });
    expect(skor.formulaVersion).toBe("v1.1");
  });

  it("data Garmin baru beberapa hari (baseline belum siap) tetap memakai mode manual", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: "rizky", jenis: "wearable" }));
    jalankanHari(d, rizky, 8);
    jalankanHari(d, rizky, 3, () => 30);
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    data(d.svc.terimaDataWearable(garmin("rizky", d.hariIni(), 30)));
    const skor = data(d.svc.skorHarian(d.pelatih, { athleteId: "rizky", tanggal: d.hariIni() }));
    expect(skor.komponen.beban!.sumber).toBe("manual");
  });

  it("data Garmin yang masuk setelah check-in menghitung ulang skor hari itu", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: "rizky", jenis: "wearable" }));
    jalankanHari(d, rizky, 9, () => 30);
    const sebelum = data(d.svc.kirimCheckIn(rizky, payloadCheckIn())).skorHarian;
    expect(sebelum.komponen.beban!.sumber).toBe("manual");
    data(d.svc.terimaDataWearable(garmin("rizky", d.hariIni(), 30)));
    const sesudah = data(d.svc.skorHarian(d.pelatih, { athleteId: "rizky", tanggal: d.hariIni() }));
    expect(sesudah.komponen.beban!.sumber).toBe("garmin");
  });
});
