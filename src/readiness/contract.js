// Athlete Readiness — integration contract (UI preview stage).
//
// The hub does NOT score readiness. Coach Donny's system owns check-ins, scoring, thresholds and alerts.
// The hub only renders what a provider returns. Today the only provider is the dummy mock
// (mockProvider.js). When Donny's system is ready, add ONE provider file that returns the same
// shapes (from his API) — or switch the slot to 'embed' and show his dashboard in a frame —
// and change READINESS_SLOT below. The view (view.js) does not change.
//
// Nothing here calls a network, stores data or computes a score.

/**
 * @typedef {'red'|'amber'|'green'|'none'} ReadinessStatus  status as decided by the provider ('none' = no score)
 * @typedef {{ id:string, name:string, title:string, checkedIn:boolean, checkInTime?:string,
 *   readiness:number|null, status:ReadinessStatus, wellness?:number|null, sleepZ?:number|null, loadAU?:number|null,
 *   reason?:string }} AthleteDay   one athlete on one day; the provider lists athletes most-in-need first
 * @typedef {{ date:string, title:string, athletes:AthleteDay[], thresholds:{ red:number, ready:number, label?:string },
 *   scale:{ min:number, max:number } }} TeamDay
 * @typedef {{ date:string, avg:number|null, n:number }} TrendPoint   team average of athletes who have a score
 * @typedef {{ athleteId:string, name:string, title:string, status:ReadinessStatus, text:string, action?:string }} Alert
 * @typedef {{ id:string, label:string, kind:'mock'|'api'|'embed', preview:boolean,
 *   getTeamDay(q:{title:string, date:string}):Promise<TeamDay>,
 *   getTrend(q:{title:string, date:string, days:number}):Promise<TrendPoint[]>,
 *   getAlerts(q:{title:string, date:string}):Promise<Alert[]>,
 *   embedUrl?:string }} ReadinessProvider
 */

// Which provider the hub uses. 'mock' until Donny's system is connected (decision: Donny + Fayad).
export const READINESS_SLOT = { use: 'mock', embedUrl: null };

export const PREVIEW_LABEL = 'Preview — Coach Donny\'s Athlete Readiness System (Future Integration).';

// One call the hub makes: everything the view needs for a title and date.
export async function loadReadiness(provider, { title, date, days = 7 }) {
  const [team, trend, alerts] = await Promise.all([provider.getTeamDay({ title, date }), provider.getTrend({ title, date, days }), provider.getAlerts({ title, date })]);
  return { provider: { id: provider.id, label: provider.label, kind: provider.kind, preview: provider.preview }, team, trend, alerts };
}
