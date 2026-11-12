// V1.15 "Guide" page: how to use the hub, per task, in English and Bahasa Indonesia. Each section says who
// it is for, links to the screen, and says when a part is not switched on yet on this site.

// key: section id; en / id: the English and Indonesian text.
const S = (key, feat, who, open, en, id) => ({ key, feat, who, open, en, id });
export const GUIDE = [
  S('start', null, { en: 'Everyone', id: 'Semua' }, 'today',
    { title: 'Start here', steps: [
      'Sign in with the email and password from your invite. Forgot it? Use "Forgot password" on the sign-in page.',
      'The top menu has your areas: Today, your game(s), Performance, Staff. Title coaches see only their own game.',
      'EN | ID switches the language. Names, notes and numbers stay as written.',
      'On a phone: open the hub in Chrome or Safari, then "Add to Home screen". It opens like an app.',
      'Want to practise first? Press "Demo sandbox": sample data, nothing is saved, nobody else sees it. Press again to leave.',
    ] },
    { title: 'Mulai di sini', steps: [
      'Masuk dengan email dan kata sandi dari undangan. Lupa? Pakai "Forgot password" di halaman masuk.',
      'Menu atas berisi area Anda: Today, game Anda, Performance, Staff. Pelatih title hanya melihat game-nya sendiri.',
      'EN | ID mengganti bahasa. Nama, catatan dan angka tetap seperti ditulis.',
      'Di HP: buka hub di Chrome atau Safari, lalu "Add to Home screen". Hub terbuka seperti aplikasi.',
      'Mau latihan dulu? Tekan "Demo sandbox": data contoh, tidak disimpan, tidak dilihat orang lain. Tekan lagi untuk keluar.',
    ] }),
  S('report', null, { en: 'Title coaches, analysts', id: 'Pelatih title, analis' }, 'reports-all',
    { title: 'File the daily scrim report', steps: [
      'Open your game → Scrim reports. One report per sparring partner, the same day.',
      'Fill the required fields first: partner, result, focus, plan-followed rating (1–5, your judgement), what worked, what failed, the one adjustment for next time.',
      'Use the quick picks (today\'s planned partner, quick scores, recent focus) and "Copy setup from last report" to save typing.',
      'Player notes are about performance only. No health, family or contact details (the hub refuses phone and ID numbers).',
      'A saved report cannot be edited: add a dated correction under it instead.',
    ] },
    { title: 'Isi laporan scrim harian', steps: [
      'Buka game Anda → Scrim reports. Satu laporan per lawan sparring, di hari yang sama.',
      'Isi kolom wajib dulu: lawan, hasil, fokus, nilai rencana dijalankan (1–5, penilaian Anda), yang berhasil, yang gagal, satu penyesuaian untuk berikutnya.',
      'Pakai pilihan cepat (lawan yang dijadwalkan hari ini, skor cepat, fokus terakhir) dan "Copy setup from last report" agar cepat.',
      'Catatan pemain hanya soal performa. Tanpa kesehatan, keluarga atau kontak (hub menolak nomor HP dan nomor ID).',
      'Laporan tersimpan tidak bisa diubah: tambahkan koreksi bertanggal di bawahnya.',
    ] }),
  S('pelatnas', 'pelatnas', { en: 'All staff; camp dates: Head Coach, admins', id: 'Semua staf; tanggal pelatnas: Head Coach, admin' }, 'pel-day',
    { title: 'Pelatnas: dates, availability, attendance', steps: [
      'Pelatnas → Availability: the camp dates stay "TBD" until the Head Coach or an admin records them, and "proposed" until PB ESI confirms them.',
      'Send players the ready message (Bahasa Indonesia or English, "Copy message"). It asks only for dates and a reason category, and says the SK and compensation will come officially from PB ESI.',
      'Record each answer: status, available from–to, dates not possible with a reason category. No health, family or contact details.',
      'Plan every session (scrim, review, individual practice, physical) in your game\'s Scrims & practice tab. It then shows on Pelatnas → Schedule & attendance.',
      'Take attendance per session: "Everyone present", then change who was late, absent or excused, and press "Save attendance". Today shows how many players have not answered and how many sessions still need attendance.',
    ] },
    { title: 'Pelatnas: tanggal, ketersediaan, kehadiran', steps: [
      'Pelatnas → Availability: tanggal pelatnas tetap "TBD" sampai Head Coach atau admin mencatatnya, dan "usulan" sampai PB ESI mengonfirmasi.',
      'Kirim pesan siap pakai ke pemain (Bahasa Indonesia atau English, "Copy message"). Pesan hanya menanyakan tanggal dan kategori alasan, dan menyebut SK serta kompensasi akan diinformasikan resmi oleh PB ESI.',
      'Catat setiap jawaban: status, tersedia dari–sampai, tanggal yang tidak bisa dengan kategori alasan. Tanpa info kesehatan, keluarga atau kontak.',
      'Rencanakan setiap sesi (scrim, review, latihan individu, fisik) di tab Scrims & practice game Anda. Sesi lalu muncul di Pelatnas → Schedule & attendance.',
      'Isi kehadiran per sesi: "Everyone present", lalu ubah yang terlambat, absen atau izin, tekan "Save attendance". Today menunjukkan berapa pemain belum menjawab dan berapa sesi belum diisi kehadirannya.',
    ] }),
  S('capture', 'capture', { en: 'MLBB, MLBB Women, Dota 2 coaches', id: 'Pelatih MLBB, MLBB Women, Dota 2' }, 'mlbb-reports',
    { title: 'Games from end-of-game screenshots', steps: [
      'In the report form, under Games, press "Read a screenshot" and pick the end-of-game screenshot (Dota: add the second screen with "Add another screenshot").',
      'Check every value. Highlighted cells are where the AI was unsure or a check failed (kills do not add up, unknown hero, duplicate hero). Tap a suggested hero to fill it.',
      'MLBB: set the map side (blue/red) yourself; it is not on the screenshot.',
      'Press "Confirm game". Nothing is saved before that. Confirmed games fill the report\'s W-L.',
      'No AI or a bad screenshot? "Add game by hand" gives the same screen empty. A saved game can be fixed with "Fix" under the report.',
    ] },
    { title: 'Game dari screenshot akhir game', steps: [
      'Di form laporan, bagian Games, tekan "Read a screenshot" dan pilih screenshot akhir game (Dota: tambah layar kedua dengan "Add another screenshot").',
      'Cek setiap nilai. Sel yang disorot berarti AI ragu atau pengecekan gagal (kill tidak cocok, hero tidak dikenal, hero ganda). Ketuk hero yang disarankan untuk mengisi.',
      'MLBB: isi sisi map (blue/red) sendiri; tidak ada di screenshot.',
      'Tekan "Confirm game". Belum ada yang tersimpan sebelum itu. Game yang dikonfirmasi mengisi W-L laporan.',
      'Tanpa AI atau screenshot buruk? "Add game by hand" memberi layar yang sama kosong. Game tersimpan bisa diperbaiki lewat "Fix" di bawah laporan.',
    ] }),
  S('debrief', 'ai', { en: 'All title coaches', id: 'Semua pelatih title' }, 'reports-all',
    { title: 'Say it once (dictated debrief)', steps: [
      'In the report form, open "Say it once" and dictate or type one note about the session.',
      'The AI moves your own words into the report fields. Any field with words you did not say is flagged: read it before saving.',
      'Health, sleep, mood, family and contact details are left out automatically (wellbeing goes to Coach Donny).',
    ] },
    { title: 'Say it once (debrief diktekan)', steps: [
      'Di form laporan, buka "Say it once" lalu diktekan atau ketik satu catatan tentang sesi.',
      'AI memindahkan kata-kata Anda sendiri ke kolom laporan. Kolom berisi kata yang tidak Anda ucapkan ditandai: baca sebelum menyimpan.',
      'Kesehatan, tidur, mood, keluarga dan kontak otomatis dikeluarkan (wellbeing ke Coach Donny).',
    ] }),
  S('patterns', 'capture', { en: 'MLBB, MLBB Women, Dota 2 staff', id: 'Staf MLBB, MLBB Women, Dota 2' }, 'mlbb-patterns',
    { title: 'Patterns and findings', steps: [
      'Your game → Patterns: numbers the hub computes from confirmed games only (side, game length, first pick, heroes, bans against us, partner level, per player). "Under 5 games" means: do not act on it yet.',
      '"Look for patterns (AI)" proposes up to five findings. The hub drops any that use a number it did not compute.',
      'Mark each finding useful / already known / wrong. Findings marked known or wrong are not repeated until 5 more games back them.',
      '"Turn into a proposal" sends it to the usual approver (Staff → Coaching cycle).',
    ] },
    { title: 'Pola dan temuan', steps: [
      'Game Anda → Patterns: angka yang dihitung hub dari game terkonfirmasi saja (side, durasi, first pick, hero, ban terhadap kita, level lawan, per pemain). "Under 5 games" artinya: jangan diputuskan dulu.',
      '"Look for patterns (AI)" mengusulkan sampai lima temuan. Hub membuang temuan yang memakai angka yang tidak dihitung hub.',
      'Tandai tiap temuan useful / already known / wrong. Temuan bertanda known atau wrong tidak diulang sampai ada 5 game baru.',
      '"Turn into a proposal" mengirimnya ke penyetuju biasa (Staff → Coaching cycle).',
    ] }),
  S('draft', 'draftRoom', { en: 'MLBB and MLBB Women staff', id: 'Staf MLBB dan MLBB Women' }, 'mlbb-draft',
    { title: 'Draft Room', steps: [
      'MLBB → Draft Room. Mock draft: choose our side and opponent, press "Start the clock", type a hero and press Enter (or tap a quick pick). "No ban" if a ban ran out of time. Save the draft at the end.',
      'Draft books: one per opponent (bans, protect, flex picks, plan per side). Every save is a new version; another coach approves it. The approved book shows on the opponent card.',
      'Hero pools: rate each player\'s heroes main / can play / learning. Suggestions come from confirmed scrim games.',
      'Drills: write a draft situation and a question, then run it against the clock with each player.',
      'Pro games: an analyst imports public pro games as CSV (format on the page). They stay apart from our numbers.',
    ] },
    { title: 'Draft Room', steps: [
      'MLBB → Draft Room. Mock draft: pilih side kita dan lawan, tekan "Start the clock", ketik hero lalu Enter (atau ketuk pilihan cepat). "No ban" jika waktu ban habis. Simpan draft di akhir.',
      'Draft book: satu per lawan (ban, protect, flex pick, rencana per side). Setiap simpan jadi versi baru; pelatih lain yang menyetujui. Book yang disetujui tampil di opponent card.',
      'Hero pool: nilai hero tiap pemain main / can play / learning. Saran diambil dari game scrim terkonfirmasi.',
      'Drill: tulis situasi draft dan pertanyaan, lalu jalankan dengan waktu untuk tiap pemain.',
      'Pro games: analis mengimpor game pro publik dalam CSV (format ada di halaman). Data ini terpisah dari angka kita.',
    ] }),
  S('readiness', 'donny', { en: 'Coach Donny, admins', id: 'Coach Donny, admin' }, 'readiness',
    { title: 'Athlete readiness (Coach Donny\'s system)', steps: [
      'Performance → Athlete readiness opens Coach Donny\'s own system, signed in with your hub account. Only Coach Donny and admins can see it.',
      'Before the first check-in: as Super admin (admins: "View as" the BTN chair / team manager), record each athlete\'s data consent. Check-ins count only after that.',
      'Staff entry: "Enter for an athlete" opens that athlete\'s check-in and session-RPE screens; fill them in with the athlete. A yellow bar shows it is a staff entry.',
      'Team board, notes and follow-ups, score settings and the audit log are on the left menu. Scores and thresholds are Coach Donny\'s; the hub only stores them.',
      '"Hub view" shows the same scores on the hub\'s board.',
    ] },
    { title: 'Kesiapan atlet (sistem Coach Donny)', steps: [
      'Performance → Athlete readiness membuka sistem Coach Donny sendiri, masuk dengan akun hub Anda. Hanya Coach Donny dan admin yang bisa melihat.',
      'Sebelum check-in pertama: sebagai Super admin (admin: "View as" Ketua BTN / manajer tim), catat persetujuan data tiap atlet. Check-in baru dihitung setelah itu.',
      'Entri staf: "Enter for an athlete" membuka layar check-in dan RPE sesi atlet itu; isi bersama atletnya. Bar kuning menandai entri staf.',
      'Papan tim, catatan dan tindak lanjut, pengaturan skor dan log audit ada di menu kiri. Skor dan ambang milik Coach Donny; hub hanya menyimpan.',
      '"Hub view" menampilkan skor yang sama di papan hub.',
    ] }),
  S('competitors', null, { en: 'All staff', id: 'Semua staf' }, 'comp-card',
    { title: 'Competitors and the opponent card', steps: [
      'Competitors → All nations / Nation profile: the published WEC field and our notes. Add notes with a source; mark each as observed or hypothesis.',
      'Scouting coverage → "Scout next": unscouted threats first, then notes older than 21 days.',
      'Opponent card: pick title and nation. The hub fills tier, notes, roster, reviewed VODs, heroes both sides play (Dota) and our draft book (MLBB). You add 1–3 key points, likely plan, our answer; the focus owner approves. Print or download.',
    ] },
    { title: 'Kompetitor dan opponent card', steps: [
      'Competitors → All nations / Nation profile: daftar peserta WEC resmi dan catatan kita. Tambah catatan dengan sumber; tandai observed atau hypothesis.',
      'Scouting coverage → "Scout next": ancaman yang belum di-scout dulu, lalu catatan yang lebih dari 21 hari.',
      'Opponent card: pilih title dan negara. Hub mengisi tier, catatan, roster, VOD, hero yang dimainkan kedua tim (Dota) dan draft book kita (MLBB). Anda menambah 1–3 poin kunci, rencana lawan, jawaban kita; focus owner menyetujui. Cetak atau unduh.',
    ] }),
  S('tournament', null, { en: 'Head Coach, focus owners, Coach Donny', id: 'Head Coach, focus owner, Coach Donny' }, 'tour-runbook',
    { title: 'Tournament week', steps: [
      'Tournament → Match-day runbook: the D-1 to match-start checklist per title. It says "not yet agreed" until the staff edit it.',
      'Add WEC match cards (15–20 Dec) and tick items by name.',
      'Between games: per game, side, outcome, worked, failed, one required adjustment. Coaching-contact rules are still unconfirmed with IESF.',
    ] },
    { title: 'Pekan turnamen', steps: [
      'Tournament → Match-day runbook: checklist H-1 sampai mulai pertandingan per title. Tertulis "not yet agreed" sampai staf mengubahnya.',
      'Tambahkan kartu pertandingan WEC (15–20 Des) dan centang item dengan nama.',
      'Between games: per game, side, hasil, yang berhasil, yang gagal, satu penyesuaian wajib. Aturan kontak pelatih masih belum dikonfirmasi IESF.',
    ] }),
  S('cycle', null, { en: 'All staff', id: 'Semua staf' }, 'staff-cycle',
    { title: 'Proposals, approvals and player plans', steps: [
      'Ideas become proposals (from a finding, an observation or a report). The approver is shown on each one: Head Coach, admin, or the assistant coach for that game.',
      'Today → My day lists what waits for you.',
      'Performance → Player plans: goals per player (game, physical, mental), with a measure, owner and due date. A goal can follow a scrim stat automatically.',
    ] },
    { title: 'Usulan, persetujuan dan rencana pemain', steps: [
      'Ide menjadi usulan (dari temuan, observasi atau laporan). Penyetuju tertulis di tiap usulan: Head Coach, admin, atau asisten pelatih game itu.',
      'Today → My day menampilkan yang menunggu Anda.',
      'Performance → Player plans: target per pemain (game, fisik, mental), dengan ukuran, penanggung jawab dan tenggat. Target bisa mengikuti statistik scrim otomatis.',
    ] }),
  S('admin', null, { en: 'Admins', id: 'Admin' }, 'admin-users',
    { title: 'For admins', steps: [
      'Staff → Users & access: give each invited person a role and their games. Changes apply after they reload.',
      '"What is switched on" lists newer parts not yet active on this site and what to run.',
      '"AI use this month": calls, failures and estimated cost. Set the real monthly limit in the Claude Console.',
      'Export: one JSON file of everything you can read. It may contain wellbeing data: store it securely.',
    ] },
    { title: 'Untuk admin', steps: [
      'Staff → Users & access: beri setiap orang yang diundang peran dan game-nya. Berlaku setelah mereka memuat ulang.',
      '"What is switched on" menampilkan bagian baru yang belum aktif di situs ini dan apa yang perlu dijalankan.',
      '"AI use this month": jumlah panggilan, gagal dan perkiraan biaya. Atur batas bulanan sebenarnya di Claude Console.',
      'Export: satu file JSON berisi semua yang bisa Anda baca. Bisa berisi data wellbeing: simpan dengan aman.',
    ] }),
  S('rules', null, { en: 'Everyone', id: 'Semua' }, null,
    { title: 'What the hub never does', steps: [
      'It does not show or promise compensation, SK dates, pelatnas dates or budgets until PB ESI confirms them.',
      'It does not invent numbers: every figure comes from your entries, confirmed games or a named public source.',
      'It does not diagnose. Wellbeing and readiness stay with Coach Donny.',
    ] },
    { title: 'Yang tidak pernah dilakukan hub', steps: [
      'Tidak menampilkan atau menjanjikan kompensasi, tanggal SK, tanggal pelatnas atau anggaran sebelum PB ESI mengonfirmasi.',
      'Tidak mengarang angka: setiap angka berasal dari isian Anda, game terkonfirmasi atau sumber publik yang disebutkan.',
      'Tidak mendiagnosis. Wellbeing dan kesiapan tetap di Coach Donny.',
    ] }),
];

