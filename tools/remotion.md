---
name: remotion
description: React framework that renders compositions to video; optional engine for motion-graphics scenes, delivered as clips into the shared assemble step.
metadata:
  tags: remotion, react, motion graphics, transitions, captions, three, studio, licence gate
  licence: Remotion License (custom, not OSI) – free for individuals, for-profit companies with ≤ 3 employees, non-profits and evaluation; everyone else needs a paid Company License.
---
# Remotion

## Best suited for

- Motion graphics, explainers and social clips composed in React, without an existing app UI.
- Scene-to-scene transitions (`@remotion/transitions`, `<TransitionSeries>`).
- Captions from word timings (`@remotion/captions`), audio visualisation.
- 3D via `@remotion/three` (`<ThreeCanvas>`).
- Studio preview with timeline scrubbing and prop editing; large-scale cloud rendering (Lambda/Cloud Run).

## Choose it when

1. **Licence gate first.** Ask in intake: how many people work in the company, and is a Remotion
   Company License in place? Free only for individuals, for-profit companies with ≤ 3 employees,
   non-profits and evaluation. 4+ people → paid Company License. No licence → use the toolkit engine
   (`tools/html-css-svg.md`) or Motion Canvas (`tools/motion-canvas.md`). Terms change slightly in
   Remotion 5.0 – re-check the licence page on every major upgrade.
   - MIT: `@remotion/three`, `@remotion/captions`, `@remotion/elevenlabs` (useless without the core, so the gate still applies).
   - Remotion License: core `remotion`, `@remotion/transitions`, `@remotion/player`, `@remotion/lambda`, `@remotion/cloudrun`.
   - Unclear (`@remotion/media`, `@remotion/animation-utils`): assume Remotion License.
   - `@remotion/install-whisper-cpp`: its 4.0.537 tarball ships LICENSE.md = Remotion License, although the docs
     page claims MIT (checked 2026-10-21; the tarball is authoritative). The toolkit aligns words with
     Transformers.js instead (`pnpm align`). `@remotion/captions` is the one Remotion package the toolkit itself
     depends on (MIT, Node-side only, for the SRT file); nothing in its browser code imports Remotion.
2. The video (or a group of scenes) is graphics-first: concept, data story, title sequence, social cut.
3. Transitions, captions, audio-reactive visuals or Studio review are central and worth the dependency.

## Do not use it when

- The video documents an existing app UI. The toolkit engine drives the real DOM/React components
  with cursor, camera, highlights and `cue()`. Remotion's `<IFrame>` is documented as fit only for pages
  without animation; anything animated inside it is not frame-driven and flickers.
- The licence question is unanswered or the answer is "no licence".
- One intro/outro card is all that is needed – toolkit HTML/SVG is cheaper.

## Combine with

- **Layout**: `video/remotion/` beside `video/scenes/`; same `video.config.json`, same `audio/`, same `clips/`.
- **Voice metadata**: `shared/voice.json` = `{ VIDEO, VOICE }`, written by `pnpm voice-meta` next to
  `shared/voice.js` with the same data. `VIDEO`: `fps`, `width`, `height`, `lead`, `tail`, `page`. `VOICE` per
  scene id: `file`, `src`, `duration`, `speechStart`, `speechEnd`, `pauses`, `text`, optional `lead`/`tail`.
