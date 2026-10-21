// Checks tools/ffbin.mjs against small clips generated with the bundled ffmpeg.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ffmpeg, parseDuration, probe, videoFrames } from "./ffbin.mjs";

let dir, withAudio, videoOnly;

const make = (out, audio) => {
  const argv = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=30:duration=1"];
  if (audio) argv.push("-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1");
  argv.push("-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p");
  argv.push(...(audio ? ["-c:a", "aac", "-shortest"] : ["-an"]), out);
  const r = spawnSync(ffmpeg, argv, { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
};

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffbin-test-"));
  withAudio = path.join(dir, "a.mp4");
  videoOnly = path.join(dir, "v.mp4");
  make(withAudio, true);
  make(videoOnly, false);
});

after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test("probe reads duration and streams of a clip with audio", () => {
  const p = probe(withAudio);
  assert.equal(p.hasVideo, true);
  assert.equal(p.hasAudio, true);
  assert.ok(Math.abs(p.duration - 1.0) <= 0.05, `duration ${p.duration}`);
});

test("videoFrames counts the video packets", () => {
  assert.equal(videoFrames(withAudio), 30);
});

test("probe reports no audio for a video-only clip", () => {
  const p = probe(videoOnly);
  assert.equal(p.hasVideo, true);
  assert.equal(p.hasAudio, false);
});

test("probe throws for a missing file", () => {
  assert.throws(() => probe("/nonexistent.mp4"));
});

test("parseDuration reads the banner line or returns null", () => {
  assert.equal(parseDuration("  Duration: 00:01:02.50, start: 0"), 62.5);
  assert.equal(parseDuration("no duration here"), null);
});
