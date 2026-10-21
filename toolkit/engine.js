/* engine.js – deterministic timeline engine for product-demo scenes (product-agnostic).
 *
 * Classic script (ES modules do not load from file://). Everything below is global.
 * Every frame is a pure function of t: DEMO.seek(t) must give the same picture whatever was seeked before.
 * No CSS transitions, no Date, no Math.random, no requestAnimationFrame animations. See README.md (rules,
 * config, commands) and ENGINE-API.md (every global below).
 *
 * Options come from the generated voice.js (const VIDEO, written by tools/voice-meta.mjs from
 * video.config.json) and can be overridden by a global ENGINE_OPTIONS defined before this script:
 *   { width, height, fps, lead, tail, page: { w, h }, camBase: { s, cx, cy }, cursorRest: { x, y },
 *     hover: "<selector>", columnTable: "<selector>", audioBase: "../audio/",
 *     theme: "<preset>" | { preset?, highlight, cursor, ripple, camera, modal, typing } }
 */

const ENGINE_OPTS = Object.assign({},
  typeof VIDEO !== "undefined" ? VIDEO : {},
  typeof ENGINE_OPTIONS !== "undefined" ? ENGINE_OPTIONS : {});

const STAGE_W = ENGINE_OPTS.width ?? 1920, STAGE_H = ENGINE_OPTS.height ?? 1080;
const PAGE_W = ENGINE_OPTS.page?.w ?? 1670, PAGE_H = ENGINE_OPTS.page?.h ?? 940;
const FPS = ENGINE_OPTS.fps ?? 30, LEAD = ENGINE_OPTS.lead ?? 0.5, TAIL = ENGINE_OPTS.tail ?? 0.8;
/** Base camera (scale 1.15 fills 1920 px with a 1670 px page). */
const CAM_BASE = { s: 1.15, cx: PAGE_W / 2, cy: PAGE_H / 2, ...(ENGINE_OPTS.camBase ?? {}) };
/** Default cursor position (stage px) when a scene gives none. */
const CURSOR_REST = { x: 1660, y: 980, ...(ENGINE_OPTS.cursorRest ?? {}) };
/** Elements that get class .hov when they are the top-most hoverable element under the cursor. */
const HOVER_SELECTOR = ENGINE_OPTS.hover ?? ".hoverable, [data-hover], button, [role=button], .btn, .tab, .opt, .btn-close";
const AUDIO_BASE = ENGINE_OPTS.audioBase ?? "../audio/";

// ---------- Small helpers ----------
const $ = (s, root = document) => (typeof s === "string" ? root.querySelector(s) : s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** 0..1 progress of t between t0 and t1 (clamped). */
const prog = (t, t0, t1) => (t1 <= t0 ? (t >= t1 ? 1 : 0) : clamp((t - t0) / (t1 - t0)));
const lerp = (a, b, p) => a + (b - a) * p;
const between = (t, t0, t1) => t >= t0 && t < t1;
const easeInOut = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeIn = (p) => p * p * p;
const linear = (p) => p;
const EASE = { inOut: easeInOut, out: easeOut, in: easeIn, linear };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const warned = new Set();
function warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn(msg); } }

// ---------- Theme (shape and motion of the overlays; colours stay in product.css) ----------

/**
 * Theme presets. `frame` is the complete base (the engine's look before themes existed); the others list only
 * what differs from it and are merged over it per section.
 */
const THEME_PRESETS = {
  frame: {
    name: "frame",
    highlight: { style: "frame", pad: 4, fade: .3, width: 2, radius: 8, glow: 4, dim: .45 },
    cursor: { style: "arrow", size: 28, press: .85, pressDur: .12, ease: "inOut", bow: .08 },
    ripple: { size: 44, dur: .45, from: .2, to: 1.3, opacity: .9 },
    camera: { ease: "inOut" },
    modal: { fade: .15, slide: .3, offset: -50, scaleFrom: 1, backdrop: .5, backdropOutDelay: .1 },
    typing: { blink: .53 },
  },
  calm: {
    highlight: { style: "underline", pad: 2, fade: .4, width: 2 },
    cursor: { style: "arrow", size: 28, press: .9, pressDur: .14, ease: "inOut", bow: .05 },
    ripple: { size: 36, dur: .5, from: .3, to: 1.1, opacity: .5 },
    camera: { ease: "out" },
    modal: { fade: .2, slide: .35, offset: -24, scaleFrom: 1, backdrop: .4, backdropOutDelay: .1 },
    typing: { blink: .6 },
  },
  spotlight: {
    highlight: { style: "spotlight", pad: 8, fade: .35, radius: 10, dim: .45 },
    cursor: { style: "dot", size: 18, press: .8, pressDur: .12, ease: "inOut", bow: .06 },
    ripple: { size: 56, dur: .5, from: .2, to: 1.4, opacity: .6 },
    camera: { ease: "inOut" },
    modal: { fade: .2, slide: .3, offset: -30, scaleFrom: .98, backdrop: .55, backdropOutDelay: .1 },
    typing: { blink: .53 },
  },
  energetic: {
    highlight: { style: "glow", pad: 6, fade: .15, radius: 10, glow: 14 },
    cursor: { style: "arrow", size: 26, press: .8, pressDur: .1, ease: "out", bow: .12 },
    ripple: { size: 48, dur: .3, from: .3, to: 1.6, opacity: .9 },
    camera: { ease: "out" },
    modal: { fade: .1, slide: .2, offset: -30, scaleFrom: .96, backdrop: .5, backdropOutDelay: .05 },
    typing: { blink: .4 },
  },
  minimal: {
    highlight: { style: "none" },
    cursor: { style: "none" },
    ripple: { size: 40, dur: .4, from: .3, to: 1.2, opacity: .5 },
    camera: { ease: "out" },
    modal: { fade: .2, slide: 0, offset: 0, scaleFrom: .98, backdrop: .35, backdropOutDelay: .1 },
    typing: { blink: .53 },
  },
};

/**
 * Resolves a theme: a preset name ("calm") or an object { preset?, highlight?, cursor?, ripple?, camera?, modal?,
 * typing? } → a complete theme object. With a preset the result starts from base ← preset, otherwise from `from`
 * (default the base); the object's sections are then merged in shallowly. Unknown preset → Error.
 */
