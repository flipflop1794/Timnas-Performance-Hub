# Hub V1.58 — support staff: "Laporan harian" and "Progres mingguan" on their own tabs (25 Nov 2026)

**Owner's ask:** the support staff page opened on the weekly numbers; the form they fill every day came after the
week strip, "My work this week", the recap and "Day by day". Put the weekly progress on another tab, so the main tab
is only what they input day to day.

**What changed (support staff who file reports: physios, psychologists, team doctor, physical coach):**
- **Laporan harian** (Daily report, opens first): the daily report form at the top (date, paste from WhatsApp → AI,
  follow-ups still open, athletes, Save, Copy for WhatsApp); under it, folded, their own reports of 14 days to check
  or edit. No weekly numbers.
- **Progres mingguan** (Weekly progress): the week strip and arrows, "Pekerjaan saya minggu ini" (days reported,
  athletes handled, visits, with the change from last week), the recap lines and "Salin rekap saya untuk WA", "Hari
  demi hari", "Yang sudah Anda kerjakan".
  - Tapping a day on the strip shows that day's reports right under the strip; **Ubah** (Edit) opens the report in
    Laporan harian.
  - A day without a report keeps "Isi sekarang" / "Tambahkan": it opens Laporan harian on that date.

**Unchanged:** Coach Donny, the Head Coach and admins (they read everyone's reports): same page as before (Perlu dicek,
Hari ini, Tim support minggu ini), no new tab. Same data, same privacy.

**Guide:** the support staff section names the two tabs.

**Tests:** `tests/web/support_v154_web.test.js` (new V1.58 test: the daily tab has no weekly numbers; a day on Weekly
progress shows its reports; Edit and "Add it" open the daily tab; Coach Donny has no new tab), plus
`support_web.test.js` and `support_v150_web.test.js` updated for the two tabs.
