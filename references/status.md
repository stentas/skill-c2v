---
name: status
description: Where the skill stands (what is built and verified, what is open), the licence rules that shape the engine choice, and the sources every dated fact was checked against.
metadata:
  tags: status, licence, verification, sources
---
# Status, licences and sources

Last verified: 2026-10-21. Dated facts (licences, model support) must be re-checked when they matter.

## What is built and verified

**Documentation and structure.** `SKILL.md` is a router (≤ 120 lines). `references/` holds the workflow
(engine choice, UI routes, look and feel, clip contract, storyboard, prompts, voice, lessons). `tools/` holds one
file per technology with the same sections and a licence field. `toolkit/README.md` (rules, layout, setup, config,
commands, scene anatomy, rendering internals), `toolkit/ENGINE-API.md` (every engine global), `toolkit/TROUBLESHOOTING.md`,
`toolkit/explode/README.md` and `toolkit/product.template.css` exist. `README.md` at the skill root is the guide for
people (how to ask, checkpoints, voice text, commands); it is not copied into projects. No design library is a
default; no third-party agent text is included.

**Documentation split (2026-10-14).** `toolkit/README.md` had grown to 431 lines (API reference, config, commands
and troubleshooting in one file). The Engine API section moved verbatim to `toolkit/ENGINE-API.md` and the
troubleshooting table to `toolkit/TROUBLESHOOTING.md`; both sit inside `toolkit/` so they travel with every project
copy. References in `SKILL.md`, `tools/html-css-svg.md`, `references/themes.md`, `references/agent-prompts.md` and
the `engine.js` header were updated; `pnpm links` covers the new files without configuration.

**Toolkit ⇄ Remotion.** `voice-meta` writes `shared/voice.js` and `shared/voice.json`. `toolkit/tools/cue.mjs`
mirrors the engine's `makeCue` (kept identical by a test) and adds `sceneInfo` and `toFrame` for Node and
Remotion. `render.mjs` waits up to 10 s for `window.DEMO`, passes `browser.args` to Chromium and resolves a
relative `audioSrc` for http(s) scenes. `tools/remotion.md` was verified against a real Remotion 4.0.535 project.

**Bundled ffmpeg.** `ffmpeg-static` is a dependency; `toolkit/tools/ffbin.mjs` resolves the binary
(`FFMPEG_PATH` > bundled > `ffmpeg` on PATH) and replaces ffprobe. Setup on a new machine is Node 22+, pnpm,
an installed Edge/Chrome/Chromium and `pnpm install`.

**Robustness and portability (2026-10-14).**
- `assemble.mjs`: silence inputs for audio-less clips now come after all clip inputs (before this fix, a
  project mixing silent and voiced clips could not assemble at all); normalisation is skipped with a note when
  the loudness measurement is not finite (all clips silent); the output is capped at the clips' total frame
  count ÷ `fps`, so AAC padding never lengthens the video.
- `toolkit/tools/browser.mjs`: the configured channel is tried first, then msedge → chrome → chromium; an
  explicit `CHROME_PATH` / `browser.executablePath` never falls back; the failure message lists every
  candidate and per-OS install hints. `pnpm doctor` runs the same checks plus Node version and ffmpeg.
- `engines.node >= 22` in `toolkit/package.json`.
- `toolkit/examples/` is a runnable example project: `01-example.html` (silent), `02-voiced.html` (every time
  from `sceneInfo(2)` and `cue`), a synthetic voice generated with ffmpeg so voice-meta measures real pauses,
  and `pnpm example` = voice → voice-meta → render all → assemble → probe. Verified: 474 frames
  (210 + 264), audio normalised from −17.6 to −16 LUFS, stills show the expected start and end states.
- Tests (`pnpm test`, 17 at the time): cue mirror, ffbin probe/frame count/duration parsing, voice-meta `measure` on a
  generated wav, assemble on silent clips, voiced clips and no clips, link validator.
- `pnpm links`: validates every Markdown link, anchor and backtick file path under the skill. It found and
  we fixed eight stale paths on its first run.

**Themes (2026-10-14).** `theme` in `video.config.json` (preset name or `{ preset, …overrides }`) sets the shape
and motion of the engine's overlays: highlight style (frame, underline, spotlight, glow, none), cursor (arrow,
dot, none), ripple, default camera easing, modal motion, caret blink. Presets `frame` (the former hard-coded look),
`calm`, `spotlight`, `energetic`, `minimal`; resolution order base < preset < config < `createDemo({ theme })`.
No theme configured gives the base look plus a warning. Colours stay in `product.css`. Guide: `references/themes.md`.
Verified: stills of the example under all five presets, `pnpm example` end to end with `spotlight` (474 frames).
Tests: 36 (adds `theme.test.mjs`: base, presets, object form, unknown preset, override without preset).

