# Engine API – `engine.js` globals

The public surface of the engine for scene files. Project layout, setup, `video.config.json`, the commands and the scene file anatomy are in [README.md](README.md); error messages and their fixes are in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

All names below are globals of `engine.js`. Top-level `const`s are shared between classic scripts but
are not `window` properties; a scene must not declare the same names again (`SyntaxError` → no DEMO).

## Options and constants

`ENGINE_OPTS` = `VIDEO` (from voice.js) overridden by an optional `ENGINE_OPTIONS` defined before
`engine.js`: `{ width, height, fps, lead, tail, page: { w, h }, camBase, cursorRest, hover, columnTable,
theme, audioBase }` (`audioBase` default `"../audio/"`, only via `ENGINE_OPTIONS`). Derived: `STAGE_W`, `STAGE_H`,
`PAGE_W`, `PAGE_H`, `FPS`, `LEAD`, `TAIL`, `CAM_BASE`, `CURSOR_REST`, `HOVER_SELECTOR`, `AUDIO_BASE`,
`THEME` (= `resolveTheme(ENGINE_OPTS.theme)`). Theme: `THEME_PRESETS` (preset table; `frame` = complete base),
`resolveTheme(input, from = base)` → complete theme object (see Themes).
Internal: `CURSOR_SVG`, `warned`/`warnOnce(msg)` (console warning once), `currentCam`, `ACTIVE_THEME` (theme of
the current demo), `showFn`, `startPreview`, `captionLayer()` (creates/re-uses `#captions` for `captionTrack`),
`CUE_LOG`/`logCue(kind, phrase, nth, t)` (log of every `cue()`/`cueEnd()` call made through `sceneInfo`; `DEMO.cues()` returns it, `render.mjs --contact` reads it).

## Themes

A theme is the shape and motion of the overlays and engine defaults; colours stay in `product.css`. Order
(later wins, shallow merge per section):

```
base (= preset "frame")  <  THEME_PRESETS[preset]  <  theme object in video.config.json  <  createDemo({ theme })
```

`"theme": "calm"` = the preset. `{ "preset": "calm", "highlight": { "pad": 6 } }` = preset + overrides; without
`preset` the overrides apply on the base (`createDemo`: on `THEME`; a name or `preset` there starts from the base).
Unknown preset → `theme: ukjent preset «x» (finnes: …)` (script error → no DEMO). No theme anywhere → base +
warning `theme: ingen theme i video.config.json – bruker «frame»`. Per-call values (`pad`, `bow`, `ease`,
`modalAt` opts, `highlights[].style`) still win. `DEMO.theme` = the resolved object.

| Section | Keys (base value) |
|---|---|
| `highlight` | `style` (`"frame"` \| `"underline"` \| `"spotlight"` \| `"glow"` \| `"none"`), `pad` (4 px), `fade` (.3 s, in and out inside [t0, t1]), `width` (2 px; frame, underline), `radius` (8 px; frame, glow, spotlight), `glow` (4 px: ring for frame, blur for glow), `dim` (.45; spotlight darkening) |
| `cursor` | `style` (`"arrow"` \| `"dot"` \| `"none"` = hidden, ripple and hover stay), `size` (28 px), `press` (.85 scale), `pressDur` (.12 s), `ease` (`"inOut"`; move easing), `bow` (.08) |
| `ripple` | `size` (44 px), `dur` (.45 s), `from` (.2) → `to` (1.3) scale, `opacity` (.9 peak) |
| `camera` | `ease` (`"inOut"`; default for keys without `ease`) |
| `modal` | `fade` (.15), `slide` (.3), `offset` (-50), `scaleFrom` (1), `backdrop` (.5), `backdropOutDelay` (.1) – `modalAt` defaults |
| `typing` | `blink` (.53 s caret period) |

