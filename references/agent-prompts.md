# Agent prompt templates

Fill the <placeholders>. Every prompt ends with a short report format – the main session must not
receive file dumps or code.

## Coverage mapping (Explore, model: sonnet) – run frontend and backend in parallel

```
Codebase root: <path>. Thoroughness: very thorough. Read-only.
Goal: map the <FRONTEND|BACKEND> for <feature area>. <What the user sees: route, dialog names>.
Find and report (concise, file:line, no file dumps):
1. Routes/endpoints (method, path, auth/policy) …
2. Entities/tables and status fields …
3. Flows step by step (create → notify → accept → manage) …
4. Roles/permissions and where they are enforced (UI vs server!) …
5. Gaps: missing features, hard-coded values, TODOs, security issues.
Return: file list with one-line purpose each, then the flows, then "unclear or missing".
```

## Exact UI texts (Explore, model: sonnet)

```
Read-only. I need EXACT <language> UI strings (resolve i18n keys against <locale path>) and visible
structure for a video storyboard: <list components/pages/dialogs/e-mail templates/menu path>.
For each: title, labels, column headers, button labels, empty states, confirmation texts,
validation messages, toasts (or "none"). Compact list per item with file:line.
```

## Design tokens (Explore, model: sonnet)

```
Read-only. Recreating pages pixel-close; need exact values with file:line: font family and how it
is loaded, base size/weight, colour scales + semantic names, which stylesheet wins (import order),
button variants/sizes/hover/disabled, inputs/selects/labels, tables, pills/badges, modals, icons
(SVG paths), logo asset paths. Return tokens, per-component resolved CSS, icon paths, asset paths.
```

## Foundation agent (default model)

```
Build the foundation of a product-demo video. Working folder: <project>/video (copied from
~/.claude/skills/skill-c2v/toolkit). Read toolkit README.md and ENGINE-API.md, the storyboard, the
voice text and audio files. Do not touch the product source.
Tasks: video.config.json incl. `theme` from the storyboard §4; voice-meta; product.css from tokens <…>; components.js (HTML builders
or React harness per route <1|2|3>) with stable data-* selectors; data.js with the story below;
component gallery; 1–2 reference scenes (<NN, NN>) synced with cue(); README section with the
boundary table (first/last frame of every scene: page state, modal, camera, cursor) and the
state timeline. Render reference scenes, check stills.
Story data: <fictional org, users, objects, dates, per-scene changes>.
Report ≤30 lines: durations table, files, API summary, what scene agents must know.
```

## Scene agent (default model) – one per contiguous scene group

```
Build scenes <NN–NN> of a product-demo video. Folder: <project>/video. Read README (contract,
boundary table, story data) and ENGINE-API.md, storyboard scenes <NN–NN>, voice text. Study reference scenes <…>.
Rules: do NOT modify shared/, toolkit files or other agents' scenes (others build <…> in parallel);
put helpers in scenes/_lib-<group>.js; report shared bugs instead of fixing them. The theme is
fixed in config: do not restyle overlays in scene CSS. Deterministic
only. Sync every action with cue(). Start/end exactly per boundary table. Use exact UI texts;
invent no features or toasts. Iterate with `pnpm contact <scene>` (one labelled still per cue and
beat on one sheet – look at it) and --stills; one full render per scene at the end; verify boundary
frames against neighbours.
Scene specifics: <per-scene notes, deviations allowed, things to verify in product source>.
Report ≤15 lines: files, clip durations, deviations and why, shared-code issues.
```

## Broadcast after a shared fix

```
Shared fix applied in <file>: <what changed>. Remove your workaround if you have one; re-check
stills <where>. No other action needed.
```
