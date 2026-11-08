import { useEffect, useState } from "react";
import type { DailyScore } from "../../src/index.js";
import { tambahHari } from "../../src/domain/tanggal.js";
import { fmtAngka, fmtTanggal, StatusBadge } from "./ui.js";

/**
 * Tren Readiness dan Wellness Score per hari. Keduanya berskala 0-100, jadi
 * cukup satu sumbu. Hari tanpa skor dibiarkan kosong (garis terputus),
 * bukan diinterpolasi.
 */

const SERI = [
  { key: "readiness", label: "Readiness", warna: "var(--series-1)" },
  { key: "wellnessScore", label: "Wellness Score", warna: "var(--series-2)" },
] as const;

const TINGGI = 240;
const PAD = { kiri: 34, kanan: 16, atas: 12, bawah: 28 };

/** Lebar elemen, diukur ulang setiap kali elemen dipasang atau berubah ukuran. */
function useLebar() {
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [lebar, setLebar] = useState(640);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setLebar(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { ref, lebar };
}

export function TrenChart(props: {
  skor: DailyScore[];
  dari: string;
  sampai: string;
  ambangMerah: number;
  ambangKuning: number;
}) {
  const { ref, lebar } = useLebar();
  const [hover, setHover] = useState<number | null>(null);
  const [tabel, setTabel] = useState(false);

  const hari: string[] = [];
  for (let t = props.dari; t <= props.sampai; t = tambahHari(t, 1)) hari.push(t);
  const perHari = new Map(props.skor.map((s) => [s.tanggal, s]));

  const w = Math.max(lebar, 320);
  const plotW = w - PAD.kiri - PAD.kanan;
  const plotH = TINGGI - PAD.atas - PAD.bawah;
  const x = (i: number) => PAD.kiri + (hari.length <= 1 ? plotW / 2 : (i / (hari.length - 1)) * plotW);
  const y = (v: number) => PAD.atas + plotH - (v / 100) * plotH;

  function jalur(key: (typeof SERI)[number]["key"]): { d: string; titikTunggal: number[] } {
    let d = "";
    let segmen: number[] = [];
    const titikTunggal: number[] = [];
    const tutup = () => {
      if (segmen.length === 1) titikTunggal.push(segmen[0]!);
      segmen = [];
    };
    hari.forEach((t, i) => {
      const v = perHari.get(t)?.[key];
      if (v === null || v === undefined) {
        tutup();
        return;
      }
      d += `${segmen.length === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      segmen.push(i);
    });
    tutup();
    return { d, titikTunggal };
  }

  const langkahLabel = Math.ceil(hari.length / Math.max(2, Math.floor(plotW / 70)));
  const hoverSkor = hover !== null ? perHari.get(hari[hover]!) : undefined;

  function gerak(e: React.PointerEvent<SVGRectElement>) {
    const kotak = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - kotak.left;
    const i = Math.round((px / kotak.width) * (hari.length - 1));
    setHover(Math.max(0, Math.min(hari.length - 1, i)));
  }

  const terakhir = [...hari].reverse().find((t) => perHari.get(t)?.readiness != null);

  return (
    <div className="stack">
      <div className="row spread">
        <div className="legend" aria-hidden>
          {SERI.map((s) => (
            <span key={s.key}>
              <i className="key" style={{ background: s.warna }} />
              {s.label}
            </span>
          ))}
          <span>
            <i className="key putus" style={{ borderColor: "var(--merah)" }} />
            Ambang merah {props.ambangMerah}
          </span>
          <span>
            <i className="key putus" style={{ borderColor: "rgba(255,255,255,0.6)" }} />
            Ambang kuning {props.ambangKuning}
          </span>
        </div>
        <button className="link kecil" onClick={() => setTabel((v) => !v)}>
          {tabel ? "Lihat grafik" : "Lihat tabel"}
        </button>
      </div>

      {tabel ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Status</th>
                <th className="num">Readiness</th>
                <th className="num">Wellness</th>
              </tr>
            </thead>
            <tbody>
              {[...props.skor].reverse().map((s) => (
                <tr key={s.tanggal}>
                  <td>{fmtTanggal(s.tanggal)}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="num">{fmtAngka(s.readiness, 1)}</td>
                  <td className="num">{fmtAngka(s.wellnessScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart" ref={ref}>
          <svg
            width={w}
            height={TINGGI}
            role="img"
            aria-label={`Tren Readiness dan Wellness Score ${fmtTanggal(props.dari)} sampai ${fmtTanggal(props.sampai)}`}
          >
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={PAD.kiri} x2={w - PAD.kanan} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} />
                <text x={PAD.kiri - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="num">
                  {v}
                </text>
              </g>
            ))}
            <line x1={PAD.kiri} x2={w - PAD.kanan} y1={y(props.ambangMerah)} y2={y(props.ambangMerah)} stroke="var(--merah)" strokeWidth={1.5} strokeDasharray="5 5" />
            <line x1={PAD.kiri} x2={w - PAD.kanan} y1={y(props.ambangKuning)} y2={y(props.ambangKuning)} stroke="#fff" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="5 5" />
            {hari.map((t, i) =>
              (i % langkahLabel === 0 && hari.length - 1 - i >= langkahLabel) || i === hari.length - 1 ? (
                <text key={t} x={x(i)} y={TINGGI - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {new Date(t + "T12:00:00Z").toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" })}
                </text>
              ) : null
            )}

            {SERI.map((s) => {
              const { d, titikTunggal } = jalur(s.key);
              return (
                <g key={s.key}>
                  <path d={d} fill="none" stroke={s.warna} strokeWidth={s.key === "readiness" ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" />
                  {titikTunggal.map((i) => (
                    <circle key={i} cx={x(i)} cy={y(perHari.get(hari[i]!)![s.key]!)} r={4} fill={s.warna} stroke="var(--surface)" strokeWidth={2} />
                  ))}
                </g>
              );
            })}

            {terakhir && (
              <g>
                <circle
                  cx={x(hari.indexOf(terakhir))}
                  cy={y(perHari.get(terakhir)!.readiness!)}
                  r={6}
                  fill="var(--series-1)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
                <text
                  x={x(hari.indexOf(terakhir)) - 8}
                  y={y(perHari.get(terakhir)!.readiness!) - 10}
                  textAnchor="end"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--ink)"
                >
                  {fmtAngka(perHari.get(terakhir)!.readiness, 1)}
                </text>
              </g>
            )}

            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.atas} y2={PAD.atas + plotH} stroke="var(--axis)" />
                {SERI.map((s) => {
                  const v = hoverSkor?.[s.key];
                  return v == null ? null : (
                    <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={s.warna} stroke="var(--surface)" strokeWidth={2} />
                  );
                })}
              </g>
            )}

            <rect
              x={PAD.kiri}
              y={PAD.atas}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={gerak}
              onPointerLeave={() => setHover(null)}
            />
          </svg>

          {hover !== null && (
            <div
              className="tooltip"
              style={{
                left: Math.min(x(hover) + 12, w - 170),
                top: PAD.atas,
              }}
            >
              <div className="muted" style={{ marginBottom: 4 }}>
                {fmtTanggal(hari[hover]!)}
              </div>
              {hoverSkor ? (
                <div className="stack" style={{ gap: 3 }}>
                  {SERI.map((s) => (
                    <div className="tt-row" key={s.key}>
                      <i className="key" style={{ background: s.warna }} />
                      <b className="num">{fmtAngka(hoverSkor[s.key], s.key === "readiness" ? 1 : 0)}</b>
                      <span className="ink-2">{s.label}</span>
                    </div>
                  ))}
                  <StatusBadge status={hoverSkor.status} />
                </div>
              ) : (
                <span className="ink-2">Tidak ada data</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
