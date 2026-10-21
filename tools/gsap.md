---
name: gsap
description: GSAP timeline library (with Anime.js as MIT alternative) – used only as a paused timeline seeked from scene time t, for choreography the engine helpers make tedious.
metadata:
  tags: gsap, anime.js, timeline, stagger, svg, morph, drawsvg, splittext, easing, choreography
  licence: GSAP Standard License (custom, not OSI) – free for commercial use including all plugins; forbidden only in visual no-code animation builders that compete with Webflow (AI-generated GSAP code is explicitly allowed).
---
# GSAP

## Best suited for

- Choreography of many elements: staggers, nested timelines, labels, overlapping tweens (`"<"`, `"-=0.2"`).
- SVG: path morphing (MorphSVG), stroke drawing (DrawSVG), motion along a path.
- Split-text reveals (SplitText: chars/words/lines) and custom eases.
- Anything that would become dozens of `prog`/`lerp`/`fadeIn` calls with hand-computed offsets.

## Choose it when

- A scene has many coordinated elements (title cards, diagrams that build up, feature grids).
- A scene needs SVG path animation or per-character text animation.
- The same choreography is reused across scenes (build it in a function that returns a timeline).

## Do not use it when

- A simple fade, slide or zoom: `fadeIn`, `fadeWindow`, `crossfade` and camera keys in `engine.js` already do it.
- Remotion is the engine and `interpolate()`/`spring()` are enough.
- As a time source. GSAP never decides when a frame is drawn; the renderer seeks, GSAP follows.
- On elements whose same property the engine or another state function already writes (one owner per property).

## Combine with

- `engine.js` `createDemo`: the timeline is one entry in `states`; camera, cursor and highlights still
  come from the engine (they run after `states` on every seek).
- `cue("word")` from `voice.js`: place labels or tween start times at spoken words.
- Remotion via `@remotion/gsap` (below). `tools/threejs.md`: a timeline can drive camera paths too.

## Deterministic use

Build the timeline once, paused, before the first seek; every `states` call seeks it to t (seconds).
A seeked timeline is a pure function of t: seeking backwards gives the same frame as seeking forwards.
`seek()` suppresses callbacks by default – never put frame state in `onUpdate`/`onComplete`.
`from()`/`fromTo()` tweens render their start values when they are created (`immediateRender`), so the
timeline must exist before `DEMO.seek` runs for the first time – build it at top level, not lazily.
GSAP writes inline styles, so base.css' `transition: none !important; animation: none !important` does not
interfere. Do not also write `style.transform` by hand on a GSAP-animated element (GSAP caches transforms).

```js
// 👍 paused timeline, seeked from t – same frame regardless of seek order
const tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
tl.from(".card", { y: 40, opacity: 0, duration: 0.6, stagger: 0.12 }, S.cue("three") - 0.2)
  .to("#line path", { strokeDashoffset: 0, duration: 1.2, ease: "none" }, "<0.3")
  .addLabel("summary", S.cue("summary"))
  .from(".total", { scale: 0.8, opacity: 0, duration: 0.4 }, "summary");
createDemo({ /* … */ states: [(t) => tl.seek(t)] });   // or tl.time(t)

// 👎 runs on GSAP's own clock – frames depend on wall time and render speed
gsap.to(".card", { y: 0, opacity: 1, stagger: 0.12 });
// 👎 state written in a callback – skipped when seek() suppresses events or jumps backwards
gsap.timeline({ paused: true, onUpdate: () => { counter.textContent = Math.round(n.v); } });
// 👎 own loop
gsap.ticker.add(() => { /* … */ });
```

Derived values (counters, text) belong in the state function, computed from t or read from a tweened
proxy object after `tl.seek(t)`.

Advanced, full manual clock: `gsap.ticker.remove(gsap.updateRoot)` unhooks GSAP's
requestAnimationFrame loop, then `gsap.updateRoot(t)` sets the root time in seconds. Only needed when
library code creates tweens you cannot put on a paused timeline; prefer `tl.seek(t)`.

### Loading in a toolkit scene

Local classic scripts only; nothing is fetched while rendering.

```bash
pnpm add gsap        # in the video folder
# copy node_modules/gsap/dist/gsap.min.js (and e.g. dist/SplitText.min.js) to video/vendor/
```

```html
<script src="../vendor/gsap.min.js"></script>
<script src="../vendor/SplitText.min.js"></script>  <!-- check exact file names in dist/ -->
<script>gsap.registerPlugin(SplitText);</script>
```

The timeline is built at script time, possibly before web fonts have loaded. Splitting into chars or
words is metric-independent; splitting into lines is not – avoid it or verify line breaks in stills.

### Remotion

`@remotion/gsap` (MIT, Remotion ≥ 4.0.517) – `npx remotion add @remotion/gsap`, plus `gsap` as peer
dependency. `useGsapTimeline(build, { dependencies? })` returns a ref for the scoping element; `build`
receives `{ timeline, scope, selector }` with `timeline` already paused at 0, and the hook seeks it per frame.
The builder must be synchronous and must not use playback controls, callbacks, plain-object tweens or
unseeded randomness.

```tsx
const scope = useGsapTimeline<HTMLDivElement>(({ timeline, selector }) => {
  timeline.from(selector("[data-title]"), { y: 40, opacity: 0, duration: 0.8 });
});
return <AbsoluteFill ref={scope}><h1 data-title>…</h1></AbsoluteFill>;
```

## Anime.js (MIT alternative)

Anime.js v4 (MIT) supports the same pattern. Times are **milliseconds**; the toolkit's t is seconds.
UMD build `animejs/dist/bundles/anime.umd.min.js` exposes the global `anime` – copy it to `vendor/`.

```js
// 👍 paused Anime.js timeline seeked from t (ms)
const { createTimeline, stagger } = anime;
const tl = createTimeline({ autoplay: false })
  .add(".card", { y: [40, 0], opacity: [0, 1], duration: 600, delay: stagger(120) }, S.cue("three") * 1000)
  .add(".total", { scale: [0.8, 1], opacity: [0, 1], duration: 400 });
createDemo({ /* … */ states: [(t) => tl.seek(t * 1000, true)] });   // true = mute callbacks
```

Rule: **one timeline library per project.** Choose Anime.js when an OSI licence is a hard requirement;
otherwise GSAP (plugins, maturity, official Remotion integration).

## References

- https://gsap.com/standard-license/
- https://gsap.com/docs/v3/Installation
- https://gsap.com/docs/v3/GSAP/Timeline/
- https://gsap.com/docs/v3/GSAP/Timeline/seek()
- https://gsap.com/docs/v3/GSAP/gsap.ticker/
- https://gsap.com/docs/v3/GSAP/gsap.updateRoot()
- https://www.remotion.dev/docs/gsap
- https://www.remotion.dev/docs/gsap/use-gsap-timeline
- https://animejs.com/documentation/getting-started/installation
- https://animejs.com/documentation/timeline/timeline-playback-settings
- https://animejs.com/documentation/timeline/timeline-methods/seek
