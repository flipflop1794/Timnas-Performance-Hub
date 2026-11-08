import { useState } from "react";
import type { HasilMasuk } from "./akun.js";

export type Sebagai = "admin" | { userId: string };

/**
 * Halaman masuk. Prototipe ini belum punya autentikasi sungguhan: akun admin
 * membuka semua persona, sedangkan akun atlet dan staf (diatur Super admin
 * atau Admin di form profil) langsung masuk sebagai pemilik akun itu saja.
 */
export function Masuk({
  periksa,
  masuk,
  contoh,
}: {
  periksa(username: string, password: string): HasilMasuk;
  masuk(sebagai: Sebagai): void;
  contoh?: boolean;
}) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [lihat, setLihat] = useState(false);
  const [dicoba, setDicoba] = useState(false);
  const [salah, setSalah] = useState("");

  const userKosong = dicoba && !user.trim();
  const passKosong = dicoba && !pass;

  return (
    <main className="masuk">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setDicoba(true);
          setSalah("");
          if (!user.trim() || !pass) return;
          const h = periksa(user, pass);
          if (h.ok) masuk(h.sebagai);
          else setSalah(h.alasan);
        }}
      >
        <div className="masuk-kepala">
          <img className="logo-lengkap" src={`${import.meta.env.BASE_URL}logo-esi.png`} alt="Esports Federation of Indonesia" />
          <h1 className="sr-only">Esports Indonesia</h1>
        </div>

        <div className="masuk-isian">
          <label htmlFor="username">Nama pengguna</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            value={user}
            aria-invalid={userKosong || !!salah}
            onChange={(e) => setUser(e.target.value)}
          />
          <span className="masuk-galat">{userKosong ? "Isi nama pengguna." : ""}</span>
        </div>

        <div className="masuk-isian">
          <label htmlFor="password">Kata sandi</label>
          <div className="masuk-sandi">
            <input
              id="password"
              name="password"
              type={lihat ? "text" : "password"}
              autoComplete="current-password"
              value={pass}
              aria-invalid={passKosong || !!salah}
              onChange={(e) => setPass(e.target.value)}
            />
            <button type="button" aria-pressed={lihat} onClick={() => setLihat((v) => !v)}>
              {lihat ? "Sembunyikan" : "Tampilkan"}
            </button>
          </div>
          <span className="masuk-galat" role={salah ? "alert" : undefined}>
            {passKosong ? "Isi kata sandi." : salah}
          </span>
        </div>

        <button type="submit" className="masuk-tombol">
          Masuk
        </button>
        <p className="masuk-demo">Akun admin prototipe: admin / admin</p>
        {contoh && <p className="masuk-demo">Menampilkan data contoh untuk gambaran, bukan data asli atlet.</p>}
      </form>
    </main>
  );
}
