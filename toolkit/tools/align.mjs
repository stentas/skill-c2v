// Measured word times for the voice-over: Whisper (Transformers.js, ONNX on the CPU) transcribes each voiced
// scene's audio file with word timestamps, and the result is aligned to the voice text word by word, so cue()
// gets real [start, end] times instead of the estimate. Scene → audio file → text exactly as voice-meta resolves it.
//
//   node tools/align.mjs [--config <file>] [--scene 2,5] [--model <id>] [--dtype fp32] [--language en] [--force]
//                                                                                   (pnpm align)
//   node tools/align.mjs --audio <file> --text <file> --out <file.words.json> [--model …] [--dtype …] [--language …]
//                                                   free-standing, no config; the text file is one paragraph
//
// Run it after tts or a new recording and before voice-meta: pnpm tts → pnpm align → pnpm voice-meta.
// Defaults come from `align` in video.config.json ({ model: "onnx-community/whisper-base_timestamped",
// dtype: "fp32", language: "en" }); flags override. Transformers.js 3.8.1 does not detect the language – set
// "no" for Norwegian audio. Only the onnx-community whisper-*_timestamped models carry the alignment heads that
// word timestamps need. Matched word times are snapped out of the pauses voice-meta's measure() finds.
// Output per scene: <dirs.audio>/<audio file>.words.json (audio/02-voiced.mp3.words.json) with the measured
// [start, end] per voice word (audio seconds, same words as makeCue), the audio size + mtime and the text it was
// made from. A fresh sidecar is skipped (--force measures again); voice-meta ignores a stale one with a warning.
// Quality gate per scene: under 50 % of the words matched → no sidecar, exit code 1; 50–80 % → written with a warning.
// Model: downloaded once from Hugging Face into a shared cache outside the project: WHISPER_CACHE_DIR, else
// ~/.cache/skill-c2v/whisper (whisper-base_timestamped fp32: ~291 MB). Fully offline after that.
// As a module: alignWords, scriptWords, decode16k, cacheDir, DEFAULTS, DTYPES (Transformers.js is only loaded to
// transcribe).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";
import { makeCue } from "./cue.mjs";
import { assertFfmpeg, ffmpeg } from "./ffbin.mjs";
import { collapse, measure, readWords, voicedAudio } from "./voice-meta.mjs";

export const DEFAULTS = { model: "onnx-community/whisper-base_timestamped", dtype: "fp32", language: "en" };
export const DTYPES = ["fp32", "fp16", "q8", "int8", "uint8", "q4", "q4f16", "bnb4"];
/** Download size in MB, measured from the cache (encoder + merged decoder). */
const MODEL_MB = { "onnx-community/whisper-base_timestamped": { fp32: 291 } };
// Transformers.js file name suffix per dtype (DEFAULT_DTYPE_SUFFIX_MAPPING).
const SUFFIX = { fp32: "", fp16: "_fp16", q8: "_quantized", int8: "_int8", uint8: "_uint8", q4: "_q4", q4f16: "_q4f16", bnb4: "_bnb4" };
const RATE = 16000;

const norm = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const round = (v) => Math.round(v * 1000) / 1000;

/** Shared model cache: WHISPER_CACHE_DIR, else ~/.cache/skill-c2v/whisper */
export function cacheDir() {
  return process.env.WHISPER_CACHE_DIR ? path.resolve(process.env.WHISPER_CACHE_DIR) : path.join(os.homedir(), ".cache", "skill-c2v", "whisper");
}

/** The voice words exactly as makeCue() splits and filters them (1:1 with cue()'s word list). */
export function scriptWords(text) {
  return makeCue({ voiceText: text, audioDuration: 1, lead: 0 }).words.map((w) => w.word);
}

/** Levenshtein distance, or Infinity as soon as it must exceed max. */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return Infinity;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return Infinity;
    prev = cur;
  }
  return prev[b.length];
}

const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && lev(a, b, 1) <= 1);

/**
 * Aligns recognised words to the voice words and gives every voice word a [start, end] (audio seconds).
 * scriptWords: the voice words (scriptWords(text)); recognized: [{ text, start, end }] from Whisper (end may be null);
 * pauses: measured silences [[a, b], …] (measure()), optional.
 * Matched words take the recognised times, snapped out of pauses (a start inside a pause moves to its end, an end
 * inside a pause to its start); unmatched runs are spread over their gap by weight (normalised length + 1), as the
 * estimator does; then clamped to [speechStart, speechEnd] and made monotonic.
 * Returns { words: [[start, end], …], matched, total }.
 */
