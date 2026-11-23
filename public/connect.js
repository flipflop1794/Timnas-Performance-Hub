// Test branch (wearables): the athlete's connect page. ?t=<invite>&p=whoop|garmin opens the consent card;
// ?done=whoop|garmin or ?error=... is where the server sends the athlete back after WHOOP's / Garmin's login.
(function () {
  var q = new URLSearchParams(location.search);
  var NAME = { whoop: 'WHOOP', garmin: 'Garmin' };
  var $ = function (id) { return document.getElementById(id); };
  function show(text, cls) { $('msg').hidden = false; $('msgText').textContent = text; $('msgText').className = cls || ''; }
  var ERR = {
    invalid: 'Link tidak dikenal. Minta link baru ke Coach Donny. (Unknown link: ask Coach Donny for a new one.)',
    used: 'Link ini sudah dipakai. Minta link baru ke Coach Donny bila perlu. (This link was already used.)',
    expired: 'Link atau sesi login kedaluwarsa. Minta link baru ke Coach Donny. (The link or login expired.)',
    denied: 'Akses tidak diizinkan di halaman login. Tidak ada data yang dikirim. (Access was not allowed; nothing is shared.)',
    token: 'Login berhasil, tetapi koneksi gagal disimpan. Coba lagi dengan link baru. (Connection could not be saved.)',
    not_ready: 'Koneksi ini belum diaktifkan oleh admin. Coba lagi nanti. (Not switched on yet by the admin.)',
  };
  if (q.get('done')) { show('Berhasil terhubung ke ' + (NAME[q.get('done')] || '') + '. Data akan masuk otomatis; halaman ini boleh ditutup. (Connected. You can close this page.)', 'ok'); return; }
  if (q.get('error')) { show(ERR[q.get('error')] || 'Terjadi kesalahan. (Something went wrong.)', 'err'); return; }
  var t = q.get('t'); var p = q.get('p');
  if (!t || !/^[A-Za-z0-9_-]{24,80}$/.test(t) || !window.HUB_WEARABLES) { show(ERR.invalid, 'err'); return; }
  $('ask').hidden = false;
  $('title').textContent = 'Hubungkan ' + (NAME[p] || 'jam / band') + ' Anda';
  var go = $('go');
  go.href = window.HUB_WEARABLES + '/start?t=' + encodeURIComponent(t);
  $('agree').addEventListener('change', function (e) { go.setAttribute('aria-disabled', e.target.checked ? 'false' : 'true'); });
})();
