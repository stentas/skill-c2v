// Loads video.config.json and resolves the scene list (shared by render.mjs, assemble.mjs, voice-meta.mjs, tts.mjs).
//
// Lookup: --config <file>, else the nearest video.config.json in `start` or a parent folder (start = the scene
// file's folder for render.mjs, else the current folder). Paths in the config are relative to the config file.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

const DEFAULTS = {
  name: "product-demo",
  output: "product-demo.mp4",
  fps: 30, width: 1920, height: 1080,
  lead: 0.5, tail: 0.8,
  page: { w: 1670, h: 940 },
  camBase: null,              // engine default: { s: 1.15, cx: page.w / 2, cy: page.h / 2 }
  cursorRest: null,           // engine default: { x: 1660, y: 980 }
  hover: null,                // engine default hover selector
  columnTable: null,          // engine default "table"
  theme: null,                // preset name or { preset?, highlight, cursor, … }; null = base ("frame") + a warning
  fonts: ["Inter"],
  dirs: { scenes: "scenes", clips: "clips", stills: "stills", audio: "audio" },
  voiceOut: "shared/voice.js",
  voiceText: null,            // text file: one paragraph (blank-line separated) per voiced scene
  audioPattern: "auto",       // "auto" = leading number of the file name = scene id; or e.g. "{n}_Chapter_1.mp3"
  browser: { channel: "msedge", executablePath: null, args: [] },   // args: extra Chromium flags (e.g. GPU for Three.js)
  encode: { crf: 14, preset: "slow", capture: "jpeg", quality: 95 },
  assemble: { crf: 16, preset: "slow", lufs: -16, truePeak: -1.5, lra: 11, audioBitrate: "192k" },
  tts: { voice: "af_heart", dtype: "fp32", speed: 1 },   // tools/tts.mjs (Kokoro, offline)
  align: { model: "onnx-community/whisper-base_timestamped", dtype: "fp32", language: "en" },   // tools/align.mjs (Whisper, offline); no auto-detect: set "no" for Norwegian audio
  captions: { maxChars: 84 },   // tools/captions.mjs (SRT next to the assembled MP4)
  scenes: null,              // null = every NN-*.html in dirs.scenes (not _*.html), in name order
};

export function findConfig(start, explicit) {
  if (explicit) {
    const f = path.resolve(explicit);
    if (!existsSync(f)) throw new Error(`Fant ikke konfigurasjonen ${f}`);
    return f;
  }
  let dir = path.resolve(start ?? process.cwd());
  for (;;) {
    const f = path.join(dir, "video.config.json");
    if (existsSync(f)) return f;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

const pad2 = (id) => (/^\d+$/.test(String(id)) ? String(id).padStart(2, "0") : String(id));

/** Loads the config (or defaults rooted at `fallbackRoot` when there is none). */
export function loadConfig({ start, explicit, fallbackRoot } = {}) {
  const file = findConfig(start, explicit);
  const raw = file ? JSON.parse(readFileSync(file, "utf8")) : {};
  const root = file ? path.dirname(file) : path.resolve(fallbackRoot ?? process.cwd());
  const cfg = {
    ...DEFAULTS, ...raw,
    dirs: { ...DEFAULTS.dirs, ...(raw.dirs ?? {}) },
    page: { ...DEFAULTS.page, ...(raw.page ?? {}) },
    browser: { ...DEFAULTS.browser, ...(raw.browser ?? {}) },
    encode: { ...DEFAULTS.encode, ...(raw.encode ?? {}) },
    assemble: { ...DEFAULTS.assemble, ...(raw.assemble ?? {}) },
    tts: { ...DEFAULTS.tts, ...(raw.tts ?? {}) },
    align: { ...DEFAULTS.align, ...(raw.align ?? {}) },
    captions: { ...DEFAULTS.captions, ...(raw.captions ?? {}) },
  };
  cfg.file = file;
  cfg.root = root;
  cfg.abs = (p) => path.resolve(root, p);
  cfg.dir = (name) => path.resolve(root, cfg.dirs[name]);
  cfg.fonts = (cfg.fonts ?? []).map((f) => (typeof f === "string" ? { family: f } : f));
  cfg.sceneList = resolveScenes(cfg);
  return cfg;
}

/** Normalised scene list: { id, key, slug, file (abs html), clip (abs mp4), raw }. */
function resolveScenes(cfg) {
  const scenesDir = cfg.dir("scenes"), clipsDir = cfg.dir("clips");
  let list = cfg.scenes;
  if (!list) {
    const files = existsSync(scenesDir) ? readdirSync(scenesDir).filter((f) => /^\d+-.*\.html$/.test(f)).sort() : [];
    list = files.map((f) => {
      const m = f.match(/^(\d+)-(.*)\.html$/);
      return { id: Number(m[1]), slug: m[2], file: f };
    });
  }
  return list.map((s) => {
    const key = pad2(s.id);
    return {
      ...s,
      id: s.id,
      key,
      slug: s.slug ?? key,
      file: path.resolve(scenesDir, s.file ?? `${key}-${s.slug}.html`),
      clip: path.resolve(clipsDir, s.clip ?? `${key}.mp4`),
      raw: s,
    };
  });
}

/** Paragraphs of the voiceText file (blank-line separated, whitespace collapsed); [] when voiceText is not set. */
export function voiceParagraphs(cfg) {
  return cfg.voiceText
    ? readFileSync(cfg.abs(cfg.voiceText), "utf8").split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean)
    : [];
}

/**
 * Voiced scenes in order with their text, consuming voiceText paragraphs exactly as voice-meta does.
 * Text: scene.text (literal) > paragraph scene.paragraph > the next paragraph in scene order; `text` may be
 * undefined. Silent scenes are skipped and consume no paragraph; `audio: "none"` scenes are kept (callers decide).
 * The array also carries `paragraphs` (the voiceText paragraphs) and `nextParagraph` (the first one not consumed).
 */
export function voicedTexts(cfg) {
  const paragraphs = voiceParagraphs(cfg);
  const list = [];
  let nextParagraph = 0;
  for (const scene of cfg.sceneList) {
    const raw = scene.raw;
    if (raw.silent) continue;
    const text = raw.text ?? (raw.paragraph ? paragraphs[raw.paragraph - 1] : paragraphs[nextParagraph]);
    if (!raw.text) nextParagraph = raw.paragraph ? raw.paragraph : nextParagraph + 1;
    list.push({ scene, text });
  }
  list.paragraphs = paragraphs;
  list.nextParagraph = nextParagraph;
  return list;
}

/** The scene entry for an HTML file (or a synthetic one when the file is not in the list). */
export function sceneForFile(cfg, htmlPath) {
  const abs = path.resolve(htmlPath);
  const hit = cfg.sceneList.find((s) => path.resolve(s.file).toLowerCase() === abs.toLowerCase());
  if (hit) return hit;
  const base = path.basename(abs, ".html");
  const m = base.match(/^(\d+)-/);
  const key = m ? pad2(m[1]) : base;
  return { id: m ? Number(m[1]) : base, key, slug: base, file: abs, clip: path.join(cfg.dir("clips"), `${key}.mp4`), raw: {} };
}
