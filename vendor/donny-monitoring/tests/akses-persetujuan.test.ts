import { describe, expect, it } from "vitest";
import type { CheckIn, LinimasaEvent } from "../src/index.js";
import { data, ditolak, payloadCheckIn, siapkanTim } from "./helpers.js";

function checkInDi(events: LinimasaEvent[]): CheckIn {
  const e = events.find((x) => x.type === "check_in");
  if (!e) throw new Error("Tidak ada Check-in di Linimasa");
  return e.data as CheckIn;
}

const RENTANG = { athleteId: "rizky", dari: "2026-11-01", sampai: "2026-11-30" };

describe("Persetujuan", () => {
  it("Atlet tanpa persetujuan Kuesioner tidak bisa mengirim Check-in", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky", { setuju: false });
    ditolak(d.svc.kirimCheckIn(rizky, payloadCheckIn()), /persetujuan/);
  });

  it("mencabut persetujuan Kuesioner menghentikan pengumpulan mulai hari itu", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    d.majuHari();
    data(d.svc.cabutPersetujuan(d.manajer, { athleteId: rizky.athleteId!, jenis: "kuesioner" }));
    ditolak(d.svc.kirimCheckIn(rizky, payloadCheckIn()), /persetujuan/);
    ditolak(
      d.svc.catatSesi(rizky, { jenis: "scrim", durasiMenit: 60, mulaiAt: d.clock.nowISO(), rpeAktual: 5 }),
      /persetujuan/
    );
  });

  it("Atlet di bawah 18 tahun tanpa persetujuan wali tidak bisa mengirim Check-in", () => {
    const d = siapkanTim();
    const dimas = d.tambahAtlet("dimas", { tanggalLahir: "2010-01-20", wali: "ibu_dimas" });
    ditolak(d.svc.kirimCheckIn(dimas, payloadCheckIn()), /wali/);

    data(d.svc.setujuiSebagaiWali({ athleteId: "dimas", guardianUserId: "ibu_dimas" }));
    data(d.svc.kirimCheckIn(dimas, payloadCheckIn()));
  });

  it("hanya wali terdaftar yang bisa menyetujui, dan persetujuannya tercatat di Log Audit", () => {
    const d = siapkanTim();
    d.tambahAtlet("dimas", { tanggalLahir: "2010-01-20", wali: "ibu_dimas" });
    ditolak(d.svc.setujuiSebagaiWali({ athleteId: "dimas", guardianUserId: "orang_lain" }), /bukan wali/);
    data(d.svc.setujuiSebagaiWali({ athleteId: "dimas", guardianUserId: "ibu_dimas" }));
    const log = data(d.svc.logAudit(d.manajer)).find((e) => e.action === "setujuiSebagaiWali");
    expect(log).toMatchObject({ actorId: "ibu_dimas", targetId: "dimas" });
  });

  it("saat Atlet berusia 18 tahun sistem meminta persetujuan ulang dari Atlet sendiri", () => {
    const d = siapkanTim();
    // Berulang tahun ke-18 pada 5 November 2026
    const dimas = d.tambahAtlet("dimas", { tanggalLahir: "2008-11-05", wali: "ibu_dimas" });
    data(d.svc.setujuiSebagaiWali({ athleteId: "dimas", guardianUserId: "ibu_dimas" }));
    data(d.svc.kirimCheckIn(dimas, payloadCheckIn()));

    d.majuHari(3);
    ditolak(d.svc.kirimCheckIn(dimas, payloadCheckIn()), /18 tahun.*persetujuan ulang/);

    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: dimas.athleteId!, jenis: "kuesioner" }));
    data(d.svc.kirimCheckIn(dimas, payloadCheckIn()));
  });
});

describe("persetujuanSaya", () => {
  it("menunjukkan persetujuan yang belum berlaku karena menunggu wali, lalu berlaku setelah wali setuju", () => {
    const d = siapkanTim();
    const dimas = d.tambahAtlet("dimas", { tanggalLahir: "2010-01-20", wali: "ibu_dimas" });
    let status = data(d.svc.persetujuanSaya(dimas));
    const kuesioner = () => status.persetujuan.find((p) => p.jenis === "kuesioner")!;
    expect(kuesioner().granted).toBe(true);
    expect(kuesioner().berlaku).toBe(false);
    expect(kuesioner().alasan).toMatch(/wali/);
    expect(status.wali).toEqual({ userId: "ibu_dimas", disetujuiAt: undefined });
    expect(status.persetujuan.find((p) => p.jenis === "wearable")!.granted).toBe(false);

    data(d.svc.setujuiSebagaiWali({ athleteId: "dimas", guardianUserId: "ibu_dimas" }));
    status = data(d.svc.persetujuanSaya(dimas));
    expect(kuesioner().berlaku).toBe(true);
    expect(status.wali?.disetujuiAt).toBeDefined();
  });

  it("hanya untuk Atlet", () => {
    const d = siapkanTim();
    ditolak(d.svc.persetujuanSaya(d.pelatih), /tidak berwenang/);
  });
});