**Kokoro offline TTS (2026-10-14).** `pnpm tts` (`toolkit/tools/tts.mjs`) writes `audio/<key>-<slug>.wav` per
voiced scene with Kokoro-82M (kokoro-js 1.2.1, fp32 by default, CPU), from the same texts voice-meta reads
(`voicedTexts()` in `toolkit/tools/config.mjs`, now shared by both). Existing scene audio is never overwritten;
`--force` regenerates only the tool's own wav. Model cache outside the project (`KOKORO_CACHE_DIR`, else
`~/.cache/skill-c2v/kokoro`). `pnpm doctor` reports kokoro-js and the cached model (informational).
Verified: `examples/audio/about-the-skill.txt` (226 words, 16 sentences) → 84.4 s of audio, speech to 83.9 s
(not truncated); first run downloaded 326 MB, the second loaded from the cache in 0.4 s without network
access; two runs give byte-identical WAVs; `pnpm tts` on the example skips scene 2 because `02-voiced.mp3`
exists; on a scratch project voice-meta measured the generated wavs next to an ElevenLabs-style
`5_Chapter_1.mp3`. Install size: `node_modules` 58 MB → 467 MB (kokoro-js, @huggingface/transformers,
onnxruntime-node, sharp). Tests: 31 (adds `voicedTexts` and `planScene`/`cacheDir`).
Benchmark (same text, Apple Silicon CPU): fp32 18.3 s (RTF 0.22), fp16 18.9 s but 208 200 NaN samples in the
output (unusable), q8 42.1 s (RTF 0.50, clean samples; listening: audibly more room tone than fp32, speech still
clear). Hence fp32 default; `tts.mjs` refuses to write a file with
non-finite samples. Table in `tools/kokoro.md`.

**Contact sheets (2026-10-14).** `pnpm contact <scene>` (`render.mjs --contact [--after S]`) writes
`stills/<key>-contact.png`: one labelled still per `cue()`/`cueEnd()` the scene asked `sceneInfo` for (plus one
`--after` s later, default 0.5), per click, camera key, highlight start and move end, and the first and last frame,
with the camera/cursor state under each tile. The engine logs the cue calls (`CUE_LOG`, outside `makeCue` so the
`cue.mjs` mirror is untouched) and exposes `DEMO.cues()` / `DEMO.events()`; `toolkit/tools/contact.mjs` plans and
lays out the sheet, which is screenshotted in the browser (no ffmpeg). Idea borrowed from the beat-sheet preview in
a Remotion-based demo kit (MIT); only the idea, no code or text. Verified: 15 tiles for `examples/02-voiced.html`
(cue, click, zoom and highlight land where the voice says), 10 for the silent `01-example.html`. Tests: 41 (adds
`contact.test.mjs`). Limit: a cue computed with `makeCue` directly, or cues called only inside `states`, are not
logged until called; silent scenes get start, beats and end only.

**Measured word times (2026-10-21).** `pnpm align` (`toolkit/tools/align.mjs`) runs Whisper offline in Node through
`@huggingface/transformers` (already a dependency via kokoro-js): model `onnx-community/whisper-base_timestamped`,
fp32, about 291 MB downloaded once into `~/.cache/skill-c2v/whisper` (`WHISPER_CACHE_DIR`), offline afterwards. It
writes `audio/<audio file>.words.json` (measured [start, end] per voice word) for Kokoro, ElevenLabs and human
recordings alike; `pnpm voice-meta` merges it into `words` in `shared/voice.js` / `voice.json`, and `cue()`/`cueEnd()`
use it (accuracy about 0.1 s). Verified on the 84 s Kokoro test: aligned in about 4.6 s (RTF ≈ 0.05, M-series Mac),
222 of 226 words matched; first download plus load about 83 s. A stale `.words.json` (audio or voice text changed) is
ignored with a warning. Quality gate: under 50 % of the script words recognised → scene rejected (exit code 1); 50–80 %
→ written with a warning. No language auto-detection: default `"en"`, other languages need `"align": { "language": … }`
(`"no"` for Norwegian). Synthetic test audio (tone bursts, `examples/audio/02-voiced.mp3`) cannot be aligned.
Corrected: the estimate used without `.words.json` is usually within 0.2 s in short paragraphs with clear pauses but
drifted up to 2.5 s (mean 0.5 s) on the 84 s single-paragraph test; the earlier "0.05–0.2 s" claim was too optimistic
for long paragraphs.