function resolveTheme(input, from = THEME_PRESETS.frame) {
  const sections = ["highlight", "cursor", "ripple", "camera", "modal", "typing"];
  const merge = (a, b) => {
    const out = { name: b.name ?? a.name };
    for (const k of sections) out[k] = { ...a[k], ...(b[k] ?? {}) };
    return out;
  };
  const obj = typeof input === "string" ? { preset: input } : (input ?? {});
  let start = from;
  if (obj.preset != null) {
    if (!Object.hasOwn(THEME_PRESETS, obj.preset)) {
      throw new Error(`theme: ukjent preset «${obj.preset}» (finnes: ${Object.keys(THEME_PRESETS).join(", ")})`);
    }
    start = merge(THEME_PRESETS.frame, { name: obj.preset, ...THEME_PRESETS[obj.preset] });
  }
  return merge(start, obj);
}

/** Theme from the config (video.config.json → VIDEO.theme, or ENGINE_OPTIONS.theme). */
const THEME = resolveTheme(ENGINE_OPTS.theme);
/** Theme of the current demo (createDemo sets it; differs from THEME when the scene passes cfg.theme). */
let ACTIVE_THEME = THEME;

// ---------- Stage ----------
const CURSOR_SVG = '<svg id="cursor" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 L12.5 25.5 L16 24 L12 15.8 L19.5 15.8 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';

/** Creates #stage > #camera > #page (+ #highlights, #ripple, #cursor) if the scene HTML does not have them. */
function ensureStage() {
  let stage = $("#stage");
  if (!stage) {
    stage = Object.assign(document.createElement("div"), { id: "stage" });
    document.body.prepend(stage);
  }
  Object.assign(stage.style, { width: STAGE_W + "px", height: STAGE_H + "px" });
  let camera = $("#camera");
  if (!camera) {
    camera = Object.assign(document.createElement("div"), { id: "camera" });
    stage.prepend(camera);
  }
  Object.assign(camera.style, { width: PAGE_W + "px", height: PAGE_H + "px" });
  if (!$("#page")) camera.prepend(Object.assign(document.createElement("div"), { id: "page" }));
  if (!$("#highlights")) camera.appendChild(Object.assign(document.createElement("div"), { id: "highlights" }));
  if (!$("#ripple")) stage.appendChild(Object.assign(document.createElement("div"), { id: "ripple" }));
  if (!$("#cursor")) stage.insertAdjacentHTML("beforeend", CURSOR_SVG);
  return stage;
}

/**
 * Inserts HTML and returns the first inserted element.
 *   where = "page"   → into #page (page states, .page-content)
 *           "camera" → into #camera above the page, below the highlights (modals, popups)
 *           "stage"  → onto the stage above the camera, below the cursor (titles, end card; not zoomed)
 */
function mount(html, where = "camera") {
  ensureStage();
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  const first = tpl.content.firstElementChild;
  if (where === "page") $("#page").appendChild(tpl.content);
  else if (where === "stage") $("#stage").insertBefore(tpl.content, $("#ripple"));
  else $("#camera").insertBefore(tpl.content, $("#highlights"));
  return first;
}

/** Stage px per CSS px of the window (1 when rendering; < 1 when the preview is fitted to the window). */
function stageScale() {
  return $("#stage").getBoundingClientRect().width / STAGE_W;
}

/** Rect of an element in page coordinates (PAGE_W × PAGE_H), independent of the current camera transform. */
function pageRect(el) {
  el = $(el);
  const pr = $("#page").getBoundingClientRect(), r = el.getBoundingClientRect(), s = pr.width / PAGE_W;
  return { x: (r.left - pr.left) / s, y: (r.top - pr.top) / s, w: r.width / s, h: r.height / s };
}
function unionRect(els) {
  const list = typeof els === "string" ? $$(els) : [...els].map((e) => $(e));
  const rs = list.map(pageRect);
  const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
}
/** Whole column n (1-based) of a table, header included. */
const columnRect = (n, table = ENGINE_OPTS.columnTable ?? "table") => unionRect($$(`${table} tr > :nth-child(${n})`));

/** True when the element has a layout box (not display: none itself or through an ancestor). */
const hasBox = (el) => !!el && el.isConnected && el.getClientRects().length > 0;

let currentCam = { ...CAM_BASE };

/** Page point → stage px through the current camera. */
const pageToStage = (px, py) => ({ x: STAGE_W / 2 + (px - currentCam.cx) * currentCam.s, y: STAGE_H / 2 + (py - currentCam.cy) * currentCam.s });

/**
 * Point in stage px for a target, measured NOW (live):
 *   { sel, ax = .5, ay = .5, dx?, dy? }  anchor inside the element's box (+ offset in page px)
 *   { px, py }                           page coordinates, through the current camera
 *   { x, y }                             stage px
 * createDemo() does not use this for cursor moves / camera keys any more: it measures each target once at the
 * time it is used (see "Targets" in ENGINE-API.md). stagePoint stays for scene code that wants a live point.
 */
function stagePoint(target) {
  if (target.sel) {
    const el = $(target.sel);
    if (!el) { warnOnce("Fant ikke " + target.sel); return { x: 0, y: 0 }; }
    const r = el.getBoundingClientRect(), sr = $("#stage").getBoundingClientRect(), k = sr.width / STAGE_W;
    if (r.width === 0 && r.height === 0) warnOnce("Elementet er skjult: " + target.sel);
    const d = { x: (target.dx ?? 0) * currentCam.s, y: (target.dy ?? 0) * currentCam.s };
    return { x: (r.left - sr.left + r.width * (target.ax ?? .5)) / k + d.x, y: (r.top - sr.top + r.height * (target.ay ?? .5)) / k + d.y };
  }
  if (target.px !== undefined) return pageToStage(target.px, target.py);
  return { x: target.x, y: target.y };
}

// ---------- State helpers (call inside a state function with the current t) ----------

/** display + opacity (removes the element from layout when hidden). */
function setShown(el, visible, opacity = 1) {
  el = $(el);
  el.style.display = visible ? "" : "none";
  el.style.opacity = visible ? opacity : 0;
}

/** opacity + visibility (keeps the layout, so targets inside stay measurable; hidden = not painted, not hit). */
function setVisible(el, opacity) {
  el = $(el);
  el.style.opacity = opacity;
  el.style.visibility = opacity > 0 ? "visible" : "hidden";
}

const showFn = (opts) => (opts && opts.keepLayout ? (el, vis, o) => setVisible(el, vis ? o : 0) : setShown);

/** Fades el in over [t0, t0 + dur]; hidden before t0 (display: none, or visibility with { keepLayout: true }). */
function fadeIn(el, t0, dur, t, opts) {
  el = $(el);
  showFn(opts)(el, t >= t0, prog(t, t0, t0 + dur));
}

