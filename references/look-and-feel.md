---
name: look-and-feel
description: What the skill needs to know about colours, type, shape and motion when the product has no design library or the video is not tied to a product
metadata:
  tags: design tokens, look and feel, product.css, fonts, brand
---

# Look and feel

## When this is needed

1. The product has no design library.
2. The video is not tied to a product (explainer, campaign, concept).
3. The product has a library, but the video should use a separate brand or visual identity.

If the product HAS a design library and the video should look like the product, skip this file. Tokens
come from the library; read them from wherever it exposes them:

| Library exposes | Where to read tokens |
|---|---|
| A theme object | the theme definition file passed to the provider |
| CSS custom properties | the global stylesheet or the computed style of `:root` in the running app |
| SCSS variables | the variables/partials imported by the main stylesheet |
| A Tailwind config | `theme` / `theme.extend` in the Tailwind config file |

## Ask for

Have the user fill in whatever they have; mark the rest "designer's choice".

- [ ] Colour palette with semantic names: background, surface, text, muted text, primary,
  primary-hover, accent/highlight, success, warning, danger, borders.
- [ ] Typography: font families, font FILES (woff2/ttf/otf) or Google Fonts names, weights used, size
  scale, line heights.
- [ ] Shape: border-radius scale, shadows, spacing scale.
- [ ] Logo files (SVG preferred) and clear-space rules.
- [ ] Iconography: icon set name or SVG files.
- [ ] Reference screenshots or a style guide.
- [ ] Tone (calm / energetic) and motion defaults (durations, easings), if any. They decide the
  overlay theme (`references/themes.md`).
- [ ] Anything that must NOT appear (colours, words, imagery, competitor marks).

## A fill-in template

Paste this back with the values filled in:

```markdown
## Colours
- background: <#ffffff>
- surface: <#f5f6f8>
- text: <#1b1f24>
- muted text: <#6b7280>
- primary: <#2563eb>   primary-hover: <#1d4ed8>
- accent/highlight: <#f59e0b>
- success: <#16a34a>  warning: <#d97706>  danger: <#dc2626>
- border: <#e5e7eb>

## Typography
- heading family: <Inter>  source: <fonts/Inter.woff2 | Google Fonts "Inter">
- body family: <Inter>     weights used: <400, 600, 700>
- size scale: <12 / 14 / 16 / 20 / 28 / 40 px>   line height: <1.4 body, 1.2 headings>

## Shape
- radius: <4 / 8 / 16 px>   shadows: <0 1px 3px rgba(0,0,0,.12), ...>
- spacing scale: <4 / 8 / 12 / 16 / 24 / 32 px>

## Brand
- logo: <assets/logo.svg>   clear space: <1x logo height>
- icons: <set name | assets/icons/*.svg>
- references: <assets/ref-1.png, style-guide.pdf>

## Tone and motion
- tone: <calm | energetic>   durations: <150 / 300 ms>   easing: <ease-out>
- theme: <frame | calm | spotlight | energetic | minimal, see references/themes.md>

## Must not appear
- <e.g. red as a decorative colour, stock photos, exclamation marks>
```

## Where it goes

Colours and tokens land in `shared/product.css` as `:root` variables (start from
`toolkit/product.template.css`). Shape and motion of the overlays land in `video.config.json`.

0. Theme: set `theme` in `video.config.json` per `references/themes.md`. Never left at the default.
1. The six overridable variables from `toolkit/base.css`: `--stage-bg`, `--page-bg`, `--highlight`,
   `--highlight-glow`, `--ripple`, `--caret`.
2. Then product tokens: semantic colours, radii, shadows, spacing, font families (`--color-primary`,
   `--radius-md`, `--font-body`, ...). Components and scenes reference only these variables.
3. Fonts: put woff2 files in `fonts/`, add an `@font-face` per weight (see the header comment of
   `fonts/fonts.css`), and list each family in `video.config.json` under `"fonts"` so rendering fails
   loudly if one does not load. No network fonts: a font fetched at render time makes frames
   non-reproducible.

## Design lock

Before any scene is built, build a component gallery page (buttons, inputs, cards, tables, badges,
modals, headings, logo, icons) using only `product.css`. The theme is part of the lock: render the
stills with the chosen theme, a highlight visible. Compare them with the
screenshots or style guide, and fix differences. Get the user to approve the stills. This is a lock:
a change after scenes exist forces every clip to be re-rendered.

The highlight colour must be visible on every surface the video uses (light, dark, brand-coloured
and image backgrounds); check it in the gallery, and adjust `--highlight` or `--highlight-glow` if it
disappears on any of them.
