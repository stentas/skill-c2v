---
name: skill-c2v
description: Plan and produce narrated videos as MP4 (1920×1080) – product demos and feature documentation of an existing application, explainers, onboarding/release/tutorial videos, campaign and social clips. Picks the right technology per video and scene (toolkit DOM engine over real or recreated UI, Remotion, Motion Canvas, GSAP/Anime.js, Motion, Three.js, SVG/HTML/CSS, ElevenLabs voice, Kokoro offline voice, measured word times, captions/SRT, ffmpeg), checks spoken claims against the code, writes storyboard and voice script, renders deterministically and assembles. Use whenever the user wants a video, screencast, animated walkthrough, storyboard or voice script, even if they only ask for the script first.
---

# Video production

Turns "we need a video that shows X" into a verified storyboard, a voice script and a rendered MP4.
This file is the router: principles, the workflow, and where to read more. Load only what the task needs.

## Principles

- **Truth first.** A video about a product documents real functionality. Every spoken claim is checked
  against the code; nothing that does not exist is shown. UI fixes a scene depends on are listed for the team.
- **Fictional data only.** Invented organisations, people and e-mail domains. Never real customers or colleagues.
- **Product- and design-agnostic.** Look and feel comes from the product's own design library, or from
  look-and-feel input the user gives (`references/look-and-feel.md`). No library is a default – ask.
- **No house style.** The overlay look (highlight, cursor, ripple, motion) is chosen per video from the
  product and the brief (`references/themes.md`), never left at the toolkit default.
- **Don't imitate third parties.** Neutral stand-ins for identity-provider logins and mail clients.
- **Audio drives time.** Voice files first; every visual beat is synced to them with `cue()`, on measured
  word times (`pnpm align`) rather than the estimate.
- **Deterministic rendering.** Every frame is a pure function of `t`. No CSS transitions, `Date`,
  random or self-running animation libraries. Libraries are used in paused + seek mode only.
- **Use what exists.** Prefer a maintained library over new code – but only in a deterministic mode, and
  only after the licence check. Never copy agent instructions from third-party repositories into this skill.
- **Keep the main context small.** Agents read and build and report in ≤ 15 lines; the main session
  plans, verifies key facts, fixes shared code and reviews stills.

## Workflow and checkpoints

| # | Phase | Output | Checkpoint |
|---|---|---|---|
| 0 | Intake | goal and video type, audience, target length, tone/mood, product source path, screenshots, demo environment, design library or look-and-feel input, licence facts (`references/engine-choice.md` §4) | ask in prose, one message |
| 1 | Coverage (product videos) | `<topic>.md`: relevant files, flows, Supported / Partly / Not supported per requirement, risks | user reads |
| 2 | Storyboard + voice script | `video-storyboard.md` per `references/storyboard-template.md`, incl. engine choice and "must fix before use" | **approve** |
| 3 | Voice | one file per scene in `audio/`: `pnpm tts` (Kokoro, offline, English) or ElevenLabs files from the user; then `pnpm align` (`audio/*.words.json`), then `pnpm voice-meta` | user listens / delivers |
| 4 | Engine, UI route and design lock | engine per `references/engine-choice.md`; UI route per `references/ui-routes.md`; theme; tokens → `product.css`; component gallery vs screenshots; 15–20 s prototype | **approve look** |
| 5 | Foundation | project from `toolkit/` (and/or a Remotion project): `pnpm install` + `pnpm doctor` in `video/` (README › Setup), config, `product.css`, components, data story, boundary table, 1–2 reference scenes (pattern: `toolkit/examples/02-voiced.html`) | – |
| 6 | Scenes | parallel scene agents, contiguous scene groups, `pnpm contact` (one labelled still per cue and beat) and stills only while iterating | – |
| 7 | Render + assemble | `pnpm render:all --jobs 4` → `pnpm check` → `pnpm assemble` (main session, plain commands) | user reviews MP4 |
| 8 | Hand-over | MP4 path, duration, loudness; deviations from the storyboard; code fixes the video depends on; how to re-render one scene | – |

Typical length 2–5 min for documentation; about 140 spoken words per minute.

Phase notes:

- **1** Delegate code mapping to Explore agents (Sonnet), frontend and backend in parallel, `file:line`
  only. Verify the claims the video relies on yourself (permissions, server-side enforcement, what
  "delete" really does) – agent summaries were wrong exactly there before. Unsupported requirements
  are stated honestly in the closing scene, never simulated.
