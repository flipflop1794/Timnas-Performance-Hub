import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type {
  KomponenSkor,
  Actor,
  CommandResult,
  JenisSesi,
  MonitoringService,
  Peran,
  PetaNyeri,
  StatusReadiness,
  SubPeranTimSupport,
  Visibilitas,
} from "../../src/index.js";
import type { AkunStore } from "./akun.js";
import { TIMEZONE } from "./demo.js";

export interface AppCtx {
  svc: MonitoringService;
  actor: Actor;
  hariIni: string;
  /** Penanda versi data; naik setiap kali ada perintah yang berhasil. */
  versi: number;
  segarkan(): void;
  nama(userId: string): string;
  /** Kelompok "Number of event" yang sedang dipilih di sidebar; "" berarti semua kelompok. */
  kelompok: string;
  /** Semua kelompok yang dimiliki Atlet, berurutan abjad. */
  daftarKelompok: string[];
  /** Kelompok milik tiap Atlet (athleteId -> kelompok). */
  kelompokAtlet: Map<string, string>;
  pilihKelompok(k: string): void;
  /** Akun masuk atlet dan staf; dikelola Super admin atau Admin lewat form profil. */
  akun: AkunStore;
  /** True bila Aktor adalah Super admin (Manajer Tim) atau staf berstatus Admin. */
  kontrol: boolean;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("AppContext belum tersedia.");
  return ctx;
}

// ───────────────────────── Label ─────────────────────────

export const PERAN_LABEL: Record<Peran, string> = {
  atlet: "Atlet",
  staf_pelatih: "Staf Pelatih",
  tim_support: "Tim Support",
  manajer_tim: "Manajer Tim",
};

export const SUBPERAN_LABEL: Record<SubPeranTimSupport, string> = {
  fisioterapis: "Fisioterapis",
  psikolog: "Psikolog",
  dokter_tim: "Dokter Tim",
  nutrisionis: "Nutrisionis",
};

/** "Super admin" untuk Manajer Tim, "Admin" untuk staf berstatus Admin, selain itu kosong. */
export function labelOtoritas(m: { peran: Peran; admin?: boolean }): string {
  if (m.peran === "manajer_tim") return "Super admin";
  return m.admin ? "Admin" : "";
}

export function labelPeran(a: { peran: Peran; subPeran?: SubPeranTimSupport }): string {
  return a.subPeran ? `${PERAN_LABEL[a.peran]} · ${SUBPERAN_LABEL[a.subPeran]}` : PERAN_LABEL[a.peran];
}

export const JENIS_SESI_LABEL: Record<JenisSesi, string> = {
  individu: "Latihan individu",
  scrim: "Scrim",
  pertandingan: "Pertandingan",
  ranked: "Ranked",
  review_vod: "Review VOD",
  fisik: "Latihan fisik",
};

export const VISIBILITAS_LABEL: Record<Visibilitas, string> = {
  staf: "Staf",
  klinis: "Klinis",
  bersama_atlet: "Bersama Atlet",
};

export const VISIBILITAS_PENJELASAN: Record<Visibilitas, string> = {
  staf: "Staf Pelatih dan Tim Support",
  klinis: "Hanya Tim Support",
  bersama_atlet: "Staf, Tim Support, dan Atlet yang bersangkutan",
};

export const AREA_NYERI_LABEL: Record<keyof PetaNyeri, string> = {
  leher: "Leher",
  bahu: "Bahu",
  punggungAtas: "Punggung atas",
  punggungBawah: "Punggung bawah",
  pergelangan: "Pergelangan",
  tangan: "Tangan",
  jariKiri: "Jari kiri",
  jariKanan: "Jari kanan",
};

export const KOMPONEN_LABEL: Record<string, string> = {
  wellness: "Wellness",
  tidur: "Tidur",
  reaksi: "Reaksi",
  fisiologis: "Fisiologis",
  beban: "Beban",
};

export const STATUS_INFO: Record<StatusReadiness, { ikon: string; label: string }> = {
  hijau: { ikon: "✓", label: "Siap" },
  kuning: { ikon: "!", label: "Kuning" },
  merah: { ikon: "✕", label: "Merah" },
  abu_abu: { ikon: "–", label: "Data kurang" },
};

export function StatusBadge({ status }: { status: StatusReadiness }) {
  const info = STATUS_INFO[status];
  return (
    <span className={`status ${status}`}>
      <span className="ikon" aria-hidden>
        {info.ikon}
      </span>
      {info.label}
    </span>
  );
}

// ───────────────────────── Ikon ─────────────────────────

