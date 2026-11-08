import { describe, expect, it } from "vitest";
import { data, ditolak, siapkanTim } from "./helpers.js";

describe("Ruang Interaksi", () => {
  it("sebutan @ menghasilkan pemberitahuan ke rekan yang disebut", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    const catatan = data(
      d.svc.tulisCatatan(d.fisio, { athleteId: "rizky", body: "Batasi scrim 2 jam minggu ini", visibilitas: "staf" })
    );
    data(d.svc.balasThread(d.fisio, { catatanId: catatan.id, body: "@pelatih mohon disesuaikan jadwalnya" }));

    const notifPelatih = data(d.svc.notifikasiSaya(d.pelatih));
    expect(notifPelatih).toHaveLength(1);
    expect(notifPelatih[0]).toMatchObject({ type: "sebutan", relatedId: catatan.id });
    expect(d.notif.sent.map((n) => n.userId)).toEqual(["pelatih"]);
  });

  it("sebutan tidak diteruskan ke rekan yang tidak berhak membaca Catatan itu", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    data(
      d.svc.tulisCatatan(d.fisio, {
        athleteId: "rizky",
        body: "@pelatih @psikolog hasil asesmen klinis",
        visibilitas: "klinis",
      })
    );
    expect(data(d.svc.notifikasiSaya(d.pelatih))).toHaveLength(0);
    expect(data(d.svc.notifikasiSaya(d.psikolog))).toHaveLength(1);
  });

  it("Tindak Lanjut muncul di tindakLanjutSaya milik penanggung jawab sampai diselesaikan", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    const catatan = data(
      d.svc.tulisCatatan(d.psikolog, { athleteId: "rizky", body: "Jadwalkan konseling", visibilitas: "staf", kategori: ["mental"] })
    );
    data(d.svc.buatTindakLanjut(d.psikolog, { catatanId: catatan.id, ownerId: "pelatih", tenggat: "2026-11-06" }));

    expect(data(d.svc.tindakLanjutSaya(d.pelatih)).map((c) => c.id)).toEqual([catatan.id]);
    expect(data(d.svc.tindakLanjutSaya(d.psikolog))).toEqual([]);
    expect(data(d.svc.notifikasiSaya(d.pelatih))[0]?.type).toBe("tindak_lanjut");

    ditolak(d.svc.selesaikanTindakLanjut(d.psikolog, { catatanId: catatan.id }), /penanggung jawab/);
    data(d.svc.selesaikanTindakLanjut(d.pelatih, { catatanId: catatan.id }));
    expect(data(d.svc.tindakLanjutSaya(d.pelatih))).toEqual([]);
  });

  it("Tindak Lanjut dari Catatan Klinis tidak bisa diberikan ke Staf Pelatih", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    const klinis = data(d.svc.tulisCatatan(d.fisio, { athleteId: "rizky", body: "x", visibilitas: "klinis" }));
    ditolak(
      d.svc.buatTindakLanjut(d.fisio, { catatanId: klinis.id, ownerId: "pelatih", tenggat: "2026-11-06" }),
      /tidak berhak/
    );
  });

  it("Catatan hanya bisa diubah penulisnya, dan riwayat versinya tersedia", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    const catatan = data(d.svc.tulisCatatan(d.pelatih, { athleteId: "rizky", body: "Main 3 map", visibilitas: "staf" }));
    ditolak(d.svc.ubahCatatan(d.fisio, { catatanId: catatan.id, body: "Main 1 map" }), /penulisnya/);

    d.clock.advanceHours(1);
    const diubah = data(d.svc.ubahCatatan(d.pelatih, { catatanId: catatan.id, body: "Main 2 map" }));
    expect(diubah.body).toBe("Main 2 map");
    expect(diubah.history.map((v) => v.body)).toEqual(["Main 3 map"]);
  });

  it("Atlet bisa membaca dan membalas Catatan Bersama Atlet miliknya", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const budi = d.tambahAtlet("budi");
    const catatan = data(
      d.svc.tulisCatatan(d.pelatih, { athleteId: "rizky", body: "Kurangi ranked malam", visibilitas: "bersama_atlet" })
    );
    data(d.svc.balasThread(rizky, { catatanId: catatan.id, body: "Maksimal jam berapa, @pelatih?" }));
    expect(data(d.svc.thread(d.pelatih, { catatanId: catatan.id })).map((r) => r.authorId)).toEqual(["rizky"]);
    expect(data(d.svc.notifikasiSaya(d.pelatih))).toHaveLength(1);
    ditolak(d.svc.balasThread(budi, { catatanId: catatan.id, body: "ikut" }), /tidak bisa diakses/);
  });

  it("Catatan tingkat tim tidak terikat satu Atlet dan bisa dicari per kategori", () => {
    const d = siapkanTim();
    data(d.svc.tulisCatatan(d.pelatih, { body: "Bootcamp mulai 10.00", visibilitas: "staf", kategori: ["logistik"] }));
    data(d.svc.tulisCatatan(d.pelatih, { body: "Draft fokus jungler", visibilitas: "staf", kategori: ["taktik"] }));
    const hasil = data(d.svc.cariCatatan(d.fisio, { kategori: "logistik" }));
    expect(hasil.map((c) => [c.body, c.athleteId])).toEqual([["Bootcamp mulai 10.00", undefined]]);
    ditolak(d.svc.tulisCatatan(d.pelatih, { body: "x", visibilitas: "staf", kategori: ["gosip"] }), /Kategori/);
  });

  it("Catatan bisa dicari berdasarkan penulis dan rentang tanggal", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    data(d.svc.tulisCatatan(d.pelatih, { athleteId: "rizky", body: "hari 1", visibilitas: "staf" }));
    d.majuHari(2);
    data(d.svc.tulisCatatan(d.fisio, { athleteId: "rizky", body: "hari 3", visibilitas: "staf" }));
    expect(data(d.svc.cariCatatan(d.pelatih, { authorId: "fisio" })).map((c) => c.body)).toEqual(["hari 3"]);
    expect(
      data(d.svc.cariCatatan(d.pelatih, { dari: "2026-11-02", sampai: "2026-11-03" })).map((c) => c.body)
    ).toEqual(["hari 1"]);
  });

  it("lampiran berupa tautan VOD tersimpan bersama Catatan", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    const catatan = data(
      d.svc.tulisCatatan(d.pelatih, {
        athleteId: "rizky",
        body: "Rotasi telat di menit 12",
        visibilitas: "staf",
        attachments: ["https://vod.example/match-7?t=720"],
      })
    );
    expect(catatan.attachments).toEqual(["https://vod.example/match-7?t=720"]);
  });
});
