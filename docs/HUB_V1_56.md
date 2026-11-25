# Hub V1.56 — Keluar (Sign out) always visible (25 Nov 2026)

**Owner's ask:** the Keluar button should be visible without anyone having to open Menu.

**What changed:** Keluar moved from under Menu to the top row, last, after Menu. It shows for every signed-in
account (coaches, support staff, Head Coach, admins). The account name stays under Menu.

Checked at phone width (375 px): the row stays on one line, with no sideways scrolling.

**Tests:** `tests/web/web_ui.test.js` (Keluar sits on the top row while Menu is closed).
