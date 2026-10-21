// Measures every voice file and writes the voice metadata script (default shared/voice.js) that sceneInfo() and
// cue() read in the browser: per scene the audio file, duration, speech start/end, pauses and the voiced text,
// plus the engine options from video.config.json (const VIDEO). Next to it, the same data as JSON
// (shared/voice.js → shared/voice.json, { "VIDEO": …, "VOICE": … }) for Node and Remotion (tools/cue.mjs).
//
//   node tools/voice-meta.mjs [--config path/to/video.config.json]      (pnpm voice-meta)
//
// Run it again whenever an audio file, the voice text or video.config.json changes.
// As a module: `import { measure } from "./voice-meta.mjs"` → measure(file) = { duration, speechStart, speechEnd,
// pauses } (the CLI runs only when the file is executed directly); voicedAudio(cfg), readWords(full, text), collapse.
// Measured words: when <audio file>.words.json (tools/align.mjs, pnpm align) matches the audio file (size + mtime)
// and the voice text, the entry gets words: [[start, end], …] per voice word and cue() uses them instead of the
// estimate. A stale sidecar is ignored with a warning.
//
// Audio file per scene (first that applies):
//   scene.audio                 explicit file name in dirs.audio ("none" = no audio)
//   audioPattern "{n}_Chapter_1.mp3" / "{nn}-{slug}.mp3" / "{i}_Chapter_1.mp3"
//                               {n} = id, {nn} = id zero-padded to 2, {slug}, {i}/{ii} = position among voiced scenes
//   audioPattern "auto"         the file in dirs.audio whose name starts with the scene id (1_Chapter_1.mp3, 01-intro.mp3)
// Voice text per scene: scene.text (literal) > paragraph scene.paragraph of voiceText > the next paragraph of
// voiceText in scene order (silent scenes do not consume one).
// Silent scene: scene.silent = true (uses scene.duration). Dummy voice: text but no audio file → needs
// scene.duration (seconds of "speech"); cues are spread evenly and the clip gets a silent track.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AUDIO_EXT, loadConfig, voicedTexts } from "./config.mjs";
import { makeCue } from "./cue.mjs";
import { assertFfmpeg, ffmpeg, parseDuration } from "./ffbin.mjs";

const round = (v) => Math.round(v * 1000) / 1000;

let ffmpegChecked = false;
export function measure(full) {
  if (!ffmpegChecked) { assertFfmpeg(); ffmpegChecked = true; }
  // silencedetect reports on stderr; the input banner in the same log carries the duration.
  const log = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", full, "-af", "silencedetect=noise=-35dB:d=0.1", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 }).stderr;
  const duration = parseDuration(log);
  if (duration === null) throw new Error(`Kunne ikke lese ${full}:\n${log}`);
  const silences = [];
  let start = null;
  for (const line of log.split(/\r?\n/)) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start !== null) { silences.push([round(start), round(Number(e[1]))]); start = null; }
  }
  if (start !== null) silences.push([round(start), round(duration)]);
  // Merge pauses split by a click or breath shorter than 50 ms.
  for (let i = silences.length - 1; i > 0; i--) {
    if (silences[i][0] - silences[i - 1][1] < 0.05) silences.splice(i - 1, 2, [silences[i - 1][0], silences[i][1]]);
  }
  let speechStart = 0, speechEnd = duration;
  if (silences.length && silences[0][0] <= 0.05) speechStart = silences.shift()[1];
  if (silences.length && silences[silences.length - 1][1] >= duration - 0.05) speechEnd = silences.pop()[0];
  return { duration: round(duration), speechStart: round(speechStart), speechEnd: round(speechEnd), pauses: silences };
}

/**
 * Voiced scenes in order with their text and audio file: [{ scene, text, file, full }] (file/full null when the
 * scene has no audio file). Same resolution as the voice metadata; tools/align.mjs uses it too. Carries
 * `paragraphs` and `nextParagraph` like voicedTexts().
 */
export function voicedAudio(cfg) {
  const audioDir = cfg.dir("audio");
  const voiced = voicedTexts(cfg);
  const audioFiles = existsSync(audioDir) ? readdirSync(audioDir).filter((f) => AUDIO_EXT.test(f)) : [];

  function audioFor(scene, index) {
    const raw = scene.raw;
    if (raw.audio === "none" || raw.audio === null) return null;
    if (raw.audio) return raw.audio;
    const pattern = cfg.audioPattern ?? "auto";
    if (pattern === "auto") {
      if (!/^\d+$/.test(String(scene.id))) return null;
      const hits = audioFiles.filter((f) => Number(f.match(/^(\d+)/)?.[1]) === Number(scene.id));
      if (hits.length > 1) throw new Error(`Scene ${scene.id}: flere lydfiler passer (${hits.join(", ")}) – sett "audio" i konfigurasjonen`);
      return hits[0] ?? null;
    }
    const name = pattern
      .replaceAll("{nn}", scene.key).replaceAll("{n}", String(scene.id)).replaceAll("{slug}", scene.slug)
      .replaceAll("{ii}", String(index).padStart(2, "0")).replaceAll("{i}", String(index));
    return existsSync(path.join(audioDir, name)) ? name : null;
  }

  const list = voiced.map(({ scene, text }, i) => {
    const file = audioFor(scene, i + 1);
    return { scene, text, file, full: file ? path.join(audioDir, file) : null };
  });
  list.paragraphs = voiced.paragraphs;
  list.nextParagraph = voiced.nextParagraph;
  return list;
}

