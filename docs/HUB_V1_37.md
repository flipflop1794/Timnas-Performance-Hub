# Hub V1.37 — physio pain map (21 Nov 2026)

From the physio reference picture (tender points, front and back).

## Put it live
- **Website only:** merge to `main`. No database change (the spots are stored inside the support report row).

## Performance → Support staff (physio)
- Every athlete or coach row of a physio report has a **pain map**: a back and a front body figure, drawn for the hub.
  Points from the reference: occiput, trapezius, supraspinatus, gluteal, greater trochanter (back); low cervical,
  second rib, lateral epicondyle, knee, ankle (front); plus wrist, hand / fingers, upper back, lower back and eyes
  for esports. Left and right are separate.
- Tap a spot (or pick it from the list on a phone), then give it a pain score 0–10 (optional). Tap again to remove it.
- The saved report shows the spots in words ("Lutut kiri 6/10") and on a small map, coloured by score
  (green 0–3, orange 4–6, red 7–10, blue without a score). WhatsApp copy adds "Titik nyeri: …".
- **My summary** (physio) and **Support team progress** show "Pain spots (7 days)": a map with bigger dots where
  more athletes hurt, the top spots, and the top spots per team.
- Edits to spots appear in the edit history. Same readers as before: the physio, Coach Donny, the Head Coach, admins.
