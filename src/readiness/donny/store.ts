// Coach Donny's system inside the hub (V1.15): his MonitoringService, unchanged, on top of a storage that
// lives in the hub's database. His StoragePort is synchronous, so the hub keeps his in-memory storage as the
// working copy and writes every change through to one table, `readiness_store`, one row per record:
//   id `${map}|${key}` for single records, `${map}|${key}|${itemId}` for each item of a list (audit log,
//   notifications, thread replies), so two devices adding items at the same time never overwrite each other.
// Ids are made unique per device (his counters would collide across devices). Garmin secrets are never stored.
import { MemoryStorage, MonitoringService, MemoryNotificationPort } from '../../../vendor/donny-monitoring/src/index.js';
import { SystemClock } from '../../../vendor/donny-monitoring/src/adapters/systemClock.js';

export const COLLECTION = 'readiness_store';
const SKIP = new Set(['rahasia', 'counters']);          // secrets never leave the device; counters are not used (ids below)
const LIST_MAPS = new Set(['threadReplies', 'notifications', 'auditByTeam']);

export type Row = { id: string; map: string; key: string; item?: string; value: unknown; origin: 'operational' | 'demo'; deleted?: boolean };

let seq = 0;
const deviceTag = Math.random().toString(36).slice(2, 6);
/** His storage with ids that cannot collide between devices, and a flag set by every write. */
export class HubStorage extends MemoryStorage {
  dirty = false;
  override nextId(prefix: string): string { this.dirty = true; return `${prefix}_${Date.now().toString(36)}${deviceTag}${(seq++).toString(36)}`; }
}
const MUTATORS = /^(save|delete|append|simpan|nextId)/;
export function trackWrites(s: HubStorage): HubStorage {
  return new Proxy(s, {
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (typeof v === 'function' && typeof p === 'string' && MUTATORS.test(p)) return (...a: unknown[]) => { t.dirty = true; return v.apply(t, a); };
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

const maps = (s: object): [string, Map<string, unknown>][] =>
  Object.entries(s).filter(([k, v]) => v instanceof Map && !SKIP.has(k)) as [string, Map<string, unknown>][];

/** Every record as rows. */
export function toRows(s: object, origin: Row['origin'] = 'operational'): Row[] {
  const out: Row[] = [];
  for (const [map, m] of maps(s)) for (const [key, value] of m) {
    if (LIST_MAPS.has(map) && Array.isArray(value)) for (const it of value as { id: string }[]) out.push({ id: `${map}|${key}|${it.id}`.slice(0, 200), map, key, item: it.id, value: it, origin });
    else out.push({ id: `${map}|${key}`.slice(0, 200), map, key, value, origin });
  }
  return out;
}
/** Replace the working copy with rows read from the database (lists rebuilt in time order). */
export function fromRows(s: object, rows: Row[]): void {
  const byMap = new Map(maps(s));
  for (const m of byMap.values()) m.clear();
  const lists = new Map<string, Map<string, { at: string; v: unknown }[]>>();
  for (const r of rows) {
    if (r.deleted) continue; // removed record (the hub keeps a marker row; records are never hard-deleted)
    const m = byMap.get(r.map); if (!m) continue;
    if (LIST_MAPS.has(r.map)) {
      const l = lists.get(r.map) || new Map(); lists.set(r.map, l);
      const it = r.value as { at?: string; createdAt?: string };
      const arr = l.get(r.key) || []; arr.push({ at: String(it.at || it.createdAt || ''), v: r.value }); l.set(r.key, arr);
    } else m.set(r.key, r.value);
  }
  for (const [map, l] of lists) for (const [key, arr] of l) byMap.get(map)!.set(key, arr.sort((a, b) => a.at.localeCompare(b.at)).map((x) => x.v));
}
/** What changed since `prev` (id -> JSON): rows to write and ids to delete. */
export function diff(prev: Map<string, string>, rows: Row[]) {
  const next = new Map(rows.map((r) => [r.id, JSON.stringify(r.value)]));
  const put = rows.filter((r) => prev.get(r.id) !== next.get(r.id));
  const del = [...prev.keys()].filter((id) => !next.has(id));
  return { put, del, next };
}

type Coll = { doc(id: string): { set(d: unknown): Promise<unknown> }; onSnapshot(ok: (s: { docs: { data(): unknown }[] }) => void, fail?: (e: unknown) => void): unknown };
export type HubDb = { collection(name: string): Coll };

/**
 * One store per page: his service over the hub database.
 * onChange runs after data from another device arrives (the screens redraw).
 */
export function createDonnyStore(db: HubDb | null, { sid = (s: string) => s, origin = 'operational' as Row['origin'], onChange = () => {}, onError = (_e: unknown) => {} } = {}) {
  const raw = new HubStorage();
  const storage = trackWrites(raw);
  const svc = new MonitoringService(storage, new SystemClock(), new MemoryNotificationPort());
  let saved = new Map<string, string>();
  let loaded = !db;
  let flushing: Promise<void> | null = null;
  let pending = false;

  async function flush() {
    if (!raw.dirty) return;
    raw.dirty = false;
    if (!db) return; // demo sandbox or a page without a database: kept in memory only
    const { put, del, next } = diff(saved, toRows(raw, origin));
    saved = next;
    const coll = db.collection(COLLECTION);
    // A removed record becomes a marker row (the hub's data layer has no hard delete; admins can purge).
    const gone = del.map((id): Row => { const [map, key, item] = id.split('|'); return { id, map, key, ...(item ? { item } : {}), value: null, deleted: true, origin }; });
    const now = Date.now(); for (const r of [...put, ...gone]) mine.set(r.id, { row: r, at: now });
    try { await Promise.all([...put, ...gone].map((r) => coll.doc(sid(r.id)).set(r))); }
    catch (e) { onError(e); }
  }
  /** Call after every command: writes what changed (batched to one write pass at a time). */
  function persist(): Promise<void> {
    if (flushing) { pending = true; return flushing; }
    flushing = flush().finally(() => { flushing = null; if (pending) { pending = false; void persist(); } else if (held) { const h = held; held = null; apply(h); } });
    return flushing;
  }
  let held: Row[] | null = null;
  // Our own writes until the database echoes them back (at most 15 s), so a slightly older snapshot never undoes them.
  const mine = new Map<string, { row: Row; at: number }>();
  const same = (a: Row, b: Row) => !!a.deleted === !!b.deleted && JSON.stringify(a.value) === JSON.stringify(b.value);
  function apply(input: Row[]) {
    const byId = new Map(input.map((r) => [r.id, r]));
    for (const [id, m] of mine) {
      const got = byId.get(id);
      if ((got && same(got, m.row)) || Date.now() - m.at > 15000) mine.delete(id); else byId.set(id, m.row);
    }
    const rows = [...byId.values()];
    if (raw.dirty && loaded) { held = rows; void persist(); return; } // save ours first, then take theirs
    // Ignore the echo of our own writes; take other devices' changes.
    const incoming = new Map(rows.filter((r) => !r.deleted).map((r) => [r.id, JSON.stringify(r.value)]));
    const unchanged = incoming.size === saved.size && [...incoming].every(([k, v]) => saved.get(k) === v);
    if (unchanged && loaded) return;
    fromRows(raw, rows); saved = incoming; loaded = true; onChange();
  }
  // While our own writes are in flight, hold incoming data (it may not include them yet) and apply the latest after.
  if (db) db.collection(COLLECTION).onSnapshot((snap) => {
    const rows = snap.docs.map((d) => d.data() as Row).filter((r) => r && r.origin === origin);
    if (flushing) { held = rows; return; }
    apply(rows);
  }, onError);
  return { svc, storage, persist, get loaded() { return loaded; }, get empty() { return !raw.getTeam('timnas'); } };
}
