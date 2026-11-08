import type { Actor, CheckInItems, CommandResult, DataWearableInput, JenisSesi, MonitoringService, PetaNyeri } from "../../src/index.js";
import { tambahHari } from "../../src/domain/tanggal.js";

/**
 * DATA CONTOH untuk memberi gambaran pemakaian aplikasi. Semua angka di sini
 * dibuat acak (berbenih) dan BUKAN data asli atlet. Sengaja tanpa narasi
 * medis: catatan pelatih bersifat taktis dan laporan atlet hanya soal
 * peralatan atau jadwal. Tanggal lahir diisi pengisi seragam (1 Jan 2000)
 * agar jelas bukan data pribadi sungguhan.
 */

export const TANGGAL_LAHIR_CONTOH = "2000-01-01";

export interface JamContoh {
  fixed: string | null;
}

interface Konteks {
  svc: MonitoringService;
  jam: JamContoh;
  manajer: Actor;
  teamId: string;
  hariIni: string;
  /** Atlet beserta nomornya, urut sesuai struktur. */
  atlet: { id: string; nomor: string }[];
  /** userId pelatih per nomor. */
  pelatihNomor: Map<string, string>;
  /** userId Kepala Pelatih Timnas. */
  kepalaPelatih: string;
  wib(tanggal: string, jam: string): string;
}

const TANPA_NYERI: PetaNyeri = {
  leher: 0,
  bahu: 0,
  punggungAtas: 0,
  punggungBawah: 0,
  pergelangan: 0,
  tangan: 0,
  jariKiri: 0,
  jariKanan: 0,
};

const JENIS_ACAK: JenisSesi[] = ["scrim", "scrim", "ranked", "individu", "review_vod", "pertandingan", "fisik"];

const CATATAN_LATIHAN = [
  "Drill mekanik 30 menit, lanjut scrim 3 game.",
  "Review VOD pertandingan kemarin, fokus rotasi mid game.",
  "Latihan komunikasi tim saat retake/teamfight.",
  "Scrim lawan tim akademi, koordinasi sudah lebih rapi.",
  "Latihan draft dan counter-pick bersama pelatih.",
  "Latihan aim/akurasi 45 menit sebelum scrim.",
];

const CATATAN_TAKTIK = [
  "Rotasi awal game sudah lebih rapi. Pertahankan komunikasi saat transisi objektif.",
  "Pengambilan keputusan saat late game masih terburu-buru; kita bahas di review VOD Kamis.",
  "Positioning saat teamfight membaik dibanding minggu lalu.",
  "Coba variasi strategi pembukaan di scrim berikutnya, catat hasilnya.",
];

const LAPORAN_CONTOH = [
  "Mouse/headset mulai bermasalah saat scrim, mohon dicek atau diganti sebelum turnamen.",
  "Jadwal latihan Sabtu bentrok dengan ujian kampus pukul 09.00. Mohon izin datang terlambat.",
  "Koneksi internet di ruang latihan B sering putus saat scrim malam.",
];

