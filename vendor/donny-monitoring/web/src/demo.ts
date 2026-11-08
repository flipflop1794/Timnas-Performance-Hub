import type { Actor, CommandResult, DataWearableInput, JenisKelamin, Membership } from "../../src/index.js";
import { MemoryNotificationPort, MemoryStorage, MonitoringService } from "../../src/index.js";
import { tambahHari, tanggalDiZona } from "../../src/domain/tanggal.js";
import type { Clock } from "../../src/ports/clock.js";
import { AkunStore } from "./akun.js";
import { isiDataContoh } from "./contoh.js";

/**
 * Data awal prototipe: struktur Tim Nasional Esports Indonesia (BTN,
 * manajemen, kepelatihan, serta pelatih dan atlet per nomor). Tidak ada data
 * dummy: check-in, sesi, data Garmin, catatan, dan laporan baru terisi saat
 * aplikasi dipakai. Data profil yang belum diketahui (tanggal lahir, tempat
 * lahir) dibiarkan kosong untuk dilengkapi Super admin.
 *
 * Belum ada HTTP API maupun penyimpanan persisten, jadi Layanan Monitoring
 * berjalan di browser dengan penyimpanan memori dan kembali ke struktur awal
 * setiap halaman dimuat ulang.
 */

export const TEAM_ID = "timnas";
export const TIMEZONE = "Asia/Jakarta";

export const UNIT = {
  btn: "Badan Tim Nasional (BTN)",
  manajemen: "Manajemen Timnas",
  kepelatihan: "Kepelatihan Timnas",
} as const;

/** Jam yang bisa dibekukan selama pengisian data contoh, lalu berjalan mengikuti waktu nyata. */
class JamDemo implements Clock {
  fixed: string | null = null;
  nowISO(): string {
    return this.fixed ?? new Date().toISOString();
  }
}

export function wib(tanggal: string, jam: string): string {
  return new Date(`${tanggal}T${jam}:00+07:00`).toISOString();
}

export function hariIniTim(): string {
  return tanggalDiZona(new Date().toISOString(), TIMEZONE);
}

function wajib<T>(r: CommandResult<T>): T {
  if (!r.ok) throw new Error(`Data awal gagal dibuat: ${r.reason}`);
  return r.data;
}

// ───────────────────────── Struktur ─────────────────────────

interface Pengurus {
  nama: string;
  jabatan: string;
  unit: string;
  peran: "manajer_tim" | "staf_pelatih";
  /** Staf berstatus Admin: otoritas kontrol sama dengan Super admin. */
  admin?: boolean;
}

/** BTN dan Manajemen Timnas = Super admin (Manajer Tim); Kepelatihan Timnas = Staf Pelatih berstatus Admin. */
const PENGURUS: Pengurus[] = [
  { nama: "Canka Adzana Jagat Subiyanto", jabatan: "Ketua BTN", unit: UNIT.btn, peran: "manajer_tim" },
  { nama: "Taufiq Shobri", jabatan: "Wakil Ketua BTN", unit: UNIT.btn, peran: "manajer_tim" },
  { nama: "Syafrial Reza Bhawana Putra", jabatan: "Manager Timnas", unit: UNIT.manajemen, peran: "manajer_tim" },
  { nama: "Jose Rizal", jabatan: "Wakil Manager Timnas", unit: UNIT.manajemen, peran: "manajer_tim" },
  { nama: "Jonathan Carls", jabatan: "Wakil Manager Timnas", unit: UNIT.manajemen, peran: "manajer_tim" },
  { nama: "Muslih Wahyudi Rahman", jabatan: "Kepala Pelatih Timnas", unit: UNIT.kepelatihan, peran: "staf_pelatih", admin: true },
  { nama: "Dr. Donny Ardy Kusuma, M.Kes.", jabatan: "Wakil Kepala Pelatih Timnas 1", unit: UNIT.kepelatihan, peran: "staf_pelatih", admin: true },
  { nama: "Aufa Bassam", jabatan: "Wakil Kepala Pelatih Timnas 2", unit: UNIT.kepelatihan, peran: "staf_pelatih", admin: true },
];

interface Nomor {
  nomor: string;
  pelatih: string;
  atlet: string[];
  /** Nomor putri: jenis kelamin atlet diketahui dari nomornya. */
  putri?: boolean;
}

