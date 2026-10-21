---
name: themes
description: How to choose and configure the toolkit theme (highlight style, cursor, ripple, camera easing, modal motion) so each video gets its own overlay look instead of the engine default
metadata:
  tags: theme, highlight, cursor, ripple, motion, look and feel, video.config.json
---

# Themes

## What a theme is

The shape and motion of the engine's overlays and defaults: highlight style, cursor, click ripple, default
camera easing, modal motion, caret blink. Colours stay in `shared/product.css` (unchanged mechanism, see
`references/look-and-feel.md`).

- One theme per video, set in `video.config.json` under `theme`.
- Per scene: `createDemo({ theme })` only for graphics or title scenes that need a different feel.
- Per highlight: `highlights[].style`.
- Full field list, override order and API: `../toolkit/ENGINE-API.md` › Themes.

## Rule: never the default

The theme is never left at the toolkit default. Choose it explicitly in phase 2 or 4 and write the choice and
the reason into storyboard §4 (`references/storyboard-template.md`). The engine warns when no theme is set.
Two videos for the same product may share a theme; two products should not, unless the brief says so.

## Choosing from the input

| Input | Preset | Adjust |
|---|---|---|
| Documentation, tender, tutorial; calm narration; dense UI (tables, forms) | `calm` | underline keeps tables readable; or `frame` with the brand accent colour |
| Onboarding or release video, one feature at a time | `spotlight` | the rest of the page dims |
| Launch, campaign, social clip; fast cuts; bold brand | `energetic` | |
| Minimal or dark-mode product; design-led brand | `minimal` | zoom and cursor-less ripples carry attention |
| Product has its own motion language (dialog transitions, easing) | nearest preset | copy the product's values into `modal` / `camera` / `cursor` overrides |
| Highlight colour | any | always the product's accent from the tokens, checked on every surface (`references/look-and-feel.md`) |

## Presets

| name | highlight | cursor | ripple | camera | modal | typing |
|---|---|---|---|---|---|---|
| `frame` | frame, pad 4, fade .3, width 2, radius 8, glow 4 | arrow 28, press .85/.12, inOut, bow .08 | 44, .45, .2→1.3, .9 | inOut | base | .53 |
| `calm` | underline, pad 2, fade .4, width 2 | arrow 28, press .9/.14, inOut, bow .05 | 36, .5, .3→1.1, .5 | out | fade .2, slide .35, offset -24, scaleFrom 1, backdrop .4, backdropOutDelay .1 | .6 |
| `spotlight` | spotlight, pad 8, fade .35, radius 10, dim .45 | dot 18, press .8/.12, inOut, bow .06 | 56, .5, .2→1.4, .6 | inOut | fade .2, slide .3, offset -30, scaleFrom .98, backdrop .55, backdropOutDelay .1 | .53 |
| `energetic` | glow, pad 6, fade .15, radius 10, glow 14 | arrow 26, press .8/.1, out, bow .12 | 48, .3, .3→1.6, .9 | out | fade .1, slide .2, offset -30, scaleFrom .96, backdrop .5, backdropOutDelay .05 | .4 |
| `minimal` | none | none | 40, .4, .3→1.2, .5 | out | fade .2, slide 0, offset 0, scaleFrom .98, backdrop .35, backdropOutDelay .1 | .53 |

Cells list the values that differ from the base; fields not listed are base values.

| name | on screen |
|---|---|
| `frame` | Thin rounded frame with a soft ring around the target, arrow cursor, even ease in and out. The pre-theme look. |
| `calm` | A line under the target, slow fades, gentle ease-out camera, small quiet ripple, modals drift in with little travel. |
| `spotlight` | The page darkens around a rounded cut-out on the target, small dot cursor, large ripple, modals scale in slightly. |
| `energetic` | Soft coloured glow around the target, fast fades, quick snappy cursor, large bright ripple, short modal motion. |
| `minimal` | No highlight and no visible cursor; only the ripple at clicks and the camera zoom show where to look. |

## Config

Name form, in `video.config.json`:

```json
{ "theme": "calm" }
```

Object form, preset plus overrides (merged per section, so `highlight.pad` changes only the padding):

```json
{ "theme": { "preset": "calm", "highlight": { "pad": 6 }, "modal": { "offset": 0 } } }
```

Without `preset` the overrides apply on the base values.

Per scene, over the project theme, for that scene only:

```js
createDemo({ /* … */ theme: "energetic" });
createDemo({ /* … */ theme: { highlight: { style: "glow" } } });
```

Per highlight:

```js
highlights: [{ t0: tSave - .4, t1: tSave + 1.6, sel: "[data-action=save]", style: "glow" }]
```

Per-call values (`pad`, `bow`, `ease`, modal opts) still win over the theme.

## What the theme does not cover

| Not in the theme | Lives in |
|---|---|
| Colours, fonts, component styling | `shared/product.css` |
| Title and end card design | scene HTML |
| Camera keys, zoom levels and timing | storyboard and scene `cue()` |

## Checklist before the design lock

- [ ] Theme named in storyboard §4, with the reason in one line.
- [ ] `theme` set in `video.config.json`; `pnpm voice-meta` run after changing it.
- [ ] Gallery stills rendered with a highlight visible (the lock includes the theme).
- [ ] Highlight visible on every surface the video uses (light, dark, brand, image).
