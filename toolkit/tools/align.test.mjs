// Checks alignWords() in tools/align.mjs (no model needed) and voicedAudio() in tools/voice-meta.mjs.
//
//   node --test "tools/*.test.mjs"      (pnpm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { alignWords, scriptWords } from "./align.mjs";
import { loadConfig } from "./config.mjs";
import { voicedAudio } from "./voice-meta.mjs";

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} ≠ ${b}`);
const text = "We ship twelve features. Finally, the deterministic renderer!";
const words = scriptWords(text);   // We ship twelve features Finally the deterministic renderer
// Recognised words at 0.5 s each from 1.0 s.
const rec = (list) => list.map((t, i) => ({ text: ` ${t}`, start: 1 + i * 0.5, end: 1.5 + i * 0.5 }));
const base = { scriptWords: words, speechStart: 0.9, speechEnd: 6 };

test("scriptWords matches makeCue's split", () => {
  assert.deepEqual(words, ["We", "ship", "twelve", "features.", "Finally,", "the", "deterministic", "renderer!"]);
});

test("(a) perfect match takes the recognised times", () => {
  const r = alignWords({ ...base, recognized: rec(["We", "ship", "twelve", "features.", "Finally,", "the", "deterministic", "renderer!"]) });
  assert.equal(r.matched, 8);
  assert.equal(r.total, 8);
  assert.deepEqual(r.words[0], [1, 1.5]);
  assert.deepEqual(r.words[7], [4.5, 5]);
});

test("(b) a substituted word is spread between its neighbours", () => {
  const r = alignWords({ ...base, recognized: rec(["We", "ship", "12", "features.", "Finally,", "the", "deterministic", "renderer!"]) });
  assert.equal(r.matched, 7);
  // "twelve" sits in the gap [end of "ship", start of "features"] = [2.0, 2.5].
  assert.deepEqual(r.words[2], [2, 2.5]);
});

test("(c) an extra recognised word is ignored", () => {
  const r = alignWords({ ...base, recognized: rec(["We", "ship", "um", "twelve", "features.", "Finally,", "the", "deterministic", "renderer!"]) });
  assert.equal(r.matched, 8);
  assert.deepEqual(r.words[1], [1.5, 2]);
  assert.deepEqual(r.words[2], [2.5, 3]);
});

test("(d) a word missing at the start is spread from speechStart", () => {
  const r = alignWords({ ...base, recognized: rec(["ship", "twelve", "features.", "Finally,", "the", "deterministic", "renderer!"]) });
  assert.equal(r.matched, 7);
  assert.deepEqual(r.words[0], [0.9, 1]);
  assert.deepEqual(r.words[1], [1, 1.5]);
});

test("(e) Levenshtein 1 matches a long word, not a short one", () => {
  const r = alignWords({ ...base, recognized: rec(["Wi", "ship", "twelve", "features.", "Finally,", "the", "determinstic", "renderer!"]) });
  assert.equal(r.matched, 7);   // "determinstic" ≈ "deterministic"; "Wi" ≠ "We"
  assert.deepEqual(r.words[6], [4, 4.5]);
});

test("(f) clamped to speech start/end and monotonic", () => {
  const recognized = rec(["We", "ship", "twelve", "features.", "Finally,", "the", "deterministic", "renderer!"]);
  recognized[0] = { text: "We", start: 0, end: 0.2 };
  recognized[3] = { text: "features.", start: 2.3, end: 2.4 };   // starts before "twelve" ends
  recognized[7] = { text: "renderer!", start: 4.5, end: 6.4 };
  const r = alignWords({ ...base, recognized });
  near(r.words[0][0], 0.9, "start ≥ speechStart");
  near(r.words[0][1], 0.94, "end ≥ start + 0.04");
  near(r.words[3][0], 2.5, "start ≥ previous end");
  near(r.words[3][1], 2.54, "end ≥ start + 0.04");
  near(r.words[7][1], 6, "end ≤ speechEnd");
  for (let i = 1; i < r.words.length; i++) assert.ok(r.words[i][0] >= r.words[i - 1][1], `word ${i} overlaps`);
});

test("(g) a null end on the last chunk becomes start + 0.3, capped at speechEnd", () => {
  const recognized = rec(["We", "ship", "twelve", "features.", "Finally,", "the", "deterministic", "renderer!"]);
  recognized[7] = { text: " renderer!", start: 4.5, end: null };
  assert.deepEqual(alignWords({ ...base, recognized }).words[7], [4.5, 4.8]);
  assert.deepEqual(alignWords({ ...base, speechEnd: 4.6, recognized }).words[7], [4.5, 4.6]);
});

const all = ["We", "ship", "twelve", "features.", "Finally,", "the", "deterministic", "renderer!"];

test("(h) pause snapping: an end inside a pause moves to its start, a start to its end", () => {
  const r = alignWords({ ...base, recognized: rec(all), pauses: [[1.9, 2.1]] });
  assert.deepEqual(r.words[1], [1.5, 1.9]);   // "ship" [1.5, 2.0] ended inside the pause
  assert.deepEqual(r.words[2], [2.1, 2.5]);   // "twelve" [2.0, 2.5] started inside it
  assert.deepEqual(r.words[0], [1, 1.5]);
});

test("(i) a word entirely inside a pause is left alone (monotonic pass only)", () => {
  const r = alignWords({ ...base, recognized: rec(all), pauses: [[3.4, 4.1]] });
  assert.deepEqual(r.words[4], [3, 3.4]);     // "Finally," end snapped
  assert.deepEqual(r.words[5], [3.5, 4]);     // "the" [3.5, 4.0] inside [3.4, 4.1]: unchanged
  assert.deepEqual(r.words[6], [4.1, 4.5]);   // "deterministic" start snapped
});

test("voicedAudio resolves the example config like voice-meta", () => {
  const config = fileURLToPath(new URL("../examples/video.config.json", import.meta.url));
  const cfg = loadConfig({ explicit: config });
  const list = voicedAudio(cfg);
  assert.equal(list.length, 1);
  assert.equal(list[0].scene.id, 2);
  assert.equal(list[0].file, "02-voiced.mp3");
  assert.equal(list[0].full, fileURLToPath(new URL("../examples/audio/02-voiced.mp3", import.meta.url)));
  const paragraph = readFileSync(new URL("../examples/audio/voice-script.txt", import.meta.url), "utf8").replace(/\s+/g, " ").trim();
  assert.equal(list[0].text, paragraph);
});
