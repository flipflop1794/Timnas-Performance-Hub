import { describe, expect, it } from "vitest";
import { data, ditolak, payloadCheckIn, siapkanTim } from "./helpers.js";

describe("Struktur tim nasional", () => {
  it("atlet boleh didaftarkan tanpa tanggal lahir, tetapi datanya baru diproses setelah tanggal lahir diisi", () => {
    const d = siapkanTim();
    const a = data(d.svc.daftarkanAtlet(d.manajer, { athleteId: "elga", nama: "Elga Cahya Putra", kelompok: "eFootball" }));
    expect(a.tanggalLahir).toBeUndefined();
    data(d.svc.berikanPersetujuan(d.manajer, { athleteId: "elga", jenis: "kuesioner" }));
    const elga = { userId: "elga", teamId: "mlbb", peran: "atlet" as const, athleteId: "elga" };
    ditolak(d.svc.kirimCheckIn(elga, payloadCheckIn()), /Tanggal lahir atlet belum diisi/);
    data(d.svc.ubahProfilAtlet(d.manajer, { athleteId: "elga", tanggalLahir: "2001-05-05" }));
    data(d.svc.kirimCheckIn(elga, payloadCheckIn()));
  });

  it("anggota staf menyimpan jabatan, unit, dan nomor yang ditangani", () => {
    const d = siapkanTim();
    const m = data(
      d.svc.undangAnggota(d.manajer, {
        userId: "indra", peran: "staf_pelatih", nama: "Indra Wijaya", jabatan: "Pelatih", unit: "Mobile Legends: Bang Bang", kelompok: "Mobile Legends: Bang Bang",
      })
    );
    expect(m).toMatchObject({ nama: "Indra Wijaya", jabatan: "Pelatih", kelompok: "Mobile Legends: Bang Bang" });
    const ubah = data(d.svc.ubahProfilAnggota(d.manajer, { userId: "indra", jabatan: "Kepala Pelatih Nomor" }));
    expect(ubah).toMatchObject({ jabatan: "Kepala Pelatih Nomor", unit: "Mobile Legends: Bang Bang" });
    expect(data(d.svc.logAudit(d.manajer)).at(-1)).toMatchObject({ action: "ubahProfilAnggota", detail: "jabatan" });
  });
});
