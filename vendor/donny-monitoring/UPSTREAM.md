# Coach Donny's Athlete Readiness System (vendored)

- **Author and owner:** Dr. Donny Ardy Kusuma, M.Kes. (Assistant Coach 1, sport scientist, Timnas Esports).
- **Source:** https://github.com/donnyakusuma/esportsindonesiamonitoring
- **Version taken:** `main` @ `56d88c28e0c48a60cdef48f73ff40e0511cc89b3` (6 Nov 2026, "Struktur Timnas, Indeks Performa, data contoh, dan deploy GitHub Pages").
- **Permission:** Coach Donny agreed to his code being used inside the Timnas Performance Hub (confirmed by Aufa Bassam, 8 Nov 2026). The repository has no licence file; all rights stay with Coach Donny. Do not reuse this folder outside the hub without asking him.

## Rule: this folder is his code, unchanged

Nothing in this folder is edited by the hub. Everything that connects it to the hub lives in
`src/readiness/donny/` (storage in the hub database, hub sign-in, mounting his screens). To take his next version:

```bash
git clone --depth 1 https://github.com/donnyakusuma/esportsindonesiamonitoring /tmp/donny
rm -rf vendor/donny-monitoring/{src,tests,web/src,web/public}
cp -R /tmp/donny/{src,tests} vendor/donny-monitoring/ && cp -R /tmp/donny/web/{src,public} vendor/donny-monitoring/web/
# update the commit above, then: npm test   (runs his tests too)
```

Not used inside the hub: his `web/src/main.tsx`, `App.tsx`, `Masuk.tsx` (stand-alone shell and demo sign-in) and
`akun.ts` passwords. The hub provides its own shell with the hub's sign-in.