export function guidePage({ lang = 'en', feat = {}, isAdmin = false, esc, tag }) {
  const L = lang === 'id' ? 'id' : 'en';
  const list = GUIDE.filter((g) => g.key !== 'admin' || isAdmin);
  const pending = (g) => g.feat && feat[g.feat] === false;
  const toc = list.map((g) => `<button type="button" class="chip" data-guide-jump="${g.key}">${esc(g[L].title)}${pending(g) ? ' ·' : ''}</button>`).join('');
  const sec = (g) => `<section class="panel guide-sec" id="guide-${g.key}"><h2>${esc(g[L].title)}</h2>
    <p class="note">${L === 'id' ? 'Untuk' : 'For'}: ${esc(g.who[L])}${pending(g) ? ` ${tag('s-proposed', L === 'id' ? 'belum aktif di situs ini' : 'not switched on yet on this site')}` : ''}${g.open ? ` · <a href="#${g.open}">${L === 'id' ? 'Buka' : 'Open'} →</a>` : ''}</p>
    <ol class="guide-steps">${g[L].steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></section>`;
  return `<div class="panel hero-panel"><div class="lead">${L === 'id' ? 'Cara memakai <em>hub</em>' : 'How to use the <em>hub</em>'}</div>
    <p class="note">${L === 'id' ? 'Panduan singkat per tugas. Ganti bahasa dengan EN | ID di atas.' : 'Short how-tos per task. Switch language with EN | ID at the top.'}</p><div class="chips">${toc}</div></div>${list.map(sec).join('')}`;
}