| Preset | highlight | cursor | ripple | camera | modal | typing |
|---|---|---|---|---|---|---|
| `frame` | frame, pad 4, fade .3, width 2, radius 8, glow 4 | arrow 28, press .85/.12, inOut, bow .08 | 44, .45, .2→1.3, .9 | inOut | base | .53 |
| `calm` | underline, pad 2, fade .4, width 2 | arrow 28, press .9/.14, inOut, bow .05 | 36, .5, .3→1.1, .5 | out | fade .2, slide .35, offset -24, scaleFrom 1, backdrop .4, delay .1 | .6 |
| `spotlight` | spotlight, pad 8, fade .35, radius 10, dim .45 | dot 18, press .8/.12, inOut, bow .06 | 56, .5, .2→1.4, .6 | inOut | fade .2, slide .3, offset -30, scaleFrom .98, backdrop .55, delay .1 | .53 |
| `energetic` | glow, pad 6, fade .15, radius 10, glow 14 | arrow 26, press .8/.1, out, bow .12 | 48, .3, .3→1.6, .9 | out | fade .1, slide .2, offset -30, scaleFrom .96, backdrop .5, delay .05 | .4 |
| `minimal` | none | none | 40, .4, .3→1.2, .5 | out | fade .2, slide 0, offset 0, scaleFrom .98, backdrop .35, delay .1 | .53 |

Fields not listed = base. Sizes reach `base.css` as custom properties set on `#stage` (`--hl-width`,
`--hl-radius`, `--hl-glow`, `--hl-dim`, `--ripple-size`, `--cursor-size`); the highlight element gets class
`hl <style>`. Do not restyle overlays in scene or product CSS.

## Helpers

| Signature | Returns | Example |
|---|---|---|
| `prog(t, t0, t1)` | 0..1 progress, clamped (step at t1 when t1 ≤ t0) | `prog(t, 2, 2.5)` |
| `lerp(a, b, p)` | interpolated value | `lerp(0, 120, p)` |
| `clamp(v, a = 0, b = 1)` | v limited to [a, b] | `clamp(x, 0, 1670)` |
| `between(t, t0, t1)` | `t0 ≤ t < t1` | `between(t, 3, 5)` |
| `EASE.inOut/out/in/linear` = `easeInOut`, `easeOut`, `easeIn`, `linear` | eased p (cubic) | `easeOut(prog(t, 1, 1.4))` |
| `esc(s)` | HTML-escaped string (`& < > "`) | `` `<b>${esc(name)}</b>` `` |
| `$(sel, root = document)` | first match; an element is returned as is | `$("#save")` |
| `$$(sel, root = document)` | array of matches | `$$(".row").forEach(…)` |

## Stage and geometry

- `ensureStage()` → `#stage`. Creates the missing stage elements and sizes stage/camera.
- `mount(html, where = "camera")` → first inserted element. `"page"`: into `#page` (page states);
  `"camera"`: into `#camera` above the page, below highlights (modals, popups – zoomed);
  `"stage"`: onto the stage above the camera, below the cursor (titles, end cards – not zoomed; use
  class `stage-layer` for a full-stage layer). `mount('<div class="stage-layer">…</div>', "stage")`
- `stageScale()` → stage px per window CSS px (1 when rendering, < 1 in a fitted preview).
- `pageRect(el)` → `{ x, y, w, h }` in page px, independent of the camera. `pageRect("#save")`
- `unionRect(els)` → bounding rect (page px) of a selector string or an iterable of elements/selectors.
- `columnRect(n, table = columnTable)` → rect of column n (1-based) including the header. `columnRect(3)`
- `hasBox(el)` → true when connected and laid out (not `display: none` itself or via an ancestor).
- `pageToStage(px, py)` → `{ x, y }` stage px through the camera of the last applied frame.
- `stagePoint(target)` → stage px measured now (live): `{ sel, ax = .5, ay = .5, dx?, dy? }` (anchor in
  the box, offset in page px), `{ px, py }` (page px) or `{ x, y }` (stage px). Warns when not found/hidden.

## State helpers (call inside a `states` function with the current `t`)

