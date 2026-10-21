---
name: engine-choice
description: Decision tree for which rendering engine and which libraries to use for a video or a scene group – toolkit DOM engine, Remotion, Motion Canvas, GSAP/Anime.js, Motion, Three.js, explode, ElevenLabs, ffmpeg
metadata:
  tags: routing, engine, remotion, gsap, three, motion canvas, licence, decision
---

# Choosing the engine and the libraries

Decide once per video in phase 0, and again per scene group in phase 4 if a group needs something
else. Write the choice and the reason into the storyboard ("Production" section). Mixed videos are
normal: every engine delivers clips that satisfy `references/clip-contract.md`, and `assemble` joins them.

## 1. Engine per video

```
What does the video mainly show?
├─ An existing application (demo, feature documentation, onboarding, release notes, tutorial)
│    → toolkit DOM engine (tools/html-css-svg.md) with UI route 1 / 2 / 3 (references/ui-routes.md)
│      Intro, concept and summary scenes: HTML/SVG in the same engine; GSAP when the choreography is dense.
├─ A concept, explainer, campaign or social clip with no app UI
│    ├─ Remotion licence in place (≤ 3 employees, non-profit, or a company licence)
│    │    → Remotion (tools/remotion.md)
│    └─ No licence
│         ├─ Flat graphics, text, charts, diagrams   → toolkit HTML/SVG + GSAP or Anime.js
│         └─ Canvas-heavy motion graphics            → Motion Canvas (tools/motion-canvas.md)
├─ Real 3D objects (hardware, models, data landscapes) → Three.js inside the chosen engine (tools/threejs.md)
├─ A page or component "exploded" into layers          → toolkit/explode (CSS 3D, crisp text)
└─ Mixed (app UI + motion-graphics chapters)           → both engines, one clip per scene, assemble
```

Tie-breakers:

- If the product's React components can be rendered in a harness (route 2), the toolkit engine wins
  even for marketing videos: exact look, zero recreation work.
- Remotion only when it adds something the toolkit cannot do cheaply: `TransitionSeries`, captions,
  audio visualisation, Studio editing by the client, Lambda-scale rendering, an existing Remotion project.
- Never pick an engine because of its animation library. GSAP, Anime.js, Motion and Three.js run inside
  either engine in paused + seek mode.

## 2. Libraries per scene

| Need | Use | Not |
|---|---|---|
| Fade, slide, zoom, cross-fade of layers, modal open/close, typing, cursor, camera | engine helpers (`fadeIn`, `fadeWindow`, `crossfade`, `fadeModal`, `typeText`, camera keys) | a library |
| Many coordinated elements, staggers, SVG draw/morph, split-text reveals | GSAP timeline, `paused: true`, `tl.seek(t)` (tools/gsap.md) | self-running tweens |
| Same, but an OSI licence is required | Anime.js `createTimeline({ autoplay: false })` + `seek` (tools/gsap.md) | both libraries in one project |
| The product's own UI animates with Motion | disable it (route 1–2) or drive `animate()` controls with `time` (tools/motion.md) | new graphics in Motion |
| Real 3D | Three.js, `renderer.render()` from `states` / `@remotion/three` (tools/threejs.md) | exploding UI with WebGL |
| Diagrams, charts, arrows, counters, title cards | inline SVG/HTML set from `t` (tools/html-css-svg.md) | CSS animations, SMIL |
| Narration | ElevenLabs, one file per scene, native-language voice, model with Norwegian support (tools/elevenlabs.md) | one file for the whole video |
| Joining, loudness, converting foreign clips | ffmpeg via `render`/`assemble` (tools/ffmpeg.md) | re-rendering to fix audio levels |

## 3. Not suitable (do not propose)

| Library | Why |
|---|---|
| AOS and other scroll-triggered libraries | scroll is not a time source; nothing to seek |
| CSS `transition`/`animation`, Tailwind animate classes, SMIL `<animate>` | run on wall-clock time; flicker in frame-by-frame capture (base.css disables them) |
| `requestAnimationFrame` loops, `setInterval`, `Date`, `Math.random` | non-deterministic between seeks |
| Lottie/GIF players left to autoplay | same; only with a seekable API driven from `t` |
| Theatre.js, Editly | not maintained since 2024/2025 |
| `@remotion/player`, `@remotion/lambda` for this skill's output | we deliver MP4; local/CI rendering is enough; both need the Remotion licence |

## 4. Licence check (phase 0)

| Engine / library | Ask |
|---|---|
| Remotion and `@remotion/transitions`, `player`, `lambda`, `cloudrun`, `media` | organisation size, or is a company licence in place? Free: individuals, ≤ 3 employees, non-profits. |
| GSAP (all plugins) | nothing – free for commercial use; not an OSI licence |
| Anime.js, Motion, Three.js, Motion Canvas, Revideo, Playwright | nothing – MIT / Apache-2.0 |
| ElevenLabs | paid plan for commercial use; synthetic-voice disclosure (EU AI Act art. 50) |
| ffmpeg | nothing for running the binary (GPL build from `ffmpeg-static`, fetched by `pnpm install`, run as a separate process) |
| Fonts | each font file's licence; Inter (OFL) ships with the toolkit |

Details and sources: `tools/*.md` → "licence" in the frontmatter and the References section.
