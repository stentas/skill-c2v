# Lessons from earlier productions

From an earlier production: a 3:45 narrated feature-documentation video for a tender, 16 scenes,
recreated UI with fictional data, ~75 min wall clock with parallel agents.

## Where the time went
| Phase | Time | Cause | Fix now in place |
|---|---|---|---|
| Foundation | 21 min | generic engine written from scratch | toolkit reused |
| Scene agents (3 parallel) | 37 min | each re-read product source; many full renders; each worked around the same engine bug | stills-only iteration, central bug fixes, fixed engine |
| Style correction + re-render all | 15 min | colour differences found after scenes were done | design lock in phase 4 |
| Stall at the end | 5 min | font check failed on a text-less scene; render delegated to an agent | explicit font load; render from main session |

## Pitfalls
- **Server vs UI truth.** The UI filtered a user's data correctly, but the server still allowed
  access to everything in the organisation. Verify enforcement server-side before saying "the user
  only has access to …".
- **Stylesheet order.** Design-library variables said one text colour; a later global stylesheet
  overrode it for `body`, while form controls and muted text still used the library variable.
  Resolve which rule wins per element.
- **Hidden targets.** Cursor/camera targets inside a closed dialog or a removed row measured as (0,0)
  → fixed in the engine (cached targets). `display:none` crossfades break measuring → use opacity.
- **Hover** reacts to anything the cursor passes over; bow cursor paths around buttons.
- **Fonts from the network** fail intermittently in headless rendering → local fonts.
- **Hard-coded UI values** (a column that always showed the same text regardless of data)
  contradict the story; list them as must-fix and show the corrected UI only if the fix will ship.
- **Wrong texts in real assets** (an outdated e-mail subject, i18n typos, rich-text markers that do
  not match their components) – show corrected text or crop, and list the fix.
- **Destructive actions without confirmation** – never click them unless the scene is about them.
- **Third-party pages** (identity-provider login) – neutral stand-in only.
- **Voice text drift.** The voiced text differed slightly from the storyboard; agents must follow the
  audio text and update on-screen summaries accordingly.
- **Every video looked the same.** The engine's overlay defaults (orange frame, arrow cursor, same
  easing) were used in every production → themes, chosen per video (`references/themes.md`).
- **Mechanical steps in agents** add latency and can stall; run render/assemble as plain commands.