- `setShown(el, visible, opacity = 1)` – `display` + `opacity`; hidden leaves the layout.
- `setVisible(el, opacity)` – `opacity` + `visibility`; keeps the layout, so targets inside stay measurable.
- `fadeIn(el, t0, dur, t, opts)` – hidden before t0, fades in over `dur`. `opts.keepLayout: true` uses
  `setVisible` instead of `display: none`. `fadeIn("#toast", 4.2, .25, t)`
- `fadeOut(el, t0, dur, t, opts)` – fades out over `dur`, hidden afterwards.
- `fadeWindow(el, t0, t1, dur, t, opts)` – visible in [t0, t1) with fades of `dur` inside both ends;
  `t1 = Infinity` stays. `fadeWindow(".tip", 2, 5, .3, t)`
- `crossfade(a, b, t0, dur, t)` – b fades in over a (b after a in the DOM; `dur = 0` = hard switch, like
  a route change); afterwards a is hidden. Uses `setVisible`, so both layers stay measurable. Use
  absolutely positioned layers (`.page-content`).
- `modalAt(dialog, backdrop, tOpen, tClose, t, opts)` – dialog fades in (`fade`) and slides from `offset`
  px (`slide`, ease-out); backdrop fades to `backdrop`. Closing reverses it, backdrop `backdropOutDelay`
  later. `tClose = null` stays open, `tOpen < 0` = already open, `backdrop` may be `null`. Sets inline
  `display: block|none`, `opacity` and `transform` on the dialog. `base` = resting transform; default
  `translate(-50%, -50%)` when the dialog has class `centered`, else `translate(-50%, 0px)` (dialog
  positioned with `left: 50%` and a fixed `top`).
- `MODAL_DEFAULTS` = `THEME.modal` (alias; base `{ fade: .15, slide: .3, offset: -50, scaleFrom: 1, backdrop: .5,
  backdropOutDelay: .1 }`). `modalAt` uses the current demo's `theme.modal` (differs when the scene passes
  `createDemo({ theme })`). Set the product's dialog motion in the theme, or per call (`opts`).
- `fadeModal(dialog, backdrop, tOpen, tClose = null, opts = {})` → state function wrapping `modalAt`.
  `states: [fadeModal("#perm", "#perm-backdrop", 2.2, 9.1)]`
- `typingTimes(text, t0, t1)` → time each character appears; slightly irregular but fixed (`@` and `.`
  take longer).
- `typeText(el, text, t0, t1, t, opts)` – writes the typed part into `el.innerHTML` (use a div/span styled
  as an input, not `<input>`). `opts`: `focusFrom = t0 - .3`, `focusTo = Infinity` (class `.focus` and
  caret while focused), `placeholder` (`<span class="placeholder">` while empty), `caret = true`. Caret
  is solid while typing (until t1 + .15) and blinks every `theme.typing.blink` s (base .53) otherwise.
  `typeText("#name", "Ada Berg", 3, 4.2, t, { placeholder: "Name" })`
- `setText(el, text)` / `setHTML(el, html)` – write only when the value changes (keeps `.hov` stable).
- `placeBelow(el, anchor, { gap = 1, dx = 0, matchWidth = true })` – positions an absolute layer in
  `#camera` under `anchor` (page px), e.g. an open select list.
- `spin(el, t, degPerSec = 400)` – deterministic rotation for spinners.

## Voice

- `voiceEntry(n)` → `VOICE[n]` (or the zero-padded key) from voice.js, or `null`.
- `sceneInfo(n, opts)` → `{ n, slug, lead, tail, audioDuration, duration, voiceText, audioSrc, cue, cueEnd,
  words }`; `opts` may override `duration`, `lead`, `tail`. Voiced: `duration = lead + audio + tail`,
  `audioSrc` relative to the scene file. No voice text: `lead = tail = 0`, duration from `opts`, the VOICE
  entry, `DATA.scenes[n].duration` or 3 s; `cue` throws. Dummy voice (text, no file): cues spread evenly.