- **2** Voice text exactly as it will be synthesised: numbers as words, no abbreviations or parentheses,
  UI names as on screen. Collect exact UI strings (resolved i18n) with a Sonnet agent.
- **4** Design lock before scenes: a late style change forces re-rendering every clip.
- **5–6** Prompt templates in `references/agent-prompts.md`. Scene agents never edit shared files or
  the toolkit; they report shared bugs, which the main session fixes once and broadcasts.
- **7** Render and assemble from the main session, not from an agent. Review the contact sheets
  (`pnpm contact --all`) and the stills at every scene boundary yourself.

## Routing: which tool and who

| Job | Tool | Who |
|---|---|---|
| Map code, endpoints, roles, flows; exact UI texts; design tokens | Grep/Read | Explore agent, Sonnet |
| Verify critical claims | targeted Read | main session |
| Storyboard, voice script, engine choice | markdown | main session |
| Voice | Kokoro, `tools/kokoro.md` (English, offline) or ElevenLabs, `tools/elevenlabs.md` (Norwegian, other languages) | Kokoro: main session, `pnpm tts`; ElevenLabs: user (API flow optional) |
| Measured word times, captions, SRT | `pnpm align`, `captionTrack(S)`, `pnpm captions` / `assemble`; `references/voice.md` | main session |
| App UI scenes: cursor, zoom, highlight, typing, dialogs | toolkit engine, `tools/html-css-svg.md`, `toolkit/ENGINE-API.md` | foundation + scene agents |
| Diagrams, title cards, summaries, charts | HTML/SVG in engine scenes; GSAP/Anime.js when dense (`tools/gsap.md`) | graphics scene agent |
| A video playing inside the picture (phone mock-up, embedded player), optionally in 3D | PNG frame sequence in an engine scene, `tools/html-css-svg.md` › Video inside a scene; long full-HD clips → Remotion | scene agent |
| Exploded 3D view of a page | `toolkit/explode/`, `toolkit/explode/README.md` | scene agent |
| Real 3D | Three.js, `tools/threejs.md` | scene agent |
| Motion-graphics chapters, transitions, captions (licensed) | Remotion, `tools/remotion.md` | scene agent |
| Motion graphics without Remotion licence, no DOM reuse | Motion Canvas, `tools/motion-canvas.md` | scene agent |
| The product's own Motion animations | disable or drive by time, `tools/motion.md` | foundation agent |
| Render, boundary check, assemble, loudness, clip conversion | `render.mjs`, `assemble.mjs`, ffmpeg, `tools/ffmpeg.md` | main session |

All engines deliver clips per `references/clip-contract.md`; `assemble` joins them in config order.

## Reference files

Workflow: `references/engine-choice.md` (decision tree and licence check) · `references/ui-routes.md`
(real app with Playwright, React harness, recreated UI; disabling animations) · `references/look-and-feel.md`
(what to ask when there is no design library) · `references/themes.md` (overlay look per video) ·
`references/storyboard-template.md` ·
`references/agent-prompts.md` · `references/voice.md` · `references/clip-contract.md` · `references/lessons.md`.

Tools (one file each: best for, choose when, avoid when, combine with, deterministic code, references):
`tools/html-css-svg.md` · `tools/remotion.md` · `tools/motion-canvas.md` · `tools/gsap.md` (incl. Anime.js) ·
`tools/motion.md` · `tools/threejs.md` · `tools/elevenlabs.md` · `tools/kokoro.md` · `tools/ffmpeg.md`.

Toolkit: `toolkit/README.md` (rules, project layout, setup, config, commands, scene anatomy, rendering
internals) · `toolkit/ENGINE-API.md` (every `engine.js` global: themes, helpers, state helpers, voice, `createDemo`) ·
`toolkit/TROUBLESHOOTING.md` (error messages, cause and fix) · `toolkit/explode/README.md` ·
`toolkit/product.template.css` · `toolkit/examples/01-example.html` (silent) · `toolkit/examples/02-voiced.html`
(voiced, `cue`-timed; `pnpm example` renders both end to end).

For people, not agents: `README.md` at the skill root is the user guide and owns the user-level commands and config instructions; this file does not repeat flags.

Status, licences and verified API facts (dated): `references/status.md`. Run `pnpm links` in `toolkit/` after
editing any of these files.
