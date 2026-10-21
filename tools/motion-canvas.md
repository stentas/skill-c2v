---
name: motion-canvas
description: MIT TypeScript library and editor for canvas-based, generator-driven animation; optional engine for pure motion-graphics clips when Remotion is not licensed.
metadata:
  tags: motion canvas, revideo, canvas, typescript, generators, motion graphics, explainer, optional engine
  licence: MIT – free for commercial use; keep the copyright notice if the code is redistributed.
---
# Motion Canvas

Canvas 2D renderer (not DOM), scenes written in TypeScript/TSX as generator functions (`yield*`),
own browser-based editor with timeline and audio waveform. Actively maintained (last push 2026-07).
Scaffold: `npm init @motion-canvas@latest`, then `npm install` and `npm run serve` (editor on port 9000).

**Revideo** (MIT, active, last push 2026-07) is a fork aimed at programmatic, headless rendering through
a render API instead of the editor's render button.

## Best suited for

- Pure motion graphics and explainers with no app UI: diagrams that build up, formulas, code
  walkthroughs drawn as shapes/text, abstract data stories.
- Cases where the Remotion licence is not available and toolkit HTML/SVG is not enough
  (many coordinated vector objects, complex sequencing that is clearer as a script than as `states`).

## Choose it when

- The scene is graphics only, and no DOM or React component has to be reused.
- Remotion is ruled out by the licence gate (`tools/remotion.md`).
- The choreography is long and sequential (A, then B and C together, then D) – generators read well for that.
- Revideo instead of Motion Canvas when rendering must run unattended (CI, scripted batch).

## Do not use it when

- The video shows an app UI or must reuse DOM/React components – it draws on a canvas and cannot host them.
  Use the toolkit engine (`tools/html-css-svg.md`).
- Remotion is licensed – larger ecosystem (transitions, captions, Studio, `@remotion/three`).
- Only an intro/outro card or a simple title is needed – toolkit HTML/SVG is cheaper and shares fonts/CSS.
- Text must match the product's web typography exactly – canvas text layout differs from the browser's CSS layout.

## Combine with

- **Output**: MP4 at the same `fps`/`width`/`height` as `video.config.json` → `clips/NN.mp4` (a scene entry
  may point elsewhere with `"clip"`) → `pnpm assemble`. Contract: `references/clip-contract.md`.
- **Voice**: same files in `audio/`; durations, speech start/end and pauses from the voice metadata
  (`shared/voice.json`, written by `pnpm voice-meta`; `toolkit/tools/cue.mjs` → `sceneInfo(meta, n)` gives durations
  and `cue()` in Node). Copy the numbers a scene needs into a small JSON next to the project, generated –
  never typed by hand.
- **Encoding**: either the `@motion-canvas/ffmpeg` exporter ("Video (FFmpeg)", plugin `ffmpeg()` after
  `motionCanvas()` in `vite.config.ts`), or render an image sequence (PNG) and build the clip with the
  conforming PNG-sequence command in `tools/ffmpeg.md`. The image-sequence route gives full control of
  colour tags, CRF and the audio track; prefer it.
- **Audio in the project**: `makeProject({ scenes, audio, audioOffset })` – only for preview in the editor
  (sign of `audioOffset`: verify on docs). The clip's voice track is muxed by ffmpeg with the lead delay.

## Deterministic use

The renderer steps its own timeline frame by frame, so output is deterministic by construction. The
rule here is about *time sources*: every duration is seconds derived from the voice metadata.

- Set render frame rate and resolution in Video Settings to the config values (e.g. 30 fps, 1920×1080,
  scale 1). Preview may use lower settings; render must not.
- No `Date.now()`, `setTimeout`, `setInterval` or unseeded randomness in scenes.
- Time events (`waitUntil('name')`) are positioned by dragging in the editor; they do not follow a new
  voice file. Prefer `waitFor(seconds)` computed from the metadata.
- Pad the scene to the exact clip length (lead + audio + tail) so the frame count matches.

```tsx
// 👍 timing from generated voice metadata – re-run voice-meta and the scene follows
yield* waitFor(t.titleAt);
// 👎 hand-placed time event – silently drifts when the voice is re-recorded
yield* waitUntil('title');
```

Minimal scene – import paths as in the motioncanvas.io quickstart; `Txt` and `opacity`: verify against
installed version.

```tsx
// src/scenes/s03.tsx
import { makeScene2D } from '@motion-canvas/2d/lib/scenes';
import { Txt } from '@motion-canvas/2d/lib/components';
import { createRef } from '@motion-canvas/core/lib/utils';
import { waitFor } from '@motion-canvas/core/lib/flow';
import t from '../timing/03.json'; // generated: { duration, titleAt } – seconds, lead included

export default makeScene2D(function* (view) {
  const title = createRef<Txt>();
  view.add(<Txt ref={title} text="Edit" fontSize={96} fill="#ffffff" opacity={0} />);
  yield* waitFor(t.titleAt);                   // cue(phrase) seconds
  yield* title().opacity(1, 0.4);              // tween: value, seconds
  yield* waitFor(t.duration - t.titleAt - 0.4); // hold to the exact clip length
});
```

```ts
// src/project.ts
import { makeProject } from '@motion-canvas/core';
import s03 from './scenes/s03?scene';
export default makeProject({ scenes: [s03] });
```

Render: editor → Video Settings → `RENDER` (frames go to `output/`). Revideo: headless render function
(`renderVideo()` from `@revideo/renderer` – verify against installed version and Revideo docs).

**Evaluated, not recommended**: Theatre.js (Apache-2.0) – no maintenance since 2024. Editly (MIT) – no
maintenance since 2025.

## References

- https://motioncanvas.io/docs/quickstart – scaffold, project and first scene
- https://motioncanvas.io/docs/flow – `all`, `chain`, `sequence`, `delay`, `loop`
- https://motioncanvas.io/api/core/flow – flow signatures incl. `waitFor(seconds)`, `waitUntil(event)`
- https://motioncanvas.io/docs/time-events – time events edited in the timeline, `useDuration`
- https://motioncanvas.io/docs/media – `audio`/`audioOffset` in the project, images and video
- https://motioncanvas.io/docs/rendering – Video Settings, frame rate, resolution, image sequence output
- https://motioncanvas.io/docs/rendering/video – `@motion-canvas/ffmpeg` exporter setup
- https://github.com/motion-canvas/motion-canvas/blob/main/LICENSE – MIT licence
- https://github.com/redotvideo/revideo – Revideo source, README and licence
