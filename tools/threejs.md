---
name: threejs
description: Three.js (WebGL) for real 3D – product models, data landscapes, camera fly-throughs, shader backgrounds – rendered on demand from scene time t, in a toolkit scene or via @remotion/three.
metadata:
  tags: three.js, webgl, 3d, gltf, camera, particles, shader, remotion-three
  licence: MIT – free for any use, including commercial; keep the copyright notice.
---
# Three.js

## Best suited for

- Product and hardware models (glTF/GLB), turntables, cut-aways.
- Data landscapes, 3D charts, globes, particle fields.
- Camera fly-throughs along a path; shader or particle backgrounds behind titles.

## Choose it when

- The subject is genuinely three-dimensional (a device, a building, a spatial dataset).
- Depth, lighting or perspective camera moves carry the message.

## Do not use it when

- The "3D" is an exploded view of a UI page or component layers: `toolkit/explode/explode.js` does that
  with CSS 3D, so text stays crisp DOM text. WebGL would rasterise the UI into textures.
- Flat motion graphics, diagrams or titles: HTML/SVG is cheaper and sharper.
- Text that must be read: put it in the DOM above the canvas, not in the 3D scene.

## Combine with

- HTML/SVG overlays above the canvas for labels and captions (crisp text); position them from the 3D
  point projected with the same camera (`vector.project(camera)`) inside the same state function.
- A paused GSAP timeline for camera paths and object choreography, seeked from t (`tools/gsap.md`).
- `explode.js` for UI layers in the same video; engine camera/cursor for the DOM part of the scene.

## Deterministic use

No `requestAnimationFrame`, no `setAnimationLoop`, no `THREE.Clock`, no `performance.now()`. Every
animated property (object transforms, camera, uniforms, morph weights, animation-mixer time) is set from
t inside a `states` function, which then calls `renderer.render(scene, camera)` once. The frame
screenshot captures the canvas; `preserveDrawingBuffer: true` keeps its content after compositing.

```js
// 👍 render on demand from t – one render per seek, same picture for any seek order
const canvas = document.querySelector("#gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(1920, 1080, false);             // stage pixels; CSS sizes the element
const camera = new THREE.PerspectiveCamera(35, 1920 / 1080, 0.1, 100);
const mixer = new THREE.AnimationMixer(model);    // if the glTF has clips
mixer.clipAction(gltf.animations[0]).play();      // schedule the action once; time comes from setTime
createDemo({ /* … */ states: [(t) => {
  const p = easeInOut(prog(t, S.cue("inside"), S.cue("inside") + 2));
  camera.position.set(lerp(6, 2.5, p), lerp(2, 1.2, p), lerp(8, 3, p));
  camera.lookAt(0, 0.6, 0);
  model.rotation.y = t * 0.4;                     // pure function of t, not an increment
  mixer.setTime(t);                               // absolute time, not mixer.update(delta)
  material.uniforms.uTime.value = t;
  renderer.render(scene, camera);
}] });

// 👎 own clock – frame content depends on render speed
renderer.setAnimationLoop(() => { model.rotation.y += 0.01; renderer.render(scene, camera); });
// 👎 delta time accumulates – seeking backwards or in parallel frame ranges gives other frames
const clock = new THREE.Clock(); mixer.update(clock.getDelta());
// 👎 random particles re-seeded per load – use a seeded generator or precomputed positions
positions[i] = Math.random();
```

Notes:
- render.mjs renders frame ranges in parallel pages; any state carried from frame to frame (velocity,
  physics integration, trails) breaks. Precompute simulations into arrays indexed by frame.
- Size the drawing buffer to the pixels it covers on stage: inside `#camera` the engine scales the page,
  so a canvas there should be rendered at page size × the largest camera scale, or kept outside `#camera`.
- `mixer.setTime(t)` jumps to an absolute time (scaled by `mixer.timeScale`); it acts through the
  actions created with `clipAction()`, so play them once at setup.
- Labels: `v.copy(anchor).project(camera)` gives NDC (−1..1); map to stage px and set the DOM label's
  `transform` in the same state function, after the camera update.

### Loading (classic scripts, file://)

Three.js ships as ES modules only: `build/three.js` and `build/three.min.js` were deprecated in r150 and
removed in r161 (migration guide). Toolkit scenes load from file://, where ES modules do not load, so:

- bundle the 3D code to a classic IIFE and load that, or
  ```bash
  pnpm add three esbuild
  pnpm exec esbuild scene-3d.js --bundle --format=iife --outfile=vendor/scene-3d.js
  ```
- serve the scene over http and pass the URL to `render.mjs` (it accepts http(s) URLs).

Assets: Chromium does not allow `fetch()` of file:// URLs, which loaders use for glTF/binary files –
serve over http, or ship textures as `<img>` elements in the page. Loading is async
(`loader.loadAsync(url)`); render.mjs waits up to 10 s after the page `load` event for `window.DEMO`
and then calls `DEMO.prepare()`. Either keep all assets part of the `load` event (`<img>` in the HTML,
then `new THREE.Texture(img)` with `needsUpdate = true`), or call `createDemo` only after `await` of all
loaders (within those 10 s). Never let `states` render a half-loaded scene.

### Headless GPU

Headless Chromium may fall back to software GL (SwiftShader): slow and sometimes different antialiasing.
Render one still at full resolution and check quality and time per frame before a full render. GPU flags
(e.g. `--use-gl=angle`, `--use-angle=metal`) go in `video.config.json` → `browser.args`, which render.mjs
passes to the browser launch.

### Remotion

`@remotion/three` (MIT): `<ThreeCanvas width={w} height={h}>` – both props required. Animate from
`useCurrentFrame()` directly in the markup; React Three Fiber's `useFrame()` is forbidden. During
rendering `frameloop` is forced to `"never"`. A `<Sequence>` inside the canvas needs `layout="none"`.
Server-side rendering (`renderMedia()` etc.) needs `chromiumOptions: { gl: "angle" }`
(`Config.setChromiumOpenGlRenderer("angle")` covers only the CLI config).

```tsx
// 👍 rotation from the frame
const frame = useCurrentFrame();
<ThreeCanvas width={1920} height={1080}><mesh rotation={[0, frame * 0.02, 0]}>…</mesh></ThreeCanvas>
// 👎 useFrame((_, delta) => (ref.current.rotation.y += delta))
```

## References

- https://github.com/mrdoob/three.js/blob/dev/LICENSE
- https://threejs.org/docs/pages/WebGLRenderer.html
- https://threejs.org/docs/pages/Loader.html
- https://threejs.org/manual/en/prerequisites.html
- https://github.com/mrdoob/three.js/wiki/Migration-Guide
- https://www.remotion.dev/docs/three
- https://www.remotion.dev/docs/three-canvas