/** Lambang Esports Indonesia (garuda) di atas kotak putih, untuk sidebar dan ukuran kecil. */
export function Logo({ ukuran }: { ukuran: number }) {
  return (
    <span className="logo-lambang" style={{ width: ukuran, height: ukuran }}>
      <img src={`${import.meta.env.BASE_URL}logo-esi-lambang.png`} alt="" width={ukuran} height={ukuran} />
    </span>
  );
}

const IKON: Record<string, string> = {
  papan: "M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z",
  atlet: "M8 8a3 3 0 100-6 3 3 0 000 6zM2.5 14a5.5 5.5 0 0111 0",
  check: "M3 8.5l3 3 7-7",
  sesi: "M2 13V9M6 13V4M10 13V7M14 13V2",
  perisai: "M8 1.5l5 2v4c0 3-2 5-5 7-3-2-5-4-5-7v-4z",
  gerigi:
    "M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4",
  tren: "M1.5 12l4-4.5 3 3 6-7",
  catatan: "M3 2h7l3 3v9H3zM5.5 7h5M5.5 10h5",
  kotak: "M1.5 9l2-6h9l2 6v4.5h-13zM1.5 9h4l1 2h3l1-2h4",
  daftar: "M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5",
  keluar: "M6 2.5H3v11h3M10.5 5l3 3-3 3M13.5 8H6",
  lapor: "M2.5 6.5v3h2.5l5 3v-9l-5 3zM12.5 6a2.5 2.5 0 010 4M5 9.5l1 4h1.5",
  tautan: "M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1",
  tim: "M6 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.5 13.5a4.5 4.5 0 019 0M11 2.2a2.5 2.5 0 010 4.6M12.5 9.3a4.5 4.5 0 012 4.2",
};