- **Cues**: `toolkit/tools/cue.mjs` exports `makeCue` (the engine's, kept identical by `pnpm test`),
  `sceneInfo(meta, n)` → `{ duration, lead, tail, audioFile, cue, cueEnd, words, … }` and
  `toFrame(sec, fps)`. `cue(phrase)` returns scene seconds, lead included → `toFrame(S.cue(phrase), fps)`.
- **Output**: one composition per scene → `clips/NN.mp4`, same `fps`/`width`/`height` as `video.config.json`,
  H.264, yuv420p, BT.709, then `pnpm assemble` joins and loudness-normalises. Contract:
  `references/clip-contract.md`.
- **Audio**: `staticFile()` reads from `public/` only – symlink or copy `audio/` to `video/remotion/public/audio/`.
- GSAP: `@remotion/gsap` (`tools/gsap.md`). Three.js: `tools/threejs.md`. Voice model: `tools/elevenlabs.md`.
- **Project setup**:
  - `pnpm voice-meta` in `video/` → `shared/voice.json`.
  - `video/remotion/` is its own package (`pnpm create video`, blank template, or `pnpm init` +
    `pnpm add remotion @remotion/cli @remotion/media react react-dom`). Its `package.json` makes
    `video/remotion/public/` the `staticFile()` root; the bundler accepts imports from `../../shared` and `../../tools`.
  - `tsconfig.json`: `"resolveJsonModule": true`, `"allowJs": true` (for the `.mjs` import) and
    `"include": ["src", "../shared", "../tools"]`.
  - pnpm 11 asks before running esbuild's install script: set `allowBuilds: { esbuild: false }` in
    `pnpm-workspace.yaml` (Remotion bundles fine without it), or `pnpm exec` never starts.
  - Use `pnpm exec remotion …` (or scripts); `npx` fails in pnpm projects that declare `devEngines`.
  - Render with the commands below.

## Deterministic use

Every visual value is a function of `useCurrentFrame()`. Remotion renders frames in parallel tabs that
share no state, so wall-clock animation breaks.

- `interpolate()` / `spring({ frame, fps })` for all motion; `fps` from `useVideoConfig()`, never hard-coded in components.
- No CSS transitions/animations, no self-running libraries (`requestAnimationFrame`, autoplaying timelines).
- Assets via `staticFile()` and Remotion's asset components (they hold the render until loaded).
- `<Sequence from durationInFrames>` for timing; inside it `useCurrentFrame()` starts at 0.
- `<Audio>`/`<Video>` from `@remotion/media` for new projects.
- GSAP: `useGsapTimeline` from `@remotion/gsap` (paused timeline, seeked to the frame; never call `play()`/`seek()` yourself).
- Three: `<ThreeCanvas width height>`; never `useFrame()`; set `chromiumOptions: { gl: 'angle' }` in `renderMedia()`/`renderFrames()`.

```tsx
// 👍 frame-driven: identical output in every render tab
const opacity = interpolate(frame, [at, at + Math.round(0.4 * fps)], [0, 1], {
  extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
});
// 👎 CSS transition: runs on the wall clock, differs per tab, flickers
<h1 style={{ transition: 'opacity 0.4s', opacity: visible ? 1 : 0 }} />
```

Worked example – verified 2026-10-14 against Remotion 4.0.535 (type-checks, renders 69 frames for a 2.3 s
scene, h264/yuv420p/BT.709 with AAC 48 kHz stereo). **Check remotion.dev for the current API on other versions.**

```tsx
// video/remotion/src/Root.tsx
import { AbsoluteFill, Composition, Sequence, interpolate, staticFile,
  useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from 'remotion';
import { Audio } from '@remotion/media';
import meta from '../../shared/voice.json';                 // { VIDEO, VOICE } from pnpm voice-meta
import { sceneInfo, toFrame } from '../../tools/cue.mjs';   // same cue() as the toolkit engine

type Props = { id: number; title: string; phrase: string; audio: string | null; lead: number; titleAt: number };

const Scene: React.FC<Props> = ({ audio, title, lead, titleAt }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = toFrame(titleAt, fps);                      // cue(phrase) seconds → frame
  const opacity = interpolate(frame, [at, at + toFrame(0.4, fps)], [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill>
      {audio && (
        <Sequence from={toFrame(lead, fps)} layout="none">
          <Audio src={staticFile(`audio/${audio}`)} />
        </Sequence>
      )}
      <h1 style={{ opacity }}>{title}</h1>
    </AbsoluteFill>
  );
};

const calculateMetadata: CalculateMetadataFunction<Props> = ({ props }) => {
  const S = sceneInfo(meta, props.id), fps = meta.VIDEO.fps;
  return {
    fps, durationInFrames: toFrame(S.duration, fps),
    props: { ...props, audio: S.audioFile, lead: S.lead, titleAt: S.cue(props.phrase) },
  };
};

export const Root = () => (
  <Composition id="scene-03" component={Scene} calculateMetadata={calculateMetadata}
    durationInFrames={1} fps={30} width={1920} height={1080}   // = video.config.json
    defaultProps={{ id: 3, title: 'Edit', phrase: 'edit', audio: null, lead: 0, titleAt: 0 }} />
);
```

Commands (run in `video/remotion/`):

```bash
pnpm exec remotion studio src/index.ts                # preview, scrub, edit props
pnpm exec remotion still src/index.ts scene-03 ../stills/03-title.png --frame=45
pnpm exec remotion render src/index.ts scene-03 ../clips/03.mp4 \
  --codec=h264 --crf=14 --pixel-format=yuv420p --color-space=bt709
pnpm exec remotion ffmpeg -version; pnpm exec remotion ffprobe ../clips/03.mp4   # bundled binaries (Remotion codecs only)
```

Programmatic: `renderMedia({ composition, serveUrl, codec: 'h264', outputLocation, concurrency })`
(concurrency defaults to half the CPU threads) and `renderStill({ composition, serveUrl, frame, output })`
from `@remotion/renderer`; `composition` comes from `selectComposition()`, `serveUrl` from `bundle()` (`@remotion/bundler` – verify against installed version).
`--color-space=bt709` matters: `assemble` tags its output BT.709 but does not convert the matrix.

**Remotion's own Agent Skills** exist (`remotion-dev/skills`, installed with the MIT `skills` CLI:
`npx skills add remotion-dev/skills`, which symlinks into `.claude/skills/`). This skill does not
install them. The user decides after reading their content: third-party agent instructions are a
supply-chain risk, and that repo carries no licence file. Default: look things up on remotion.dev directly –
every docs page also exists as Markdown at `https://www.remotion.dev/docs/<page>.md`. Note that
Remotion's voiceover guidance defaults to `eleven_multilingual_v2`, which does not support Norwegian;
see `tools/elevenlabs.md`.

