// Checks that tools/cue.mjs stays identical to makeCue() in engine.js, and covers sceneInfo()/toFrame().
//
//   node --test "tools/*.test.mjs"      (pnpm test)
//
// engine.js touches the DOM, so only the makeCue function is cut out of its source and evaluated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeCue, sceneInfo, toFrame } from "./cue.mjs";

const sliceFn = (text, marker) => {
  const i = text.indexOf(marker);
  assert.ok(i >= 0, `fant ikke ${marker}`);
  return text.slice(i, text.indexOf("\n}\n", i) + 2);
};
const engineSrc = sliceFn(readFileSync(new URL("../engine.js", import.meta.url), "utf8"), "function makeCue(");
const engineMakeCue = new Function("LEAD", engineSrc + "\nreturn makeCue;")(0.5);
const mirrorSrc = sliceFn(readFileSync(new URL("./cue.mjs", import.meta.url), "utf8"), "function makeCue(");

const textA = "Hello world. This is a test, with a pause; and the end!";
const voiceA = { file: "01.mp3", duration: 6.0, speechStart: 0.2, speechEnd: 5.6, pauses: [[1.0, 1.4], [3.0, 3.2]], text: textA };
const textB = "one two three two one";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test("cue.mjs makeCue is a verbatim copy of the engine's (default lead aside)", () => {
  assert.equal(mirrorSrc, engineSrc.replace("lead = LEAD", "lead = 0.5"));
});

test("fixture A (measured voice): engine and cue.mjs agree", () => {
  const e = engineMakeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceA });
  const m = makeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceA });
  assert.deepEqual(m.words, e.words);
  assert.equal(m.cue("This is"), e.cue("This is"));
  assert.equal(m.cueEnd("pause"), e.cueEnd("pause"));
  assert.equal(m.cue("the end"), e.cue("the end"));
});

test("fixture B (dummy voice): engine and cue.mjs agree, even spread", () => {
  const e = engineMakeCue({ voiceText: textB, audioDuration: 5, lead: 0, voice: null });
  const m = makeCue({ voiceText: textB, audioDuration: 5, lead: 0, voice: null });
  assert.deepEqual(m.words, e.words);
  for (const c of [e, m]) {
    assert.equal(c.cue("two"), c.cue("two", 1));
    assert.ok(c.cue("two", 2) > c.cue("two", 1));
    assert.equal(c.cue("three"), 2);
    assert.equal(c.cueEnd("three"), 3);
  }
});

test("fixture A: speech start/end and pause anchors", () => {
  const m = makeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceA });
  near(m.cue("Hello"), 0.5 + 0.2);
  near(m.cueEnd("end"), 0.5 + 5.6);
  // The sentence boundary snaps to the measured pause [1.0, 1.4] (1e-9 = float rounding).
  assert.ok(m.cueEnd("world") <= 0.5 + 1.0 + 1e-9, `cueEnd("world") = ${m.cueEnd("world")}`);
  assert.ok(m.cue("This") >= 0.5 + 1.4 - 1e-9, `cue("This") = ${m.cue("This")}`);
});

// Fixture C: measured word times (voice.words from pnpm align), one [start, end] per word of textA (12 words).
const wordsC = [[0.21, 0.5], [0.52, 0.95], [1.42, 1.6], [1.6, 1.72], [1.72, 1.8], [1.8, 2.3], [2.4, 2.6], [2.6, 2.66],
  [2.66, 2.98], [3.21, 3.4], [3.4, 3.52], [3.52, 5.55]];
const voiceC = { ...voiceA, words: wordsC };

test("fixture C (measured words): used as they are, engine and cue.mjs agree", () => {
  const e = engineMakeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceC });
  const m = makeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceC });
  assert.deepEqual(m.words, e.words);
  for (const c of [e, m]) {
    assert.equal(c.cue("This is"), 0.5 + wordsC[2][0]);
    assert.equal(c.cueEnd("end"), 0.5 + wordsC[11][1]);
    assert.equal(c.words.length, 12);
  }
});

test("fixture C: wrong-length words fall back to the estimate with one warning", () => {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  let e, m;
  try {
    e = engineMakeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: { ...voiceA, words: wordsC.slice(0, 11) } });
    m = makeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: { ...voiceA, words: wordsC.slice(0, 11) } });
  } finally { console.warn = orig; }
  assert.equal(warns.length, 2, warns.join("\n"));   // once per call: one engine call, one mirror call
  assert.match(warns[0], /voice\.words har 11 ord, teksten 12/);
  const a = makeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceA });
  assert.deepEqual(m.words, a.words);
  assert.deepEqual(e.words, a.words);
});

test("unknown phrase throws in both", () => {
  const e = engineMakeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceA });
  const m = makeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceA });
  assert.throws(() => e.cue("nope"), (err) => err instanceof Error && err.message.includes("fant ikke «nope»"));
  assert.throws(() => m.cue("nope"), (err) => err instanceof Error && err.message.includes("fant ikke «nope»"));
});

test("sceneInfo and toFrame", () => {
  const meta = { VIDEO: { fps: 30, lead: 0.5, tail: 0.8 }, VOICE: { 1: { slug: "intro", ...voiceA, src: "../audio/01.mp3" } } };
  const S = sceneInfo(meta, 1);
  assert.equal(S.duration, 0.5 + 6.0 + 0.8);
  assert.equal(S.audioFile, "01.mp3");
  assert.equal(S.audioSrc, "../audio/01.mp3");
  assert.equal(S.cue("Hello"), makeCue({ voiceText: textA, audioDuration: 6, lead: 0.5, voice: voiceA }).cue("Hello"));

  const silent = { VIDEO: { fps: 30, lead: 0.5, tail: 0.8 }, VOICE: { "02": { slug: "end", silent: true, duration: 3 } } };
  const T = sceneInfo(silent, 2);
  assert.equal(T.duration, 3);
  assert.equal(T.lead, 0);
  assert.equal(T.tail, 0);
  assert.deepEqual(T.words, []);
  assert.throws(() => T.cue("x"));

  assert.equal(toFrame(1.26, 30), 38);
});