/** Fades el out over [t0, t0 + dur]; hidden afterwards. */
function fadeOut(el, t0, dur, t, opts) {
  el = $(el);
  const p = prog(t, t0, t0 + dur);
  showFn(opts)(el, p < 1, 1 - p);
}

/** Visible only in [t0, t1) with fades of `dur` at both ends (t1 = Infinity: stays). */
function fadeWindow(el, t0, t1, dur, t, opts) {
  el = $(el);
  const o = Math.min(prog(t, t0, t0 + dur), t1 === Infinity ? 1 : 1 - prog(t, t1 - dur, t1));
  showFn(opts)(el, t >= t0 && t < t1, o);
}

/**
 * Cross-fades from layer a to layer b over [t0, t0 + dur] (dur 0 = hard switch, like a route change).
 * a stays opaque underneath while b fades in on top (b must come after a in the DOM). Hidden layers keep their
 * layout (opacity + visibility), so targets inside an outgoing/incoming layer can still be measured. Layers
 * should be absolutely positioned (like .page-content).
 */
function crossfade(a, b, t0, dur, t) {
  a = $(a); b = $(b);
  const p = dur > 0 ? prog(t, t0, t0 + dur) : (t >= t0 ? 1 : 0);
  if (a.style.display === "none") a.style.display = "";
  if (b.style.display === "none") b.style.display = "";
  setVisible(a, p < 1 ? 1 : 0);
  setVisible(b, p);
}

/**
 * Default modal motion = the theme's `modal` section (base: backdrop to .5, dialog fade .15 s + slide from -50 px
 * over .3 s). Alias kept for compatibility; set the motion in the theme, or per call (opts) to match the design
 * library's own dialog transition.
 */
const MODAL_DEFAULTS = THEME.modal;

/**
 * Modal at time t: dialog fades in and slides from `offset` px (ease-out), backdrop fades to `backdrop`.
 * Closing reverses it (dialog first, then the backdrop). tClose may be null (stays open); tOpen < 0 = already open.
 * dialog/backdrop: element or selector; backdrop may be null.
 * opts (all optional, default the current demo's theme.modal): { fade, slide, offset, scaleFrom, backdrop,
 * backdropOutDelay, base } – base = the dialog's resting transform (default: "translate(-50%, -50%)" for
 * .centered, else "translate(-50%, 0px)", matching a dialog positioned with left: 50%).
 */
function modalAt(dialog, backdrop, tOpen, tClose, t, opts = {}) {
  const o = { ...ACTIVE_THEME.modal, ...opts };
  dialog = $(dialog); backdrop = backdrop && $(backdrop);
  const closing = tClose != null && t >= tClose;
  let op = 0, k = 0, bo = 0;
  if (t >= tOpen) {
    op = prog(t, tOpen, tOpen + o.fade);
    k = easeOut(prog(t, tOpen, tOpen + o.slide));
    bo = o.backdrop * prog(t, tOpen, tOpen + o.fade);
    if (closing) {
      op = Math.min(op, 1 - prog(t, tClose, tClose + o.fade));
      k = lerp(k, 0, prog(t, tClose, tClose + o.slide));
      bo = Math.min(bo, o.backdrop * (1 - prog(t, tClose + o.backdropOutDelay, tClose + o.backdropOutDelay + o.fade)));
    }
  }
  const dy = lerp(o.offset, 0, k), sc = lerp(o.scaleFrom, 1, k);
  const base = o.base ?? `translate(-50%, ${dialog.classList.contains("centered") ? "-50%" : "0px"})`;
  dialog.style.display = op > 0 ? "block" : "none";
  dialog.style.opacity = op;
  dialog.style.transform = `${base} translateY(${dy}px)${o.scaleFrom !== 1 ? ` scale(${sc})` : ""}`;
  if (backdrop) {
    backdrop.style.display = bo > 0 ? "block" : "none";
    backdrop.style.opacity = bo;
  }
}

/** State-function form of modalAt, for the `states` list: fadeModal("#perm", "#perm-backdrop", 2.2, 9.1). */
function fadeModal(dialog, backdrop, tOpen, tClose = null, opts = {}) {
  return (t) => modalAt(dialog, backdrop, tOpen, tClose, t, opts);
}

/** Deterministic per-character typing rhythm (slightly irregular, same every time). */
function typingTimes(text, t0, t1) {
  const w = [...text].map((ch, i) => {
    const r = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
    return (ch === "@" || ch === "." ? 1.6 : 1) * (.65 + .7 * r);
  });
  const total = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  return w.map((x) => (acc += x, t0 + (t1 - t0) * (acc - x) / total));
}

/**
 * Types `text` into el between t0 and t1 with a caret.
 * opts: focusFrom (default t0 - .3) / focusTo (default Infinity) – when the field has focus (caret + class
 *       .focus), placeholder – shown while empty, caret (default true).
 * The caret is solid while typing and blinks (theme.typing.blink, base 530 ms) otherwise while focused.
 */
function typeText(el, text, t0, t1, t, opts = {}) {
  el = $(el);
  const { focusFrom = t0 - .3, focusTo = Infinity, placeholder = "", caret = true } = opts;
  const times = typingTimes(text, t0, t1);
  const n = times.filter((x) => t >= x).length;
  const typed = [...text].slice(0, n).join("");
  const focused = t >= focusFrom && t < focusTo;
  const typing = t >= t0 && t < t1 + .15;
  const blinkOn = typing || Math.floor((t - focusFrom) / ACTIVE_THEME.typing.blink) % 2 === 0;
  const caretHtml = caret && focused ? `<span class="caret${blinkOn ? "" : " off"}"></span>` : "";
  el.innerHTML = typed
    ? esc(typed) + caretHtml
    : caretHtml + (placeholder ? `<span class="placeholder">${esc(placeholder)}</span>` : "");
  el.__html = undefined;   // other code may write this element too (setHTML must not trust its cache)
  el.classList.toggle("focus", focused);
}

/** Sets textContent only when it changes (cheap to call every frame). */
function setText(el, text) {
  el = $(el);
  if (el.textContent !== text) el.textContent = text;
}

/** Sets innerHTML only when the HTML changes (cheap to call every frame; keeps hover classes stable). */
function setHTML(el, html) {
  el = $(el);
  if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
}

