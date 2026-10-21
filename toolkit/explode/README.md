# Exploded view (`explode.js`)

Turns a flat page into a 3D view: the page tilts back, selected components lift out of it as floating
cards with soft cast shadows, optional labels with leader lines and dashed guides to where they came
from. Layers can be focused one at a time (the others dim), then everything lands and the page tilts
back flat. Like the engine, it is a pure function of `t`: no transitions, rAF, `Date` or random.

Use it to explain how a screen is built (navigation, filter bar, table, detail panel) or to point at
one component in context. For real 3D objects use Three.js instead (`../../tools/threejs.md`).

## Include

```html
<script src="../shared/voice.js"></script>
<script src="../engine.js"></script>
<script src="../explode/explode.js"></script>
```

Classic script; defines the global `createExplode` and injects its CSS once (`<style id="xp-style">`).
It does not depend on engine.js, but is made for `createDemo`.

## `createExplode(cfg)` → state function

| Option | Default | Meaning |
|---|---|---|
| `root` | required | element/selector of the page that tilts (the slab), e.g. `".page-content"` |
| `space` | `#page`, else `root.offsetParent`, else `body` | coordinate space; the overlay is sized to it |
| `layers` | required | components to lift, bottom to top (below) |
| `focus` | `[]` | focus windows `{ layer, t0, t1 }`; `layer` = index, label or selector |
| `t0` | `0` | start of the tilt |
| `tilt` | `{ rx: 50, rz: -12, duration: 1.4, perspective: 2600 }` | final rotation (deg), tilt time (s), perspective (px) |
| `liftStagger` | `.2` | seconds between layers lifting (and landing) |
| `liftDuration` | `.9` | seconds per lift / landing |
| `reassembleAt` | `Infinity` | time labels fade and layers start landing; `Infinity` = stays exploded |
| `focusFade` | `.5` | fade length, centred on each window's t0/t1 |
| `focusLift` | `34` | extra height (px) of a focused layer |
| `dim` | `.62` | wash opacity on unfocused cards while something is focused |
| `labelDim` | `.55` | label opacity factor for unfocused layers |
| `slabTint` | `.05` | tint on the tilted page |
| `slabDim` | `.06` | extra tint on the page while something is focused |
| `shadow` | `.16` | cast-shadow opacity |
| `thickness` | `10` | slab edge thickness (px) |
| `guides` | `true` | dashed lines from card corners down to the slot |
| `backdrop` | `"#e8ecef"` | colour that opaque ancestors of `root` blend to while tilted; `null`/`false` = off |
| `ease` | ease-in-out cubic | easing **function** `(p) => p` for tilt and lift (not a name string) |
| `className` | – | extra class(es) on the overlay (theme it with `--xp-*`) |
| `origin` | centre of `root` | pivot `{ x, y }` in space coordinates |

Layer entries:

| Key | Default | Meaning |
|---|---|---|
| `sel` | required | selector of the component |
| `depth` | `80` | lift height in px (relative to its parent layer) |
| `label` | none | label text; also usable as the layer's name in `focus`, `rectAt`, `camKey` |
| `labelSide` | `"right"` | `"right"`, `"left"` or `"top"` |
| `labelGap` | `40` | leader-line length (px) |
| `pad` | `10` | card padding around the component when lifted |
| `radius` | `10` | card corner radius |
| `background` | own or first opaque ancestor's background, else `#fff` | card background |

## Timeline

`liftStart(i) = t0 + tilt.duration × .55 + i × liftStagger`. Labels appear at 65 % of each lift.
At `reassembleAt` labels fade (.3 s); layers land in reverse order from `reassembleAt + .25`; the tilt
back starts when the last landing is 55 % done. Before `t0` and after the end the overlay is hidden and
`root` gets its original transform back, so the boundary frames show the plain page.

## Returned state function and members

`const xp = createExplode(cfg)` is `(t) => void`; pass it in `states`. Attached:

- `xp.times` – `{ tiltIn: [a, b], lift: [[a, b], …], labelsIn: [t, …], labelsOut: [a, b], land: [[a, b], …],
  tiltOut: [a, b], end }` for syncing other beats (`end` is `Infinity` without `reassembleAt`).
