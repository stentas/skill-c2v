// Integration tests for assemble.mjs: builds tiny clips with the bundled ffmpeg and runs assemble as a child process.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ffmpeg, probe, videoFrames } from "./ffbin.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const assemblePath = path.resolve(here, "..", "assemble.mjs");
const SKIP_MSG = /normalisering hoppet over/i;

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "assemble-")); });
after(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

/** A fresh project folder with video.config.json and an empty clips/ dir. */
function makeProject(name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, "clips"), { recursive: true });
  const cfgPath = path.join(dir, "video.config.json");
  fs.writeFileSync(cfgPath, JSON.stringify({
    scenes: [{ id: 1, slug: "a" }, { id: 2, slug: "b" }],
    fps: 30, width: 64, height: 64,
    assemble: { preset: "ultrafast" },
  }));
  return { dir, cfgPath, outPath: path.join(dir, "out.mp4") };
}

const video = ["-f", "lavfi", "-i", "testsrc=size=64x64:rate=30:duration=1"];
const enc = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"];

function silentClip(file) {
  execFileSync(ffmpeg, ["-hide_banner", "-y", ...video, "-an", ...enc, file], { stdio: "pipe" });
}

function voicedClip(file) {
  execFileSync(ffmpeg, ["-hide_banner", "-y", ...video,
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
    ...enc, "-c:a", "aac", "-shortest", file], { stdio: "pipe" });
}

/** Runs assemble; returns combined stdout+stderr, or fails the test with that output on a non-zero exit. */
function assemble({ cfgPath, outPath }) {
  // spawnSync rather than execFileSync: on success execFileSync hands back stdout only, and the
  // skip message check needs stderr (console.warn) as well.
  const r = spawnSync(process.execPath, [assemblePath, "--config", cfgPath, "--out", outPath],
    { stdio: "pipe", encoding: "utf8" });
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  assert.equal(r.status, 0, `assemble feilet (status ${r.status}):\n${output}`);
  return output;
}

test("S1: silent clips assemble to a file with video and a silent audio track", () => {
  const p = makeProject("s1");
  silentClip(path.join(p.dir, "clips", "01.mp4"));
  silentClip(path.join(p.dir, "clips", "02.mp4"));
  assemble(p);
  assert.ok(fs.existsSync(p.outPath), "output file missing");
  const info = probe(p.outPath);
  assert.equal(info.hasVideo, true);
  assert.equal(info.hasAudio, true);
  assert.equal(videoFrames(p.outPath), 60);
  assert.ok(Math.abs(info.duration - 2.0) <= 0.05, `duration ${info.duration} not within 2.0 ± 0.05`);
});

test("S2: voiced clips are normalised and keep the exact frame-based length", (t) => {
  const p = makeProject("s2");
  voicedClip(path.join(p.dir, "clips", "01.mp4"));
  voicedClip(path.join(p.dir, "clips", "02.mp4"));
  const output = assemble(p);
  assert.doesNotMatch(output, SKIP_MSG, `normalisation was skipped:\n${output}`);
  const info = probe(p.outPath);
  t.diagnostic(`S2 output duration: ${info.duration} s`);
  assert.equal(info.hasAudio, true);
  assert.equal(videoFrames(p.outPath), 60);
  assert.ok(Math.abs(info.duration - 2.0) <= 0.05, `duration ${info.duration} not within 2.0 ± 0.05`);
});

test("S3: no clip files → assemble exits non-zero", () => {
  const p = makeProject("s3");
  assert.throws(() => execFileSync(process.execPath, [assemblePath, "--config", p.cfgPath, "--out", p.outPath],
    { stdio: "pipe" }), (e) => typeof e.status === "number" && e.status !== 0);
  assert.equal(fs.existsSync(p.outPath), false);
});