- `makeCue({ voiceText, audioDuration, lead = LEAD, voice = null })` → `{ cue, cueEnd, words }`.
- `cue(phrase, nth = 1)` → scene time (lead included) when the nth occurrence of the phrase starts.
  Matching ignores case and punctuation, word by word; throws `cue(): fant ikke «…»` if absent.
  `cueEnd(phrase, nth)` → time the phrase has been spoken. `words` → `[{ word, start, end }]`.

Measured word times: when the VOICE entry has `words` (one `[start, end]` per voice word in audio seconds,
written by `pnpm align` and picked up by `pnpm voice-meta`), `makeCue` uses them as they are, so `cue`,
`cueEnd` and `sceneInfo(n).words` carry measured times, about 0.1 s (word edges are snapped out of measured
pauses). A `words` array whose length differs from the text's word count
warns `cue(): voice.words har X ord, teksten Y – bruker estimat` and falls back to the estimate below.

How timing is estimated (no `words`): each word weighs its length + 1; `. ! ?` add a pause weight of 6, `, ; :` 3.
With measured audio (`voice` has `pauses`, `speechStart`, `speechEnd`), sentence/clause punctuation is
anchored to the nearest measured pause (within 1 s, in order, two passes) and words are spread between
anchors. Usually within 0.2 s in short paragraphs with clear pauses, but it drifts up to several seconds in long
paragraphs; check key cues in stills. Without pauses (dummy voice or
`createDemo({ voiceText })`): words spread evenly over `audioDuration` by index.

`captionTrack(S, opts = {})` → state function that burns the spoken caption into `#captions`; put it last in
`states`. Grouping as `tools/captions.mjs` (SRT): per sentence, longer than `maxChars` split at the last `, ; :`
before the limit, else at a word boundary; shown from first word − .1 s to last word + .25 s (≥ 1 s, capped at the
next caption and at `lead + audioDuration`). Pure function of `t`: `display` and `opacity` are set on every call.
`states: [..., captionTrack(S, { pos: "top" })]`

| Option | Default | Meaning |
|---|---|---|
| `mode` | `"sentence"` | `"karaoke"`: a `<span>` per word, `.said` (end ≤ t) and `.now` (start ≤ t < end); needs measured word times (`pnpm align`) – estimated times drift |
| `maxChars` | `64` | longest caption before splitting |
| `pos` | `"bottom"` | `"top"`; class `pos-top` / `pos-bottom` on `#captions` |
| `margin` | `72` | px from the stage edge |
| `fade` | `.15` | linear opacity ramp (s) at caption start and end; back-to-back captions switch without a fade |
| `until` | `S.lead + S.audioDuration` | nothing shown from here on (keeps the tail and the last frame clean) |
| `className` | `""` | extra class on `#captions` |

Z-order: `#captions` is created in `#stage` outside `#camera` (not zoomed or panned), directly before `#ripple` –
above the page, modals and `mount(…, "stage")` layers, below the click ripple and the cursor (the cursor stays
visible over a caption). Look: `base.css` custom properties `--caption-font` (unset = the `#stage` font),
`--caption-size`, `--caption-weight`, `--caption-color`, `--caption-bg`, `--caption-radius`, `--caption-pad`,
`--caption-max`, karaoke `--caption-now`, `--caption-said`, `--caption-ahead` – neutral defaults, set per video in
`product.css`.

Node/Remotion: `tools/cue.mjs` exports the same `makeCue` (default `lead` 0.5) plus `sceneInfo(meta, n, opts)`
for the parsed `shared/voice.json` (same fields as above, plus `audioFile`; no `DATA.scenes` fallback) and
`toFrame(sec, fps)` = `Math.round(sec * fps)`. `pnpm test` keeps it identical to the engine's `makeCue`.

## `createDemo(cfg)` → `DEMO` (also `window.DEMO`)

