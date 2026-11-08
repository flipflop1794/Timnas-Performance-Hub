import { useState } from "react";
import type { IntegrasiGarmin, JenisDataGarmin } from "../../../src/index.js";
import { simulasiSinkronGarmin } from "../demo.js";
import { IkonGarmin, METRIK_GARMIN } from "../garmin.js";
import { fmtWaktu, Info, inisial, Pesan, useAksi, useApp } from "../ui.js";

/**
 * Pengaturan koneksi ke Garmin Health API. Hanya Super admin dan Admin.
 *
 * Prototipe ini berjalan di browser tanpa server, jadi kredensial disimpan di
 * memori dan uji koneksi serta sinkronisasi disimulasikan. Di produksi,
 * rahasia disimpan di server (secret manager), otorisasi atlet lewat OAuth
 * Garmin Connect, dan data masuk lewat webhook ke alamat di bawah.
 */

/** Ringkasan Garmin Health API dan metrik Kondisi Atlet yang diisinya. */
const JENIS_DATA: { id: JenisDataGarmin; label: string; metrik: string[] }[] = [
  { id: "dailies", label: "Dailies", metrik: ["langkah", "menitIntensitas", "duduk", "kalori", "detakJantung", "stres", "bodyBattery"] },
  { id: "sleeps", label: "Sleeps", metrik: ["tidur"] },
  { id: "hrv", label: "HRV", metrik: ["hrv"] },
  { id: "pulse_ox", label: "Pulse Ox", metrik: ["spo2"] },
  { id: "respiration", label: "Respiration", metrik: ["respirasi"] },
  { id: "body_compositions", label: "Body Compositions", metrik: ["komposisiTubuh"] },
  { id: "blood_pressures", label: "Blood Pressures", metrik: ["tekananDarah"] },
];