export function alignWords({ scriptWords: script, recognized, speechStart, speechEnd, pauses = [] }) {
  const a = script.map(norm);
  const b = [];
  for (const r of recognized) {
    const n = norm(String(r.text ?? "").trim());
    if (!n || typeof r.start !== "number") continue;
    const end = typeof r.end === "number" ? r.end : Math.min(r.start + 0.3, speechEnd);
    b.push({ n, start: r.start, end });
  }
  // Sequence alignment: most matches first, then fewest gaps (a mismatch pair is not a gap).
  const n = a.length, m = b.length, W = m + 1, MATCH = 1e6;
  const score = new Float64Array((n + 1) * W), move = new Uint8Array((n + 1) * W);   // 1 diag, 2 up (skip a), 3 left (skip b)
  for (let i = 1; i <= n; i++) { score[i * W] = -i; move[i * W] = 2; }
  for (let j = 1; j <= m; j++) { score[j] = -j; move[j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = score[(i - 1) * W + j - 1] + (same(a[i - 1], b[j - 1].n) ? MATCH : 0);
      const u = score[(i - 1) * W + j] - 1, l = score[i * W + j - 1] - 1;
      const k = i * W + j;
      if (d >= u && d >= l) { score[k] = d; move[k] = 1; } else if (u >= l) { score[k] = u; move[k] = 2; } else { score[k] = l; move[k] = 3; }
    }
  }
  const hit = new Array(n).fill(-1);
  for (let i = n, j = m; i > 0 || j > 0;) {
    const mv = move[i * W + j];
    if (mv === 1) { if (same(a[i - 1], b[j - 1].n)) hit[i - 1] = j - 1; i--; j--; } else if (mv === 2) i--; else j--;
  }

  const start = [], end = [];
  let matched = 0;
  hit.forEach((j, i) => { if (j >= 0) { start[i] = b[j].start; end[i] = b[j].end; matched++; } });
  // Pause snapping: no word starts or ends inside measured silence (Whisper tends to start words early).
  // A word entirely inside one pause is left alone; if snapping would invert a word, only its start moves.
  for (let i = 0; i < n; i++) {
    if (hit[i] < 0) continue;
    const s = start[i], e = end[i];
    const ps = pauses.find(([pa, pb]) => pa < s && s < pb), pe = pauses.find(([pa, pb]) => pa < e && e < pb);
    if (ps && ps === pe) continue;
    start[i] = ps ? ps[1] : s;
    end[i] = pe && pe[0] > start[i] ? pe[0] : e;
  }
  // Unmatched runs: spread inside [previous matched end, next matched start] (speech start/end at the edges).
  for (let i = 0; i < n;) {
    if (hit[i] >= 0) { i++; continue; }
    let k = i;
    while (k < n && hit[k] < 0) k++;
    const tA = i > 0 ? end[i - 1] : speechStart, tB = k < n ? start[k] : speechEnd;
    let total = 0;
    for (let x = i; x < k; x++) total += a[x].length + 1;
    let acc = 0;
    for (let x = i; x < k; x++) {
      start[x] = tA + (tB - tA) * acc / total;
      acc += a[x].length + 1;
      end[x] = tA + (tB - tA) * acc / total;
    }
    i = k;
  }
  const words = [];
  for (let i = 0; i < n; i++) {
    let s = Math.max(start[i], speechStart), e = Math.min(end[i], speechEnd);
    if (i > 0) s = Math.max(s, words[i - 1][1]);
    e = Math.max(e, s + 0.04);
    words.push([round(s), round(e)]);
  }
  return { words, matched, total: n };
}

let ffmpegChecked = false;
/** Decodes any audio file to mono 16 kHz Float32 samples with ffmpeg. */
export function decode16k(file) {
  if (!ffmpegChecked) { assertFfmpeg(); ffmpegChecked = true; }
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) throw new Error(`Kunne ikke dekode ${file} med ffmpeg: ${r.error?.message ?? String(r.stderr).trim()}`);
  const buf = r.stdout;
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length - (buf.length % 4)));
}

// ---------- Whisper (Transformers.js is imported here only) ----------

