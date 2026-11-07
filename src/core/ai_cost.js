// AI usage and cost estimate for the admin page (V1.13). Prices are USD per million tokens from the
// Claude pricing page, read 7 Nov 2026 (platform.claude.com/docs/en/about-claude/pricing). They are an
// estimate for planning the monthly spend limit; the Claude Console bill is the real figure.
export const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
};
export const PRICES_READ = '2026-11-07';

export function callCost(r, prices = PRICES) {
  const p = prices[r.model];
  if (!p) return null;
  return ((r.input_tokens || 0) * p.input + (r.output_tokens || 0) * p.output + (r.cache_write_tokens || 0) * p.cacheWrite + (r.cache_read_tokens || 0) * p.cacheRead) / 1e6;
}

// rows: ai_usage rows. Returns totals, per action and per title, with the cache share of input tokens.
export function usageSummary(rows, { prices = PRICES } = {}) {
  const blank = () => ({ calls: 0, failed: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, unpriced: 0 });
  const add = (acc, r) => {
    acc.calls++; if (!r.ok) acc.failed++;
    acc.input += r.input_tokens || 0; acc.output += r.output_tokens || 0; acc.cacheRead += r.cache_read_tokens || 0; acc.cacheWrite += r.cache_write_tokens || 0;
    const c = callCost(r, prices); if (c == null) acc.unpriced++; else acc.cost += c;
  };
  const total = blank(); const byAction = {}; const byTitle = {};
  for (const r of rows) { add(total, r); add(byAction[r.action] ||= blank(), r); add(byTitle[r.title || '—'] ||= blank(), r); }
  const allIn = total.input + total.cacheRead + total.cacheWrite;
  return { total, byAction, byTitle, cacheShare: allIn ? total.cacheRead / allIn : 0,
    perScreenshot: byAction.scoreboard?.calls ? byAction.scoreboard.cost / byAction.scoreboard.calls : null };
}