export const NOMOR: Nomor[] = [
  {
    nomor: "PUBG Mobile",
    pelatih: "Christie Albertos Berie Onibala",
    atlet: ["Alan Raynold Kumaseh", "Christophe Javier Lionel Umboh", "Kelvin Brilliant Embran", "Jouaqueen Matthew Walukow"],
  },
  {
    nomor: "Mobile Legends: Bang Bang",
    pelatih: "Indra Wijaya",
    atlet: ["Aldhia Fahmi Aranda", "Yonathan Cin", "Andric Alfayyadh", "Muhammad Rio Adiwijaya", "Julio Keven"],
  },
  {
    nomor: "Mobile Legends: Bang Bang Women",
    pelatih: "Ilyas Rahmanda",
    atlet: ["Cindy Laurent Siswanto", "Michelle Denise Siswanto", "Venny Lim", "Viorelle Valencia Chen", "Vivi Indrawaty"],
    putri: true,
  },
  {
    nomor: "Dota 2",
    pelatih: "Gregorius Arvindra",
    atlet: ["Musthofa Dzikry Pamungkas", "Rafli Fathurrahman", "Muhammad Saieful Ilham", "Tri Kuncoro", "Matthew Filemon"],
  },
  {
    nomor: "Counter Strike 2",
    pelatih: "Baskoro Dwi Putra",
    atlet: ["Achmad Rismana Handachnie", "Andre Yosua", "Al Furqan", "Jovan Farrel Briliant", "Muhammad Sulaiman Saefulloh"],
  },
  {
    nomor: "Counter Strike 2 Women",
    pelatih: "Iqbal Mauldhan Yusup",
    atlet: ["Risalma Agnia Lukman", "Dhammamitta Marvella", "Aulia Brillian Putri Hac", "Monica Chavela", "Daltha Amellia Dwiguna"],
    putri: true,
  },
  { nomor: "eFootball", pelatih: "Qwa", atlet: ["Elga Cahya Putra"] },
];

/**
 * ID pengguna (sekaligus nama pengguna untuk masuk) dari nama: kata pertama
 * tanpa gelar, huruf kecil. Bila sudah dipakai, ditambah kata berikutnya
 * (mis. muhammad.rio).
 */
function buatId(nama: string, terpakai: Set<string>): string {
  const kata = nama
    .replace(/,.*$/, "")
    .split(/\s+/)
    .filter((k) => !/^(dr|ir|prof|drs?)\.?$/i.test(k))
    .map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  // Nama depan yang sangat umum atau terlalu pendek langsung digabung dengan nama kedua.
  const umum = kata[0]!.length < 3 || ["muhammad", "muhamad", "mohammad", "achmad", "ahmad"].includes(kata[0]!);
  let id = umum && kata[1] ? `${kata[0]}.${kata[1]}` : kata[0]!;
  for (let i = 1; terpakai.has(id) && i < kata.length; i++) id = `${kata[0]}.${kata[i]}`;
  for (let n = 2; terpakai.has(id); n++) id = `${kata[0]}${n}`;
  terpakai.add(id);
  return id;
}

// ───────────────────────── Simulasi sinkron Garmin ─────────────────────────

