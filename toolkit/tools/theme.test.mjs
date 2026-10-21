// Covers THEME_PRESETS and resolveTheme() in engine.js.
//
//   node --test "tools/*.test.mjs"      (pnpm test)
//
// engine.js touches the DOM, so only the preset table and resolveTheme are cut out of its source and evaluated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../engine.js", import.meta.url), "utf8");
const from = src.indexOf("const THEME_PRESETS = {");
const fn = src.indexOf("function resolveTheme(");
assert.ok(from >= 0 && fn > from, "fant ikke THEME_PRESETS / resolveTheme i engine.js");
const { THEME_PRESETS, resolveTheme } = new Function(src.slice(from, src.indexOf("\n}\n", fn) + 2) + "\nreturn { THEME_PRESETS, resolveTheme };")();
const BASE = THEME_PRESETS.frame;
const SECTIONS = ["highlight", "cursor", "ripple", "camera", "modal", "typing"];

test("no input = the base = preset frame", () => {
  assert.deepEqual(resolveTheme(), BASE);
  assert.deepEqual(resolveTheme(null), BASE);
  assert.deepEqual(resolveTheme("frame"), BASE);
});

test("every preset resolves with every key of the base", () => {
  for (const name of Object.keys(THEME_PRESETS)) {
    const t = resolveTheme(name);
    assert.equal(t.name, name);
    for (const s of SECTIONS) assert.deepEqual(Object.keys(t[s]).sort(), Object.keys(BASE[s]).sort(), `${name}.${s}`);
  }
});

test("object form: preset + overrides", () => {
  const t = resolveTheme({ preset: "calm", highlight: { pad: 9 } });
  assert.equal(t.highlight.style, "underline");
  assert.equal(t.highlight.pad, 9);
  assert.equal(t.highlight.fade, .4);
  assert.equal(t.cursor.bow, .05);
});

test("unknown preset throws and lists the names", () => {
  assert.throws(() => resolveTheme("loud"), (err) => err instanceof Error
    && err.message.includes("ukjent preset «loud»")
    && Object.keys(THEME_PRESETS).every((n) => err.message.includes(n)));
});

test("object without preset: overrides on the base only", () => {
  const t = resolveTheme({ highlight: { style: "glow" } });
  assert.deepEqual(t, { ...BASE, highlight: { ...BASE.highlight, style: "glow" } });
});