/** Positions an absolutely positioned layer (in #camera) right under an anchor element, e.g. an open <select> list. */
function placeBelow(el, anchor, { gap = 1, dx = 0, matchWidth = true } = {}) {
  el = $(el);
  const r = pageRect(anchor);
  el.style.left = r.x + dx + "px";
  el.style.top = r.y + r.h + gap + "px";
  if (matchWidth) el.style.minWidth = r.w + "px";
}

/** Deterministic rotation (spinners): degrees per second. */
function spin(el, t, degPerSec = 400) {
  $(el).style.transform = `rotate(${(t * degPerSec) % 360}deg)`;
}

// ---------- Voice cues ----------

/**
 * Builds cue(phrase) for a voice text. Measured word times (voice.words: one [start, end] per word in audio
 * seconds, from `pnpm align` via tools/voice-meta.mjs) are used as they are when present – about 0.1 s.
 * Otherwise word timing is estimated from character counts and anchored to the pauses that tools/voice-meta.mjs
 * measured in the audio (punctuation ↔ nearest pause): usually within 0.2 s in short paragraphs with clear
 * pauses, but it drifts up to several seconds in long paragraphs. Without measured pauses it falls back to lead + audioDuration * wordIndex / totalWords.
 * Returned times are scene times (lead included).
 */
