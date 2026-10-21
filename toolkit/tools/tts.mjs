// Offline text-to-speech with Kokoro-82M (kokoro-js, ONNX on the CPU): one WAV per voiced scene in dirs.audio,
// from the same voice text voice-meta reads (scene.text > scene.paragraph > the next voiceText paragraph).
//
//   node tools/tts.mjs [--config <file>] [--scene 2,5] [--voice af_heart] [--dtype fp32] [--speed 1] [--force]
//                                                                                   (pnpm tts)
//   node tools/tts.mjs --text <file> --out <file.wav> [--voice …] [--dtype …] [--speed …]   free-standing, no config;
//                                                   prints generation time, audio seconds and the real-time factor
//   node tools/tts.mjs --list-voices                the voices kokoro-js accepts
//
// Defaults come from `tts` in video.config.json ({ voice: "af_heart", dtype: "fp32", speed: 1 }); flags override.
// Output per scene: dirs.audio/<key>-<slug>.wav (02-voiced.wav), which audioPattern "auto" maps back to the scene.
// A scene that already has an audio file (any file whose leading number is the scene id) is skipped; --force
// regenerates only our own <key>-<slug>.wav and never deletes another file (e.g. an ElevenLabs mp3).
// Model: onnx-community/Kokoro-82M-v1.0-ONNX, downloaded once from Hugging Face into a shared cache outside the
// project: KOKORO_CACHE_DIR, else ~/.cache/skill-c2v/kokoro. Fully offline after that.
// Long paragraphs are split into sentences (Kokoro reads at most ~510 phonemes per call) and joined into one file.
// As a module: planScene, cacheDir, modelFile, MODEL_ID, DTYPES, MODEL_MB (kokoro-js is only loaded to synthesise).
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AUDIO_EXT, loadConfig, voicedTexts } from "./config.mjs";

export const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const DTYPES = ["fp32", "fp16", "q8", "q4", "q4f16"];
/** Download size per dtype in MB (model file only; voices ship inside kokoro-js). */
export const MODEL_MB = { fp32: 326, fp16: 163, q8: 92 };
// Transformers.js file name suffix per dtype (DEFAULT_DTYPE_SUFFIX_MAPPING).
const MODEL_FILE = { fp32: "model.onnx", fp16: "model_fp16.onnx", q8: "model_quantized.onnx", q4: "model_q4.onnx", q4f16: "model_q4f16.onnx" };
const MAX_PHONEMES = 510;

/** Shared model cache: KOKORO_CACHE_DIR, else ~/.cache/skill-c2v/kokoro */
export function cacheDir() {
  return process.env.KOKORO_CACHE_DIR ? path.resolve(process.env.KOKORO_CACHE_DIR) : path.join(os.homedir(), ".cache", "skill-c2v", "kokoro");
}

/** Path of the ONNX model file for a dtype inside the cache (Transformers.js layout: <cache>/<model id>/onnx/<file>). */
export function modelFile(dtype = "fp32") {
  return path.join(cacheDir(), ...MODEL_ID.split("/"), "onnx", MODEL_FILE[dtype] ?? `model_${dtype}.onnx`);
}

/** Decides what to do for one voiced scene. */
export function planScene({ scene, text, audioFiles, force = false }) {
  const file = `${scene.key}-${scene.slug}.wav`;
  const raw = scene.raw ?? {};
  if (raw.audio === "none" || raw.audio === null) return { action: "skip", file, reason: `"audio": "none" i konfigurasjonen` };
  if (typeof raw.audio === "string" && raw.audio) return { action: "skip", file, reason: `scenen bruker "audio": "${raw.audio}" fra konfigurasjonen` };
  if (!text || !String(text).trim()) return { action: "skip", file, reason: "ingen speakertekst (sett \"text\", \"paragraph\" eller \"voiceText\")" };
  const existing = (audioFiles ?? []).filter((f) => AUDIO_EXT.test(f)).find((f) => Number(f.match(/^(\d+)/)?.[1]) === Number(scene.id));
  if (existing) {
    const own = existing.toLowerCase() === file.toLowerCase();
    if (!force) return { action: "skip", file, reason: own ? `${existing} finnes (--force lager den på nytt)` : `${existing} finnes` };
    if (!own) return { action: "skip", file, reason: `${existing} finnes – fjern den først (tts sletter aldri andre filer)` };
  }
  return { action: "write", file, reason: existing ? `erstatter ${existing} (--force)` : "ny" };
}

// ---------- synthesis (kokoro-js is imported here only) ----------

async function loadKokoro() {
  try {
    const kokoro = await import("kokoro-js");
    const { env, RawAudio } = await import("@huggingface/transformers");
    return { ...kokoro, hfEnv: env, RawAudio };
  } catch (e) {
    throw new Error(`kokoro-js mangler eller kunne ikke lastes – kjør "pnpm install" i videomappen (${e.message})`);
  }
}

