// Calendar dates in the viewer's own time zone (WIB for the staff). toISOString() is UTC, which
// before 07:00 WIB gives yesterday's date, so every "today" in the hub goes through here.
export function localDay(d = new Date()) {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
}
export const shiftDay = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
