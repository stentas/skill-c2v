// planContact / contactSheetHtml (render.mjs --contact): tile order, merging, after-stills, clamping, labels.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contactSheetHtml, labelOf, planContact } from "./contact.mjs";

const cues = [
  { kind: "cue", phrase: "open the panel", nth: 1, t: 2.0 },
  { kind: "cue", phrase: "highlight the total", nth: 1, t: 4.0 },
  { kind: "cueEnd", phrase: "modal closes", nth: 1, t: 7.0 },
];
const events = [
  { kind: "click", t: 2.0 },                        // same time as the first cue → merged
  { kind: "camera", t: 2.9, s: 1.4, sel: "#dialog" },
  { kind: "highlight", t: 4.01, sel: "#total" },    // within half a frame of the second cue → merged
  { kind: "move", t: 9.0, sel: "#approve" },        // after the last frame → clamped onto "slutt"
];

test("planContact: ordered, merged, clamped, with after-stills for cues only", () => {
  const tiles = planContact({ cues, events, after: 0.5, lastFrame: 8.0, fps: 30 });
  assert.deepEqual(tiles.map((x) => x.t), [0, 2.0, 2.5, 2.9, 4.0, 4.5, 7.0, 8.0]);
  assert.deepEqual(tiles[1].labels, ["cue «open the panel»", "klikk"]);
  assert.deepEqual(tiles[2].labels, ["+0.50 s etter «open the panel»"]);
  assert.deepEqual(tiles[3].labels, ["kamera s=1.4 → #dialog"]);
  assert.deepEqual(tiles[4].labels, ["cue «highlight the total»", "highlight #total"]);
  assert.deepEqual(tiles[6].labels, ["cueEnd «modal closes»"]);   // no after-still for cueEnd
  assert.deepEqual(tiles[7].labels, ["slutt", "peker → #approve"]);
});

test("planContact: silent scene without cues still gives start, beats and end", () => {
  const tiles = planContact({ cues: [], events: [{ kind: "click", t: 1 }], after: 0.5, lastFrame: 3, fps: 30 });
  assert.deepEqual(tiles.map((x) => x.t), [0, 1, 3]);
  assert.deepEqual(tiles[0].labels, ["start"]);
});

test("planContact: after = 0 adds no reaction stills; an after-still past the end is dropped", () => {
  assert.equal(planContact({ cues, events: [], after: 0, lastFrame: 8, fps: 30 }).length, 5);
  const late = planContact({ cues: [{ kind: "cue", phrase: "x", nth: 1, t: 7.8 }], after: 0.5, lastFrame: 8, fps: 30 });
  assert.deepEqual(late.map((x) => x.t), [0, 7.8, 8]);
});

test("labelOf: nth occurrence and move without a selector", () => {
  assert.equal(labelOf({ kind: "cue", phrase: "two", nth: 2 }), "cue «two» (2.)");
  assert.equal(labelOf({ kind: "move", t: 1 }), "peker ferdig");
});

test("contactSheetHtml: one figure per tile, labels escaped, state shown", () => {
  const png = Buffer.from("png");
  const tiles = [
    { t: 0, labels: ["start"], png, state: { s: 1.15, cx: 835, cy: 470, x: 1660, y: 980, cursor: true } },
    { t: 2, labels: ["cue «<b>»"], png, state: null },
  ];
  const html = contactSheetHtml({ title: "02 – voiced", tiles, columns: 2, tileWidth: 400 });
  assert.equal((html.match(/<figure>/g) ?? []).length, 2);
  assert.ok(html.includes("cue «&lt;b&gt;»"));
  assert.ok(html.includes("kamera s=1.15 cx=835 cy=470 · peker x=1660 y=980"));
  assert.ok(html.includes(`data:image/png;base64,${png.toString("base64")}`));
  assert.ok(html.includes("width: 816px"));            // 2 × 400 + 1 × 16
  assert.ok(html.includes('height="225"'));            // 400 × 1080 / 1920
});
