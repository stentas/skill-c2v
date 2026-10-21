// Joins the scene clips (hard cuts, in config order) into the final video.
//
//   node assemble.mjs [--config video.config.json] [--out file.mp4]        (pnpm assemble)
//
// Clips: the "scenes" list of video.config.json → clips/<id>.mp4 (missing ones are skipped with a warning).
// Re-encodes once: H.264 CRF 16 (config "assemble.crf"), config fps, yuv420p BT.709, AAC 192k 48 kHz stereo,
// audio loudness-normalised to -16 LUFS (EBU R128, two-pass loudnorm, linear; skipped when the audio is silent).
// Length is capped at the summed clip frame counts / fps. Prints the duration.
// Captions: when shared/voice.json exists and a scene has voice text, also writes <out>.srt (tools/captions.mjs).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { readVoiceMeta, writeCaptions } from "./tools/captions.mjs";
import { loadConfig } from "./tools/config.mjs";
import { sceneInfo } from "./tools/cue.mjs";
import { assertFfmpeg, ffmpeg, probe, videoFrames } from "./tools/ffbin.mjs";

assertFfmpeg();
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const cfg = loadConfig({ explicit: opt("--config") });
if (!cfg.file) console.warn("Advarsel: fant ingen video.config.json – bruker standardverdier");
const out = opt("--out") ? path.resolve(opt("--out")) : cfg.abs(cfg.output);
const A = cfg.assemble, fps = cfg.fps, W = cfg.width, H = cfg.height;
const TARGET = { I: A.lufs, TP: A.truePeak, LRA: A.lra };

// clipScene[i] = index in cfg.sceneList of clip i; frameCounts per scene (null = clip skipped) for the captions.
const clips = [], clipScene = [], frameCounts = cfg.sceneList.map(() => null);
for (const [i, s] of cfg.sceneList.entries()) {
  if (existsSync(s.clip)) { clips.push(s.clip); clipScene.push(i); }
  else console.warn(`Advarsel: mangler ${path.relative(process.cwd(), s.clip)} – hoppes over`);
}
if (!clips.length) {
  console.error("Ingen klipp å sette sammen.");
  process.exit(1);
}

// Inputs + concat graph. Clips without an audio stream get generated silence of the same length.
// Clip i is input i; the silence inputs come after all clips (input clips.length, clips.length + 1, …).
// Exact output length = sum of clip frame counts / fps (null if any count is unknown).
const inputs = [], silence = [], parts = [];
let extra = clips.length, totalFrames = 0;
clips.forEach((file, i) => {
  inputs.push("-i", file);
  const { duration, hasAudio } = probe(file);
  const n = videoFrames(file);
  totalFrames = n === null || totalFrames === null ? null : totalFrames + n;
  frameCounts[clipScene[i]] = n ?? Math.round(duration * fps);
  let a = `${i}:a`;
  if (!hasAudio) {
    silence.push("-f", "lavfi", "-t", duration.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
    a = `${extra++}:a`;
  }
  parts.push(`[${i}:v]fps=${fps},scale=${W}:${H},setsar=1,format=yuv420p[v${i}];[${a}]aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
});
inputs.push(...silence);
const concat = `${parts.join(";")};${clips.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${clips.length}:v=1:a=1[v][acat]`;

const run = (argv) => {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-y", ...argv], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) { console.error(r.stderr); process.exit(r.status ?? 1); }
  return r.stderr;
};

// Pass 1: measure loudness of the joined audio.
console.log(`Måler lydnivå for ${clips.length} klipp …`);
const log = run([...inputs, "-filter_complex", `${concat};[v]nullsink;[acat]loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json[aout]`,
  "-map", "[aout]", "-f", "null", "-"]);
// Silent audio measures as "-inf", which pass 2 rejects – then normalisation is skipped.
let m = null;
try {
  const j = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
  m = Object.fromEntries(["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"].map((k) => [k, Number(j[k])]));
  if (!Object.values(m).every(Number.isFinite)) m = null;
} catch { m = null; }

// Pass 2: encode with linear normalisation from the measured values.
let afilter = "aresample=48000";
if (m) {
  console.log(`Koder ${path.basename(out)} (målt ${m.input_i} LUFS → ${TARGET.I} LUFS) …`);
  afilter = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}` +
    `:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,${afilter}`;
} else {
  console.log(`Koder ${path.basename(out)} – lydnormalisering hoppet over: lyden er stille eller kunne ikke måles …`);
}
// Cap at the exact video length so AAC padding does not make the file longer than the clips.
const limit = totalFrames === null ? [] : ["-t", (totalFrames / fps).toFixed(3)];
if (totalFrames === null) console.warn("Advarsel: fant ikke antall bilder i alle klipp – lengden kappes ikke eksakt");
run([...inputs, "-filter_complex", `${concat};[acat]${afilter}[aout]`,
  "-map", "[v]", "-map", "[aout]",
  "-c:v", "libx264", "-preset", A.preset, "-crf", String(A.crf), "-pix_fmt", "yuv420p", "-r", String(fps),
  "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
  "-c:a", "aac", "-b:a", A.audioBitrate, "-ar", "48000", "-ac", "2",
  ...limit, "-shortest", "-movflags", "+faststart", out]);

const total = probe(out).duration;
const secs = Math.round(total);
console.log(`Ferdig: ${path.relative(process.cwd(), out)} – ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")} (${total.toFixed(2)} s, ${clips.length} klipp)`);

const meta = readVoiceMeta(cfg);
if (meta && cfg.sceneList.some((s) => sceneInfo(meta, s.id).words.length)) {
  const r = writeCaptions(cfg, { out: out.replace(/\.[^./\\]+$/, "") + ".srt", frameCounts, meta });
  console.log(`Undertekster: ${path.relative(process.cwd(), r.out)} (${r.count} tekster)`);
}
