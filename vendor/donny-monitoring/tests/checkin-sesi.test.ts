import { describe, expect, it } from "vitest";
import { data, ditolak, payloadCheckIn, siapkanTim } from "./helpers.js";

describe("Check-in Harian", () => {
  it("bisa diubah sebelum Sesi pertama dimulai, dan setiap perubahan disimpan di riwayat", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ durasiTidur: 6 })));
    const diubah = data(d.svc.ubahCheckIn(rizky, payloadCheckIn({ durasiTidur: 7 }))).checkIn;
    expect(diubah.items.durasiTidurJam).toBe(7);
    expect(diubah.history.map((v) => v.items.durasiTidurJam)).toEqual([6, 7]);
  });

  it("terkunci setelah Sesi pertama hari itu dimulai", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    // Scrim dijadwalkan 10.00 WIB; sekarang 07.00 WIB.
    data(
      d.svc.jadwalkanSesi(d.pelatih, {
        athleteId: "rizky",
        jenis: "scrim",
        durasiMenit: 120,
        mulaiAt: "2026-11-02T03:00:00Z",
      })
    );
    data(d.svc.ubahCheckIn(rizky, payloadCheckIn({ durasiTidur: 7 })));
    d.clock.advanceHours(3);
    ditolak(d.svc.ubahCheckIn(rizky, payloadCheckIn({ durasiTidur: 6 })), /terkunci.*Catatan koreksi/);
  });

  it("checkInHariIni melaporkan isi Check-in dan status kunci untuk Atlet sendiri", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    expect(data(d.svc.checkInHariIni(rizky))).toEqual({ checkIn: null, terkunci: false });
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ durasiTidur: 6 })));
    data(
      d.svc.jadwalkanSesi(d.pelatih, {
        athleteId: "rizky",
        jenis: "scrim",
        durasiMenit: 120,
        mulaiAt: "2026-11-02T03:00:00Z",
      })
    );
    expect(data(d.svc.checkInHariIni(rizky)).checkIn?.items.durasiTidurJam).toBe(6);
    d.clock.advanceHours(3);
    expect(data(d.svc.checkInHariIni(rizky)).terkunci).toBe(true);
    ditolak(d.svc.checkInHariIni(d.pelatih), /tidak berwenang/);
  });

  it("hanya bisa dikirim sekali per hari; perubahan lewat ubahCheckIn", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn()));
    ditolak(d.svc.kirimCheckIn(rizky, payloadCheckIn()), /ubahCheckIn/);
  });

  it("menolak butir di luar skala dengan alasan yang bisa dibaca", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(d.svc.kirimCheckIn(rizky, payloadCheckIn({ wellness: [6, 4, 4, 4, 4, 4] })), /kelelahanUmum.*1-5/);
    ditolak(d.svc.kirimCheckIn(rizky, payloadCheckIn({ nyeri: { pergelangan: 11 } })), /pergelangan.*0-10/);
  });

  it("hanya Atlet yang bisa mengirim Check-in untuk dirinya sendiri", () => {
    const d = siapkanTim();
    d.tambahAtlet("rizky");
    ditolak(d.svc.kirimCheckIn(d.pelatih, payloadCheckIn()), /tidak berwenang/);
  });

  it("menyediakan jawaban kemarin sebagai titik awal pengisian", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    data(d.svc.kirimCheckIn(rizky, payloadCheckIn({ durasiTidur: 6.5 })));
    d.majuHari();
    expect(data(d.svc.checkInKemarin(rizky))?.items.durasiTidurJam).toBe(6.5);
  });

  it("hari Check-in ditentukan oleh zona waktu Tim, bukan UTC", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    // 18.00 UTC tanggal 2 = 01.00 WIB tanggal 3
    d.clock.setISO("2026-11-02T18:00:00Z");
    expect(data(d.svc.kirimCheckIn(rizky, payloadCheckIn())).checkIn.tanggal).toBe("2026-11-03");
  });
});

describe("Sesi dan Beban Sesi", () => {
  it("Beban Sesi adalah RPE x durasi menit", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const hasil = data(
      d.svc.catatSesi(rizky, { jenis: "scrim", durasiMenit: 90, mulaiAt: d.clock.nowISO(), rpeAktual: 6 })
    );
    expect(hasil.skorHarian.komponen.beban?.nilai).toBe(540);
  });

  it("Beban menjumlahkan sRPE hari ini dan dua hari sebelumnya", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    for (const menit of [60, 60, 60, 60]) {
      data(d.svc.catatSesi(rizky, { jenis: "ranked", durasiMenit: menit, mulaiAt: d.clock.nowISO(), rpeAktual: 5 }));
      d.majuHari();
    }
    d.clock.advanceHours(-24);
    const skor = data(d.svc.skorHarian(rizky, { athleteId: "rizky", tanggal: d.hariIni() }));
    expect(skor.komponen.beban?.nilai).toBe(900); // 3 hari x 300 AU
  });

  it("Atlet cukup mengisi RPE untuk Sesi yang sudah dijadwalkan pelatih, dan RPE rencana tetap tersimpan", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const terjadwal = data(
      d.svc.jadwalkanSesi(d.pelatih, {
        athleteId: "rizky",
        jenis: "scrim",
        durasiMenit: 120,
        mulaiAt: "2026-11-02T03:00:00Z",
        rpeRencana: 6,
      })
    );
    expect(data(d.svc.sesiMenungguRpe(rizky))).toHaveLength(0);
    d.clock.advanceHours(5);
    expect(data(d.svc.sesiMenungguRpe(rizky)).map((s) => s.id)).toEqual([terjadwal.id]);

    const { sesi } = data(d.svc.catatSesi(rizky, { sesiId: terjadwal.id, rpeAktual: 8 }));
    expect(sesi).toMatchObject({ rpeRencana: 6, rpeAktual: 8, status: "selesai", durasiMenit: 120 });
    expect(data(d.svc.sesiMenungguRpe(rizky))).toHaveLength(0);
  });

  it("Sesi yang berakhir 00.30 WIB masuk ke hari sesi itu dimulai", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    // Mulai 23.00 WIB tanggal 2, selesai 00.30 WIB tanggal 3
    const { sesi } = data(
      d.svc.catatSesi(rizky, {
        jenis: "ranked",
        durasiMenit: 90,
        mulaiAt: "2026-11-02T16:00:00Z",
        selesaiAt: "2026-11-02T17:30:00Z",
        rpeAktual: 7,
      })
    );
    expect(sesi.tanggal).toBe("2026-11-02");
  });

  it("Sesi latihan fisik dicatat terpisah dari Sesi game", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    const { sesi } = data(
      d.svc.catatSesi(rizky, { jenis: "fisik", durasiMenit: 45, mulaiAt: d.clock.nowISO(), rpeAktual: 7 })
    );
    expect(sesi.jenis).toBe("fisik");
    ditolak(
      d.svc.catatSesi(rizky, { jenis: "nonton" as never, durasiMenit: 45, mulaiAt: d.clock.nowISO(), rpeAktual: 7 }),
      /tidak dikenal/
    );
  });

  it("menolak RPE di luar skala CR-10", () => {
    const d = siapkanTim();
    const rizky = d.tambahAtlet("rizky");
    ditolak(
      d.svc.catatSesi(rizky, { jenis: "scrim", durasiMenit: 60, mulaiAt: d.clock.nowISO(), rpeAktual: 11 }),
      /0-10/
    );
  });
});
