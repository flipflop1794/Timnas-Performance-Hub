// Feeds the hub's readiness board (donnyProvider.js) straight from Coach Donny's service running in the hub,
// so the "Hub view" shows his scores, not dummy data. Read-only; acts as one of his coaching staff.
import { resolveScoreConfig, SKOR_FORMULA_VERSION, type Actor } from '../../../vendor/donny-monitoring/src/index.js';
import { TEAM_ID } from '../../../vendor/donny-monitoring/web/src/demo.js';
import type { HubStorage } from './store.js';

type Svc = { papanTim(a: Actor, p: { tanggal: string }): { ok: boolean; data?: unknown[]; reason?: string } };

export function localSource(store: { svc: unknown; storage: HubStorage }, actor: () => Actor | null) {
  const athletes = () => store.storage.listAthletesByTeam(TEAM_ID).filter((a) => !a.archived);
  const kelompok = (id: string) => athletes().find((a) => a.id === id)?.kelompok || '';
  return {
    async papanTim(tanggal: string) {
      const a = actor(); if (!a) throw new Error("No coaching staff in Coach Donny's team list yet.");
      const r = (store.svc as Svc).papanTim(a, { tanggal });
      if (!r.ok) throw new Error(r.reason || "Coach Donny's system refused the request.");
      return (r.data as { athleteId: string }[]).map((row) => ({ ...row, kelompok: kelompok(row.athleteId) }));
    },
    async trenTim({ dari, sampai }: { dari: string; sampai: string }) {
      return athletes().flatMap((at) => store.storage.listDailyScoresByAthlete(at.id, dari, sampai).map((s) => ({ ...s, kelompok: at.kelompok || '' })));
    },
    async konfigurasiSkor() {
      return { ...resolveScoreConfig(store.storage.getTeam(TEAM_ID)), formulaVersion: SKOR_FORMULA_VERSION };
    },
  };
}