/** PRNG kecil berbenih agar data contoh sama setiap kali dimuat. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wajib<T>(r: CommandResult<T>): T {
  if (!r.ok) throw new Error(`Data contoh gagal dibuat: ${r.reason}`);
  return r.data;
}

function jamDariMenitMalam(menit: number): string {
  const total = (Math.round(menit) + 18 * 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isiDataContoh(k: Konteks): void {
  const rand = mulberry32(2026);
  const bulatAcak = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const acak = (min: number, max: number) => min + rand() * (max - min);
  const atlet = (id: string): Actor => ({ userId: id, teamId: k.teamId, peran: "atlet", athleteId: id });
  const staf = (id: string): Actor => ({ userId: id, teamId: k.teamId, peran: "staf_pelatih" });
  const { svc, jam, manajer, hariIni } = k;
  const awal = tambahHari(hariIni, -22);

  // Pembagian peran dalam cerita contoh (berdasarkan urutan, bukan kondisi asli siapa pun).
  const ids = k.atlet.map((a) => a.id);
  const tanpaGarmin = new Set([ids[3], ids[16], ids[29]].filter(Boolean) as string[]); // mode RPE manual
  const menurun = new Map<string, number>([
    [ids[2]!, 1],
    [ids[17]!, 1],
    [ids[6]!, 0.25],
    [ids[12]!, 0.25],
    [ids[21]!, 0.25],
  ]);
  const belumCheckIn = new Set([ids[1], ids[14], ids[25]].filter(Boolean) as string[]);

  // Profil fisik dasar acak per atlet, agar tiap orang punya baseline sendiri.
  const fisik = new Map(
    ids.map((id) => [
      id,
      {
        rhr: bulatAcak(54, 66),
        berat: bulatAcak(52, 78),
        tidur: bulatAcak(400, 470),
        stres: bulatAcak(22, 40),
        hrv: bulatAcak(50, 80),
        duduk: bulatAcak(420, 540),
        jamTidur: bulatAcak(300, 370), // 23.00 - 00.10
      },
    ])
  );

  // 1. Integrasi Garmin (kredensial contoh), persetujuan, dan tanggal lahir pengisi.
  jam.fixed = k.wib(awal, "09:00");
  wajib(
    svc.aturIntegrasiGarmin(manajer, {
      aktif: true,
      lingkungan: "evaluasi",
      consumerKey: "contoh-consumer-key",
      consumerSecret: "contoh-rahasia",
      jenisData: ["dailies", "sleeps", "hrv", "pulse_ox", "respiration", "body_compositions", "blood_pressures"],
    })
  );
  wajib(svc.catatUjiKoneksiGarmin(manajer, { ok: true, pesan: "Simulasi: kredensial contoh lengkap." }));
  for (const id of ids) {
    wajib(svc.ubahProfilAtlet(manajer, { athleteId: id, tanggalLahir: TANGGAL_LAHIR_CONTOH }));
    wajib(svc.berikanPersetujuan(manajer, { athleteId: id, jenis: "kuesioner" }));
    if (!tanpaGarmin.has(id)) {
      wajib(svc.berikanPersetujuan(manajer, { athleteId: id, jenis: "wearable" }));
      wajib(svc.hubungkanAkunGarmin(atlet(id), { garminUserId: `garmin-${id}` }));
    }
  }

  const butir = (dasar: number) => Math.max(1, Math.min(5, dasar + bulatAcak(-1, 1)));
  const isiCheckIn = (id: string, mundur: number): { items: CheckInItems; catatanLatihan?: string } => {
    const turun = (menurun.get(id) ?? 0) * (mundur <= 3 ? 1 : 0);
    const dasar = (rand() < 0.7 ? 4 : 3) - Math.round(turun * 2);
    return {
      items: {
        durasiTidurJam: Math.max(4, 6 + bulatAcak(0, 5) * 0.5 - turun * 2),
        kualitasTidur: Math.max(1, bulatAcak(3, 5) - Math.round(turun * 2)),
        kelelahanUmum: butir(dasar),
        kelelahanMata: butir(dasar),
        sakitKepala: butir(dasar + 1),
        stres: butir(dasar),
        mood: butir(dasar),
        motivasiBerlatih: butir(dasar),
        energi: butir(dasar),
        fokus: butir(dasar),
      },
      catatanLatihan: rand() < 0.35 ? CATATAN_LATIHAN[bulatAcak(0, CATATAN_LATIHAN.length - 1)] : undefined,
    };
  };

  // 2. Riwayat 21 hari: check-in pagi dan satu sesi sore (kecuali hari istirahat).
  for (let mundur = 21; mundur >= 1; mundur--) {
    const tanggal = tambahHari(hariIni, -mundur);
    const istirahat = mundur % 7 === 3;
    for (const id of ids) {
      jam.fixed = k.wib(tanggal, "08:00");
      const c = isiCheckIn(id, mundur);
      wajib(svc.kirimCheckIn(atlet(id), { ...c, petaNyeri: TANPA_NYERI, screenTimeJamKemarin: bulatAcak(7, 12) }));
      if (istirahat) continue;
      jam.fixed = k.wib(tanggal, "17:30");
      wajib(
        svc.catatSesi(atlet(id), {
          jenis: JENIS_ACAK[bulatAcak(0, JENIS_ACAK.length - 1)]!,
          durasiMenit: bulatAcak(6, 12) * 15,
          mulaiAt: k.wib(tanggal, "14:00"),
          selesaiAt: k.wib(tanggal, "16:30"),
          rpeAktual: bulatAcak(4, 8),
        })
      );
    }
  }

  // 3. Data Garmin harian (hari ini termasuk), untuk atlet yang memakai jam.
  for (let mundur = 21; mundur >= 0; mundur--) {
    const tanggal = tambahHari(hariIni, -mundur);
    for (const id of ids) {
      if (tanpaGarmin.has(id) || (mundur === 0 && id === ids[9])) continue; // satu atlet belum sinkron pagi ini
      jam.fixed = k.wib(tanggal, "07:30");
      wajib(svc.terimaDataWearable(buatGarmin(id, tanggal, mundur)));
    }
  }

  function buatGarmin(id: string, tanggal: string, mundur: number): DataWearableInput {
    const f = fisik.get(id)!;
    const turun = (menurun.get(id) ?? 0) * (mundur <= 3 ? 1 : 0);
    const tidurMenit = Math.round(f.tidur + acak(-35, 35) - 100 * turun);
    const pulih = Math.max(0, Math.min(1, (tidurMenit - 270) / 240));
    const stres = Math.round(Math.max(5, Math.min(95, f.stres + acak(-8, 8) + (1 - pulih) * 8 + 26 * turun)));
    const rhr = Math.round(f.rhr + acak(-2, 2) + (1 - pulih) * 3 + 7 * turun);
    const tertinggi = Math.round(Math.max(15, Math.min(100, 35 + pulih * 55 - stres * 0.15 + acak(-6, 6))));
    const mulai = f.jamTidur + acak(-20, 20) + 100 * turun;
    const fisikHari = mundur % 4 === 1;
    return {
      athleteId: id,
      tanggal,
      langkah: Math.round(acak(2800, 6500) + (fisikHari ? 4500 : 0)),
      menitIntensitas: Math.round(acak(0, 20) + (fisikHari ? 35 : 0)),
      tidur: {
        durasiMenit: tidurMenit,
        skor: Math.round(Math.max(20, Math.min(98, 35 + pulih * 55 + acak(-6, 6) - 15 * turun))),
        mulai: jamDariMenitMalam(mulai),
        bangun: jamDariMenitMalam(mulai + tidurMenit + acak(5, 20)),
      },
      kalori: Math.round(f.berat * 30 + acak(-150, 200) + (fisikHari ? 450 : 0)),
      detakJantung: { istirahat: rhr, rataRata: Math.round(rhr + acak(14, 22)), maks: Math.round(acak(118, 140) + (fisikHari ? 30 : 0)) },
      stres,
      spo2: Math.round(acak(94.5, 98.9)),
      bodyBattery: { tertinggi, terendah: Math.round(Math.max(5, tertinggi - acak(45, 70))) },
      komposisiTubuh: mundur % 7 === 0 ? { beratKg: Math.round((f.berat + acak(-0.6, 0.6)) * 10) / 10, lemakPersen: Math.round(acak(14, 24) * 10) / 10 } : null,
      respirasi: Math.round(acak(13, 16.5) * 10) / 10,
      tekananDarah: mundur % 3 === 0 ? { sistolik: Math.round(acak(108, 126)), diastolik: Math.round(acak(68, 82)) } : null,
      hrvRmssd: Math.round(Math.max(10, f.hrv * (1 + acak(-0.08, 0.08)) - 20 * turun)),
      durasiDudukMenit: Math.round(f.duduk + acak(-40, 40) - (fisikHari ? 60 : 0) + 170 * turun),
    };
  }

  // 4. Catatan pelatih kemarin malam (taktis, tanpa narasi medis).
  const kemarin = tambahHari(hariIni, -1);
  jam.fixed = k.wib(kemarin, "20:15");
  let i = 0;
  for (const [nomor, pelatih] of k.pelatihNomor) {
    const atletNomor = k.atlet.filter((a) => a.nomor === nomor);
    const sasaran = atletNomor[i % Math.max(1, atletNomor.length)];
    if (sasaran) {
      wajib(
        svc.tulisCatatan(staf(pelatih), {
          athleteId: sasaran.id,
          body: CATATAN_TAKTIK[i % CATATAN_TAKTIK.length]!,
          visibilitas: "bersama_atlet",
          kategori: ["taktik"],
        })
      );
    }
    i++;
  }
  const catatanTim = wajib(
    svc.tulisCatatan(staf(k.kepalaPelatih), {
      body: `Evaluasi mingguan: semua pelatih nomor mohon kirim ringkasan beban latihan dan kendala tim sebelum Jumat. @${[...k.pelatihNomor.values()][0]}`,
      visibilitas: "staf",
      kategori: ["logistik"],
    })
  );
  wajib(svc.buatTindakLanjut(staf(k.kepalaPelatih), { catatanId: catatanTim.id, ownerId: [...k.pelatihNomor.values()][0]!, tenggat: tambahHari(hariIni, 1) }));

  // 5. Laporan ringan dari beberapa atlet (peralatan dan jadwal).
  jam.fixed = k.wib(kemarin, "21:30");
  LAPORAN_CONTOH.forEach((isi, j) => {
    const pelapor = ids[(j * 11 + 4) % ids.length]!;
    const lap = wajib(svc.kirimLaporan(atlet(pelapor), { isi }));
    if (j === 0) {
      const nomor = k.atlet.find((a) => a.id === pelapor)!.nomor;
      wajib(svc.tandaiLaporanDibaca(staf(k.pelatihNomor.get(nomor)!), { laporanId: lap.id }));
    }
  });

  // 6. Pagi ini: check-in sebagian besar atlet.
  const sekarang = Date.now();
  const pagiIni = Math.min(new Date(k.wib(hariIni, "08:00")).getTime(), sekarang - 10 * 60_000);
  jam.fixed = new Date(Math.max(pagiIni, new Date(k.wib(hariIni, "00:05")).getTime())).toISOString();
  for (const id of ids) {
    if (belumCheckIn.has(id)) continue;
    const c = isiCheckIn(id, 0);
    wajib(svc.kirimCheckIn(atlet(id), { ...c, petaNyeri: TANPA_NYERI, screenTimeJamKemarin: bulatAcak(7, 12) }));
  }

  // 7. Scrim sore ini dijadwalkan pelatih nomor masing-masing.
  const mulaiScrim = new Date(Math.ceil((sekarang + 2 * 3600_000) / 3600_000) * 3600_000).toISOString();
  for (const { id, nomor } of k.atlet) {
    const pelatih = k.pelatihNomor.get(nomor);
    if (!pelatih) continue;
    wajib(svc.jadwalkanSesi(staf(pelatih), { athleteId: id, jenis: "scrim", durasiMenit: 120, mulaiAt: mulaiScrim, rpeRencana: 6 }));
  }

  jam.fixed = null;
}
