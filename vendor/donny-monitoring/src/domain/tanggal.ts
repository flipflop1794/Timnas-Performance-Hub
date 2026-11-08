/**
 * Util tanggal sadar-zona-waktu. "Hari" selalu ditentukan oleh zona waktu
 * Tim (bawaan Asia/Jakarta), bukan UTC — lihat Keputusan Lain di PRD:
 * sesi yang selesai setelah tengah malam tetap masuk ke hari sesi itu
 * dimulai.
 */

export function tanggalDiZona(isoDatetime: string, timezone: string): string {
  const d = new Date(isoDatetime);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA -> YYYY-MM-DD
}

export function tambahHari(tanggal: string, hari: number): string {
  const d = new Date(tanggal + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

export function bandingkanTanggal(a: string, b: string): number {
  return a.localeCompare(b);
}
