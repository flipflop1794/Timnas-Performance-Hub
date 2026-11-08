import { describe, expect, it } from "vitest";
import { data, ditolak, payloadCheckIn, siapkanTim } from "./helpers.js";

describe("Profil Atlet", () => {
  it("mendaftarkan Atlet dengan profil lengkap", () => {
    const d = siapkanTim();
    const a = data(
      d.svc.daftarkanAtlet(d.manajer, {
        nama: "  Andi Saputra ",
        tanggalLahir: "2004-02-10",
        tempatLahir: "Surabaya",
        jenisKelamin: "laki_laki",
        kelompok: "Divisi MLBB",
      })
    );
    expect(a).toMatchObject({ nama: "Andi Saputra", tempatLahir: "Surabaya", jenisKelamin: "laki_laki", kelompok: "Divisi MLBB" });
  });

  it("menolak isian profil yang tidak valid", () => {
    const d = siapkanTim();
    ditolak(d.svc.daftarkanAtlet(d.manajer, { nama: " ", tanggalLahir: "2004-02-10" }), /Nama lengkap/);
    ditolak(d.svc.daftarkanAtlet(d.manajer, { nama: "Andi", tanggalLahir: "2004-02-10", kelompok: "  " }), /kelompok/);
  });

  it("Manajer Tim mengubah sebagian profil; field lain tetap", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    const a = data(d.svc.ubahProfilAtlet(d.manajer, { athleteId: "rizky", tempatLahir: "Bandung", kelompok: "Akademi MLBB" }));
    expect(a).toMatchObject({ nama: "rizky", tanggalLahir: "2002-03-15", tempatLahir: "Bandung", kelompok: "Akademi MLBB" });

    const log = data(d.svc.logAudit(d.manajer));
    expect(log.at(-1)).toMatchObject({ action: "ubahProfilAtlet", targetId: "rizky", detail: "tempatLahir, kelompok" });
  });

  it("hanya Manajer Tim yang boleh mengubah profil", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(d.svc.ubahProfilAtlet(d.pelatih, { athleteId: "rizky", nama: "Rizky" }), /.+/);
    ditolak(d.svc.ubahProfilAtlet(rizky, { athleteId: "rizky", nama: "Rizky" }), /.+/);
  });

  it("Atlet yang diarsipkan atau dari Tim lain tidak bisa diubah", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    data(d.svc.arsipkanAtlet(d.manajer, { athleteId: "rizky" }));
    ditolak(d.svc.ubahProfilAtlet(d.manajer, { athleteId: "rizky", nama: "Rizky" }), /diarsipkan/);
    ditolak(d.svc.ubahProfilAtlet(d.manajer, { athleteId: "tidak_ada", nama: "X" }), /tidak ditemukan/);
  });
});

describe("Hapus Atlet dan staf", () => {
  it("Manajer Tim menghapus Atlet beserta seluruh datanya; audit tetap ada", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.tulisCatatan(d.pelatih, { athleteId: "rizky", body: "Catatan", visibilitas: "staf" }));
    d.svc.cariCatatan(d.pelatih, { athleteId: "rizky" });

    data(d.svc.hapusAtlet(d.manajer, { athleteId: "rizky" }));

    expect(data(d.svc.anggotaTim(d.manajer)).atlet.map((a) => a.id)).not.toContain("rizky");
    expect(data(d.svc.cariCatatan(d.pelatih, { athleteId: undefined })).filter((c) => c.athleteId === "rizky")).toHaveLength(0);
    ditolak(d.svc.skorHarian(d.pelatih, { athleteId: "rizky", tanggal: d.hariIni() }), /tidak ditemukan/);
    ditolak(d.svc.kirimCheckIn(rizky, payloadCheckIn()), /.+/);
    expect(data(d.svc.logAudit(d.manajer)).at(-1)).toMatchObject({ action: "hapusAtlet", targetId: "rizky", detail: "rizky" });
  });

  it("hanya Manajer Tim yang boleh menghapus Atlet", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(d.svc.hapusAtlet(d.pelatih, { athleteId: "rizky" }), /.+/);
    ditolak(d.svc.hapusAtlet(rizky, { athleteId: "rizky" }), /.+/);
    ditolak(d.svc.hapusAtlet(d.manajer, { athleteId: "tidak_ada" }), /tidak ditemukan/);
  });

  it("Manajer Tim menghapus pelatih dan Tim Support, tetapi tidak dirinya sendiri atau Atlet", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    data(d.svc.hapusAnggota(d.manajer, { userId: "pelatih" }));
    data(d.svc.hapusAnggota(d.manajer, { userId: "fisio" }));
    const sisa = data(d.svc.anggotaTim(d.manajer)).anggota.map((m) => m.userId);
    expect(sisa).not.toContain("pelatih");
    expect(sisa).not.toContain("fisio");
    expect(sisa).toContain("psikolog");
    ditolak(d.svc.hapusAnggota(d.manajer, { userId: "manajer" }), /sendiri/);
    ditolak(d.svc.hapusAnggota(d.manajer, { userId: "rizky" }), /hapusAtlet/);
    ditolak(d.svc.hapusAnggota(d.pelatih, { userId: "psikolog" }), /.+/);
  });
});
