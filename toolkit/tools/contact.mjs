// Contact sheet planning and layout for render.mjs --contact: one still per cue (and one `after` seconds later),
// one per scripted beat (click, camera key, highlight start, move end), plus the first and last frame, laid out
// as a grid with the time, the camera/cursor state and what happens there under each tile.
//
// Pure functions, no browser: render.mjs seeks and grabs the PNGs, then screenshots the HTML this module builds.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtT = (t) => t.toFixed(2);

/** Label of one cue or event, as shown under its tile. */
export function labelOf(m) {
  if (m.kind === "cue") return `cue «${m.phrase}»${m.nth > 1 ? ` (${m.nth}.)` : ""}`;
  if (m.kind === "cueEnd") return `cueEnd «${m.phrase}»${m.nth > 1 ? ` (${m.nth}.)` : ""}`;
  if (m.kind === "after") return `+${fmtT(m.after)} s etter «${m.phrase}»`;
  if (m.kind === "click") return "klikk";
  if (m.kind === "camera") return `kamera s=${m.s}${m.sel ? ` → ${m.sel}` : ""}`;
  if (m.kind === "highlight") return `highlight ${m.sel ?? ""}`.trim();
  if (m.kind === "move") return `peker${m.sel ? ` → ${m.sel}` : " ferdig"}`;
  return m.kind;
}

/**
 * Tiles to grab: [{ t, labels: [string] }] in time order, merged when closer than half a frame.
 * cues: DEMO.cues(), events: DEMO.events(); after: seconds after each cue for the reaction still (0 = none).
 */
export function planContact({ cues = [], events = [], after = 0.5, lastFrame, fps = 30 }) {
  const marks = [{ t: 0, label: "start" }, { t: lastFrame, label: "slutt" }];
  for (const c of cues) {
    marks.push({ t: c.t, label: labelOf(c) });
    if (after > 0 && c.kind === "cue" && c.t + after < lastFrame) marks.push({ t: c.t + after, label: labelOf({ kind: "after", after, phrase: c.phrase }) });
  }
  for (const e of events) marks.push({ t: e.t, label: labelOf(e) });

  const tiles = [];
  const eps = 0.5 / fps;
  for (const m of marks.filter((x) => Number.isFinite(x.t)).sort((a, b) => a.t - b.t)) {
    const t = Math.min(Math.max(m.t, 0), lastFrame);
    const last = tiles[tiles.length - 1];
    if (last && Math.abs(last.t - t) < eps) { if (!last.labels.includes(m.label)) last.labels.push(m.label); continue; }
    tiles.push({ t, labels: [m.label] });
  }
  return tiles;
}

const fmtState = (s) => (s ? `kamera s=${s.s} cx=${s.cx} cy=${s.cy} · peker x=${s.x} y=${s.y}${s.cursor ? "" : " (skjult)"}` : "");

/**
 * The sheet as an HTML document. tiles: planContact() output plus `png` (Buffer) and optional `state`
 * (DEMO.state(t)). columns/tileWidth decide the grid; the page is `columns × tileWidth` plus gaps wide.
 */
export function contactSheetHtml({ title, tiles, width = 1920, height = 1080, columns = 4, tileWidth = 456, gap = 16 }) {
  const tileHeight = Math.round(tileWidth * height / width);
  const cells = tiles.map((tile, i) => `
    <figure>
      <img src="data:image/png;base64,${tile.png.toString("base64")}" width="${tileWidth}" height="${tileHeight}" alt="">
      <figcaption>
        <b>${i + 1}</b> t=${fmtT(tile.t)}
        <ul>${tile.labels.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
        <small>${esc(fmtState(tile.state))}</small>
      </figcaption>
    </figure>`).join("");
  return `<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { margin: 0; padding: ${gap}px; width: ${columns * tileWidth + (columns - 1) * gap}px; background: #1b1d21; color: #e6e8ec;
         font: 13px/1.35 system-ui, sans-serif; }
  h1 { margin: 0 0 ${gap}px; font-size: 18px; font-weight: 600; }
  .grid { display: grid; grid-template-columns: repeat(${columns}, ${tileWidth}px); gap: ${gap}px; }
  figure { margin: 0; }
  img { display: block; width: ${tileWidth}px; height: ${tileHeight}px; background: #000; }
  figcaption { padding: 6px 2px 0; min-height: 64px; }
  figcaption b { display: inline-block; min-width: 20px; color: #f8992e; }
  ul { margin: 2px 0 0; padding-left: 16px; }
  small { display: block; margin-top: 2px; color: #9aa0a8; font-size: 11px; }
</style></head>
<body><h1>${esc(title)} – ${tiles.length} bilder</h1><div class="grid">${cells}
</div></body></html>`;
}
