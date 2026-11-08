# Sistem Monitoring Readiness & Wellness Atlet Esport — Tahap 1

Implementasi Tahap 1 dari PRD (30 Oktober 2026): Check-in Harian, Sesi/sRPE,
Wellness Score, Papan Tim, Catatan + Thread + Tindak Lanjut, Persetujuan dan
wali, Akses/Visibilitas, dan Log Audit.

```bash
npm install
npm test          # 56 tes skenario lewat seam Layanan Monitoring
npm run typecheck # backend + frontend
npm run dev       # prototipe UI web di http://localhost:5173
```

## Prototipe UI web

Frontend React + Vite ada di [web/](web/). Karena HTTP API dan penyimpanan
persisten belum dibangun, `MonitoringService` berjalan langsung di browser
dengan `MemoryStorage`. Data demo ([web/src/demo.ts](web/src/demo.ts)) berisi
satu tim MLBB dengan riwayat 3 minggu dan dibuat ulang setiap halaman dimuat.

Pilih persona lewat "Masuk sebagai" di kanan atas, atau buka langsung dengan
`?sebagai=<userId>`:

| Persona | Peran | Yang bisa dicoba |
| --- | --- | --- |
| `budi` | Staf Pelatih | Papan Tim, detail atlet + tren, jadwalkan sesi, konfigurasi skor |
| `sari` | Tim Support · Fisioterapis | Catatan Klinis, Tindak Lanjut yang ditugaskan kepadanya |
| `dimas` | Tim Support · Psikolog | Catatan, notifikasi sebutan |
| `raka` | Atlet | Check-in pagi (belum diisi), RPE sesi kemarin, tren pribadi |
| `dinda` | Atlet, 16 tahun | Persetujuan dengan wali |
| `rina` | Manajer Tim | Anggota tim, daftarkan/arsipkan atlet, Log Audit |

## Arsitektur

Semua perilaku melewati satu seam: `MonitoringService`
([src/service/monitoringService.ts](src/service/monitoringService.ts)). Setiap
panggilan membawa `Actor` dan mengembalikan `{ ok: true, data }` atau
`{ ok: false, reason }` dengan alasan penolakan dalam bahasa Indonesia.

| Lapisan | Berkas | Sifat |
| --- | --- | --- |
| Layanan Monitoring | `src/service/` | Fasad tunggal, satu-satunya seam uji |
| Instrumen | `src/modules/instrumen.ts` | Fungsi murni, berversi |
| Skor | `src/modules/skor.ts` | Fungsi murni, berversi (`v1`) |
| Akses & Persetujuan | `src/modules/akses.ts` | Fungsi murni keputusan izin |
| Kolaborasi | `src/modules/kolaborasi.ts` | Parsing sebutan @, kategori |
| Port | `src/ports/` | Penyimpanan, Jam, Notifikasi |
| Adapter | `src/adapters/` | Versi memori + jam palsu untuk tes |

## Operasi yang tersedia

- **Tim & anggota:** `buatTim`, `daftarkanManajerAwal`, `undangAnggota`, `ubahPeran`, `daftarkanAtlet`, `arsipkanAtlet`, `infoTim`, `anggotaTim`
- **Persetujuan:** `berikanPersetujuan`, `cabutPersetujuan`, `setujuiSebagaiWali`, `persetujuanSaya`
- **Check-in:** `kirimCheckIn`, `ubahCheckIn`, `checkInKemarin`, `checkInHariIni`
- **Sesi:** `jadwalkanSesi`, `catatSesi`, `sesiMenungguRpe`
- **Skor:** `skorHarian`, `trenAtlet`, `papanTim`, `ubahKonfigurasiSkor`
- **Kolaborasi:** `tulisCatatan`, `ubahCatatan`, `balasThread`, `thread`, `buatTindakLanjut`, `selesaikanTindakLanjut`, `tindakLanjutSaya`, `cariCatatan`, `notifikasiSaya`
- **Linimasa & audit:** `linimasaAtlet`, `logAudit`

## Keputusan implementasi Tahap 1

- **Readiness sudah memakai rumus v1 lengkap**, tetapi hanya komponen Wellness,
  Tidur, dan Beban yang punya sumber data. Reaksi (Tahap 2) dan Fisiologis
  (Tahap 3) selalu "tidak tersedia" sehingga bobot dinormalisasi ulang sesuai
  PRD. Status Merah/Kuning belum mempertimbangkan Penanda karena modul
  Penanda baru ada di Tahap 2.
- **Check-in terkunci** dihitung langsung dari ada/tidaknya Sesi hari itu yang
  waktu mulainya sudah lewat, bukan flag yang disimpan.
- **Baseline Beban** hanya memakai hari yang punya Check-in, agar hari sebelum
  atlet bergabung tidak terhitung sebagai beban nol.
- **Penghitungan ulang** hanya untuk hari data itu masuk (PRD #76). Sesi yang
  dicatat terlambat tidak menghitung ulang skor 1–2 hari setelahnya, meski
  jendela beban 3 hari mencakupnya.
- **Satu Atlet = satu pengguna:** `athleteId` dipakai juga sebagai `userId`.
- **Wali** bukan anggota Tim, jadi `setujuiSebagaiWali` dipanggil dengan
  `guardianUserId`, bukan `Actor`.
- **SD minimum per komponen** (Wellness 5, Tidur 1, Beban 50 AU) adalah nilai
  awal pilihan saya, bukan dari PRD; perlu dievaluasi saat pilot.

## Belum dibangun (Tahap 2–3)

Tes Reaksi, modul Penanda dan antrean per peran, Penanganan, adapter wearable
(Garmin Starter, agregator, manual), `ringkasanManajer`, `eksporDataAtlet`,
`hapusDataAtlet`, ringkasan harian, pengingat terjadwal, penyimpanan
persisten, HTTP API, login sungguhan, dan UI web yang terhubung ke API
(prototipe di `web/` masih memanggil layanan langsung di browser).
