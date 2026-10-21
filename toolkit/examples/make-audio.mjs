// Writes examples/audio/02-voiced.mp3: a synthetic stand-in for a recorded voice, deterministic and offline.
// One soft tone burst per sentence of audio/voice-script.txt, separated by silences that voice-meta's
// silencedetect (-35 dB, 0.1 s) measures as pauses, so cue() anchors work as with a real recording.
//
//   node examples/make-audio.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertFfmpeg, ffmpeg } from "../tools/ffbin.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "audio", "02-voiced.mp3");

// [seconds, tone?] – silence, then one burst per sentence (4 sentences in voice-script.txt).
const segments = [[0.3, false], [1.2, true], [0.45, false], [1.4, true], [0.45, false], [1.3, true], [0.45, false], [1.5, true], [0.4, false]];

// aevalsrc with a conditional on t: a 220 Hz sine (plus a soft octave) inside each burst, with 40 ms fades.
let t = 0;
const bursts = [];
for (const [len, tone] of segments) {
  if (tone) bursts.push(`between(t,${t.toFixed(2)},${(t + len).toFixed(2)})*min(1,min(t-${t.toFixed(2)},${(t + len).toFixed(2)}-t)/0.04)`);
  t += len;
}
const env = bursts.join("+");
const expr = `0.3*(${env})*(0.8*sin(2*PI*220*t)+0.2*sin(2*PI*440*t))`;

assertFfmpeg();
mkdirSync(path.dirname(out), { recursive: true });
const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", `aevalsrc=exprs='${expr}':s=48000:c=mono:d=${t.toFixed(2)}`,
  "-c:a", "libmp3lame", "-b:a", "128k", "-map_metadata", "-1", "-fflags", "+bitexact", out], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${t.toFixed(2)} s, ${segments.filter((s) => s[1]).length} tone bursts)`);
