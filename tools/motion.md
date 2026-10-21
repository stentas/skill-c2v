---
name: motion
description: Motion (formerly framer-motion) – the filmed product's own UI animation library; the skill either switches it off so states settle instantly, or drives paused animate() controls from scene time t.
metadata:
  tags: motion, framer-motion, react, ui animation, reduced motion, harness, playwright
  licence: MIT – free for any use, including commercial; keep the copyright notice.
---
# Motion

## Best suited for

Motion is the **product's** animation library, not a video tool. It belongs to the React app being
filmed. The skill meets it in two situations:

1. **UI route 1/2** – the product's components animate with Motion (dialogs, drawers, lists, layout
   changes). Those animations must be disabled so every state settles instantly; the engine then
   animates appearance (fade, slide, zoom) itself, frame-accurately.
2. **Re-creating a product transition exactly** – e.g. a drawer that slides in with the product's own
   spring – by driving Motion with external time instead of its clock.

## Choose it when

- The product uses Motion (`motion` or `framer-motion` in its `package.json`).
- A product transition has a character (spring, overshoot) the engine's eases do not reproduce, and the
  transition values can be read from the product source.

## Do not use it when

- Creating new video graphics: use the engine helpers, `tools/gsap.md` or Remotion.
- Never let Motion run on its own clock during rendering – no autoplaying `animate()`, no `motion.*`
  components with live `animate`/`initial`/`exit`/`layout`, no gestures.

## Combine with

- `references/ui-routes.md` – routes 1–3 and the table "Disabling animations of real components".
- The engine draws cursor, camera and highlights over the settled DOM; explode.js works on it too.
- Playwright (route 1): reduced-motion emulation and CSS injection as extra safety nets.

## Deterministic use

### (a) Disable: let every state settle instantly

- `MotionGlobalConfig.skipAnimations = true` before the app renders (import from the same package the
  product uses). Values jump to their end state; nothing is seeked. Not found on motion.dev's docs pages;
  the changelog (12.39.0) only says `useAnimate` now respects `skipAnimations` – verify against installed
  version (export name, and whether `MotionConfig` has a matching prop).
- `<MotionConfig reducedMotion="always">` is documented, but only disables transform and layout
  animations; opacity, colours etc. still animate. Not sufficient alone.
- Playwright: `page.emulateMedia({ reducedMotion: "reduce" })` – affects only code that checks
  `useReducedMotion()` / `reducedMotion="user"`; same limits as above.
- CSS fallback for non-Motion transitions: inject
  `*,*::before,*::after{transition:none!important;animation:none!important}` (base.css already does in
  toolkit scenes). It does not stop Motion's JS-driven or WAAPI animations.

After disabling, check two stills of the same state at different seek orders: identical pixels.

### (b) Drive: paused `animate()` controls with time from t

`animate()` returns playback controls; `pause()` stops the clock and the `time` setter (seconds) moves
the playhead. Set `time` on every seek, clamped to the animation's span.

```js
// 👍 paused controls, time set from t on every seek
const { animate } = Motion;                      // classic script: vendor/motion.js (global Motion)
const t0 = S.cue("drawer");
const drawer = animate("#drawer", { x: ["100%", "0%"] },
  { type: "spring", stiffness: 380, damping: 34 });   // copy the values from the product source
drawer.pause();
const d = drawer.duration;                       // read-only, seconds (one iteration)
createDemo({ /* … */ states: [(t) => { drawer.time = clamp(t - t0, 0, d); }] });

// 👎 left running – frames depend on wall time
<motion.div animate={{ x: 0 }} initial={{ x: "100%" }} />
// 👎 useAnimate sequence that is never paused
const [scope, animateIn] = useAnimate(); useEffect(() => { animateIn(scope.current, { opacity: 1 }); }, []);
// 👎 gesture-driven state – the renderer never hovers or taps
<motion.button whileHover={{ scale: 1.05 }} />
```

Notes:
- Pause in the same synchronous block that creates the animation, before the first seek. Whether a
  spring's computed `duration` covers the full settle is not documented – compare the end frame with the
  product (verify against installed version).
- Motion may run some values (opacity, transform) as hardware-accelerated WAAPI animations, which do not
  appear as inline styles. Render stills seeking forwards and backwards and compare.
- One owner per property: do not let an engine helper or GSAP write the same `transform`/`opacity`.

### React harness (route 2)

State is derived from t inside `window.DEMO.seek(t)` and applied with `flushSync(() => setState(...))`
so the DOM is final before the screenshot. Motion components render with animations skipped (a);
appearance comes from the engine or from paused controls (b) attached to refs after mount.

```tsx
// 👍 state is a function of t, committed synchronously
seek(t) { flushSync(() => setScene(stateAt(t))); drawer.time = clamp(t - t0, 0, d); }
// 👎 state change that triggers a live Motion animation after the screenshot
seek(t) { setOpen(t > t0); }
```

### Loading

- Toolkit scene (file://): `pnpm add motion`, copy `node_modules/motion/dist/motion.js` to `vendor/` and
  load it as a classic script; it exposes the global `Motion`.
- Harness: use the product's installed version (`motion` or `framer-motion`) so behaviour matches.

## References

- https://motion.dev/docs/animate
- https://motion.dev/docs/quick-start
- https://motion.dev/docs/react-motion-config
- https://motion.dev/docs/react-accessibility
- https://motion.dev/docs/react-use-reduced-motion
- https://motion.dev/docs/react-use-animate
- https://motion.dev/changelog
- https://github.com/motiondivision/motion/blob/main/LICENSE.md