**Captions and SRT (2026-10-21).** `pnpm assemble` also writes `<output>.srt` next to the MP4 from the voice words of
every scene, offset by each clip's start; `pnpm captions` writes only the SRT. One caption per sentence, split at a
clause or word boundary above `captions.maxChars` (84). Burned-in captions: `captionTrack(S)` (`toolkit/tools/captions.mjs`,
engine.js) as the last entry of `states`; `mode` sentence or karaoke (karaoke only looks right with measured words),
look overridden in `product.css` through `--caption-*` custom properties. SRT serialisation uses `@remotion/captions`
4.0.537 (MIT, zero dependencies, Node only; the browser code does not depend on it).

## Gates (run before handing over a change to the skill)

- `SKILL.md` ≤ 120 lines; each `tools/*.md` 60–160 lines (`tools/remotion.md` is 174, content verified).
- `cd toolkit && pnpm install && pnpm test && pnpm links && pnpm doctor && pnpm example` runs clean.
- No design-library names (Mantine, Bootstrap) outside historical notes.

## Open points

Code
- `-t` in assemble assumes every clip is at `cfg.fps`, which `render.mjs` guarantees and the clip contract
  requires; a hand-made clip at another frame rate would be cut short. Use `probe().duration` per clip if
  that case ever matters.
- Double encoding: clips at CRF 14, assemble at CRF 16. `-c:v copy` would need the concat demuxer instead
  of the concat filter. Not worth it until a production asks for it.
- `cue.test.mjs` cuts `makeCue` out of `engine.js` as text (`function makeCue(` in column 0 up to `\n}\n`).
  Fragile, but fails loudly.
- `resolveAudio` for http(s) scenes has only been code-reviewed, not exercised with a served scene.
- Durations from `ffmpeg -i` have 10 ms resolution; under a third of a frame at 30 fps.

Environment
- Tested only on macOS arm64 with Edge. The chrome/chromium fallbacks, Linux and Windows are untried.
- Offline install (`FFMPEG_BIN` or `FFMPEG_BINARIES_URL`) is documented but untried.
- Kokoro: tested on macOS arm64 only. Copying the model cache to an offline machine is documented but untried.
- If `video/` becomes a package inside a parent pnpm workspace, `allowBuilds`/`onlyBuiltDependencies` must
  move to the workspace root.
