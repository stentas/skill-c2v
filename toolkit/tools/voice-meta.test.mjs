// Checks measure() in tools/voice-meta.mjs on a generated voice stand-in with known speech and pauses.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg } from "./ffbin.mjs";
import { measure } from "./voice-meta.mjs";

let dir, file;
const near = (actual, expected, tol, what) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual}, expected ${expected} ± ${tol}`);

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "voice-meta-test-"));
  file = path.join(dir, "02.wav");
  // 0.3 s silence · 1.0 s tone · 0.5 s silence · 1.0 s tone · 0.2 s silence = 3.0 s, 48 kHz mono.
  const graph = [
    "anullsrc=r=48000:cl=mono:d=0.3[s0]",
    "sine=frequency=440:sample_rate=48000:duration=1.0[t0]",
    "anullsrc=r=48000:cl=mono:d=0.5[s1]",
    "sine=frequency=440:sample_rate=48000:duration=1.0[t1]",
    "anullsrc=r=48000:cl=mono:d=0.2[s2]",
    "[s0][t0][s1][t1][s2]concat=n=5:v=0:a=1[out]",
  ].join(";");
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-filter_complex", graph, "-map", "[out]",
    "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", file], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test("measure finds duration, speech start/end and the one internal pause", () => {
  const m = measure(file);
  near(m.duration, 3.0, 0.03, "duration");
  near(m.speechStart, 0.3, 0.06, "speechStart");
  near(m.speechEnd, 2.8, 0.06, "speechEnd");
  // Leading and trailing silence become speechStart/speechEnd, not pauses.
  assert.equal(m.pauses.length, 1, JSON.stringify(m.pauses));
  near(m.pauses[0][0], 1.3, 0.06, "pause start");
  near(m.pauses[0][1], 1.8, 0.06, "pause end");
});