/** Voice text with whitespace collapsed, as stored in a words sidecar. */
export const collapse = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * The words sidecar of an audio file (<full>.words.json, written by tools/align.mjs) checked against the audio
 * (size + mtimeMs) and the voice text: { status: "none" | "fresh" | "stale", data }.
 */
export function readWords(full, text) {
  const file = `${full}.words.json`;
  if (!existsSync(file)) return { status: "none", data: null };
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { return { status: "stale", data: null }; }
  const st = statSync(full);
  const fresh = data?.audio?.size === st.size && data?.audio?.mtimeMs === st.mtimeMs && data.text === collapse(text) &&
    Array.isArray(data.words);
  return { status: fresh ? "fresh" : "stale", data };
}

function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf("--config");
  const cfg = loadConfig({ explicit: ci >= 0 ? args[ci + 1] : null });
  if (!cfg.file) console.warn("Advarsel: fant ingen video.config.json – bruker standardverdier");

  const audioDir = cfg.dir("audio");
  const scenesDir = cfg.dir("scenes");
  const out = cfg.abs(cfg.voiceOut);

  const voiced = voicedAudio(cfg);
  const { paragraphs, nextParagraph } = voiced;
  const byScene = new Map(voiced.map((v) => [v.scene, v]));

  const voice = {};
  for (const scene of cfg.sceneList) {
    const raw = scene.raw;
    const entry = { slug: scene.slug };
    if (raw.lead !== undefined) entry.lead = raw.lead;
    if (raw.tail !== undefined) entry.tail = raw.tail;
    if (raw.silent) {
      voice[scene.id] = { ...entry, silent: true, duration: raw.duration ?? 3 };
      console.log(`${String(scene.key).padStart(3)}  stille  ${(raw.duration ?? 3).toFixed(3)} s`);
      continue;
    }
    const { text, file, full } = byScene.get(scene);
    if (!file) {
      if (raw.duration === undefined) throw new Error(`Scene ${scene.id}: fant ingen lydfil i ${path.relative(process.cwd(), audioDir) || "."} – sett "audio", "silent" eller "duration" (dummy)`);
      voice[scene.id] = { ...entry, file: null, src: null, duration: raw.duration, text: text ?? "" };
      console.log(`${String(scene.key).padStart(3)}  dummy   ${raw.duration.toFixed(3)} s  (ingen lydfil)`);
      continue;
    }
    if (!text) throw new Error(`Scene ${scene.id}: mangler speakertekst (sett "text", "paragraph" eller "voiceText")`);
    if (!existsSync(full)) throw new Error(`Scene ${scene.id}: fant ikke ${full}`);
    const m = measure(full);
    const src = path.relative(scenesDir, full).split(path.sep).join("/");
    voice[scene.id] = { ...entry, file, src, ...m, text };
    // Measured word times from tools/align.mjs, only when the sidecar matches this audio, text and word split.
    const side = readWords(full, text);
    if (side.status !== "none") {
      const count = makeCue({ voiceText: text, audioDuration: 1, lead: 0 }).words.length;
      if (side.status === "fresh" && side.data.words.length === count) voice[scene.id].words = side.data.words;
      else console.warn(`Advarsel: scene ${scene.id}: ${file}.words.json er utdatert – kjør pnpm align`);
    }
    const nWords = voice[scene.id].words ? voice[scene.id].words.length : "–";
    console.log(`${String(scene.key).padStart(3)}  ${m.duration.toFixed(3)} s  tale ${m.speechStart.toFixed(2)}–${m.speechEnd.toFixed(2)}  pauser ${m.pauses.length}  ord ${nWords}  ${file}`);
  }
  if (paragraphs.length && nextParagraph < paragraphs.length) {
    console.warn(`Advarsel: ${paragraphs.length - nextParagraph} avsnitt i ${cfg.voiceText} er ikke brukt av noen scene`);
  }

  const video = { fps: cfg.fps, width: cfg.width, height: cfg.height, lead: cfg.lead, tail: cfg.tail, page: cfg.page };
  for (const k of ["camBase", "cursorRest", "hover", "columnTable", "theme"]) if (cfg[k] != null) video[k] = cfg[k];

  const line = (v) => JSON.stringify(v).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/,"(\w+)":/g, ', "$1": ');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out,
    `// GENERATED by tools/voice-meta.mjs from ${cfg.file ? path.basename(cfg.file) : "defaults"} – do not edit by hand.\n` +
    `// VIDEO: engine options. VOICE: per scene id – audio file (src relative to the scenes folder), duration (s),\n` +
    `// speech start/end (s), internal pauses [start, end] (s), the voiced text and, when pnpm align measured them,\n` +
    `// words: one [start, end] per voice word (audio seconds).\n` +
    `const VIDEO = ${JSON.stringify(video)};\n` +
    `const VOICE = {\n${Object.entries(voice).map(([id, v]) => `  ${/^\d+$/.test(id) ? id : JSON.stringify(id)}: ${line(v)},`).join("\n")}\n};\n`);
  const outJson = out.replace(/\.m?js$/, "") + ".json";
  writeFileSync(outJson, JSON.stringify({ VIDEO: video, VOICE: voice }, null, 2) + "\n");
  console.log(`Skrev ${path.relative(process.cwd(), out)} og ${path.relative(process.cwd(), outJson)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