export function HalamanIntegrasiGarmin() {
  const { svc, actor } = useApp();
  const aksi = useAksi();
  const r = svc.integrasiGarmin(actor);
  if (!r.ok) return <Pesan umpan={{ jenis: "gagal", teks: r.reason }} />;
  const { pengaturan, atlet } = r.data;
  const terhubung = atlet.filter((a) => a.koneksi?.status === "terhubung").length;

  return (
    <>
      <div className="judul">
        <div>
          <h1>Integrasi Garmin</h1>
          <p>Hubungkan Tim ke Garmin Health API agar data Kondisi Atlet masuk otomatis dari jam Garmin atlet.</p>
        </div>
        <StatusIntegrasi pengaturan={pengaturan} />
      </div>
      <Info jenis="peringatan">
        <span>
          <b>Mode prototipe.</b> Belum ada server, jadi kredensial hanya disimpan di memori browser, dan uji koneksi serta sinkronisasi
          disimulasikan. Koneksi sungguhan butuh backend HTTPS publik dan akun Garmin Connect Developer Program yang disetujui Garmin.
        </span>
      </Info>
      <Pesan umpan={aksi.umpan} />

      <FormKredensial key={pengaturan?.diubahAt ?? "baru"} pengaturan={pengaturan} jalankan={aksi.jalankan} setUmpan={aksi.setUmpan} />

      <section className="setelan">
        <div className="setelan-ket">
          <h2>Alamat untuk portal Garmin</h2>
          <p>Daftarkan alamat ini di Garmin Connect Developer Program. Garmin mengirim data baru ke alamat webhook.</p>
        </div>
        <div className="card stack">
          <AlamatSalin label="OAuth callback" nilai={`${location.origin}/api/garmin/oauth/callback`} />
          <AlamatSalin label="Webhook (ping/push)" nilai={`${location.origin}/api/garmin/webhook`} />
          <AlamatSalin label="Deregistrasi & izin pengguna" nilai={`${location.origin}/api/garmin/deregistration`} />
          <p className="muted kecil">
            Alamat di atas harus HTTPS dan bisa diakses dari internet. Saat ini masih alamat lokal karena prototipe belum punya server.
          </p>
        </div>
      </section>

      <section className="setelan">
        <div className="setelan-ket">
          <h2>Koneksi atlet</h2>
          <p>
            {terhubung} dari {atlet.length} atlet terhubung. Atlet harus memberi persetujuan Data wearable lalu menyetujui akses di Garmin
            Connect.
          </p>
        </div>
        <div className="card flush">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Atlet</th>
                  <th>Persetujuan</th>
                  <th>Status Garmin</th>
                  <th>Sinkron terakhir</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {atlet.map((a) => {
                  const k = a.koneksi;
                  return (
                    <tr key={a.athleteId}>
                      <td>
                        <span className="atlet-sel">
                          <span className="avatar gelap">{inisial(a.nama)}</span>
                          <span>
                            <b>{a.nama}</b>
                            {k?.garminUserId && <span className="muted kecil">{k.garminUserId}</span>}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className={`status ${a.persetujuanBerlaku ? "hijau" : "abu_abu"}`}>{a.persetujuanBerlaku ? "Diberikan" : "Belum"}</span>
                      </td>
                      <td>
                        {k?.status === "terhubung" ? (
                          <span className="status hijau">Terhubung</span>
                        ) : k?.status === "diundang" ? (
                          <span className="status kuning">Menunggu atlet</span>
                        ) : (
                          <span className="status abu_abu">Belum terhubung</span>
                        )}
                      </td>
                      <td className="muted">{k?.sinkronTerakhirAt ? fmtWaktu(k.sinkronTerakhirAt) : "–"}</td>
                      <td>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {k?.status === "terhubung" ? (
                            <>
                              <button
                                className="btn kecil"
                                aria-label={`Sinkron sekarang ${a.nama}`}
                                onClick={() => aksi.jalankan(simulasiSinkronGarmin(svc, a.athleteId), `Simulasi: data Garmin hari ini untuk ${a.nama} diterima.`)}
                              >
                                Sinkron sekarang
                              </button>
                              <button
                                className="btn bahaya kecil"
                                aria-label={`Putuskan ${a.nama}`}
                                onClick={() => {
                                  if (confirm(`Putuskan koneksi Garmin ${a.nama}? Data yang sudah masuk tetap tersimpan, tapi data baru berhenti masuk.`)) {
                                    aksi.jalankan(svc.putuskanGarmin(actor, { athleteId: a.athleteId }), `Koneksi Garmin ${a.nama} diputus.`);
                                  }
                                }}
                              >
                                Putuskan
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn utama kecil"
                              aria-label={`Undang ${a.nama}`}
                              disabled={!pengaturan?.aktif}
                              onClick={() =>
                                aksi.jalankan(
                                  svc.undangHubungkanGarmin(actor, { athleteId: a.athleteId }),
                                  `Undangan terkirim. ${a.nama} bisa menghubungkan akun Garmin di halaman Persetujuan Data.`
                                )
                              }
                            >
                              {k?.status === "diundang" ? "Undang ulang" : "Undang"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function StatusIntegrasi({ pengaturan }: { pengaturan: IntegrasiGarmin | null }) {
  if (!pengaturan) return <span className="status abu_abu">Belum diatur</span>;
  return (
    <div className="row">
      <span className={`status ${pengaturan.aktif ? "hijau" : "abu_abu"}`}>{pengaturan.aktif ? "Aktif" : "Nonaktif"}</span>
      <span className="status abu_abu">{pengaturan.lingkungan === "produksi" ? "Produksi" : "Evaluasi"}</span>
    </div>
  );
}

function FormKredensial({
  pengaturan,
  jalankan,
  setUmpan,
}: {
  pengaturan: IntegrasiGarmin | null;
  jalankan: ReturnType<typeof useAksi>["jalankan"];
  setUmpan: ReturnType<typeof useAksi>["setUmpan"];
}) {
  const { svc, actor, segarkan } = useApp();
  const [aktif, setAktif] = useState(pengaturan?.aktif ?? false);
  const [lingkungan, setLingkungan] = useState<IntegrasiGarmin["lingkungan"]>(pengaturan?.lingkungan ?? "evaluasi");
  const [key, setKey] = useState(pengaturan?.consumerKey ?? "");
  const [secret, setSecret] = useState("");
  const [lihat, setLihat] = useState(false);
  const [jenis, setJenis] = useState<JenisDataGarmin[]>(pengaturan?.jenisData ?? JENIS_DATA.map((j) => j.id));

  const simpan = () =>
    jalankan(svc.aturIntegrasiGarmin(actor, { aktif, lingkungan, consumerKey: key, consumerSecret: secret, jenisData: jenis }), "Pengaturan integrasi Garmin tersimpan.");

  return (
    <>
      <section className="setelan">
        <div className="setelan-ket">
          <h2>Kredensial API</h2>
          <p>Didapat dari Garmin Connect Developer Program setelah aplikasi disetujui. Rahasia tidak pernah ditampilkan ulang.</p>
        </div>
        <div className="card stack">
          <div className="row spread">
            <span>
              <b>Aktifkan integrasi</b>
              <span className="muted kecil" style={{ display: "block" }}>
                Saat nonaktif, data baru dari Garmin tidak diterima.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={aktif}
              aria-label="Aktifkan integrasi Garmin"
              className={`saklar ${aktif ? "nyala" : ""}`}
              onClick={() => setAktif((v) => !v)}
            >
              <span />
            </button>
          </div>
          <label className="field">
            Lingkungan
            <select id="garmin-lingkungan" value={lingkungan} onChange={(e) => setLingkungan(e.target.value as IntegrasiGarmin["lingkungan"])}>
              <option value="evaluasi">Evaluasi (uji coba)</option>
              <option value="produksi">Produksi</option>
            </select>
          </label>
          <label className="field">
            Consumer Key
            <input id="garmin-key" type="text" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <label className="field">
            Consumer Secret
            <span className="hint">
              {pengaturan?.consumerSecretTersimpan ? "Rahasia sudah tersimpan. Kosongkan bila tidak diganti." : "Belum ada rahasia tersimpan."}
            </span>
            <span className="sandi-baris">
              <input
                id="garmin-secret"
                type={lihat ? "text" : "password"}
                autoComplete="new-password"
                placeholder={pengaturan?.consumerSecretTersimpan ? "••••••••••••" : ""}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <button type="button" className="btn kecil" aria-pressed={lihat} onClick={() => setLihat((v) => !v)}>
                {lihat ? "Sembunyikan" : "Tampilkan"}
              </button>
            </span>
          </label>
          <div className="row">
            <button className="btn utama" onClick={simpan}>
              Simpan pengaturan
            </button>
            <button
              className="btn"
              onClick={() => {
                const lengkap = !!pengaturan?.consumerKey && !!pengaturan.consumerSecretTersimpan;
                const pesan = lengkap
                  ? "Simulasi berhasil: kredensial lengkap. Uji sungguhan ke server Garmin butuh backend."
                  : "Simpan Consumer Key dan Consumer Secret terlebih dahulu.";
                const h = svc.catatUjiKoneksiGarmin(actor, { ok: lengkap, pesan });
                if (!h.ok) setUmpan({ jenis: "gagal", teks: h.reason });
                else setUmpan({ jenis: lengkap ? "ok" : "gagal", teks: pesan });
                segarkan();
              }}
            >
              Tes koneksi
            </button>
          </div>
          {pengaturan?.ujiTerakhir && (
            <p className="muted kecil">
              Uji terakhir {fmtWaktu(pengaturan.ujiTerakhir.at)}: {pengaturan.ujiTerakhir.ok ? "berhasil" : "gagal"}. {pengaturan.ujiTerakhir.pesan}
            </p>
          )}
          {pengaturan && <p className="muted kecil">Terakhir diubah {fmtWaktu(pengaturan.diubahAt)}.</p>}
        </div>
      </section>

      <section className="setelan">
        <div className="setelan-ket">
          <h2>Jenis data</h2>
          <p>Ringkasan Garmin yang diminta dan metrik Kondisi Atlet yang diisinya. Minta seperlunya saja.</p>
        </div>
        <div className="card stack" style={{ gap: 4 }}>
          {JENIS_DATA.map((j) => (
            <label key={j.id} className="baris-jenis">
              <input
                type="checkbox"
                checked={jenis.includes(j.id)}
                onChange={(e) => setJenis((v) => (e.target.checked ? [...v, j.id] : v.filter((x) => x !== j.id)))}
              />
              <span className="stack" style={{ gap: 4 }}>
                <b>{j.label}</b>
                <span className="row" style={{ gap: 6 }}>
                  {METRIK_GARMIN.filter((m) => j.metrik.includes(m.kunci)).map((m) => (
                    <span key={m.kunci} className="chip row" style={{ gap: 4 }}>
                      <IkonGarmin path={m.ikon} ukuran={14} />
                      {m.label}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          ))}
          <div style={{ marginTop: 12 }}>
            <button className="btn utama" onClick={simpan}>
              Simpan pengaturan
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function AlamatSalin({ label, nilai }: { label: string; nilai: string }) {
  const [tersalin, setTersalin] = useState(false);
  return (
    <div className="field">
      <span>{label}</span>
      <span className="sandi-baris">
        <input type="text" readOnly value={nilai} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        <button
          type="button"
          className="btn kecil"
          onClick={() => {
            void navigator.clipboard?.writeText(nilai);
            setTersalin(true);
            setTimeout(() => setTersalin(false), 1500);
          }}
        >
          {tersalin ? "Tersalin" : "Salin"}
        </button>
      </span>
    </div>
  );
}