/** The voices kokoro-js accepts, read without loading the model. */
async function voiceTable() {
  const { KokoroTTS } = await loadKokoro();
  return Object.create(KokoroTTS.prototype).voices;
}

async function loadModel(dtype) {
  const { KokoroTTS, TextSplitterStream, hfEnv, RawAudio } = await loadKokoro();
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });
  hfEnv.cacheDir = dir;   // must be set before from_pretrained (kokoro-js 1.2.1 does not forward cacheDir itself)
  const file = modelFile(dtype);
  const mb = MODEL_MB[dtype] ? `~${MODEL_MB[dtype]} MB` : "ukjent størrelse";
  console.log(`Kokoro-modell: ${MODEL_ID} (${dtype}), cache ${dir}`);
  if (!existsSync(file)) console.log(`Første gang: laster ned modellen (${mb}) fra Hugging Face – deretter helt offline.`);
  let shown = -1;
  const progress = (p) => {
    if (p.status !== "progress" || !/\.onnx$/.test(p.file ?? "")) return;
    const pct = Math.floor((p.progress ?? 0) / 10) * 10;
    if (pct > shown) { shown = pct; console.log(`  nedlasting ${p.file}: ${pct} %`); }
  };
  const t0 = performance.now();
  let tts;
  try {
    tts = await KokoroTTS.from_pretrained(MODEL_ID, { dtype, device: "cpu", progress_callback: progress });
  } catch (e) {
    throw new Error(`Kunne ikke laste Kokoro-modellen (${dtype}) til ${dir}: ${e.message}\n` +
      `Uten nett: kopier ${dir} fra en maskin som har den, eller pek KOKORO_CACHE_DIR dit.`);
  }
  return { tts, TextSplitterStream, RawAudio, dtype, loadSeconds: (performance.now() - t0) / 1000 };
}

function checkVoice(voices, voice) {
  if (!Object.hasOwn(voices, voice)) {
    throw new Error(`Fant ikke stemmen «${voice}». kokoro-js godtar: ${Object.keys(voices).join(", ")} (se --list-voices)`);
  }
}

/** Synthesises text sentence by sentence and returns one Float32 buffer plus timing. */
async function synth(model, text, { voice, speed }) {
  const { tts, TextSplitterStream } = model;
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();   // a string passed to tts.stream() is never closed in kokoro-js 1.2.1, so the last sentence would hang
  const parts = [];
  let rate = 24000;
  const t0 = performance.now();
  for await (const { text: sentence, phonemes, audio } of tts.stream(splitter, { voice, speed })) {
    if (phonemes.length > MAX_PHONEMES) console.warn(`Advarsel: setningen har ${phonemes.length} fonemer (maks ${MAX_PHONEMES}) og blir kuttet: «${sentence.slice(0, 60)}…» – del den opp`);
    parts.push(audio.audio);
    rate = audio.sampling_rate;
  }
  const genSeconds = (performance.now() - t0) / 1000;
  const total = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { total.set(p, at); at += p.length; }
  // fp16 on the CPU gave NaN for whole sentences (kokoro-js 1.2.1, macOS arm64) – never write such a file.
  let bad = 0;
  for (const v of total) if (!Number.isFinite(v)) bad++;
  if (bad) throw new Error(`Modellen ga ${bad} ugyldige sampler (${(bad / rate).toFixed(1)} s) – dtype «${model.dtype}» er ubrukelig på denne maskinen, bruk fp32`);
  return { samples: total, rate, sentences: parts.length, genSeconds, audioSeconds: total.length / rate };
}

async function save(model, result, out) {
  mkdirSync(path.dirname(out), { recursive: true });
  await new model.RawAudio(result.samples, result.rate).save(out);
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = { force: false, listVoices: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") opts.force = true;
    else if (a === "--list-voices") opts.listVoices = true;
    else if (["--config", "--scene", "--voice", "--dtype", "--speed", "--text", "--out"].includes(a)) {
      if (argv[i + 1] === undefined) throw new Error(`${a} mangler en verdi`);
      opts[a.slice(2)] = argv[++i];
    } else throw new Error(`Ukjent argument: ${a}`);
  }
  return opts;
}

function settings(opts, defaults) {
  const voice = opts.voice ?? defaults.voice;
  const dtype = opts.dtype ?? defaults.dtype;
  const speed = Number(opts.speed ?? defaults.speed);
  if (!DTYPES.includes(dtype)) throw new Error(`Ugyldig dtype «${dtype}» – bruk ${DTYPES.join(", ")}`);
  if (!(speed > 0)) throw new Error(`Ugyldig speed «${opts.speed ?? defaults.speed}» – et tall over 0, f.eks. 1`);
  return { voice, dtype, speed };
}

async function listVoices() {
  const voices = await voiceTable();
  for (const [id, v] of Object.entries(voices)) console.log(`${id.padEnd(12)} ${v.language}  ${v.gender.padEnd(6)}  karakter ${v.overallGrade.padEnd(2)}  ${v.name}`);
  console.log(`${Object.keys(voices).length} stemmer (kokoro-js godtar bare engelsk: en-us og en-gb)`);
}

