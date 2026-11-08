import { describe, expect, it } from "vitest";
import type { JenisDataGarmin } from "../src/index.js";
import { data, ditolak, siapkanTim } from "./helpers.js";

const SEMUA: JenisDataGarmin[] = ["dailies", "sleeps", "pulse_ox", "respiration", "body_compositions", "blood_pressures"];

describe("Integrasi Garmin", () => {
  it("hanya Super admin atau Admin yang bisa melihat dan mengatur integrasi", () => {
    const d = siapkanTim();
    ditolak(d.svc.integrasiGarmin(d.pelatih), /Super admin/);
    ditolak(d.svc.aturIntegrasiGarmin(d.pelatih, { aktif: false, lingkungan: "evaluasi", consumerKey: "", jenisData: [] }), /Super admin/);
    expect(data(d.svc.integrasiGarmin(d.manajer)).pengaturan).toBeNull();
  });

  it("mengaktifkan butuh Consumer Key, Consumer Secret, dan minimal satu jenis data", () => {
    const d = siapkanTim();
    const atur = (ubah: object) => d.svc.aturIntegrasiGarmin(d.manajer, { aktif: true, lingkungan: "evaluasi", consumerKey: "kunci", consumerSecret: "rahasia", jenisData: SEMUA, ...ubah });
    ditolak(atur({ consumerKey: " " }), /Consumer Key/);
    ditolak(atur({ consumerSecret: "" }), /Consumer Secret/);
    ditolak(atur({ jenisData: [] }), /jenis data/);
    const i = data(atur({}));
    expect(i).toMatchObject({ aktif: true, consumerKey: "kunci", consumerSecretTersimpan: true });
    expect(JSON.stringify(i)).not.toContain("rahasia");
  });

  it("rahasia lama tetap dipakai bila tidak diisi ulang, dan tidak pernah masuk Log Audit", () => {
    const d = siapkanTim();
    data(d.svc.aturIntegrasiGarmin(d.manajer, { aktif: true, lingkungan: "evaluasi", consumerKey: "kunci", consumerSecret: "rahasia-sangat", jenisData: SEMUA }));
    const i = data(d.svc.aturIntegrasiGarmin(d.manajer, { aktif: true, lingkungan: "produksi", consumerKey: "kunci", jenisData: ["dailies"] }));
    expect(i).toMatchObject({ lingkungan: "produksi", consumerSecretTersimpan: true, jenisData: ["dailies"] });
    const log = data(d.svc.logAudit(d.manajer)).filter((e) => e.action === "aturIntegrasiGarmin");
    expect(log).toHaveLength(2);
    expect(JSON.stringify(log)).not.toContain("rahasia-sangat");
  });

  it("alur koneksi atlet: undang, hubungkan (butuh persetujuan), sinkron, putuskan", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(d.svc.undangHubungkanGarmin(d.manajer, { athleteId: "rizky" }), /Aktifkan integrasi/);
    data(d.svc.aturIntegrasiGarmin(d.manajer, { aktif: true, lingkungan: "evaluasi", consumerKey: "k", consumerSecret: "s", jenisData: SEMUA }));
    expect(data(d.svc.undangHubungkanGarmin(d.manajer, { athleteId: "rizky" })).status).toBe("diundang");

    ditolak(d.svc.hubungkanAkunGarmin(rizky, { garminUserId: "g-123" }), /persetujuan Data wearable/);
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    expect(data(d.svc.hubungkanAkunGarmin(rizky, { garminUserId: "g-123" }))).toMatchObject({ status: "terhubung", garminUserId: "g-123" });

    data(
      d.svc.terimaDataWearable({
        athleteId: "rizky", tanggal: d.hariIni(), langkah: 5000, menitIntensitas: 10, tidur: null, kalori: null, detakJantung: null,
        stres: null, spo2: null, bodyBattery: null, komposisiTubuh: null, respirasi: null, tekananDarah: null,
      })
    );
    const baris = data(d.svc.integrasiGarmin(d.manajer)).atlet.find((a) => a.athleteId === "rizky")!;
    expect(baris.koneksi?.sinkronTerakhirAt).toBeDefined();

    ditolak(d.svc.putuskanGarmin(d.pelatih, { athleteId: "rizky" }), /Super admin/);
    data(d.svc.putuskanGarmin(rizky, { athleteId: "rizky" }));
    expect(data(d.svc.koneksiGarminSaya(rizky)).koneksi).toBeNull();
  });

  it("atlet tidak bisa menghubungkan akun bila integrasi Tim belum aktif", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "wearable" }));
    ditolak(d.svc.hubungkanAkunGarmin(rizky, { garminUserId: "g-1" }), /belum aktif/);
  });
});
