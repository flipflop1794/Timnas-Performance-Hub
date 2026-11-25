# Hub V1.57 — every section on the top bar again, no Menu (25 Nov 2026)

**Owner's ask:** the "Menu" of V1.55 hid most sections; after every page change it closed again and had to be opened
again. "Very inefficient and clunky." Go back to how it was up to V1.54: everything visible.

**What changed:**
- The Menu button is gone. Every section the person can open is on the top bar, always.
- Order: Home, the sections, then the name, Sandbox demo, Tampilkan semua (focus mode), EN/ID and **Keluar** (last,
  as since V1.56).
- What stays from V1.55: the colours, thumb-sized buttons, plain plurals and the shorter header on phones.

**What each account sees:**

| Account | Top bar |
|---|---|
| Head Coach team (Aufa, Fayad, Donny) | Home, Hari ini, Pelatnas, Kompetitor, Turnamen, the 7 titles, Performa, Guide, Staf, name, Sandbox demo, Tampilkan semua, EN/ID, Keluar. Laptop: 2 lines. Phone: about 7 lines. |
| Support staff | Performa, Guide, name, EN/ID, Keluar |
| Coach with one title | Home, their title, name, Lainnya, EN/ID, Keluar |

**Tests:** `tests/v155.test.js` (every section on the bar, no Menu, still there after changing page),
`tests/web/web_ui.test.js` (Keluar on the bar, no Menu).
