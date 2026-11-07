// Contact and ID numbers that must not go into performance notes (scrim reports, debriefs, partner bank).
// Until V1.13 the rule was "9 or more digits, spaces allowed", which also refused ordinary stat notes
// such as "gold 10485 10105 9820" or "NW 23589 vs 18930". Now it matches what the numbers look like:
//   - Indonesian mobile numbers: 08…, +62 8…, 62 8… (10–13 digits, spaces/dots/dashes allowed)
//   - any number written with a leading + and 9+ digits (international phone)
//   - an unbroken run of 12+ digits (NIK is 16, KK 16, passport/bank account numbers 10–16): 12+ to stay clear of stats
//   - a 10–11 digit run starting with 0 (landline / account written without spaces)
const MOBILE_ID = /(?:^|[^\d+])(?:\+?62|0)[\s.-]?8(?:[\s.-]?\d){7,11}(?!\d)/;
const INTL = /\+\d(?:[\s().-]?\d){8,}/;
const LONG_RUN = /\d{12,}/;
const ZERO_RUN = /(?:^|\D)0\d{9,10}(?!\d)/;
export const hasContactNumber = (text) => { const t = String(text || ''); return MOBILE_ID.test(t) || INTL.test(t) || LONG_RUN.test(t) || ZERO_RUN.test(t); };