## References

- https://www.remotion.dev/docs/license – licence terms, who needs a Company License
- https://www.remotion.dev/docs/flickering – why non-frame-driven animation breaks; `delayRender()`
- https://www.remotion.dev/docs/calculate-metadata – `calculateMetadata` arguments and return fields
- https://www.remotion.dev/docs/interpolate – `interpolate()` ranges, extrapolation, easing
- https://www.remotion.dev/docs/sequence – `<Sequence>` props, frame shifting
- https://www.remotion.dev/docs/media/audio – `<Audio>` from `@remotion/media`, props
- https://www.remotion.dev/docs/transitions – `<TransitionSeries>` overview
- https://www.remotion.dev/docs/captions/api – `@remotion/captions` API
- https://www.remotion.dev/docs/gsap/use-gsap-timeline – paused GSAP timeline per frame
- https://www.remotion.dev/docs/three – `<ThreeCanvas>`, `chromiumOptions.gl` for server-side render
- https://www.remotion.dev/docs/iframe – `<IFrame>` limits (no animated pages)
- https://www.remotion.dev/docs/cli/render – CLI render syntax and flags
- https://www.remotion.dev/docs/renderer/render-media – `renderMedia()` options incl. `concurrency`
- https://www.remotion.dev/docs/renderer/render-still – `renderStill()` with `frame`, `output`
- https://www.remotion.dev/docs/options/color-space – colour space values and defaults
- https://www.remotion.dev/docs/cli/ffmpeg – bundled ffmpeg/ffprobe
- https://www.remotion.dev/docs/ai/skills – Remotion Agent Skills
