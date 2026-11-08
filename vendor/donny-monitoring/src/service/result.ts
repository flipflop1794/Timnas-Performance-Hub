/**
 * Setiap panggilan ke Layanan Monitoring mengembalikan CommandResult: baik
 * perintah maupun kueri. Penolakan selalu membawa alasan yang bisa dibaca
 * manusia (lihat PRD, bagian Antarmuka Layanan Monitoring).
 */
export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

export function ok<T>(data: T): CommandResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(reason: string): CommandResult<T> {
  return { ok: false, reason };
}