describe("Akses dan Visibilitas", () => {
  it("Staf Pelatih tidak menerima teks bebas Check-in, Tim Support dan Atlet pemiliknya menerima", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ catatanBebas: "lagi ada masalah keluarga" })));

    const versiPelatih = checkInDi(data(d.svc.linimasaAtlet(d.pelatih, RENTANG)));
    expect(versiPelatih.catatanBebas).toBeUndefined();
    expect(JSON.stringify(versiPelatih)).not.toContain("masalah keluarga");
    expect(versiPelatih.items.durasiTidurJam).toBe(8);

    expect(checkInDi(data(d.svc.linimasaAtlet(d.psikolog, RENTANG))).catatanBebas).toBe("lagi ada masalah keluarga");
    expect(checkInDi(data(d.svc.linimasaAtlet(rizky, RENTANG))).catatanBebas).toBe("lagi ada masalah keluarga");
  });

  it("Manajer Tim tidak menerima isi Catatan Klinis di kueri mana pun", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    const klinis = data(
      d.svc.tulisCatatan(d.fisio, {
        athleteId: "rizky",
        body: "Suspek tendinopati pergelangan kanan",
        visibilitas: "klinis",
        kategori: ["medis"],
      })
    );
    data(d.svc.buatTindakLanjut(d.fisio, { catatanId: klinis.id, ownerId: "fisio", tenggat: "2026-11-09" }));

    expect(data(d.svc.cariCatatan(d.manajer))).toEqual([]);
    expect(data(d.svc.tindakLanjutSaya(d.manajer))).toEqual([]);
    ditolak(d.svc.linimasaAtlet(d.manajer, RENTANG), /Manajer/);
    ditolak(d.svc.thread(d.manajer, { catatanId: klinis.id }), /tidak bisa diakses/);
    ditolak(d.svc.skorHarian(d.manajer, { athleteId: "rizky", tanggal: "2026-11-02" }), /agregat/);
    ditolak(d.svc.papanTim(d.manajer, { tanggal: "2026-11-02" }), /tidak berwenang/);
    const semuaAudit = JSON.stringify(data(d.svc.logAudit(d.manajer)));
    expect(semuaAudit).not.toContain("tendinopati");
  });

  it("Catatan Klinis hanya terbaca Tim Support; Catatan Staf memuat rekomendasi untuk pelatih", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.tulisCatatan(d.fisio, { athleteId: "rizky", body: "Diagnosis: tendinopati", visibilitas: "klinis" }));
    data(d.svc.tulisCatatan(d.fisio, { athleteId: "rizky", body: "Batasi scrim 2 jam", visibilitas: "staf" }));
    data(d.svc.tulisCatatan(d.fisio, { athleteId: "rizky", body: "Lakukan stretching 3x sehari", visibilitas: "bersama_atlet" }));

    const isi = (actor: Parameters<typeof d.svc.cariCatatan>[0]) =>
      data(d.svc.cariCatatan(actor, { athleteId: "rizky" })).map((c) => c.body);

    expect(isi(d.psikolog)).toEqual(["Diagnosis: tendinopati", "Batasi scrim 2 jam", "Lakukan stretching 3x sehari"]);
    expect(isi(d.pelatih)).toEqual(["Batasi scrim 2 jam", "Lakukan stretching 3x sehari"]);
    expect(isi(rizky)).toEqual(["Lakukan stretching 3x sehari"]);
  });

  it("hanya Tim Support yang bisa menulis Catatan Klinis, dan Atlet tidak bisa menulis Catatan", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(d.svc.tulisCatatan(d.pelatih, { athleteId: "rizky", body: "x", visibilitas: "klinis" }), /Tim Support/);
    ditolak(d.svc.tulisCatatan(rizky, { athleteId: "rizky", body: "x", visibilitas: "bersama_atlet" }), /Staf Pelatih atau Tim Support/);
  });

  it("Atlet tidak bisa melihat skor atau Linimasa rekan setimnya", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const budi = d.tambahAtlet("budi");
    data(d.svc.kirimCheckIn(budi, payloadCheckIn()));
    ditolak(d.svc.skorHarian(rizky, { athleteId: "budi", tanggal: "2026-11-02" }), /sendiri/);
    ditolak(d.svc.linimasaAtlet(rizky, { ...RENTANG, athleteId: "budi" }), /sendiri/);
  });

  it("anggota Tim lain tidak bisa membaca data Atlet Tim ini", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    const pelatihTimLain = { userId: "pelatih_val", teamId: "valorant", peran: "staf_pelatih" as const };
    ditolak(d.svc.skorHarian(pelatihTimLain, { athleteId: "rizky", tanggal: "2026-11-02" }), /tidak ditemukan/);
    ditolak(d.svc.linimasaAtlet(pelatihTimLain, RENTANG), /tidak ditemukan/);
  });

  it("hanya Super admin atau Admin yang bisa mengundang anggota dan mengubah peran", () => {
    const d = siapkanTim();
    ditolak(d.svc.undangAnggota(d.pelatih, { userId: "x", peran: "staf_pelatih" }), /Super admin/);
    data(d.svc.ubahPeran(d.manajer, { userId: "psikolog", peran: "staf_pelatih" }));
    ditolak(d.svc.ubahPeran(d.manajer, { userId: "tidak_ada", peran: "staf_pelatih" }), /tidak ditemukan/);
  });

  it("Atlet yang diarsipkan hilang dari Papan Tim dan tidak bisa mengirim Check-in", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.arsipkanAtlet(d.manajer, { athleteId: "rizky" }));
    expect(data(d.svc.papanTim(d.pelatih, { tanggal: d.hariIni() }))).toEqual([]);
    ditolak(d.svc.kirimCheckIn(rizky, payloadCheckIn()), /diarsipkan/);
  });
});
