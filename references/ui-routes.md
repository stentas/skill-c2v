# UI routes

## Design library and look and feel

The product's own design library, if it has one, is the source of truth for look and feel. Find it in
the product's `package.json`; never assume one. It decides: which provider/theme wraps components
(route 2), where tokens come from (route 3: theme object, CSS custom properties, SCSS variables,
Tailwind config), the default motion of dialogs/menus (to disable and re-create deterministically), and
component anatomy for the gallery.

If the product has no design library, or the video is not tied to a product, collect look-and-feel
input with `references/look-and-feel.md` before building anything. Either way the result is
`shared/product.css` (see `toolkit/product.template.css`).

## Routes

Choose in this order. Mixing is fine (e.g. route 2 for app screens, recreated HTML for an e-mail).

## Route 1 – real app with seeded demo data (Playwright)

When: a test/staging environment exists where fictional data can be created.

- Create the data with a seed script, API calls or the UI itself. For invitation flows, use new
  addresses the mail server accepts, e.g. plus addressing (`name+demo1@company.no` in Exchange
  Online); verify the identity provider accepts `+`.
- Drive the app with Playwright (`page.click`, `page.fill`), but do not record in real time:
  perform each step, then capture frames while the toolkit overlay animates cursor, ripple, zoom
  and highlights deterministically over a static (or step-wise changing) page.
  Simplest robust pattern: for each step, screenshot the settled UI state once, then render the
  scene's frames from those state screenshots + overlay (camera transform on the screenshot image).
- Disable app animations (see below) so each state settles instantly.
- Hide real personal data; log in as a demo user; use a demo organisation.

## Route 2 – real React components in a harness

When: the product is React and its components can render with mocked data.

- Create `harness/` (Vite + React) inside the video project. Import product components through a
  Vite alias to the product's `src/`. Install the product's dependencies (use the product's own
  package manager).
- Wrap scenes in the providers the components need, mocked:
  - data: `QueryClientProvider` with a client whose cache is pre-filled (`setQueryData`) – no network;
  - i18n: real locale files, fixed language;
  - router: `MemoryRouter` at the scene's route;
  - auth/user context: a fake provider returning the demo user and ACL;
  - theme: the product's design-library provider and theme, if it has one, plus its global CSS/SCSS,
    imported exactly as the app does (same order – later stylesheets win);
- Expose `window.DEMO = { duration, lead, audioSrc, seek(t) }`. In `seek(t)`, derive all scene
  state from `t` and apply it with `flushSync(() => setState(...))` so the DOM is final before the
  screenshot. The toolkit overlay (cursor, camera, highlights, explode) works on the rendered DOM.
- Portals (modals, dropdowns) render into `document.body`: make sure the camera transform includes
  them (render modals into a container inside the camera element via the library's `container`/
  `portalProps` option).

## Route 3 – recreated UI (HTML/CSS)

When: routes 1–2 are not feasible (no environment, non-React product, dependencies too heavy).

- Extract design values with an Explore agent: fonts and how they load, colour scales and semantic
  names, which stylesheet wins (import order!), button variants and sizes, inputs/selects, table
  cells, pills/badges, modals, icons (SVG paths). Put them in `product.css`.
- Build `components.js` (HTML builders with stable `data-*` attributes for selectors) and a
  component gallery page; compare stills with screenshots before building scenes.
- Use exact UI strings from the locale files.

## Disabling animations of real components

| Library | How |
|---|---|
| Motion / framer-motion | `MotionGlobalConfig.skipAnimations = true` (import from the package the product uses; verify against the installed version – `MotionConfig reducedMotion` alone leaves opacity/colour animating). Details: `tools/motion.md` |
| The product's design library | its documented transition/animation props or theme-level duration setting – look it up in its docs, never assume; as a fallback emulate reduced motion (next rows) |
| CSS | inject `*,*::before,*::after{transition:none!important;animation:none!important}` |
| Playwright | `page.emulateMedia({ reducedMotion: 'reduce' })` |

The engine then animates appearance (fade/slide/zoom) itself, frame-accurately.
