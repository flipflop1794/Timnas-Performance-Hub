/**
 * Modul Kolaborasi — bagian murni dari Catatan, Thread, sebutan (@), dan
 * Tindak Lanjut. Penyimpanan dan pemberitahuan sebutan dilakukan oleh
 * Layanan Monitoring; modul ini hanya mem-parsing dan memvalidasi.
 */

const MENTION_PATTERN = /@([a-zA-Z0-9_.-]+)/g;

/** Mengambil daftar userId yang disebut (@userId) dari teks, tanpa duplikat. */
export function ambilSebutan(body: string): string[] {
  const hasil = new Set<string>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    hasil.add(match[1] as string);
  }
  return [...hasil];
}

export const KATEGORI_CATATAN_VALID = [
  "taktik",
  "fisik",
  "mental",
  "medis",
  "nutrisi",
  "logistik",
] as const;

export type KategoriCatatan = (typeof KATEGORI_CATATAN_VALID)[number];

export function kategoriValid(kategori: string[]): boolean {
  return kategori.every((k) => (KATEGORI_CATATAN_VALID as readonly string[]).includes(k));
}