async function freeStanding(opts) {
  if (!opts.out) throw new Error("--text krever --out <fil.wav>");
  const s = settings(opts, { voice: "af_heart", dtype: "fp32", speed: 1 });
  const textFile = path.resolve(opts.text);
  if (!existsSync(textFile)) throw new Error(`Fant ikke tekstfilen ${textFile}`);
  // Paragraphs as in voiceText; a newline between them is a sentence break for the splitter.
  const text = readFileSync(textFile, "utf8").split(/\r?\n\s*\r?\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  if (!text) throw new Error(`${textFile} er tom`);
  checkVoice(await voiceTable(), s.voice);
  const model = await loadModel(s.dtype);
  console.log(`  modell lastet på ${model.loadSeconds.toFixed(2)} s`);
  const r = await synth(model, text, s);
  const out = path.resolve(opts.out);
  await save(model, r, out);
  const rel = path.relative(process.cwd(), out);
  console.log(`Skrev ${rel && !rel.startsWith("..") ? rel : out} (${r.sentences} setninger, ${text.split(/\s+/).length} ord)`);
  console.log(`generated ${r.audioSeconds.toFixed(2)} s of audio in ${r.genSeconds.toFixed(2)} s (RTF ${(r.genSeconds / r.audioSeconds).toFixed(3)})`);
  console.log(`  dtype ${s.dtype} · stemme ${s.voice} · speed ${s.speed} · cache ${cacheDir()}`);
}

async function scenes(opts) {
  const cfg = loadConfig({ explicit: opts.config ?? null });
  if (!cfg.file) console.warn("Advarsel: fant ingen video.config.json – bruker standardverdier");
  const s = settings(opts, cfg.tts);
  const audioDir = cfg.dir("audio");
  mkdirSync(audioDir, { recursive: true });
  const audioFiles = readdirSync(audioDir).filter((f) => AUDIO_EXT.test(f));

  const wanted = opts.scene ? new Set(opts.scene.split(",").map((x) => x.trim()).filter(Boolean)) : null;
  const voiced = voicedTexts(cfg);
  const items = voiced.map((v, i) => ({ ...v, index: i + 1 })).filter((v) => !wanted || wanted.has(String(v.scene.id)) || wanted.has(v.scene.key));
  if (wanted) {
    for (const w of wanted) if (!items.some((v) => String(v.scene.id) === w || v.scene.key === w)) console.warn(`Advarsel: scene ${w} er ikke en scene med tale i konfigurasjonen`);
  }
  if (!items.length) { console.log("Ingen scener med tale å lage lyd for."); return; }

  const plans = items.map((v) => ({ ...v, plan: planScene({ scene: v.scene, text: v.text, audioFiles, force: opts.force }) }));
  const writes = plans.filter((p) => p.plan.action === "write");
  let model = null;
  if (writes.length) {
    checkVoice(await voiceTable(), s.voice);
    model = await loadModel(s.dtype);
    console.log(`  modell lastet på ${model.loadSeconds.toFixed(2)} s · stemme ${s.voice} · speed ${s.speed}`);
  }

  let gen = 0, audio = 0;
  const pattern = cfg.audioPattern ?? "auto";
  for (const { scene, text, index, plan } of plans) {
    const key = String(scene.key).padStart(3);
    if (plan.action === "skip") { console.log(`${key}  hoppet over  ${plan.reason}`); continue; }
    const r = await synth(model, text, s);
    await save(model, r, path.join(audioDir, plan.file));
    gen += r.genSeconds; audio += r.audioSeconds;
    console.log(`${key}  skrevet      ${plan.file}  ${r.audioSeconds.toFixed(2)} s lyd på ${r.genSeconds.toFixed(2)} s (${r.sentences} setninger)`);
    if (pattern !== "auto") {
      const name = pattern.replaceAll("{nn}", scene.key).replaceAll("{n}", String(scene.id)).replaceAll("{slug}", scene.slug)
        .replaceAll("{ii}", String(index).padStart(2, "0")).replaceAll("{i}", String(index));
      if (name !== plan.file) console.warn(`     Advarsel: audioPattern "${pattern}" peker på ${name}, ikke ${plan.file} – bruk "auto" eller "{nn}-{slug}.wav"`);
    }
  }
  const skipped = plans.length - writes.length;
  console.log(`\n${writes.length} skrevet, ${skipped} hoppet over` +
    (writes.length ? ` – generering ${gen.toFixed(2)} s for ${audio.toFixed(2)} s lyd (RTF ${(gen / audio).toFixed(3)})` : ""));
  if (writes.length) console.log("Neste: pnpm voice-meta");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.listVoices) return listVoices();
  if (opts.text) return freeStanding(opts);
  if (opts.out) throw new Error("--out krever --text <fil>");
  return scenes(opts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // exitCode, not process.exit(): exiting while onnxruntime's threads are alive aborts with "mutex lock failed".
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
