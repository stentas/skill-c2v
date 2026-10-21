// End-to-end example run (pnpm example): synthetic voice → voice metadata → clips → final video → probe.
//
//   node examples/run.mjs
//
// 1. examples/make-audio.mjs writes audio/02-voiced.mp3 when it is missing (delete it to regenerate).
// 2. tools/voice-meta.mjs measures it and writes examples/shared/voice.js + voice.json.
// 3. render.mjs --all renders every scene of examples/video.config.json to examples/clips/NN.mp4.
// 4. assemble.mjs joins them into examples/example.mp4.
// 5. The result is probed: duration, frames, streams.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probe, videoFrames } from "../tools/ffbin.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const config = path.join(here, "video.config.json");
const output = path.join(here, "example.mp4");
const rel = (p) => path.relative(process.cwd(), p) || ".";

const step = (title, script, ...args) => {
  console.log(`\n== ${title}`);
  execFileSync(process.execPath, [path.join(root, script), ...args], { stdio: "inherit", cwd: root });
};

try {
  if (existsSync(path.join(here, "audio", "02-voiced.mp3"))) console.log("== Audio: audio/02-voiced.mp3 exists, kept");
  else step("Audio: generating audio/02-voiced.mp3", "examples/make-audio.mjs");
  step("Voice metadata", "tools/voice-meta.mjs", "--config", config);
  step("Render all scenes", "render.mjs", "--all", "--config", config, "--jobs", "2");
  step("Assemble", "assemble.mjs", "--config", config, "--out", output);

  const p = probe(output);
  console.log(`\n== Result: ${rel(output)}`);
  console.log(`duration ${p.duration.toFixed(2)} s · video frames ${videoFrames(output)} · video ${p.hasVideo} · audio ${p.hasAudio}`);
} catch (err) {
  // execFileSync already showed the child's output; its status is the exit code.
  console.error(`\nExample run failed: ${err.status != null ? `step exited with code ${err.status}` : err.message}`);
  process.exit(typeof err.status === "number" && err.status > 0 ? err.status : 1);
}