- `xp.rectAt(ref, t, { withLabel = false })` – projected card rect in space (page) px at time t.
- `xp.boundsAt(t, { labels = true, slab = false })` – union of all cards (+ labels, + slab).
- `xp.camKey(ref, { t, s, at = t, dx = 0, dy = 0, ease, withLabel = true })` – camera key centred on a
  layer as it is at `at`. You choose `s`.
- `xp.fitKey({ t, at = t, margin = 60, minS = .5, maxS = 2, stageW = 1920, stageH = 1080, dx, dy, ease,
  slab = false })` – camera key whose scale fits the whole exploded view at `at` (computed when the demo
  measures). `stageW/H` are not read from the config; pass them for other output sizes.
- `xp.project(x, y, z, t)` – space point lifted to height z, projected at time t.
- `xp.model(t)` – the DOM-free model: `{ t, tp, rx, rz, G, lay: [{ z, zp, e, k, dimA, f, padE, lab }] }`.
- `xp.overlay` – the overlay element (`.xp-overlay`).

## With `createDemo`

```js
const xp = createExplode({
  root: ".page-content", t0: S.cue("is built from"), reassembleAt: S.cue("together they"),
  layers: [
    { sel: "[data-part=nav]", label: "Navigation", labelSide: "left" },
    { sel: "[data-part=filters]", label: "Filters", depth: 110 },
    { sel: "[data-part=table]", label: "Results", depth: 140 },
  ],
  focus: [{ layer: "Filters", t0: S.cue("filters"), t1: S.cue("results") },
          { layer: "Results", t0: S.cue("results"), t1: S.cue("together they") }],
});
createDemo({
  duration: S.duration, lead: S.lead, audioSrc: S.audioSrc, audioDuration: S.audioDuration, cue: S.cue,
  cursor: false,
  states: [xp],
  camera: [
    { t: 0, ...CAM_BASE },
    xp.fitKey({ t: xp.times.lift[2][1] }),
    xp.camKey("Filters", { t: S.cue("filters") + .4, s: 1.6 }),
    xp.camKey("Results", { t: S.cue("results") + .4, s: 1.4 }),
    { t: xp.times.end, ...CAM_BASE },
  ],
});
```

`rectAt`/`boundsAt` return page coordinates when `space` is `#page`, which is what camera `rect` keys
expect.

## Nested layers

A layer whose element lies inside another layer's element gets that layer as parent (the nearest
containing one). It rides on the parent card: its slot and shadow sit on the parent plane, its height is
the parent's height + its own `depth`, and it is bright when either it or a parent is focused. Order in
`layers` does not matter for parent detection; the index sets the lift order.

## CSS variables

Set on `.xp-overlay` (or a `className` of yours): `--xp-ink` (accent: dots, focused label, card outline),
`--xp-tint` (slab tint), `--xp-edge`, `--xp-edge-side` (slab edges), `--xp-slot`, `--xp-slot-line` (hole
left behind), `--xp-shadow`, `--xp-line` (leaders, guides), `--xp-wash` (dim colour), `--xp-label-bg`,
`--xp-label-fg`, `--xp-label-size`. `--xp-backdrop` is declared but not read; use the `backdrop` option.

## Gotchas

- Cards are **clones** of the components with every computed style inlined and `id`, `class`, `name`,
  `for` and `data-*` removed, so selectors and hover never hit them. Clones are rebuilt only when the
  source's HTML or size changes; change the source, not the clone.
- Table parts lose their table context when cloned: rows become flex boxes and cells blocks with their
  measured size frozen. Lift a whole table or a wrapper, rather than a single `<td>`, when you can.
- Transparent components get the first opaque ancestor's background (else white) so the card is not
  see-through; set `background` when that is wrong.
- No `transform-style: preserve-3d`: every plane gets its own full `perspective() rotateX rotateZ
  translate3d` transform, so `overflow: hidden`, `filter` or `opacity` on ancestors cannot flatten it.
- Text stays crisp because cards are real DOM rasterised by the browser at each frame, not textures.
- Measuring always happens with `root` flat (its transform is reset for the measurement), so layout
  rects are the page's own. A layer whose selector matches nothing is skipped with a warning; a layer
  that is `display: none` measures as an empty box at 0,0 – keep lifted components laid out.
- `root` gets inline `transform`, `transform-origin` and `box-shadow` while active; other scene code must
  not set them on the same element.