| Key | Meaning |
|---|---|
| `duration` | seconds; default `lead + audioDuration + tail` when `audioDuration` is set, else 5 |
| `audioDuration`, `lead`, `tail` | voice length; defaults `LEAD`, `TAIL` from config |
| `audioSrc` | voice file (relative to the scene); muxed by render, played by preview |
| `cue` | cue function (pass `S.cue`); otherwise built from `voiceText` + `audioDuration` (even spread) |
| `camera` | keys `{ t, s, cx, cy }`, `{ t, s, sel, dx?, dy?, at? }` or `{ t, s, rect: () => rect, dx?, dy?, at? }`; `s` = scale (1.15 base), `cx/cy` = page point at stage centre; `ease: "inOut"` / `"out"` / `"in"` / `"linear"` on the key it eases into (default `theme.camera.ease`). Keys in ascending `t`; held before the first and after the last. Default `[{ t: 0, ...CAM_BASE }]` |
| `cursorStart` | target at t = 0 (default `CURSOR_REST`) |
| `cursor` | `false` hides cursor, ripple and hover (theme `cursor.style: "none"` hides only the cursor) |
| `cursorOpacity` | number or `(t) => number` |
| `moves` | `[{ t0, t1, to: target, bow = theme.cursor.bow }]` – `theme.cursor.ease` with a slight arc (`bow` 0 = straight) |
| `clicks` | `[{ t }]` – press (`theme.cursor.press` for `pressDur` s) + ripple (`theme.ripple`) at the cursor; the DOM change is up to `states` |
| `highlights` | `[{ t0, t1, sel \| rect: () => rect \| col: n, table?, pad = theme.highlight.pad, style = theme.highlight.style }]` – fades `theme.highlight.fade` s at both ends inside [t0, t1], re-measured every frame; `style: "none"` draws nothing |
| `states` | `(t) => void` or an array; applied first on every seek |
| `hover`, `hoverSelector` | `hover: false` disables `.hov`; `hoverSelector` replaces `HOVER_SELECTOR` |
| `theme` | preset name or theme object for this scene only, merged over `THEME` (see Themes) |

Order per seek: states → camera → highlights → cursor (+ ripple, hover). Hover: the top-most element
under the cursor matching the selector gets class `.hov` (not when `disabled` or `.disabled`); style
`.hov` in product.css.

**Targets.** `{ sel, ax = .5, ay = .5, dx?, dy?, at?, live? }` | `{ px, py }` (page px) | `{ x, y }`
(stage px). A `sel` target is measured once: the engine applies the states at the time of use – a move
at its `t1`, `cursorStart` at 0, a camera key at its `t`, or `at` when given – and caches the point in
page px (stage px for elements outside `#camera`). Every frame converts it through the current camera.
So a dialog that closes later never makes the cursor or camera jump. If the element has no box at that
time, the nearest frame where it has one is used with a warning; if never, the cursor stays put and a
camera key falls back to the base centre. `live: true` measures every frame (`stagePoint`). Highlights
are measured live with a fallback rect taken at their middle. Measuring is redone after fonts and
images load.

**DEMO object.** `seek(t)` · `prepare()` → `{ final }` (measures now; render calls it after fonts) ·
`cameraAt(t)` → `{ s, cx, cy }` · `cursorAt(t)` → stage point (seeks) · `state(t)` → rounded camera +
cursor, used for boundary output · `targets()` → resolved cursorStart, moves, camera keys · `lint()` →
boundary warnings · `cue` (or `null`) · `cues()` → every `cue`/`cueEnd` call made through `sceneInfo`
(`{ kind, phrase, nth, t }`, call order, duplicates dropped) · `events()` → the scripted beats (`{ kind: "click" |
"camera" | "highlight" | "move", t, sel?, s? }`; camera keys at `t > 0`, highlight `t0`, move `t1`) · `lastFrame` =
`(round(duration × fps) − 1) / fps` · `theme` (resolved) · `duration`, `lead`, `fps`, `audioSrc`, `audioDuration`.