- Generated files (`node_modules/`, `clips/`, `stills/`, `*.mp4`, the example's mp3 and `shared/`) are listed in
  `toolkit/.gitignore`, which travels with copies of the toolkit; the skill root has its own `.gitignore`.
  A project's `shared/voice.js` is deliberately not ignored (needed to render; commit it with the audio).

Optional next steps, only on request
1. ElevenLabs API with timestamps (`with-timestamps` → exact word times in `voice.json`, `cue()` uses them).
   Largely covered since 2026-10-21 by `pnpm align`, which measures word times for Kokoro, ElevenLabs and
   recordings; the API route stays optional (character-level times, no Whisper download).
2. GSAP and Three.js example scenes in `toolkit/examples/`.
3. Crossfade between clips in assemble (`xfade` + `acrossfade`).
4. `tools/remotion.md` under 160 lines.

## Licences (not legal advice)

| Tool | Licence | Rule that matters here |
|---|---|---|
| `remotion` core, `@remotion/transitions`, `@remotion/player`, `@remotion/lambda`, `@remotion/cloudrun` | Remotion License (not OSI) | free for individuals, companies ≤ 3 people, non-profits and evaluation; everyone else needs the paid company licence. Terms change slightly in Remotion 5.0 – re-check on upgrade |
| `@remotion/three`, `@remotion/captions`, `@remotion/elevenlabs` | MIT | useless without the core, so the licence gate applies in practice. `@remotion/captions` 4.0.537 (`license: MIT` in package.json, no LICENSE file in the tarball, zero dependencies) is the one Remotion package the toolkit itself uses (Node-side SRT only) |
| `@remotion/paths`, `@remotion/layout-utils` | MIT (`license` in package.json, 4.0.537) | not adopted |
| `@remotion/install-whisper-cpp` | Remotion License (tarball 4.0.537 ships LICENSE.md; the docs page claims MIT, the tarball is authoritative) | not used; `pnpm align` uses Transformers.js instead |
| `@remotion/media-parser`, `@remotion/webcodecs` | Remotion License (being phased out for Mediabunny) | not used |
| `@remotion/media`, `@remotion/animation-utils` | unclear | assume Remotion License until confirmed |
| `remotion-dev/skills` (skill text) | no LICENSE file | treated as Remotion License; installed by the user, never vendored |
| GSAP incl. all plugins | GSAP Standard License | free for commercial use; AI-generated code explicitly allowed; not for no-code tools competing with Webflow |
| Motion, Three.js, Motion Canvas, Revideo, whisper.cpp | MIT | free |
| Playwright | Apache-2.0 | free |
| ffmpeg (ffmpeg-static build) | GPL (libx264) | run as a separate process, never linked or redistributed |
| ElevenLabs | terms of service | free plan is non-commercial with attribution; every paid plan includes a commercial licence; SDK is MIT |
| Inter | SIL OFL 1.1 | in the repo with its licence file |
| Whisper base (`onnx-community/whisper-base_timestamped`) | upstream `openai/whisper-base` is Apache-2.0 (HF model card, 2026-10-21); the onnx-community conversion declares no licence of its own, so it inherits Apache-2.0; Transformers.js is Apache-2.0 | downloaded to the user cache, never vendored |
| Kokoro-82M (model weights) | Apache-2.0 | free, commercial use included; downloaded to the user cache, never vendored |
| kokoro-js 1.2.1 | Apache-2.0 (`license` in its package.json) | free |
| @huggingface/transformers 3.8.1 | Apache-2.0 (`license` in its package.json) | free |
| onnxruntime-node / onnxruntime-common 1.21.0 | MIT (`license` in their package.json) | free; native binaries bundled, its CUDA download script is not run |

Consequences: the Remotion licence gate is asked in phase 0 whenever Remotion is a candidate. The toolkit engine
(Playwright + ffmpeg + own code) has no usage restriction and is the default path. The whole workflow runs
without a Remotion licence: transitions via ffmpeg `xfade`/`acrossfade` or GSAP, preview via the engine's own
live preview, scale via `render.mjs --jobs` in CI, pure motion graphics via Motion Canvas when needed.

## Verified API facts

- ElevenLabs: `eleven_multilingual_v2` does not list Norwegian; `eleven_v4`, `eleven_v4_turbo`, `eleven_v3` and
  `eleven_flash_v2_5` do. `POST /v1/text-to-speech/{voice_id}/with-timestamps` returns character alignment
  (SDK `textToSpeech.convertWithTimestamps`). `@remotion/elevenlabs` is speech-to-text, not TTS.
- kokoro-js 1.2.1: `KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype, device: "cpu",
  progress_callback })`; `tts.stream(splitter, { voice, speed })` with a closed `TextSplitterStream` yields
  `{ text, phonemes, audio }` per sentence (`audio.audio` Float32Array, `audio.sampling_rate` 24000), joined and
  saved with Transformers.js `new RawAudio(samples, rate).save(file)` (32-bit float WAV). `generate()` truncates
  at ~510 phonemes; a plain string passed to `stream()` never closes its splitter, so the last sentence hangs.
  Its exported `env` only has `wasmPaths`: the cache is set with `env.cacheDir` from `@huggingface/transformers`
  (a direct dependency at the same version, so pnpm resolves one instance). Only the 28 English voices pass
  `_validate_voice`; the voice `.bin` files are read from the package (no network). Files cache as
  `<cacheDir>/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx` (`model_fp16.onnx`, `model_quantized.onnx`).
  `dtype: "fp16"` on `device: "cpu"` returns NaN for whole sentences (macOS arm64, onnxruntime-node via
  @huggingface/transformers 3.8.1); fp32 and q8 are clean. q8 is 2.3× slower than fp32 on this CPU.
- GSAP: `timeline.pause()`, `seek()`, `progress()`, `time()` are documented; `gsap.updateRoot(t)` after
  `gsap.ticker.remove(gsap.updateRoot)` gives a fully manual clock. `@remotion/gsap` offers `useGsapTimeline`.
- Motion: `animate()` controls expose `pause()` and a `time` setter; `skipAnimations` jumps to end values.
- Three.js: `renderer.render(scene, camera)` on demand with `preserveDrawingBuffer: true`; in Remotion
  `<ThreeCanvas>` + `useCurrentFrame`, never `useFrame()`; set `chromiumOptions.gl: 'angle'` server-side.
- Remotion `<IFrame>` is for static pages only (animated frames flicker), so it cannot replace the toolkit
  engine for app UI. `renderMedia({ concurrency })`, `renderStill({ frame })`, `npx remotion render`.

## Sources

Remotion
- Licence: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md · pricing: https://www.remotion.dev/docs/pricing
- Skills: https://github.com/remotion-dev/skills · https://www.remotion.dev/docs/ai/skills
- `@remotion/three` (MIT): https://github.com/remotion-dev/remotion/blob/main/packages/three/package.json · https://www.remotion.dev/docs/three
- `@remotion/captions` (MIT): https://github.com/remotion-dev/remotion/blob/main/packages/captions/package.json
- `@remotion/transitions`: https://www.remotion.dev/docs/transitions
- `@remotion/gsap`: https://www.remotion.dev/docs/gsap · https://www.remotion.dev/docs/gsap/use-gsap-timeline
- `@remotion/elevenlabs` (STT → captions): https://www.remotion.dev/docs/elevenlabs
- `<IFrame>`: https://www.remotion.dev/docs/iframe
- `renderMedia` / `renderStill`: https://www.remotion.dev/docs/renderer/render-media · https://www.remotion.dev/docs/renderer/render-still
- `@remotion/media`: https://www.remotion.dev/docs/media · `<OffthreadVideo>`: https://www.remotion.dev/docs/offthreadvideo
- Captions: https://www.remotion.dev/docs/captions/create-tiktok-style-captions · whisper: https://www.remotion.dev/docs/install-whisper-cpp
- `@remotion/cloudrun`: https://github.com/remotion-dev/remotion/blob/main/packages/cloudrun/package.json

GSAP
- Licence: https://gsap.com/standard-license/
- Timeline: https://gsap.com/docs/v3/GSAP/Timeline/ · ticker: https://gsap.com/docs/v3/GSAP/gsap.ticker/ · `updateRoot`: https://gsap.com/docs/v3/GSAP/gsap.updateRoot()

Motion
- Licence: https://github.com/motiondivision/motion/blob/main/LICENSE.md
- `animate()` controls: https://motion.dev/docs/animate · `skipAnimations`: https://motion.dev/changelog (Motion 12.39.0)

Three.js
- Licence: https://github.com/mrdoob/three.js/blob/dev/LICENSE
- WebGLRenderer: https://threejs.org/docs/pages/WebGLRenderer.html · migration (UMD removed in r161): https://github.com/mrdoob/three.js/wiki/Migration-Guide

ElevenLabs
- Commercial use: https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform
- Models and languages: https://elevenlabs.io/docs/overview/models
- TTS with timestamps: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- Speech to text: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- SDK (MIT): https://github.com/elevenlabs/elevenlabs-js

Kokoro
- Model (Apache-2.0): https://huggingface.co/hexgrad/Kokoro-82M · voices: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md
- ONNX export: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- kokoro-js: https://github.com/hexgrad/kokoro/tree/main/kokoro.js · https://www.npmjs.com/package/kokoro-js

ffmpeg, Playwright, whisper.cpp
- https://ffmpeg.org/legal.html · https://github.com/microsoft/playwright/blob/main/LICENSE · https://github.com/ggml-org/whisper.cpp/blob/master/LICENSE
- ffmpeg `xfade`: https://ffmpeg.org/ffmpeg-filters.html#xfade · `acrossfade`: https://ffmpeg.org/ffmpeg-filters.html#acrossfade
- Playwright Docker: https://playwright.dev/docs/docker

Alternatives
- Motion Canvas (MIT): https://github.com/motion-canvas/motion-canvas/blob/main/LICENSE · Revideo (MIT): https://github.com/redotvideo/revideo/blob/main/LICENSE
- Theatre.js (Apache-2.0, last commit 2024-04): https://github.com/theatre-js/theatre · Editly (MIT, last commit 2025-02): https://github.com/mifi/editly
- Vidstack (MIT): https://github.com/vidstack/player/blob/main/LICENSE · media-chrome (MIT): https://github.com/muxinc/media-chrome/blob/main/LICENSE · Video.js (Apache-2.0): https://github.com/videojs/video.js/blob/main/LICENSE
- `skills` CLI (MIT, vercel-labs): https://github.com/vercel-labs/skills

CSS 3D and text sharpness
- Chrome re-rasterisation of composited layers: https://developer.chrome.com/blog/re-rastering-composite
