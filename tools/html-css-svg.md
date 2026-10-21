---
name: html-css-svg
description: Plain HTML/CSS/SVG scenes driven by toolkit/engine.js – the skill's default for app UI, diagrams, title cards and summaries.
metadata:
  tags: html, css, svg, dom, engine, ui, diagrams, title-card, default
  licence: web platform – no licence; fonts must carry their own (Inter: SIL OFL 1.1 in toolkit/fonts/)
---
# HTML/CSS/SVG (toolkit engine)

API signatures live in [`../toolkit/ENGINE-API.md`](../toolkit/ENGINE-API.md); setup, config and commands in
[`../toolkit/README.md`](../toolkit/README.md). This file says when to use the
engine and which patterns keep frames deterministic.

## Best suited for
- Documenting an existing app: real app via Playwright, real components in a harness, or recreated
  HTML (routes 1–3, [`../references/ui-routes.md`](../references/ui-routes.md)).
- Diagrams and concept graphics: roles, flows, architecture, connecting lines and arrows.
- Title and end cards, on-screen summaries, charts with few data points, exploded UI views
  (`toolkit/explode`).

Why it is the default: text stays crisp DOM text at any zoom, the product's CSS is reused as is, there
is no licence gate, and the engine already provides cursor, camera, highlights, typing, modals and
voice sync through `cue()`.

## Choose it when
- The video shows UI, or explains concepts with flat 2D graphics.
- Any scene that must match a neighbouring UI scene pixel for pixel at the cut.

## Do not use it when
- Real 3D (models, terrain, camera flights) → [`threejs.md`](threejs.md).
- Heavy React motion-graphics compositions with transitions and captions, and a Remotion licence is
  in place → [`remotion.md`](remotion.md).
- Complex multi-element choreography (staggers, morphs, split text) where hand-written `prog()` maths
  costs more than a timeline → [`gsap.md`](gsap.md) inside `states`.

## Combine with
- GSAP / Anime.js: a paused timeline seeked from a `states` function ([`gsap.md`](gsap.md)).
- `toolkit/explode` for layered 3D views of a page ([`../toolkit/explode/README.md`](../toolkit/explode/README.md)).
- Three.js canvas under DOM labels, rendered from `states` ([`threejs.md`](threejs.md)).
- ElevenLabs voice through `sceneInfo(n).cue` ([`elevenlabs.md`](elevenlabs.md)); ffmpeg via
  `pnpm render` / `pnpm assemble` ([`ffmpeg.md`](ffmpeg.md)).

## Deterministic use

Every frame is a pure function of `t`: `DEMO.seek(t)` must give the same picture whatever was seeked
before. `base.css` already forces `transition: none` and `animation: none` on every element.

Scene skeleton (classic scripts from `file://`; no modules, no network):

```html
<link rel="stylesheet" href="../fonts/fonts.css"><link rel="stylesheet" href="../base.css">
<link rel="stylesheet" href="../shared/product.css">
<div id="stage"><div id="camera"><div id="page">
  <div class="page-content" id="list"><!-- route A --></div>
  <div class="page-content" id="detail"><!-- route B, after A in the DOM --></div>
</div></div></div>
<script src="../shared/voice.js"></script><script src="../engine.js"></script>
<script>
const S = sceneInfo(3), { cue } = S;
const tOpen = cue("åpne kontrakten"), tSave = cue("Lagre");
createDemo({
  audioDuration: S.audioDuration, lead: S.lead, tail: S.tail, audioSrc: S.audioSrc, cue,
  camera: [{ t: 0, ...CAM_BASE }, { t: tOpen - .2, ...CAM_BASE },               // hold, then move
           { t: tOpen + 1, s: 1.4, sel: "[data-field=title]", ease: "out" }],
  moves: [{ t0: tOpen - 1.3, t1: tOpen - .1, to: { sel: "[data-row='2']" }, bow: .1 }],
  clicks: [{ t: tOpen }],
  highlights: [{ t0: tSave - .4, t1: tSave + 1.6, sel: "[data-action=save]" }],
  states: [
    (t) => crossfade("#list", "#detail", tOpen + .15, 0, t),                     // dur 0 = route change
    (t) => typeText("[data-field=title] .value", "Q3 renewal", tOpen + 1.2, tOpen + 2.4, t,
                    { placeholder: "Title" }),
  ],
});
</script>
```

- Camera keys interpolate from the previous key; add a hold key before each move. `sel` keys and
  `moves[].to` are measured once, at the time they are used, so later hidden elements never jump.
- Page states are stacked `.page-content` layers. `crossfade` hides with opacity + visibility, which
  keeps layout. `setShown` / `fadeIn` without `{ keepLayout: true }` use `display: none`: siblings
  reflow and targets inside have no box (the engine then measures at another time and warns).
- Modal on the camera layer (`mount(html, "camera")`), positioned `left: 50%` (class `.centered`
  for vertical centring). Match the product's dialog motion with opts over `MODAL_DEFAULTS`:
  `fadeModal("#dlg", "#dlg-bg", tOpen, tClose, { fade: .2, slide: .2, offset: 0, scaleFrom: .96 })`
  goes straight into `states`.
- Hover: the engine puts `.hov` on the top-most element under the cursor matching `hoverSelector`
  (default in `HOVER_SELECTOR`; project-wide via `"hover"` in `video.config.json`). Style `.hov` in
  `product.css`; `hover: false` disables it; bow cursor paths around buttons you do not mean to hover.

SVG and graphics as functions of `t`:

```js
const line = $("#flow path");            // <path pathLength="1" style="stroke-dasharray: 1">
const bars = $$("#chart rect"), BASE = 300, t0 = cue("tre kvartaler");
const title = mount(`<div class="stage-layer title"><h1>Contracts</h1></div>`, "stage");
const states = [
  // 👍 inline style/attributes computed from t on every seek
  (t) => { line.style.strokeDashoffset = 1 - easeInOut(prog(t, cue("flyten"), cue("flyten") + 1.2)); },
  (t) => bars.forEach((r, i) => {
    const h = lerp(0, +r.dataset.h, easeOut(prog(t, t0 + i * .15, t0 + i * .15 + .6)));
    r.setAttribute("height", h); r.setAttribute("y", BASE - h);
  }),
  (t) => setText("#total", String(Math.round(lerp(0, 1240, easeOut(prog(t, t0, t0 + 1.5)))))),
  (t) => spin("#spinner", t),
  (t) => fadeWindow(title, .3, cue("I denne videoen"), .4, t),   // title card, not zoomed
];
// 👎 CSS @keyframes / transition            – killed by base.css; would ignore t anyway
// 👎 <animate> / <animateTransform> (SMIL)  – runs on the document clock, not on t
// 👎 requestAnimationFrame / setInterval    – wall-clock driven; frames depend on render speed
// 👎 Date.now(), performance.now()          – not a function of t
// 👎 Math.random()                          – different every seek; precompute or hash from an index
// 👎 el.style.x += step                      – depends on which frames were seeked before
// 👎 <video> + video.currentTime = t         – seeking is async and not frame-exact; render.mjs does not wait
```

### Video inside a scene

A video that plays inside the picture (a phone mock-up, an embedded player, a product that edits video)
is not a `<video>` element. Extract it to a PNG frame sequence at the render fps (`ffmpeg.md`, one-liners),
load every frame before `createDemo`, and show frame `floor((t − t0) · fps)` by toggling visibility.
Everything around it – a 3D-tilted phone, callouts, cursor – is ordinary engine work.

```html
<div id="phone"><div class="screen" id="clip"></div></div>
<style>#clip { position: relative; width: 390px; height: 844px; overflow: hidden }
       #clip img { position: absolute; inset: 0; visibility: hidden }</style>
<script>
const S = sceneInfo(7), { cue } = S, FRAMES = 150, tPlay = cue("spiller av");   // FPS: engine global
const clip = $("#clip");
const frames = Array.from({ length: FRAMES }, (_, i) =>
  clip.appendChild(Object.assign(new Image(390, 844), { src: `../assets/clip/${String(i + 1).padStart(6, "0")}.png` })));
// render.mjs waits up to 10 s for window.DEMO: decode all frames first, then create the demo
Promise.all(frames.map((im) => im.decode())).then(() => createDemo({
  audioDuration: S.audioDuration, lead: S.lead, tail: S.tail, audioSrc: S.audioSrc, cue,
  states: [
    (t) => { const n = Math.min(FRAMES - 1, Math.max(0, Math.floor((t - tPlay) * FPS)));
             frames.forEach((im, i) => { im.style.visibility = i === n ? "visible" : "hidden"; }); },
    (t) => { $("#phone").style.transform =                                 // 3D is plain CSS, a function of t
               `perspective(1600px) rotateY(${lerp(-28, 0, easeOut(prog(t, tPlay, tPlay + 2)))}deg)`; },
  ],
}));
</script>
```

- Toggle `visibility`, never swap `src`: a new `src` loads asynchronously and the screenshot does not wait.
- Keep the sequence small: extract at the on-screen size (times the largest camera zoom), trim to the
  seconds the scene needs, and drop to a lower fps only if the source already is. Hundreds of frames are
  fine; a minute of full-HD frames is not – that is a Remotion scene (`remotion.md`, `<Video>` from
  `@remotion/media`, licence check first).
- Frames before `tPlay` show frame 0 (a poster); for a paused ending hold the last frame, for black
  hide all.
- The clip's own sound, if any, is not carried by the frames: mix it into the scene's voice file, or
  leave it out.

- Without `pathLength`, measure once with `getTotalLength()` and use it for dasharray and offset.
- Arrows in diagrams: draw the line, then fade the arrow head with `fadeIn(head, tEnd, .15, t,
  { keepLayout: true })`; place labels with `pageRect()` measurements done once, not per frame.

Build and asset hygiene:
- Recreated HTML gets stable `data-*` selectors from the `components.js` builders; never select by
  generated class names or nth-child chains that change with the data.
- Overlay look (highlight style, cursor, ripple, modal motion) comes from `theme` in
  `video.config.json`, never from scene CSS ([`../references/themes.md`](../references/themes.md)).
- UI strings exactly as in the product's i18n files.
- Fonts local only (`fonts/fonts.css`) and listed in `video.config.json` → `fonts`; render fails
  loudly if one does not load. The engine re-measures targets once `document.fonts` reports loaded.
- Images local, with explicit width/height so layout does not shift; the engine re-measures on `load`.

Boundaries and iteration:
- First and last frame must match the neighbouring scenes (boundary table in the project README):
  same page state, modal, camera and cursor; no highlight, ripple or move in progress.
- `DEMO.lint()` in the preview console lists boundary problems; `pnpm check` compares cuts.
- Iterate with the live preview (`?t=12.4` freezes a time) and `pnpm stills`; full renders only at
  the end.

## References
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-dasharray
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/stroke-dashoffset
- https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/pathLength
- https://developer.mozilla.org/en-US/docs/Web/API/SVGGeometryElement/getTotalLength
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform
- https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/ready
- [`../toolkit/README.md`](../toolkit/README.md) · [`../toolkit/ENGINE-API.md`](../toolkit/ENGINE-API.md) · [`../toolkit/TROUBLESHOOTING.md`](../toolkit/TROUBLESHOOTING.md) · [`../toolkit/explode/README.md`](../toolkit/explode/README.md) · [`../references/ui-routes.md`](../references/ui-routes.md)
