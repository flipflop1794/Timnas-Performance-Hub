import { describe, expect, it } from "vitest";
import type { LampiranLaporan } from "../src/index.js";
import { data, ditolak, siapkanTim } from "./helpers.js";

const foto: LampiranLaporan = { nama: "lutut.jpg", tipe: "image/jpeg", ukuranByte: 800_000, url: "blob:foto" };
const video: LampiranLaporan = { nama: "gerakan.mp4", tipe: "video/mp4", ukuranByte: 20_000_000, url: "blob:video" };

describe("Laporan atlet", () => {
  it("atlet mengirim laporan dengan foto dan video; staf melihatnya", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const l = data(d.svc.kirimLaporan(rizky, { isi: "  Pergelangan kanan nyeri setelah scrim. ", lampiran: [foto, video] }));
    expect(l).toMatchObject({ isi: "Pergelangan kanan nyeri setelah scrim.", status: "baru", athleteId: "rizky" });
    expect(data(d.svc.laporanTim(d.pelatih))).toHaveLength(1);
    expect(data(d.svc.laporanTim(d.fisio))[0]!.lampiran).toHaveLength(2);
    expect(data(d.svc.laporanSaya(rizky))).toHaveLength(1);
  });

  it("menolak laporan kosong, lampiran selain foto/video, dan berkas terlalu besar", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(d.svc.kirimLaporan(rizky, { isi: "  " }), /Tulis laporan/);
    ditolak(d.svc.kirimLaporan(rizky, { isi: "x", lampiran: [{ ...foto, tipe: "application/pdf", nama: "a.pdf" }] }), /hanya foto atau video/);
    ditolak(d.svc.kirimLaporan(rizky, { isi: "x", lampiran: [{ ...foto, ukuranByte: 11_000_000 }] }), /foto maksimal 10 MB/);
    ditolak(d.svc.kirimLaporan(rizky, { isi: "x", lampiran: [{ ...video, ukuranByte: 101_000_000 }] }), /video maksimal 100 MB/);
    ditolak(d.svc.kirimLaporan(rizky, { isi: "x", lampiran: Array(6).fill(foto) }), /Maksimal 5/);
    data(d.svc.kirimLaporan(rizky, { isi: "", lampiran: [foto] }));
  });

  it("hanya atlet yang mengirim; Manajer Tim tidak membaca isi laporan; atlet lain tidak melihat laporan orang", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const andi = d.tambahAtlet("andi");
    ditolak(d.svc.kirimLaporan(d.pelatih, { isi: "x" }), /.+/);
    data(d.svc.kirimLaporan(rizky, { isi: "Laporan Rizky" }));
    ditolak(d.svc.laporanTim(d.manajer), /.+/);
    expect(data(d.svc.laporanSaya(andi))).toHaveLength(0);
  });

  it("staf menandai laporan dibaca; tercatat siapa dan kapan", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const l = data(d.svc.kirimLaporan(rizky, { isi: "Mata perih" }));
    const dibaca = data(d.svc.tandaiLaporanDibaca(d.fisio, { laporanId: l.id }));
    expect(dibaca).toMatchObject({ status: "dibaca", dibacaOleh: "fisio" });
    expect(data(d.svc.laporanSaya(rizky))[0]!.status).toBe("dibaca");
  });

  it("menghapus atlet ikut menghapus laporannya", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimLaporan(rizky, { isi: "x" }));
    data(d.svc.hapusAtlet(d.manajer, { athleteId: "rizky" }));
    expect(data(d.svc.laporanTim(d.pelatih))).toHaveLength(0);
  });
});