async function loadAsr({ model, dtype }) {
  let tf;
  try {
    tf = await import("@huggingface/transformers");
  } catch (e) {
    throw new Error(`@huggingface/transformers mangler eller kunne ikke lastes – kjør "pnpm install" i videomappen (${e.message})`);
  }
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  tf.env.cacheDir = dir;   // before the pipeline loads, so the model lands in the shared cache
  const encoder = path.join(dir, ...model.split("/"), "onnx", `encoder_model${SUFFIX[dtype]}.onnx`);
  const mb = MODEL_MB[model]?.[dtype] ? `~${MODEL_MB[model][dtype]} MB` : "ukjent størrelse";
  console.log(`Whisper-modell: ${model} (${dtype}), cache ${dir}`);
  if (!existsSync(encoder)) console.log(`Første gang: laster ned modellen (${mb}) fra Hugging Face – deretter helt offline.`);
  const shown = {};
  const progress = (p) => {
    if (p.status !== "progress" || !/\.onnx$/.test(p.file ?? "")) return;
    const pct = Math.floor((p.progress ?? 0) / 10) * 10;
    if (pct > (shown[p.file] ?? -1)) { shown[p.file] = pct; console.log(`  nedlasting ${p.file}: ${pct} %`); }
  };
  const t0 = performance.now();
  let asr;
  try {
    asr = await tf.pipeline("automatic-speech-recognition", model, { dtype, device: "cpu", progress_callback: progress });
  } catch (e) {
    throw new Error(`Kunne ikke laste Whisper-modellen ${model} (${dtype}) til ${dir}: ${e.message}\n` +
      `Uten nett: kopier ${dir} fra en maskin som har den, eller pek WHISPER_CACHE_DIR dit.`);
  }
  console.log(`  modell lastet på ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  return asr;
}

/** Whisper word chunks for 16 kHz samples → [{ text, start, end }] (end may be null). */
async function transcribe(asr, samples, language) {
  const opts = { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5, task: "transcribe" };
  if (language) opts.language = language;
  // Without a language Transformers.js warns once per 30 s chunk; the header line already says so.
  const warn = console.warn;
  console.warn = (...a) => { if (!/^No language specified/.test(String(a[0]))) warn(...a); };
  let out;
  try { out = await asr(samples, opts); } finally { console.warn = warn; }
  return (out.chunks ?? []).map((c) => ({ text: c.text, start: c.timestamp?.[0] ?? null, end: c.timestamp?.[1] ?? null }));
}

/** Transcribes and aligns one audio file; returns the sidecar content plus timing. */
async function alignFile(asr, s, full, text) {
  const t0 = performance.now();
  const samples = decode16k(full);
  const m = measure(full);
  const recognized = await transcribe(asr, samples, s.language);
  const r = alignWords({ scriptWords: scriptWords(text), recognized, speechStart: m.speechStart, speechEnd: m.speechEnd, pauses: m.pauses });
  const st = statSync(full);
  const data = { tool: "align", model: s.model, dtype: s.dtype, language: s.language, audio: { size: st.size, mtimeMs: st.mtimeMs },
    text: collapse(text), words: r.words, matched: r.matched, total: r.total, created: new Date().toISOString() };
  return { data, ratio: r.total ? r.matched / r.total : 0, audioSeconds: samples.length / RATE, seconds: (performance.now() - t0) / 1000 };
}

const writeSidecar = (out, data) => { mkdirSync(path.dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(data) + "\n"); };
const pct = (r) => `${Math.round(r * 100)} %`;
const lowHint = "prøv --model onnx-community/whisper-small_timestamped, eller sjekk at speakerteksten stemmer med lyden";

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") opts.force = true;
    else if (["--config", "--scene", "--model", "--dtype", "--language", "--audio", "--text", "--out"].includes(a)) {
      if (argv[i + 1] === undefined) throw new Error(`${a} mangler en verdi`);
      opts[a.slice(2)] = argv[++i];
    } else throw new Error(`Ukjent argument: ${a}`);
  }
  return opts;
}

function settings(opts, defaults) {
  const model = opts.model ?? defaults.model ?? DEFAULTS.model;
  const dtype = opts.dtype ?? defaults.dtype ?? DEFAULTS.dtype;
  const lang = opts.language ?? defaults.language ?? DEFAULTS.language;
  const language = lang ? String(lang) : null;
  if (!DTYPES.includes(dtype)) throw new Error(`Ugyldig dtype «${dtype}» – bruk ${DTYPES.join(", ")}`);
  return { model, dtype, language };
}

async function freeStanding(opts) {
  if (!opts.text || !opts.out) throw new Error("--audio krever --text <fil> og --out <fil.words.json>");
  const s = settings(opts, DEFAULTS);
  const audio = path.resolve(opts.audio), textFile = path.resolve(opts.text);
  if (!existsSync(audio)) throw new Error(`Fant ikke lydfilen ${audio}`);
  if (!existsSync(textFile)) throw new Error(`Fant ikke tekstfilen ${textFile}`);
  const text = collapse(readFileSync(textFile, "utf8"));
  if (!text) throw new Error(`${textFile} er tom`);
  const asr = await loadAsr(s);
  const r = await alignFile(asr, s, audio, text);
  const line = `ord ${r.data.matched}/${r.data.total} (${pct(r.ratio)})  ${r.audioSeconds.toFixed(2)} s lyd på ${r.seconds.toFixed(2)} s (RTF ${(r.seconds / r.audioSeconds).toFixed(3)})`;
  if (r.ratio < 0.5) {
    console.error(`Feil: bare ${line} – skrev ingenting; ${lowHint}`);
    process.exitCode = 1;
    return;
  }
  const out = path.resolve(opts.out);
  writeSidecar(out, r.data);
  const rel = path.relative(process.cwd(), out);
  console.log(`Skrev ${rel && !rel.startsWith("..") ? rel : out}  ${line}`);
  if (r.ratio < 0.8) console.warn(`Advarsel: lav treffrate – ${lowHint}`);
}

async function scenes(opts) {
  const cfg = loadConfig({ explicit: opts.config ?? null });
  if (!cfg.file) console.warn("Advarsel: fant ingen video.config.json – bruker standardverdier");
  const s = settings(opts, cfg.align ?? {});
  const wanted = opts.scene ? new Set(opts.scene.split(",").map((x) => x.trim()).filter(Boolean)) : null;
  const pick = (scene) => !wanted || wanted.has(String(scene.id)) || wanted.has(scene.key);
  if (wanted) {
    for (const w of wanted) if (!cfg.sceneList.some((sc) => String(sc.id) === w || sc.key === w)) console.warn(`Advarsel: scene ${w} finnes ikke i konfigurasjonen`);
  }
  const byScene = new Map(voicedAudio(cfg).map((v) => [v.scene, v]));

  const plans = [];
  for (const scene of cfg.sceneList.filter(pick)) {
    const v = byScene.get(scene);
    const skip = (reason) => plans.push({ scene, skip: reason });
    if (!v) { skip("stille scene"); continue; }
    if (!v.text || !String(v.text).trim()) { skip("ingen speakertekst"); continue; }
    if (!v.file) { skip("ingen lydfil"); continue; }
    if (!existsSync(v.full)) { skip(`fant ikke ${v.file}`); continue; }
    const side = readWords(v.full, v.text);
    if (!opts.force && side.status === "fresh" && side.data.words.length === scriptWords(v.text).length) {
      skip(`${v.file}.words.json er oppdatert (--force måler på nytt)`);
      continue;
    }
    plans.push({ scene, ...v });
  }
  const work = plans.filter((p) => !p.skip);
  if (!plans.length) { console.log("Ingen scener å måle."); return; }
  const asr = work.length ? await loadAsr(s) : null;
  if (work.length) console.log(`  språk ${s.language ?? "ikke satt (Transformers.js bruker engelsk – sett align.language)"}`);

  let written = 0, rejected = 0, spent = 0, audio = 0;
  for (const p of plans) {
    const key = String(p.scene.key).padStart(3);
    if (p.skip) { console.log(`${key}  hoppet over  ${p.skip}`); continue; }
    const r = await alignFile(asr, s, p.full, p.text);
    spent += r.seconds; audio += r.audioSeconds;
    const name = `${p.file}.words.json`;
    const line = `ord ${r.data.matched}/${r.data.total} (${pct(r.ratio)})  ${r.audioSeconds.toFixed(2)} s lyd på ${r.seconds.toFixed(2)} s`;
    if (r.ratio < 0.5) {
      console.error(`${key}  Feil: ${line} – skrev ikke ${name}; ${lowHint}`);
      rejected++;
      continue;
    }
    writeSidecar(`${p.full}.words.json`, r.data);
    written++;
    console.log(`${key}  ${line}  ${name}`);
    if (r.ratio < 0.8) console.warn(`     Advarsel: scene ${p.scene.id}: lav treffrate – ${lowHint}`);
  }
  console.log(`\n${written} skrevet, ${plans.length - work.length} hoppet over, ${rejected} avvist` +
    (work.length ? ` – ${spent.toFixed(2)} s for ${audio.toFixed(2)} s lyd (RTF ${(spent / audio).toFixed(3)})` : ""));
  if (rejected) process.exitCode = 1;
  if (written) console.log("Neste: pnpm voice-meta");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.audio) return freeStanding(opts);
  if (opts.text || opts.out) throw new Error("--text og --out krever --audio <fil>");
  return scenes(opts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // exitCode, not process.exit(): exiting while onnxruntime's threads are alive aborts with "mutex lock failed".
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
