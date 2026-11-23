# Hub V1.50: pain map for physios only, prognosis column for psychologists, "My week" recap (23 Nov 2026)

## 1. Pain map, VAS and body region: physios only
**The owner's request:** only the physios (Coach Ilham, Coach Dewi) should see the pain map, not the rest of the support staff.

**What changed:**
- Only accounts whose support job is **Fisio putra / Fisio putri** get these fields in their daily report form:
  - Peta nyeri (pain map)
  - VAS before/after
  - Body region
- The doctor, the physical coach, the psychologists, Coach Donny and admins never get them.
- The physio role can no longer be picked by hand from "Your role".
- A new report always takes the account's own role.
- **Fixed the cause:** the unsent draft was kept once per device. The role and rows of whoever used the phone last
  could open in the next person's form. That is how a physio form could show for someone else. The draft is now kept
  per account.
- The doctor keeps "Athlete response".
- **Unchanged:** editing a saved physio report keeps its fields, so nothing is lost. Coach Donny, the Head Coach and
  admins still read the physios' findings and the weekly pain spots.

## 2. Psychologists: Prognosis as its own column
**Their request:** in the athlete row, next to the formal/informal counselling session, a **Prognosis** text column.
- **The form:** Session (formal / informal / observation) sits under the athlete's name. Prognosis is a text column
  between Findings and Follow-up.
- **The saved report:** the same columns, with the session as a tag under the name.
- **On a phone:** the columns stack, as before.

## 3. "My week": a recap for every staff member
Under the seven day tiles, each staff member sees their own week:
- **Three numbers:** days reported (x/7), athletes handled (each athlete counted once) and visits (each time seen).
  The small number is the change from the week before.
- **Follow-ups:** written · closed · still open.
- **Their role's numbers:**
  - Physio: pain drop on average and "better" x/y
  - Doctor: better after treatment
  - Psychologist: formal / informal sessions
- **Per team**, and **seen most** (athletes seen 2+ times).
- **"Copy my recap for WhatsApp":** counts only, no athlete names.
- The ‹ › arrows show the recap of earlier weeks.
- Their own reports only. Nobody else's numbers show.

## Tests
- `tests/web/support_v150_web.test.js`:
  - a physio sees the pain map
  - a psychologist, the physical coach and Coach Donny don't, even with a physio draft left on the device
  - the prognosis column in the form and the saved report
  - the recap counts and the names-free copy
- `tests/web/support_web.test.js`: the staff recap numbers.

**Checked at phone size (375 × 812) in Bahasa:** the physio's recap and form, and the psychologist's form.

## Put it live
Merge to `main`. No database or AI change.
