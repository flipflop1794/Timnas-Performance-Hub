// Sign-in screens are shown before the hub (and its translator) loads, so they carry their own strings.
const ID: Record<string, string> = {
  'Sign in': 'Masuk', 'Invite-only. Use the email your invitation was sent to.': 'Hanya untuk yang diundang. Gunakan email yang menerima undangan.',
  Email: 'Email', Password: 'Kata sandi', 'Forgot password?': 'Lupa kata sandi?', 'Signing in…': 'Sedang masuk…',
  'Email or password is not correct.': 'Email atau kata sandi salah.', 'Type your email first.': 'Isi email Anda dulu.',
  'Could not send the email. Try again in a few minutes.': 'Email tidak terkirim. Coba lagi beberapa menit lagi.',
  'If that email has an account, a link to set a new password is on its way.': 'Jika email itu punya akun, tautan untuk membuat kata sandi baru sedang dikirim.',
  'Set your password': 'Buat kata sandi Anda', 'At least 10 characters. You will use it to sign in from any device.': 'Minimal 10 karakter. Dipakai untuk masuk dari perangkat mana pun.',
  'New password': 'Kata sandi baru', 'Repeat password': 'Ulangi kata sandi', 'Save password': 'Simpan kata sandi', 'At least 10 characters.': 'Minimal 10 karakter.',
  'The two passwords are different.': 'Kedua kata sandi berbeda.', 'Loading the hub…': 'Memuat hub…',
  'Could not reach the database. Check your connection and sign in again.': 'Database tidak dapat dihubungi. Periksa koneksi lalu masuk lagi.',
  'No access yet': 'Belum ada akses', 'Signed in as': 'Masuk sebagai',
  'Your account has no role yet. Ask the admin to grant access, then reload this page.': 'Akun Anda belum punya peran. Minta admin memberi akses, lalu muat ulang halaman ini.',
  'Sign out': 'Keluar',
};
export const lang = (): 'en' | 'id' => { try { return localStorage.getItem('hub-lang') === 'id' ? 'id' : 'en'; } catch { return 'en'; } };
export const setLang = (l: 'en' | 'id') => { try { localStorage.setItem('hub-lang', l); } catch { /* per-device only */ } };
export const T = (s: string) => (lang() === 'id' ? ID[s] ?? s : s);