function jamDariMenitMalam(menit: number): string {
  const total = (Math.round(menit) + 18 * 60) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Simulasi "Sinkron sekarang" di tab Integrasi Garmin: membuat ringkasan
 * Garmin hari ini untuk satu atlet, seolah dikirim webhook Garmin. Hanya
 * untuk mencoba alur prototipe; tombolnya diberi label simulasi.
 */
export function simulasiSinkronGarmin(svc: MonitoringService, athleteId: string): CommandResult<unknown> {
  const acak = (min: number, max: number) => min + Math.random() * (max - min);
  const tidurMenit = Math.round(acak(360, 480));
  const mulai = acak(300, 390);
  const data: DataWearableInput = {
    athleteId,
    tanggal: hariIniTim(),
    langkah: Math.round(acak(2800, 8000)),
    menitIntensitas: Math.round(acak(0, 40)),
    tidur: {
      durasiMenit: tidurMenit,
      skor: Math.round(acak(55, 90)),
      mulai: jamDariMenitMalam(mulai),
      bangun: jamDariMenitMalam(mulai + tidurMenit + 10),
    },
    kalori: Math.round(acak(1900, 2700)),
    detakJantung: { istirahat: Math.round(acak(52, 68)), rataRata: Math.round(acak(70, 85)), maks: Math.round(acak(120, 160)) },
    stres: Math.round(acak(20, 50)),
    spo2: Math.round(acak(95, 99)),
    bodyBattery: { tertinggi: Math.round(acak(55, 95)), terendah: Math.round(acak(5, 30)) },
    komposisiTubuh: null,
    respirasi: Math.round(acak(13, 16.5) * 10) / 10,
    tekananDarah: null,
    hrvRmssd: Math.round(acak(45, 85)),
    durasiDudukMenit: Math.round(acak(380, 560)),
  };
  return svc.terimaDataWearable(data);
}

// ───────────────────────── Data awal ─────────────────────────

export interface Demo {
  svc: MonitoringService;
  manajer: Actor;
  /** Akun masuk atlet dan staf (halaman landing). */
  akun: AkunStore;
  /** Semua anggota Tim, dipakai sebagai daftar "Masuk sebagai". */
  daftarPersona(): Actor[];
}

/**
 * Membuat struktur awal. Dengan `contoh: true`, ditambah DATA CONTOH (lihat
 * contoh.ts) agar aplikasi memberi gambaran; tanpa itu hanya struktur bersih.
 */
export function buatDemo(opsi: { contoh?: boolean } = {}): Demo {
  const storage = new MemoryStorage();
  const jam = new JamDemo();
  const svc = new MonitoringService(storage, jam, new MemoryNotificationPort());
  const hariIni = hariIniTim();
  // Dengan data contoh, struktur dibuat "22 hari lalu" agar riwayat bisa diisi mundur.
  if (opsi.contoh) jam.fixed = wib(tambahHari(hariIni, -22), "08:00");
  const pelatihNomor = new Map<string, string>();
  const atletNomor: { id: string; nomor: string }[] = [];
  let kepalaPelatih = "";
  const akun = new AkunStore();
  const terpakai = new Set<string>(["admin"]);
  const daftarAkun = (id: string) => akun.simpan(id, id, `${id}123`);

  svc.buatTim({ id: TEAM_ID, nama: "Tim Nasional Esports Indonesia", divisi: "Esports", timezone: TIMEZONE });

  // Ketua BTN menjadi Super admin pertama; pengurus lain diundang olehnya.
  const [ketua, ...pengurusLain] = PENGURUS;
  const idKetua = buatId(ketua!.nama, terpakai);
  wajib(svc.daftarkanManajerAwal({ userId: idKetua, teamId: TEAM_ID }));
  const manajer: Actor = { userId: idKetua, teamId: TEAM_ID, peran: "manajer_tim" };
  wajib(svc.ubahProfilAnggota(manajer, { userId: idKetua, nama: ketua!.nama, jabatan: ketua!.jabatan, unit: ketua!.unit }));
  daftarAkun(idKetua);

  for (const p of pengurusLain) {
    const id = buatId(p.nama, terpakai);
    wajib(svc.undangAnggota(manajer, { userId: id, peran: p.peran, nama: p.nama, jabatan: p.jabatan, unit: p.unit }));
    if (p.admin) wajib(svc.ubahProfilAnggota(manajer, { userId: id, admin: true }));
    if (p.jabatan === "Kepala Pelatih Timnas") kepalaPelatih = id;
    daftarAkun(id);
  }

  for (const n of NOMOR) {
    const idPelatih = buatId(n.pelatih, terpakai);
    wajib(
      svc.undangAnggota(manajer, {
        userId: idPelatih,
        peran: "staf_pelatih",
        nama: n.pelatih,
        jabatan: "Pelatih",
        unit: n.nomor,
        kelompok: n.nomor,
      })
    );
    daftarAkun(idPelatih);
    pelatihNomor.set(n.nomor, idPelatih);

    for (const nama of n.atlet) {
      const id = buatId(nama, terpakai);
      const jenisKelamin: JenisKelamin | undefined = n.putri ? "perempuan" : undefined;
      wajib(svc.daftarkanAtlet(manajer, { athleteId: id, nama, kelompok: n.nomor, jenisKelamin }));
      daftarAkun(id);
      atletNomor.push({ id, nomor: n.nomor });
    }
  }

  if (opsi.contoh) {
    isiDataContoh({ svc, jam, manajer, teamId: TEAM_ID, hariIni, atlet: atletNomor, pelatihNomor, kepalaPelatih, wib });
  }
  jam.fixed = null;

  const urutanStruktur = [UNIT.btn, UNIT.manajemen, UNIT.kepelatihan, ...NOMOR.map((n) => n.nomor)];
  const urutan = (m: Membership): number => {
    const peran = { manajer_tim: 0, staf_pelatih: 1, tim_support: 2, atlet: 3 }[m.peran];
    const unit = urutanStruktur.indexOf(m.unit ?? "");
    return peran * 100 + (unit < 0 ? 99 : unit);
  };

  return {
    svc,
    manajer,
    akun,
    daftarPersona() {
      const r = svc.anggotaTim(manajer);
      if (!r.ok) return [];
      const atlet = new Map(r.data.atlet.map((a) => [a.id, a]));
      const namaDari = (m: Membership) => m.nama ?? atlet.get(m.userId)?.nama ?? m.userId;
      const kelompokDari = (m: Membership) => m.unit ?? atlet.get(m.userId)?.kelompok ?? "";
      return r.data.anggota
        .filter((m) => !atlet.get(m.userId)?.archived)
        .map((m) => ({ ...m, unit: kelompokDari(m) }))
        // Pengurus dan pelatih mengikuti urutan jabatan di struktur; atlet urut nama.
        .sort((a, b) => urutan(a) - urutan(b) || (a.peran === "atlet" ? namaDari(a).localeCompare(namaDari(b)) : 0))
        .map((m: Membership): Actor => ({ ...m }));
    },
  };
}
