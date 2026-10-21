// Checks voicedTexts() in tools/config.mjs and the pure helpers (planScene, cacheDir, constants) in tools/tts.mjs.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, voicedTexts } from "./config.mjs";
import { DTYPES, MODEL_ID, cacheDir, planScene } from "./tts.mjs";

let dir, cfgFile, cfgNoText;

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-test-"));
  fs.writeFileSync(path.join(dir, "voice-script.txt"), "P one\n\nP two\ncontinued\n\nP three\n");
  cfgFile = path.join(dir, "video.config.json");
  fs.writeFileSync(cfgFile, JSON.stringify({
    dirs: { scenes: ".", audio: "audio" },
    voiceText: "voice-script.txt",
    scenes: [
      { id: 1, slug: "intro", silent: true, duration: 3 },
      { id: 2, slug: "a" },
      { id: 3, slug: "b", text: "literal text" },
      { id: 4, slug: "c", paragraph: 1 },
      { id: 5, slug: "d", audio: "none" },
      { id: 6, slug: "e" },
    ],
  }));
  cfgNoText = path.join(dir, "no-text.config.json");
  fs.writeFileSync(cfgNoText, JSON.stringify({
    dirs: { scenes: ".", audio: "audio" },
    scenes: [{ id: 7, slug: "f" }],
  }));
});

after(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });

test("voicedTexts resolves literal text, explicit paragraphs and the running paragraph counter", () => {
  const cfg = loadConfig({ explicit: cfgFile });
  const out = voicedTexts(cfg);
  assert.deepEqual(out.map((v) => [v.scene.id, v.text]), [
    [2, "P one"], [3, "literal text"], [4, "P one"], [5, "P two continued"], [6, "P three"],
  ]);
});

test("voicedTexts skips silent scenes", () => {
  const cfg = loadConfig({ explicit: cfgFile });
  assert.ok(!voicedTexts(cfg).some((v) => v.scene.id === 1));
});

test("voicedTexts gives text undefined when there is no voiceText file", () => {
  const cfg = loadConfig({ explicit: cfgNoText });
  const out = voicedTexts(cfg);
  assert.equal(out.length, 1);
  assert.equal(out[0].scene.id, 7);
  assert.equal(out[0].text, undefined);
});

const scene = (over = {}) => ({ id: 2, key: "02", slug: "voiced", raw: {}, ...over });
const assertSkip = (r, file = "02-voiced.wav") => {
  assert.equal(r.action, "skip");
  assert.equal(r.file, file);
  assert.equal(typeof r.reason, "string");
  assert.ok(r.reason.length > 0);
};

test("planScene writes when nothing exists for the scene", () => {
  const r = planScene({ scene: scene(), text: "Hello", audioFiles: [] });
  assert.equal(r.action, "write");
  assert.equal(r.file, "02-voiced.wav");
});

test("planScene skips when audio already exists", () => {
  assertSkip(planScene({ scene: scene(), text: "Hello", audioFiles: ["02-voiced.mp3"] }));
});

test("planScene matches an unpadded leading number", () => {
  assertSkip(planScene({ scene: scene(), text: "Hello", audioFiles: ["2_Chapter_1.mp3"] }));
});

test("planScene with force overwrites its own wav", () => {
  const r = planScene({ scene: scene(), text: "Hello", audioFiles: ["02-voiced.wav"], force: true });
  assert.equal(r.action, "write");
  assert.equal(r.file, "02-voiced.wav");
});

test("planScene with force never replaces another file", () => {
  assertSkip(planScene({ scene: scene(), text: "Hello", audioFiles: ["02-other.mp3"], force: true }));
});

test("planScene ignores audio that belongs to other scenes", () => {
  const r = planScene({ scene: scene(), text: "Hello", audioFiles: ["03-next.mp3", "01-intro.wav"] });
  assert.equal(r.action, "write");
  assert.equal(r.file, "02-voiced.wav");
});

test("planScene skips scenes with audio none or null", () => {
  assertSkip(planScene({ scene: scene({ raw: { audio: "none" } }), text: "Hello", audioFiles: [] }));
  assertSkip(planScene({ scene: scene({ raw: { audio: null } }), text: "Hello", audioFiles: [] }));
});

test("planScene skips empty, blank and missing text", () => {
  for (const text of ["", "   ", undefined]) {
    assertSkip(planScene({ scene: scene(), text, audioFiles: [] }));
  }
});

test("planScene handles a string scene id", () => {
  const r = planScene({
    scene: { id: "outro", key: "outro", slug: "end", raw: {} },
    text: "Hello",
    audioFiles: ["01-intro.wav"],
  });
  assert.equal(r.action, "write");
  assert.equal(r.file, "outro-end.wav");
});

test("cacheDir honours KOKORO_CACHE_DIR and falls back to the home cache", () => {
  const saved = process.env.KOKORO_CACHE_DIR;
  try {
    const custom = path.join(os.tmpdir(), "kokoro-cache-test");
    process.env.KOKORO_CACHE_DIR = custom;
    assert.equal(cacheDir(), custom);
    delete process.env.KOKORO_CACHE_DIR;
    const d = cacheDir();
    assert.ok(d.startsWith(os.homedir()), d);
    assert.ok(d.endsWith(path.join(".cache", "skill-c2v", "kokoro")), d);
  } finally {
    if (saved === undefined) delete process.env.KOKORO_CACHE_DIR;
    else process.env.KOKORO_CACHE_DIR = saved;
  }
});

test("model id and dtype list are fixed", () => {
  assert.equal(MODEL_ID, "onnx-community/Kokoro-82M-v1.0-ONNX");
  assert.deepEqual(DTYPES, ["fp32", "fp16", "q8", "q4", "q4f16"]);
});
