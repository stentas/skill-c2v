# Storyboard template

Write the storyboard in the user's language (Norwegian bokmål for Norwegian products). File:
`<project>/<topic>/video-storyboard.md`.

## 1. Scene overview

Start = estimated mm:ss before audio exists (≈140 words/min + 1–2 s per scene); replace with real
clip durations after `voice-meta`.

| # | Start | Duration | Scene | Requirements covered | Type |
|---|---|---|---|---|---|
| 01 | 00:00 | 16 s | Intro | – | Graphics |
| 02 | 00:16 | 24 s | Concept (e.g. roles) | 2 | Graphics / exploded view |
| 03 | 00:40 | 9 s | Navigation to feature | 1 | UI |
| … | | | | | |
| NN | | 25 s | Summary and limitations | unsupported reqs | Graphics |
| – | | 3 s | End card / logo | – | Graphics |

Requirement coverage table: requirement → scenes, or "Not supported – stated in scene NN".

## 2. Scenes

Per scene:

```
### Scene NN – <title> · mm:ss
**Audio file:** NN-<slug>.mp3
> <exact voice text, ready for ElevenLabs>
**Screen/action:** numbered steps with exact UI texts in «», cursor targets, what is highlighted
**Source components:** paths in the product repo
**Note:** pitfalls (a dialog that looks confusing for some roles, a destructive button without
confirmation that must not be clicked, etc.)
```

Rules for voice text: numbers as words ("sju"), no parentheses or abbreviations, UI names exactly
as on screen, neutral factual tone. The closing scene states unsupported requirements plainly.

## 3. Must be fixed before the video is used

| # | Problem | Where (file) | Scenes |
|---|---|---|---|

Include: wrong/hard-coded columns, typos, wrong e-mail subjects, i18n markup bugs, server-side
gaps that make a spoken claim untrue.

## 4. Production
- Demo data story (fictional org, users, objects, dates; what changes in which scene).
- Voice settings, pronunciation tests.
- UI route chosen and why.
- Theme: <preset> (+ deviations) per `references/themes.md`, with the reason for the choice in one line.
- Visual guidelines: calm cursor (1–1.4 s per move, click ~0.3 s after arrival), zoom 110–160 %,
  no on-screen text that only repeats the voice (except role/level names in diagrams and the summary).

## 5. Fact table

| Claim in voice text | Source (file:line) |
|---|---|

## Boundary table (in the project README, filled by the foundation agent)

| Cut | Page/state | Modal | Camera (s, cx, cy) | Cursor |
|---|---|---|---|---|
| 03 → 04 | list page, data v1 | none | base | rest |
