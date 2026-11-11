// Use the team's calendar even when staff are travelling or their device is set to UTC.
const jakarta = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
});
export function localDay(d = new Date()) {
  const parts = Object.fromEntries(jakarta.formatToParts(d).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export const shiftDay = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