// Mirrored in tools/cue.mjs – keep both identical; tools/cue.test.mjs checks it.
function makeCue({ voiceText, audioDuration, lead = LEAD, voice = null }) {
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const words = voiceText.split(/\s+/).filter(Boolean).map((raw) => ({
    raw, n: norm(raw), w: norm(raw).length + 1,
    pause: /[.!?]["»”]?$/.test(raw) ? 6 : /[,;:]$/.test(raw) ? 3 : 0,
  })).filter((w) => w.n);
  let start = [], end = [];
  const measured = voice && Array.isArray(voice.words);
  if (measured && voice.words.length !== words.length) {
    console.warn(`cue(): voice.words har ${voice.words.length} ord, teksten ${words.length} – bruker estimat (kjør pnpm align på nytt)`);
  }

  if (measured && voice.words.length === words.length) {
    words.forEach((_, i) => { start[i] = voice.words[i][0]; end[i] = voice.words[i][1]; });
  } else if (!voice || !voice.pauses) {
    words.forEach((_, i) => { start[i] = audioDuration * i / words.length; end[i] = audioDuration * (i + 1) / words.length; });
  } else {
    // Anchors: index i = boundary before word i (i = words.length → end of speech). Value = [timeBefore, timeAfter].
    const solve = (anchors) => {
      const idx = Object.keys(anchors).map(Number).sort((a, b) => a - b);
      const s = [], e = [], pauseMid = [];
      for (let k = 0; k < idx.length - 1; k++) {
        const i0 = idx[k], i1 = idx[k + 1];
        const tA = anchors[i0][1], tB = anchors[i1][0];
        // Weight inside the segment: words + unanchored punctuation pauses.
        let total = 0;
        for (let i = i0; i < i1; i++) total += words[i].w + (i < i1 - 1 ? words[i].pause : 0);
        let acc = 0;
        for (let i = i0; i < i1; i++) {
          s[i] = tA + (tB - tA) * acc / total;
          acc += words[i].w;
          e[i] = tA + (tB - tA) * acc / total;
          if (i < i1 - 1) { acc += words[i].pause; pauseMid[i] = (e[i] + tA + (tB - tA) * acc / total) / 2; }
          else pauseMid[i] = (e[i] + anchors[i1][1]) / 2;
        }
      }
      return { s, e, pauseMid };
    };
    const base = { 0: [voice.speechStart, voice.speechStart], [words.length]: [voice.speechEnd, voice.speechEnd] };
    let anchors = { ...base };
    for (let iter = 0; iter < 2; iter++) {
      const { pauseMid } = solve(anchors);
      anchors = { ...base };
      let lastPause = -1;
      words.forEach((w, i) => {
        if (!w.pause || i === words.length - 1) return;
        let best = -1, bestD = 1.0;
        voice.pauses.forEach(([a, b], j) => {
          const d = Math.abs((a + b) / 2 - pauseMid[i]);
          if (j > lastPause && d < bestD) { best = j; bestD = d; }
        });
        if (best >= 0) { anchors[i + 1] = voice.pauses[best]; lastPause = best; }
      });
    }
    ({ s: start, e: end } = solve(anchors));
  }

  const find = (phrase, nth = 1) => {
    const p = phrase.split(/\s+/).map(norm).filter(Boolean);
    let seen = 0;
    for (let i = 0; i + p.length <= words.length; i++) {
      if (p.every((x, j) => words[i + j].n === x) && ++seen === nth) return [i, i + p.length - 1];
    }
    throw new Error(`cue(): fant ikke «${phrase}» (${nth}. forekomst) i speakerteksten`);
  };
  /** Time the phrase starts being spoken. nth = which occurrence (1-based). */
  const cue = (phrase, nth = 1) => lead + start[find(phrase, nth)[0]];
  /** Time the phrase has been spoken. */
  const cueEnd = (phrase, nth = 1) => lead + end[find(phrase, nth)[1]];
  return { cue, cueEnd, words: words.map((w, i) => ({ word: w.raw, start: lead + start[i], end: lead + end[i] })) };
}

/** Every cue()/cueEnd() call made through sceneInfo, in call order: { kind, phrase, nth, t }. Read by DEMO.cues()
 *  (render.mjs --contact takes a still per cue). */
const CUE_LOG = [];
function logCue(kind, phrase, nth, t) {
  if (!CUE_LOG.some((c) => c.kind === kind && c.phrase === phrase && c.nth === nth)) CUE_LOG.push({ kind, phrase, nth, t });
  return t;
}

/** Voice entry n from the generated voice.js (numeric id, or zero-padded string id). */
function voiceEntry(n) {
  if (typeof VOICE === "undefined") return null;
  return VOICE[n] ?? VOICE[String(n).padStart(2, "0")] ?? null;
}

/**
 * Everything a scene needs from the generated voice metadata: n, slug, lead, tail, audioDuration, duration,
 * voiceText, audioSrc (relative to the scene file), cue, cueEnd, words.
 * Scenes without voice text get lead = tail = 0 and the configured duration (VOICE entry or DATA.scenes[n]).
 * A voice entry with text but no audio file (dummy voice) gets cues spread evenly over its duration.
 */
function sceneInfo(n, opts = {}) {
  const v = voiceEntry(n);
  const meta = typeof DATA !== "undefined" && DATA && DATA.scenes ? DATA.scenes[n] : null;
  const slug = v?.slug ?? meta?.slug ?? String(n);
  const noVoice = () => { throw new Error(`Scene ${n} har ingen speakertekst`); };
  if (!v || !v.text) {
    return { n, slug, lead: 0, tail: 0, audioDuration: 0, duration: opts.duration ?? v?.duration ?? meta?.duration ?? 3, voiceText: "",
      audioSrc: null, cue: noVoice, cueEnd: noVoice, words: [] };
  }
  const lead = opts.lead ?? v.lead ?? LEAD, tail = opts.tail ?? v.tail ?? TAIL;
  const made = makeCue({ voiceText: v.text, audioDuration: v.duration, lead, voice: v.file ? v : null });
  const cue = (phrase, nth = 1) => logCue("cue", phrase, nth, made.cue(phrase, nth));
  const cueEnd = (phrase, nth = 1) => logCue("cueEnd", phrase, nth, made.cueEnd(phrase, nth));
  const words = made.words;
  const audioSrc = v.src !== undefined ? v.src : v.file ? AUDIO_BASE + v.file : null;
  return { n, slug, lead, tail, audioDuration: v.duration, duration: lead + v.duration + tail, voiceText: v.text, audioSrc, cue, cueEnd, words };
}

// ---------- Captions ----------

/** #captions on the stage, outside #camera (not zoomed): above the page and stage layers, below #ripple and #cursor. */
function captionLayer() {
  const stage = ensureStage(), ripple = $("#ripple");
  let el = $("#captions");
  if (!el) el = Object.assign(document.createElement("div"), { id: "captions" });
  if (el.parentNode !== stage || el.nextElementSibling !== ripple) stage.insertBefore(el, ripple);   // later mount(…, "stage") stays below
  return el;
}

/**
 * captionTrack(S, opts) → state function (t) => void that shows the caption being spoken in #captions.
 * Captions are S.words grouped per sentence (longer than maxChars: split at the last , ; : before the limit, else
 * at a word boundary) – the same rules as tools/captions.mjs (SRT). Shown from first word − .1 s to last word
 * + .25 s (≥ 1 s, up to the next caption), linear opacity fade of `fade` s at both ends; nothing from `until` on.
 * opts: mode "sentence" | "karaoke" (span per word, .said / .now), maxChars 64, pos "bottom" | "top", margin 72 (px
 * from the stage edge), fade .15, until S.lead + S.audioDuration, className (extra class on #captions).
 */
function captionTrack(S, opts = {}) {
  const { mode = "sentence", maxChars = 64, pos = "bottom", margin = 72, fade = .15, className = "" } = opts;
  const audioEnd = S.lead + S.audioDuration, until = opts.until ?? audioEnd;
  const text = (ws) => ws.map((w) => w.word).join(" ");
  const split = (ws) => {
    if (ws.length < 2 || text(ws).length <= maxChars) return [ws];
    let cut = 0, clause = 0;
    for (let k = 1; k < ws.length && text(ws.slice(0, k)).length <= maxChars; k++) { cut = k; if (/[,;:]$/.test(ws[k - 1].word)) clause = k; }
    const k = clause || cut || 1;
    return [ws.slice(0, k), ...split(ws.slice(k))];
  };
  const sentences = [];
  let cur = [];
  for (const w of S.words ?? []) { cur.push(w); if (/[.!?]["»”]?$/.test(w.word)) { sentences.push(cur); cur = []; } }
  if (cur.length) sentences.push(cur);
  const groups = sentences.flatMap(split), raw = groups.map((g) => Math.max(g[0].start - .1, S.lead));
  let prevEnd = -Infinity;
  const caps = groups.map((g, i) => {
    const start = Math.max(raw[i], prevEnd);
    prevEnd = Math.max(start, Math.min(Math.max(g[g.length - 1].end + .25, start + 1), raw[i + 1] ?? Infinity, audioEnd));
    return { words: g, start, end: prevEnd };
  });
  const cls = ["pos-" + pos, mode, className].filter(Boolean).join(" ");

  return (t) => {
    const el = captionLayer();
    el.className = cls;
    el.style.top = pos === "top" ? margin + "px" : "auto";
    el.style.bottom = pos === "top" ? "auto" : margin + "px";
    const i = t < until ? caps.findIndex((c) => t >= c.start && t < c.end) : -1;
    if (i < 0) { el.style.display = "none"; el.style.opacity = 0; return; }
    const c = caps[i], end = Math.min(c.end, until);
    // Back-to-back captions switch without a fade; elsewhere opacity ramps linearly with t.
    const fin = i > 0 && caps[i - 1].end >= c.start ? 1 : prog(t, c.start, c.start + fade);
    const fout = caps[i + 1] && caps[i + 1].start <= end ? 1 : 1 - prog(t, end - fade, end);
    el.style.display = "";
    el.style.opacity = Math.min(fin, fout);
    setHTML(el, mode === "karaoke"
      ? c.words.map((w) => `<span${w.end <= t ? ' class="said"' : w.start <= t ? ' class="now"' : ""}>${esc(w.word)}</span>`).join(" ")
      : esc(text(c.words)));
  };
}

// ---------- The demo ----------

/**
 * createDemo(config) → DEMO (also set as window.DEMO for render.mjs).
 * config: duration | (audioDuration + lead + tail), lead, tail, audioSrc, voiceText, cue,
 *   camera:      [{ t, s, cx, cy } | { t, s, sel, dx?, dy? } | { t, s, rect: () => rect }, ...]
 *                (ease: "inOut" | "out" | "in" | "linear" on the key it eases INTO; default theme.camera.ease)
 *   cursorStart: target; cursor: false hides it; cursorOpacity: number | (t) => number
 *   moves:       [{ t0, t1, to: target, bow? }]
 *   clicks:      [{ t }]
 *   highlights:  [{ t0, t1, sel | rect: () => rect | col: n, table?, pad?, style? }]
 *   states:      [(t) => void, ...]  scene-specific DOM, applied first on every seek
 *   hover:       false disables automatic hover; hoverSelector overrides HOVER_SELECTOR
 *   theme:       preset name or theme object for this scene only (see resolveTheme; merged over THEME)
 *
 * Targets: { sel, ax = .5, ay = .5, dx?, dy?, at?, live? } | { px, py } | { x, y }.
 * A `sel` target is measured ONCE (cached in page px; stage px for elements outside #camera) by applying the
 * scene states at the time it is used – a move at t1, cursorStart at 0, a camera key at its t, or `at` if given –
 * and converted through the camera of the current frame. So targets that are hidden later (closed modal, left
 * route, closed popup) never make the cursor or camera jump. If the element has no box at that time, the nearest
 * time where it has one is used (with a warning). `live: true` restores per-frame measuring.
 */
function createDemo(cfg) {
  ensureStage();
  const lead = cfg.lead ?? LEAD;
  const duration = cfg.duration ?? (cfg.audioDuration ? lead + cfg.audioDuration + (cfg.tail ?? TAIL) : 5);
  const cameraKeys = cfg.camera?.length ? cfg.camera : [{ t: 0, ...CAM_BASE }];
  const moves = cfg.moves ?? [], clicks = cfg.clicks ?? [], highlights = cfg.highlights ?? [];
  const states = typeof cfg.states === "function" ? [cfg.states] : (cfg.states ?? []);
  const cursorStart = cfg.cursorStart ?? CURSOR_REST;
  const hoverSelector = cfg.hoverSelector ?? HOVER_SELECTOR;
  const stageEl = $("#stage"), cameraEl = $("#camera"), cursorEl = $("#cursor"), ripple = $("#ripple");
  const cue = cfg.cue ?? (cfg.voiceText ? makeCue({ voiceText: cfg.voiceText, audioDuration: cfg.audioDuration, lead }).cue : null);
  const lastFrame = Math.max(0, (Math.round(duration * FPS) - 1) / FPS);

  // ----- Theme (resolved once; sizes reach base.css as custom properties on #stage) -----
  if (ENGINE_OPTS.theme == null && cfg.theme == null) warnOnce("theme: ingen theme i video.config.json – bruker «frame»");
  const theme = cfg.theme != null ? resolveTheme(cfg.theme, THEME) : THEME;
  ACTIVE_THEME = theme;
  const curT = theme.cursor, ripT = theme.ripple;
  for (const [k, v] of [["--hl-width", theme.highlight.width + "px"], ["--hl-radius", theme.highlight.radius + "px"],
    ["--hl-glow", theme.highlight.glow + "px"], ["--hl-dim", theme.highlight.dim],
    ["--ripple-size", ripT.size + "px"], ["--cursor-size", curT.size + "px"]]) stageEl.style.setProperty(k, String(v));
  if (curT.style === "dot") {
    // Filled circle, hotspot in the centre (stroke 2 px inside the box).
    const d = Number(curT.size);
    cursorEl.setAttribute("viewBox", `0 0 ${d} ${d}`);
    cursorEl.innerHTML = `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 1}" fill="#000" stroke="#fff" stroke-width="2"/>`;
    cursorEl.style.transformOrigin = "50% 50%";
  }
  const hotspot = curT.style === "dot" ? curT.size / 2 : 2;

  const runStates = (t) => { for (const s of states) s(t); };

  // ----- Target resolution (measured once, deterministic) -----
  let prepared = false, final = false;
  let startPoint = null, movePoints = [], keys = [], hlFallback = [];

  /** Measures a `sel` target in the current DOM → { space: "page", px, py } | { space: "stage", x, y } | null. */
  function measureSel(target) {
    const el = $(target.sel);
    if (!hasBox(el)) return null;
    const ax = target.ax ?? .5, ay = target.ay ?? .5, dx = target.dx ?? 0, dy = target.dy ?? 0;
    if (cameraEl.contains(el)) {
      const r = pageRect(el);
      return { space: "page", px: r.x + r.w * ax + dx, py: r.y + r.h * ay + dy };
    }
    const r = el.getBoundingClientRect(), sr = stageEl.getBoundingClientRect(), k = sr.width / STAGE_W;
    return { space: "stage", x: (r.left - sr.left + r.width * ax) / k + dx, y: (r.top - sr.top + r.height * ay) / k + dy };
  }

  /** Applies the states at T and measures; if nothing is measurable at T, searches the nearest frame that is. */
  function measureAt(fn, T, label) {
    T = clamp(T, 0, duration);
    runStates(T);
    let m = fn();
    if (m) return m;
    const step = 1 / FPS, n = Math.ceil(duration * FPS) + 1;
    for (let i = 1; i <= n; i++) {
      for (const tt of [T - i * step, T + i * step]) {
        if (tt < 0 || tt > duration) continue;
        runStates(tt);
        m = fn();
        if (m) { warnOnce(`${label}: ikke synlig ved t=${T.toFixed(2)}, målt ved t=${tt.toFixed(2)}`); return m; }
      }
    }
    warnOnce(`${label}: fant ikke elementet på noe tidspunkt`);
    return null;
  }

  function resolveTarget(target, T, label) {
    if (!target) return null;
    if (target.sel !== undefined) {
      if (target.live) return { space: "live", target };
      return measureAt(() => measureSel(target), target.at ?? T, `${label} (${target.sel})`);
    }
    if (target.px !== undefined) { runStates(clamp(target.at ?? T, 0, duration)); return { space: "page", px: target.px, py: target.py }; }
    return { space: "stage", x: target.x, y: target.y };
  }

  function resolveKey(k, i) {
    if (k.cx !== undefined) return k;
    const label = `camera[${i}]`;
    let c = null;
    if (k.rect) {
      c = measureAt(() => { const r = k.rect(); return r && isFinite(r.x) ? { cx: r.x + r.w / 2, cy: r.y + r.h / 2 } : null; }, k.at ?? k.t, label);
    } else if (k.sel) {
      c = measureAt(() => { const el = $(k.sel); if (!hasBox(el)) return null; const r = pageRect(el); return { cx: r.x + r.w / 2, cy: r.y + r.h / 2 }; },
        k.at ?? k.t, `${label} (${k.sel})`);
    }
    c = c ?? { cx: CAM_BASE.cx, cy: CAM_BASE.cy };
    return { ...k, cx: c.cx + (k.dx ?? 0), cy: c.cy + (k.dy ?? 0) };
  }

  /** Highlight rect from the current DOM, or null. */
  function highlightRect(h) {
    if (h.rect) { const r = h.rect(); return r && isFinite(r.x) ? r : null; }
    if (h.col) { const cells = $$(`${h.table ?? ENGINE_OPTS.columnTable ?? "table"} tr > :nth-child(${h.col})`).filter(hasBox); return cells.length ? unionRect(cells) : null; }
    const el = $(h.sel);
    return hasBox(el) ? pageRect(el) : null;
  }

  function prepare() {
    startPoint = resolveTarget(cursorStart, 0, "cursorStart");
    movePoints = moves.map((m, i) => resolveTarget(m.to, m.t1, `moves[${i}]`));
    keys = cameraKeys.map(resolveKey);
    // Fallback rect per highlight (measured at its middle), used on frames where its element has no box.
    hlFallback = highlights.map((h, i) => measureAt(() => highlightRect(h), (h.t0 + h.t1) / 2, `highlights[${i}]`));
    prepared = true;
    final = document.fonts.status === "loaded";
  }
  // Images change layout when they load: measure again afterwards (preview).
  addEventListener("load", () => { prepared = false; });

  const toStage = (p, fallback) => {
    if (!p) return fallback;
    if (p.space === "page") return pageToStage(p.px, p.py);
    if (p.space === "live") return stagePoint(p.target);
    return { x: p.x, y: p.y };
  };

  // ----- Camera -----
  function cameraAt(t) {
    const i = keys.findIndex((k) => k.t > t);
    if (i === -1) return keys[keys.length - 1];
    if (i === 0) return keys[0];
    const a = keys[i - 1], b = keys[i];
    const p = (EASE[b.ease ?? theme.camera.ease] ?? easeInOut)(prog(t, a.t, b.t));
    return { s: lerp(a.s, b.s, p), cx: lerp(a.cx, b.cx, p), cy: lerp(a.cy, b.cy, p) };
  }
  function applyCamera(t) {
    const { s, cx, cy } = cameraAt(t);
    currentCam = { s, cx, cy };
    cameraEl.style.transform = `translate(${STAGE_W / 2 - cx * s}px, ${STAGE_H / 2 - cy * s}px) scale(${s})`;
  }

  // ----- Cursor -----
  function cursorAt(t) {
    let pos = toStage(startPoint, CURSOR_REST);
    moves.forEach((m, i) => {
      if (t < m.t0) return;
      const target = toStage(movePoints[i], pos);
      if (t >= m.t1) { pos = target; return; }
      const p = (EASE[curT.ease] ?? easeInOut)(prog(t, m.t0, m.t1));
      // Slight arc so the path does not look robotic.
      const dx = target.x - pos.x, dy = target.y - pos.y, bow = Math.sin(Math.PI * p) * (m.bow ?? curT.bow);
      pos = { x: lerp(pos.x, target.x, p) - dy * bow, y: lerp(pos.y, target.y, p) + dx * bow };
    });
    return pos;
  }

  function applyCursor(t) {
    if (cfg.cursor === false) { cursorEl.style.display = "none"; ripple.style.opacity = 0; return; }
    // Theme cursor "none": hidden, but ripple and hover still follow the computed position.
    cursorEl.style.display = curT.style === "none" ? "none" : "";
    if (cfg.cursorOpacity !== undefined) {
      cursorEl.style.opacity = typeof cfg.cursorOpacity === "function" ? cfg.cursorOpacity(t) : cfg.cursorOpacity;
    }
    const pos = cursorAt(t);
    const pressed = clicks.some((c) => t >= c.t && t < c.t + curT.pressDur);
    cursorEl.style.transform = `translate(${pos.x - hotspot}px, ${pos.y - hotspot}px) scale(${pressed ? curT.press : 1})`;

    const click = clicks.find((c) => t >= c.t && t < c.t + ripT.dur);
    if (click) {
      const p = prog(t, click.t, click.t + ripT.dur);
      ripple.style.left = pos.x + "px";
      ripple.style.top = pos.y + "px";
      ripple.style.opacity = ripT.opacity * (1 - p);
      ripple.style.transform = `scale(${lerp(ripT.from, ripT.to, easeOut(p))})`;
    } else {
      ripple.style.opacity = 0;
    }

    // Hover style for the top-most hoverable element under the cursor (respects modals/backdrops).
    $$(".hov").forEach((e) => e.classList.remove("hov"));
    if (cfg.hover === false) return;
    const sr = stageEl.getBoundingClientRect(), k = sr.width / STAGE_W;
    const hit = document.elementFromPoint(sr.left + pos.x * k, sr.top + pos.y * k);
    const target = hit && hit.closest(hoverSelector);
    if (target && !target.disabled && !target.classList.contains("disabled")) target.classList.add("hov");
  }

  // ----- Highlights -----
  const layer = $("#highlights");
  const hlStyle = (h) => h.style ?? theme.highlight.style;
  const hlFade = theme.highlight.fade;
  // Style "none" is never visible (no .hl drawn, not reported by lint).
  const hlOpacity = (h, t) => (hlStyle(h) === "none" ? 0 : Math.min(prog(t, h.t0, h.t0 + hlFade), 1 - prog(t, h.t1 - hlFade, h.t1)));
  function applyHighlights(t) {
    while (layer.children.length < highlights.length) layer.appendChild(Object.assign(document.createElement("div"), { className: "hl" }));
    highlights.forEach((h, i) => {
      const el = layer.children[i];
      const cls = "hl " + hlStyle(h);
      if (el.className !== cls) el.className = cls;
      const o = hlOpacity(h, t);
      el.style.opacity = o;
      el.style.display = o > 0 ? "" : "none";
      if (o <= 0) return;
      const r = highlightRect(h) ?? hlFallback[i];
      if (!r) { el.style.display = "none"; return; }
      const pad = h.pad ?? theme.highlight.pad;
      Object.assign(el.style, { left: r.x - pad + "px", top: r.y - pad + "px", width: r.w + 2 * pad + "px", height: r.h + 2 * pad + "px" });
    });
  }

  function seek(t) {
    if (!prepared || (!final && document.fonts.status === "loaded")) prepare();
    t = clamp(t, 0, duration);
    runStates(t);
    applyCamera(t);
    applyHighlights(t);
    applyCursor(t);
  }

  /** Inline opacity/transform/display/visibility of every scene element (overlays and camera excluded). */
  function snapshot() {
    const m = new Map();
    $$("#stage *").forEach((el) => {
      if (el === cameraEl || el === cursorEl || el === ripple || el.closest("#highlights, #cursor")) return;
      const s = el.style;
      if (s.opacity || s.transform || s.display || s.visibility) m.set(el, `${s.opacity}|${s.transform}|${s.display}|${s.visibility}`);
    });
    return m;
  }
  const describe = (el) => (el.id ? "#" + el.id
    : el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : ""));

  /** Boundary hygiene at the first and last frame: highlights, ripples, moves, camera moves, layers mid-animation. */
  function lint() {
    const out = [];
    for (const [name, t, tn] of [["første", 0, 1 / FPS], ["siste", lastFrame, Math.max(0, lastFrame - 1 / FPS)]]) {
      seek(tn);
      const near = snapshot();
      seek(t);
      const here = snapshot();
      here.forEach((v, el) => { if (near.has(el) && near.get(el) !== v) out.push(`${name} bilde: ${describe(el)} er midt i en animasjon`); });
      highlights.forEach((h, i) => { if (hlOpacity(h, t) > 0) out.push(`${name} bilde: highlights[${i}] er synlig`); });
      if (clicks.some((c) => t >= c.t && t < c.t + ripT.dur)) out.push(`${name} bilde: klikk-ripple er synlig`);
      moves.forEach((m, i) => { if (t > m.t0 && t < m.t1) out.push(`${name} bilde: pekeren er midt i moves[${i}]`); });
      const i = keys.findIndex((k) => k.t > t);
      if (i > 0) {
        const a = keys[i - 1], b = keys[i];
        if (t > a.t && (a.s !== b.s || a.cx !== b.cx || a.cy !== b.cy)) out.push(`${name} bilde: kameraet er i bevegelse (camera[${i - 1}] → camera[${i}])`);
      }
    }
    return out;
  }

  const demo = {
    duration, lead, fps: FPS, audioSrc: cfg.audioSrc ?? null, audioDuration: cfg.audioDuration ?? 0,
    seek,
    /** Forces target measuring now (render.mjs calls it after the fonts have loaded). */
    prepare: () => { prepare(); return { final }; },
    cameraAt: (t) => { if (!prepared) prepare(); const c = cameraAt(t); return { s: c.s, cx: c.cx, cy: c.cy }; },
    cursorAt: (t) => { seek(t); return cursorAt(t); },
    /** Camera + cursor at t, rounded (used by render.mjs for boundary checks). */
    state: (t) => {
      seek(t);
      const c = cameraAt(t), p = cursorAt(t);
      return { t, s: +c.s.toFixed(3), cx: +c.cx.toFixed(1), cy: +c.cy.toFixed(1), x: +p.x.toFixed(1), y: +p.y.toFixed(1),
        cursor: cfg.cursor !== false && curT.style !== "none" && cursorEl.style.opacity !== "0" };
    },
    /** Resolved targets (debugging): cursorStart, moves, camera keys. */
    targets: () => { if (!prepared) prepare(); return { cursorStart: startPoint, moves: movePoints, camera: keys.map(({ t, s, cx, cy }) => ({ t, s, cx, cy })) }; },
    lint, cue, lastFrame,
    /** Every cue()/cueEnd() the scene asked sceneInfo for (render.mjs --contact). */
    cues: () => CUE_LOG.map((c) => ({ ...c })),
    /** The scripted beats: clicks, camera keys, highlight starts, move ends (render.mjs --contact). */
    events: () => [
      ...clicks.map((c) => ({ kind: "click", t: c.t })),
      ...cameraKeys.filter((k) => k.t > 0).map((k) => ({ kind: "camera", t: k.t, s: k.s, sel: k.sel ?? null })),
      ...highlights.map((h) => ({ kind: "highlight", t: h.t0, sel: h.sel ?? (h.col ? `col ${h.col}` : "rect") })),
      ...moves.map((m) => ({ kind: "move", t: m.t1, sel: m.to?.sel ?? null })),
    ],
    /** The resolved theme of this demo. */
    theme,
  };
  window.DEMO = demo;
  startPreview(demo);
  return demo;
}

// ---------- Live preview (not used when rendering) ----------
function startPreview(demo) {
  const params = new URLSearchParams(location.search);
  if (params.has("render")) return;
  document.body.classList.add("preview");
  const fit = () => {
    const k = Math.min(1, innerWidth / STAGE_W, innerHeight / STAGE_H);
    $("#stage").style.transform = k < 1 ? `scale(${k})` : "";
  };
  fit();
  addEventListener("resize", fit);

  if (params.has("t")) {
    document.fonts.ready.then(() => demo.seek(Number(params.get("t"))));
    return;
  }

  const hud = Object.assign(document.createElement("div"), { id: "hud" });
  document.body.appendChild(hud);
  const audio = demo.audioSrc ? new Audio(demo.audioSrc) : null;
  let audioBlocked = false;
  if (audio) {
    audio.preload = "auto";
    audio.addEventListener("error", () => { audio.dataset.failed = "1"; });
  }

  let start = performance.now(), paused = false, pausedAt = 0;
  const now = () => (paused ? pausedAt : ((performance.now() - start) / 1000) % demo.duration);
  const jump = (t) => {
    t = ((t % demo.duration) + demo.duration) % demo.duration;
    if (paused) pausedAt = t; else start = performance.now() - t * 1000;
  };
  addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (paused) start = performance.now() - pausedAt * 1000; else pausedAt = now();
      paused = !paused;
    } else if (e.code === "ArrowLeft") jump(now() - (e.shiftKey ? 1 / FPS : 1));
    else if (e.code === "ArrowRight") jump(now() + (e.shiftKey ? 1 / FPS : 1));
    else if (e.code === "Home") jump(0);
    unblock();
  });
  addEventListener("pointerdown", unblock);
  function unblock() {
    if (audio && audioBlocked) { audioBlocked = false; audio.play().catch(() => { audioBlocked = true; }); }
  }

  function syncAudio(t) {
    if (!audio || audio.dataset.failed) return;
    const a = t - demo.lead;
    const want = !paused && a >= 0 && a < (audio.duration || demo.audioDuration || 0) - .05;
    if (!want) { if (!audio.paused) audio.pause(); return; }
    if (audio.paused && !audioBlocked) {
      audio.currentTime = a;
      audio.play().catch(() => { audioBlocked = true; });
    } else if (!audio.paused && Math.abs(audio.currentTime - a) > .2) {
      audio.currentTime = a;
    }
  }

  // The preview clock is the only place wall time is used; frames themselves stay pure functions of t.
  const loop = () => {
    const t = now();
    demo.seek(t);
    syncAudio(t);
    const sound = !audio ? "" : audio.dataset.failed ? " · lyd mangler" : audioBlocked ? " · klikk for lyd" : "";
    hud.textContent = `${t.toFixed(2)} / ${demo.duration.toFixed(2)} s · mellomrom = pause · ←/→ = ±1 s (shift: 1 bilde)${sound}`;
    requestAnimationFrame(loop);
  };
  document.fonts.ready.then(loop);
}
