# Timnas Performance Hub V1.7 — Athlete Readiness (UI preview)

Prepared 3 Nov 2026. Not published: files only.

- The "Players" section is renamed **Performance**. Its first tab is **Athlete readiness (preview)**, labelled "Preview — Coach Donny's Athlete Readiness System (Future Integration)."
- It follows the layout of Coach Donny's dashboard (screenshot, 31 Oct), in the hub's own design system (dark and light themes, phone layout):
  - KPIs: checked in, red, amber, average readiness;
  - a focus athlete card with a readiness ring, wellness, sleep z and load;
  - a 7-day team trend with the "ready" line and a table view;
  - an athlete table, most in need first;
  - a "needs follow-up" list;
  - a daily check-ins panel.
- **All disciplines:** choose any of the seven titles or all titles together.
- **Dummy data only.** Athletes are placeholders ("CS2 · Athlete 3"), not real Timnas players, so demo numbers can't be mistaken for a real player's health data. Buttons that need his system are shown but disabled. Nothing is saved, scored or fetched.
- **Modular:** `src/readiness/` holds the contract, the mock provider and the view. Integration path: docs/READINESS_INTEGRATION.md.
- 61 automated tests pass. New tests cover the contract for every title, all five components plus the label, no real names, rendering data from a non-mock provider, and filtering on the page.