export function Ikon({ nama }: { nama: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d={IKON[nama] ?? ""} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Cincin readiness 0-100; kosong (abu-abu) bila skor belum ada. */
export function CincinReadiness({ skor, status, ukuran = 160 }: { skor: number | null; status: StatusReadiness; ukuran?: number }) {
  const keliling = 339.3; // 2π × 54
  const warna = { hijau: "var(--siap)", kuning: "var(--kuning)", merah: "var(--merah)", abu_abu: "var(--abu-ring)" }[status];
  const isi = skor === null ? 0 : Math.max(0, Math.min(100, skor));
  return (
    <div
      className={`cincin ${ukuran < 120 ? "kecil" : ""}`}
      style={{ width: ukuran, height: ukuran }}
      role="img"
      aria-label={skor === null ? "Readiness belum tersedia" : `Readiness ${fmtAngka(skor, 1)}`}
    >
      <svg width={ukuran} height={ukuran} viewBox="0 0 128 128">
        <circle cx="64" cy="64" r="54" fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        {skor !== null && (
          <circle
            cx="64"
            cy="64"
            r="54"
            fill="none"
            stroke={warna}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${(isi / 100) * keliling} ${keliling}`}
          />
        )}
      </svg>
      <div className="isi">
        <b>{fmtAngka(skor, 0)}</b>
        <span>readiness</span>
      </div>
    </div>
  );
}

export function SkorBar({ skor }: { skor: number | null }) {
  return (
    <span className="skor-bar">
      <b>{fmtAngka(skor, 1)}</b>
      <span className="bar" aria-hidden>
        <i style={{ width: `${skor === null ? 0 : Math.max(0, Math.min(100, skor))}%` }} />
      </span>
    </span>
  );
}

/**
 * Nilai Beban beserta satuannya. Mode Garmin = total menit intensitas 3 hari,
 * mode manual = jumlah RPE x menit Sesi 3 hari (AU).
 */
export function fmtBeban(k: KomponenSkor | undefined): { nilai: string; satuan: string; sumber: string } {
  // Tanpa skor hari ini, mode belum diketahui; jangan menebak.
  if (!k?.sumber) return { nilai: fmtAngka(k?.nilai ?? null), satuan: "", sumber: "" };
  const garmin = k.sumber === "garmin";
  return {
    nilai: fmtAngka(k.nilai),
    satuan: garmin ? "mnt" : "AU",
    sumber: garmin ? "Garmin" : "RPE manual",
  };
}

export function NilaiBeban({ k }: { k: KomponenSkor | undefined }) {
  const b = fmtBeban(k);
  return (
    <>
      {b.nilai}
      {b.satuan && <small> {b.satuan}</small>}
    </>
  );
}

// ───────────────────────── Format ─────────────────────────

export function fmtAngka(n: number | null | undefined, digit = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("id-ID", { minimumFractionDigits: digit, maximumFractionDigits: digit });
}

export function fmtTanggal(tanggal: string, opsi: { tahun?: boolean } = {}): string {
  return new Date(tanggal + "T12:00:00Z").toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: opsi.tahun === false ? undefined : "numeric",
    timeZone: "UTC",
  });
}

export function fmtJam(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE });
}

export function fmtWaktu(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

/** Nilai input datetime-local dibaca sebagai waktu WIB (Asia/Jakarta, UTC+7, tanpa DST). */
export function dariInputWaktu(nilai: string): string {
  return new Date(`${nilai}:00+07:00`).toISOString();
}

export function keInputWaktu(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export function inisial(nama: string): string {
  return nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0]!.toUpperCase())
    .join("");
}

// ───────────────────────── Komponen kecil ─────────────────────────

export type Umpan = { jenis: "ok" | "gagal"; teks: string } | null;

/**
 * Menjalankan perintah ke Layanan Monitoring dan menampilkan hasilnya.
 * Penolakan selalu ditampilkan apa adanya, karena alasannya sudah ditulis
 * untuk dibaca pengguna.
 */
export function useAksi() {
  const { segarkan } = useApp();
  const [umpan, setUmpan] = useState<Umpan>(null);
  function jalankan<T>(hasil: CommandResult<T>, teksBerhasil: string): hasil is { ok: true; data: T } {
    if (hasil.ok) {
      setUmpan({ jenis: "ok", teks: teksBerhasil });
      segarkan();
      return true;
    }
    setUmpan({ jenis: "gagal", teks: hasil.reason });
    return false;
  }
  return { umpan, setUmpan, jalankan };
}

export function Pesan({ umpan }: { umpan: Umpan }) {
  if (!umpan) return null;
  return (
    <div className={`pesan ${umpan.jenis}`} role={umpan.jenis === "gagal" ? "alert" : "status"}>
      <span aria-hidden>{umpan.jenis === "ok" ? "✓" : "✕"}</span>
      <span>{umpan.teks}</span>
    </div>
  );
}

export function Info({ jenis = "info", children }: { jenis?: "info" | "peringatan"; children: ReactNode }) {
  return <div className={`pesan ${jenis}`}>{children}</div>;
}

export function Tabs<T extends string>(props: {
  nilai: T;
  pilihan: { id: T; label: string }[];
  ubah(id: T): void;
}) {
  return (
    <div className="tabs" role="tablist">
      {props.pilihan.map((p) => (
        <button
          key={p.id}
          role="tab"
          aria-selected={p.id === props.nilai}
          className={p.id === props.nilai ? "aktif" : ""}
          onClick={() => props.ubah(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function Skala(props: {
  nilai: number;
  dari: number;
  sampai: number;
  ubah(n: number): void;
  label: string;
  lebar?: boolean;
}) {
  const angka: number[] = [];
  for (let i = props.dari; i <= props.sampai; i++) angka.push(i);
  return (
    <div className={`skala ${props.lebar ? "lebar" : ""}`} role="radiogroup" aria-label={props.label}>
      {angka.map((n) => (
        <button
          type="button"
          key={n}
          role="radio"
          aria-checked={props.nilai === n}
          className={props.nilai === n ? "pilih" : ""}
          onClick={() => props.ubah(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Menyorot sebutan @userId dan menampilkan nama penggunanya. */
export function TeksSebutan({ teks }: { teks: string }) {
  const { nama } = useApp();
  const bagian = teks.split(/(@[a-zA-Z0-9_.-]+)/g);
  return (
    <>
      {bagian.map((b, i) =>
        b.startsWith("@") ? (
          <span key={i} className="mention" title={b}>
            @{nama(b.slice(1))}
          </span>
        ) : (
          <span key={i}>{b}</span>
        )
      )}
    </>
  );
}

/** Jendela popup: Esc atau klik latar menutup. */
export function Jendela({ judul, tutup, children }: { judul: string; tutup(): void; children: ReactNode }) {
  useEffect(() => {
    const tombol = (e: KeyboardEvent) => e.key === "Escape" && tutup();
    document.addEventListener("keydown", tombol);
    return () => document.removeEventListener("keydown", tombol);
  }, [tutup]);
  return (
    <div className="jendela-latar" onMouseDown={(e) => e.target === e.currentTarget && tutup()}>
      <div className="jendela card" role="dialog" aria-modal="true" aria-label={judul}>
        {children}
      </div>
    </div>
  );
}

export function Kosong({ children }: { children: ReactNode }) {
  return <div className="kosong">{children}</div>;
}
