// Tests for tools/captions.mjs: grouping, timing, video offsets, SRT text and the CLI against the example project.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupCaptions, toSrt, videoCaptions } from "./captions.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "captions.mjs");
const exampleConfig = path.resolve(here, "..", "examples", "video.config.json");

let tmp;
before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "captions-")); });
after(() => { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

/** Words "w@start-end" → [{ word, start, end }]. */
const W = (...specs) => specs.map((s) => { const [word, t] = s.split("@"); const [start, end] = t.split("-").map(Number); return { word, start, end }; });
const texts = (caps) => caps.map((c) => c.text);

test("splits at sentence ends and keeps the original words", () => {
  const caps = groupCaptions(W("Hello@1-1.3", "there.@1.3-1.6", "Next»@2-2.2", "one!»@2.2-2.5", "Last@3-3.2", "bit@3.2-3.4"));
  assert.deepEqual(texts(caps), ["Hello there.", "Next» one!»", "Last bit"]);
  assert.equal(caps[0].timestampMs, null);
  assert.equal(caps[0].confidence, null);
});

test("a long sentence splits at the last clause punctuation before maxChars, else at a word boundary", () => {
  const clause = groupCaptions(W("One@0-1", "two,@1-2", "three@2-3", "four@3-4", "five.@4-5"), { maxChars: 16 });
  assert.deepEqual(texts(clause), ["One two,", "three four five."]);
  const words = groupCaptions(W("aaaa@0-1", "bbbb@1-2", "cccc@2-3", "dddd.@3-4"), { maxChars: 10 });
  assert.deepEqual(texts(words), ["aaaa bbbb", "cccc dddd."]);
  const repeat = groupCaptions(W("aa@0-1", "bb@1-2", "cc@2-3", "dd@3-4", "ee.@4-5"), { maxChars: 5 });
  assert.deepEqual(texts(repeat), ["aa bb", "cc dd", "ee."]);
});

test("timing: −100 ms, at least 1 s, capped at the next start and at audioEnd, never before lead", () => {
  const [a] = groupCaptions(W("Hi.@1-1.2"));
  assert.deepEqual([a.startMs, a.endMs], [900, 1900]);   // start − 100 ms; max(end + 250 ms, start + 1 s)
  const [b] = groupCaptions(W("Long@1-2", "word.@2-3"));
  assert.deepEqual([b.startMs, b.endMs], [900, 3250]);   // last word end + 250 ms
  const [c, d] = groupCaptions(W("Hi.@1-1.2", "Go.@1.5-1.8"));
  assert.deepEqual([c.startMs, c.endMs, d.startMs], [900, 1400, 1400]);   // capped at the next caption's start
  const [e] = groupCaptions(W("End.@2-3"), { audioEnd: 3.1 });
  assert.equal(e.endMs, 3100);
  const [f] = groupCaptions(W("Early.@0.55-0.9"), { lead: 0.5 });
  assert.equal(f.startMs, 500);
});

const meta = {
  VIDEO: { lead: 0.5, tail: 0.8 },
  VOICE: { 1: { slug: "a", silent: true, duration: 2.01 }, 2: { slug: "b", duration: 2, text: "Hello there." } },
};
const cfg = { fps: 30, captions: { maxChars: 84 }, sceneList: [{ id: 1 }, { id: 2 }] };

test("videoCaptions offsets by the clip start: computed, measured, and skipped clips", () => {
  // Scene 2 (dummy voice, words spread evenly): "Hello" 0.5–1.5, "there." 1.5–2.5 → caption 0.5–2.5 (audioEnd).
  const span = (caps) => caps.map((c) => [c.text, c.startMs, c.endMs]);
  assert.deepEqual(span(videoCaptions(cfg, meta)), [["Hello there.", 2500, 4500]]);   // silent scene: round(2.01 × 30) = 60 frames
  assert.deepEqual(span(videoCaptions(cfg, meta, { frameCounts: [66, 90] })), [["Hello there.", 2700, 4700]]);
  assert.deepEqual(span(videoCaptions(cfg, meta, { frameCounts: [null, 90] })), [["Hello there.", 500, 2500]]);
});

test("toSrt writes standard SRT", () => {
  const srt = toSrt([
    { text: "First line.", startMs: 900, endMs: 2400, timestampMs: null, confidence: null },
    { text: "Second, later.", startMs: 3723004, endMs: 3725000, timestampMs: null, confidence: null },
  ]);
  assert.equal(srt, "1\n00:00:00,900 --> 00:00:02,400\nFirst line.\n\n2\n01:02:03,004 --> 01:02:05,000\nSecond, later.\n");
  assert.equal(toSrt([]), "");
});

test("CLI writes the SRT of the example project", () => {
  const out = path.join(tmp, "example.srt");
  const r = spawnSync(process.execPath, [cli, "--config", exampleConfig, "--out", out], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Skrev .*example\.srt \(4 tekster\)/);
  const srt = fs.readFileSync(out, "utf8");
  assert.match(srt, /^1\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}\nThis is the voiced example\.\n\n2\n/);
});

test("CLI without shared/voice.json fails with a hint", () => {
  const dir = path.join(tmp, "novoice");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "video.config.json"), JSON.stringify({ scenes: [{ id: 1, slug: "a" }] }));
  const r = spawnSync(process.execPath, [cli, "--config", path.join(dir, "video.config.json")], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Fant ikke .*voice\.json – kjør pnpm voice-meta først/);
});
