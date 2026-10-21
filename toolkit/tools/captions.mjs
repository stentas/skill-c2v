// Captions: an SRT file for the whole video, built from the voice words of every scene.
//
//   node tools/captions.mjs [--config video.config.json] [--out file.srt]      (pnpm captions)
//
// Reads shared/voice.json (the JSON twin of config "voiceOut", written by tools/voice-meta.mjs) and groups each
// scene's words (tools/cue.mjs sceneInfo) into captions: one per sentence, split at a clause or word boundary when
// longer than "captions.maxChars". Times are offset by the start of the scene's clip in the joined video.
// Clip lengths: the measured frame count of clips/NN.mp4 when it exists, else round(duration × fps) as render.mjs
// does – so it also works before rendering. Default output: config "output" with the extension .srt.
// assemble.mjs calls writeCaptions() after the final encode with the frame counts of the clips it joined.
// engine.js captionTrack() burns the same grouping into a scene (seconds instead of ms).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { serializeSrt } from "@remotion/captions";
import { loadConfig } from "./config.mjs";
import { sceneInfo } from "./cue.mjs";
import { videoFrames } from "./ffbin.mjs";

const SENTENCE_END = /[.!?]["»”]?$/, CLAUSE_END = /[,;:]$/;
const textOf = (ws) => ws.map((w) => w.word).join(" ");

/** Splits a sentence (array of words) until every part fits maxChars: last clause punctuation, else last word boundary. */
function splitLong(ws, maxChars) {
  if (ws.length < 2 || textOf(ws).length <= maxChars) return [ws];
  let cut = 0, clause = 0;
  for (let k = 1; k < ws.length && textOf(ws.slice(0, k)).length <= maxChars; k++) {
    cut = k;
    if (CLAUSE_END.test(ws[k - 1].word)) clause = k;
  }
  const k = clause || cut || 1;
  return [ws.slice(0, k), ...splitLong(ws.slice(k), maxChars)];
}

/**
 * Groups scene words ([{ word, start, end }], scene seconds) into captions (ms, scene time):
 * start = first word − 100 ms (not before the previous caption's end or `lead`); end = max(last word + 250 ms,
 * start + 1 s), capped at the next caption's start and at `audioEnd` (seconds).
 */
export function groupCaptions(words, { maxChars = 84, lead = 0, audioEnd = Infinity } = {}) {
  const sentences = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    if (SENTENCE_END.test(w.word)) { sentences.push(cur); cur = []; }
  }
  if (cur.length) sentences.push(cur);
  const groups = sentences.flatMap((s) => splitLong(s, maxChars));
  const rawStart = groups.map((g) => Math.max(g[0].start - .1, lead));
  const out = [];
  let prevEnd = -Infinity;
  groups.forEach((g, i) => {
    const start = Math.max(rawStart[i], prevEnd);
    const end = Math.max(start, Math.min(Math.max(g[g.length - 1].end + .25, start + 1), rawStart[i + 1] ?? Infinity, audioEnd));
    prevEnd = end;
    out.push({ text: textOf(g), startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), timestampMs: null, confidence: null });
  });
  return out;
}

/** Path of shared/voice.json (config "voiceOut" with .json). */
export const voiceJsonPath = (cfg) => cfg.abs(cfg.voiceOut).replace(/\.js$/, ".json");

/** Parsed shared/voice.json, or null when it is missing. */
export function readVoiceMeta(cfg) {
  const file = voiceJsonPath(cfg);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

/** Clip frames of a scene as render.mjs computes them: round(duration × fps). */
const computedFrames = (meta, scene, fps) => Math.round(sceneInfo(meta, scene.id).duration * fps);

/**
 * Captions of the whole video (ms): every scene of cfg.sceneList in order, offset by its clip start.
 * frameCounts[i] = frames of scene i's clip (null = clip missing: scene skipped, as assemble skips it);
 * without frameCounts the length is round(duration × fps) / fps.
 */
export function videoCaptions(cfg, meta, { frameCounts } = {}) {
  const fps = cfg.fps, list = [];
  let offset = 0;
  cfg.sceneList.forEach((scene, i) => {
    const frames = frameCounts ? frameCounts[i] : computedFrames(meta, scene, fps);
    if (frames == null) return;
    const S = sceneInfo(meta, scene.id);
    const ms = Math.round(offset * 1000);
    for (const c of groupCaptions(S.words, { maxChars: cfg.captions?.maxChars, lead: S.lead, audioEnd: S.lead + S.audioDuration })) {
      list.push({ ...c, startMs: c.startMs + ms, endMs: c.endMs + ms });
    }
    offset += frames / fps;
  });
  return list;
}

/** SRT text (index, HH:MM:SS,mmm --> HH:MM:SS,mmm, text, blank line), ending with a newline. */
export const toSrt = (captions) => (captions.length ? serializeSrt({ lines: captions.map((c) => [c]) }) + "\n" : "");

/** Writes the SRT for the video; returns { out, count }. */
export function writeCaptions(cfg, { out, frameCounts, meta = readVoiceMeta(cfg) } = {}) {
  if (!meta) throw new Error(`Fant ikke ${voiceJsonPath(cfg)} – kjør pnpm voice-meta først`);
  const captions = videoCaptions(cfg, meta, { frameCounts });
  writeFileSync(out, toSrt(captions));
  return { out, count: captions.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
  try {
    const cfg = loadConfig({ explicit: opt("--config") });
    if (!cfg.file) console.warn("Advarsel: fant ingen video.config.json – bruker standardverdier");
    const out = opt("--out") ? path.resolve(opt("--out")) : cfg.abs(cfg.output).replace(/\.[^./\\]+$/, "") + ".srt";
    const meta = readVoiceMeta(cfg);
    if (!meta) throw new Error(`Fant ikke ${path.relative(process.cwd(), voiceJsonPath(cfg))} – kjør pnpm voice-meta først`);
    // Measured frames when the clip exists (ffmpeg missing or unreadable → computed), else the computed length.
    const frameCounts = cfg.sceneList.map((s) => (existsSync(s.clip) ? videoFrames(s.clip) : null) ?? computedFrames(meta, s, cfg.fps));
    const r = writeCaptions(cfg, { out, frameCounts, meta });
    console.log(`Skrev ${path.relative(process.cwd(), r.out)} (${r.count} tekster)`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
