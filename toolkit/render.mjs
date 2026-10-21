// Renders scenes frame by frame to MP4 clips with their voice track, or PNG stills, or checks scene boundaries.
//
//   node render.mjs scenes/04-users.html                    -> clips/04.mp4 (voice muxed in, start/end state printed)
//   node render.mjs scenes/04-users.html --stills 0,3.5,end -> stills/04-0.png, stills/04-3.5.png, stills/04-end.png
//   node render.mjs scenes/04-users.html --contact          -> stills/04-contact.png: one still per cue() (+0.5 s after
//                                                              it), per click, camera key, highlight and move, first
//                                                              and last frame – labelled, on one sheet (no ffmpeg)
//   node render.mjs --all                                   -> every scene of video.config.json, in order
//   node render.mjs --check-boundaries [--clips]            -> last frame of scene N vs first frame of N+1
//
// Options:
//   --after S          with --contact: seconds after each cue for the reaction still (default 0.5; 0 = none)
//   --jobs N           parallel browser pages (default min(4, cores / 2)). Each scene is split into frame ranges
//                      that are rendered and encoded in parallel, then joined without re-encoding.
//   --capture png|jpeg frame capture format (default from config "encode.capture"); --quality N for JPEG (95)
//   --out <file>       other output path (one scene only)
//   --config <file>    video.config.json to use (default: nearest one above the scene file / current folder)
//   --clips            with --check-boundaries: compare the rendered clips instead of rendering the two frames
//
// The page must expose window.DEMO = { duration, lead, audioSrc, seek(t) } (engine.js does this; prepare, state and
// lint are used when present). It is awaited for up to 10 s, so a scene may create it after asynchronous loading
// (e.g. 3D assets). A scene can also be an http(s) URL (e.g. a built React harness served elsewhere); its relative
// audioSrc is then looked up in the scenes folder, then dirs.audio.
// Browser: config "browser" ({ channel: "msedge" } by default, then chrome, chromium as fallback; "args": extra
// Chromium flags), or CHROME_PATH = path to a Chromium binary (no fallback). See tools/browser.mjs.
// Audio: delayed by DEMO.lead, padded with silence to the clip length, AAC 192k 48 kHz stereo.
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launchBrowser } from "./tools/browser.mjs";
import { loadConfig, sceneForFile } from "./tools/config.mjs";
import { contactSheetHtml, planContact } from "./tools/contact.mjs";
import { assertFfmpeg, ffmpeg, videoFrames } from "./tools/ffbin.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i === -1 ? null : args.splice(i, 2)[1] ?? ""; };
const flag = (name) => { const i = args.indexOf(name); if (i === -1) return false; args.splice(i, 1); return true; };

const stills = opt("--stills");
const outArg = opt("--out");
const configArg = opt("--config");
const jobsArg = opt("--jobs");
const captureArg = opt("--capture");
const qualityArg = opt("--quality");
const afterArg = opt("--after");
const contact = flag("--contact");
const all = flag("--all");
const checkBoundaries = flag("--check-boundaries");
const fromClips = flag("--clips");
const inputs = args.filter((a) => !a.startsWith("--"));

const isUrl = (s) => /^https?:\/\//i.test(s);
const firstFile = inputs.find((a) => !isUrl(a));
const cfg = loadConfig({ explicit: configArg, start: firstFile ? path.dirname(path.resolve(firstFile)) : process.cwd() });
const fps = cfg.fps, W = cfg.width, H = cfg.height;
const jobs = Math.max(1, Number(jobsArg) || Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2))));
const capture = (captureArg ?? cfg.encode.capture ?? "png").toLowerCase();
const quality = Number(qualityArg ?? cfg.encode.quality ?? 95);
if (!["png", "jpeg"].includes(capture)) throw new Error(`--capture må være png eller jpeg, ikke ${capture}`);

const t0 = performance.now();
const elapsed = () => ((performance.now() - t0) / 1000).toFixed(1) + " s";
const rel = (p) => path.relative(process.cwd(), p) || ".";

// ---------- Scenes to process ----------
let scenes;
if (all || (checkBoundaries && !inputs.length)) {
  scenes = cfg.sceneList.filter((s) => {
    if (existsSync(s.file)) return true;
    console.warn(`Advarsel: fant ikke ${rel(s.file)} – hoppes over`);
    return false;
  });
} else {
  if (!inputs.length) {
    console.error("Bruk: node render.mjs <scene.html> [--stills 0,2.5,end | --contact] [--jobs N] | --all | --check-boundaries");
    process.exit(1);
  }
  scenes = inputs.map((a) => (isUrl(a)
    ? { ...sceneForFile(cfg, path.join(cfg.dir("scenes"), path.basename(new URL(a).pathname).replace(/(\.html)?$/, ".html"))), url: a }
    : sceneForFile(cfg, a)));
}
for (const s of scenes) {
  s.url ??= pathToFileURL(s.file).href;
  if (!isUrl(s.url) && !existsSync(s.file)) throw new Error(`Fant ikke ${s.file}`);
}
if (outArg && scenes.length > 1) throw new Error("--out kan bare brukes med én scene");
if (stills === null && !contact) assertFfmpeg();   // clips and boundary checks need ffmpeg; stills and contact sheets do not

// ---------- Browser ----------
const { browser } = await launchBrowser(cfg, { log: console.log });

const DEMO_TIMEOUT_MS = 10000;
const warnedMsgs = new Set();
function warn(scene, msg) {
  const k = scene.key + msg;
  if (!warnedMsgs.has(k)) { warnedMsgs.add(k); console.warn(`\n  [${scene.key}] ${msg}`); }
}

/** Opens a scene in its own context (own renderer process), checks fonts, measures targets. */
async function openScene(scene) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warn(scene, m.text()); });
  page.on("pageerror", (e) => warn(scene, `sidefeil: ${e.message}`));
  const url = new URL(scene.url);
  url.searchParams.set("render", "1");
  await page.goto(url.href);
  try {
    await page.waitForFunction(() => !!window.DEMO, null, { timeout: DEMO_TIMEOUT_MS });
  } catch {
    throw new Error(`${scene.key}: window.DEMO mangler etter ${DEMO_TIMEOUT_MS / 1000} s (createDemo ble ikke kjørt – se sidefeil over)`);
  }
  await checkFonts(page, scene);
  const info = await page.evaluate(() => {
    const d = window.DEMO;
    if (d.prepare) d.prepare();
    return { duration: d.duration, lead: d.lead ?? 0, audioSrc: d.audioSrc ?? null };
  });
  const cdp = await context.newCDPSession(page);
  return { scene, context, page, cdp, info };
}

/**
 * Local path of the scene's voice file (null = none). file: scenes resolve audioSrc against the scene URL;
 * http(s) scenes resolve a root-relative src against the project root, a relative one against the scenes folder
 * (voice-meta writes src relative to dirs.scenes), then by file name in dirs.audio.
 */
function resolveAudio(info, scene) {
  const src = info.audioSrc;
  if (!src) return null;
  if (new URL(scene.url).protocol === "file:") return fileURLToPath(new URL(src, scene.url));
  if (isUrl(src)) throw new Error(`Lydfilen må være en lokal fil, ikke ${src}`);
  const candidates = src.startsWith("/")
    ? [path.join(cfg.root, src)]
    : [path.resolve(cfg.dir("scenes"), src), path.join(cfg.dir("audio"), path.basename(src))];
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error(`Fant ikke lydfilen ${src} (prøvde ${candidates.join(", ")})`);
  return hit;
}

/** Loads every declared @font-face explicitly (a scene without text never triggers it) and fails loudly. */
async function checkFonts(page, scene) {
  const families = cfg.fonts.map((f) => f.family);
  const r = await page.evaluate(async (families) => {
    await document.fonts.ready;
    const faces = [...document.fonts];
    await Promise.allSettled(faces.map((f) => f.load()));
    for (const fam of families) { try { await document.fonts.load(`16px "${fam}"`); } catch { /* reported below */ } }
    await document.fonts.ready;
    const name = (f) => f.family.replace(/^["']|["']$/g, "");
    return {
      failed: faces.filter((f) => f.status === "error").map((f) => `${name(f)} ${f.style} ${f.weight}`),
      missing: families.filter((fam) => !faces.some((f) => name(f) === fam && f.status === "loaded")),
    };
  }, families);
  if (r.failed.length || r.missing.length) {
    throw new Error(`${scene.key}: fonter ble ikke lastet` +
      (r.missing.length ? ` – mangler @font-face for ${r.missing.join(", ")} (lenk inn fonts/fonts.css?)` : "") +
      (r.failed.length ? ` – lastefeil: ${r.failed.join("; ")}` : ""));
  }
}

const seek = (w, t) => w.page.evaluate((x) => window.DEMO.seek(x), t);
async function grab(w, format = capture) {
  const params = format === "jpeg"
    ? { format: "jpeg", quality, optimizeForSpeed: true }
    : { format: "png", optimizeForSpeed: true };
  const { data } = await w.cdp.send("Page.captureScreenshot", { ...params, captureBeyondViewport: false });
  return Buffer.from(data, "base64");
}
const stateAt = (w, t) => w.page.evaluate((x) => (window.DEMO.state ? window.DEMO.state(x) : null), t);
const fmtState = (s) => (s ? `kamera s=${s.s} cx=${s.cx} cy=${s.cy} · peker x=${s.x} y=${s.y}${s.cursor ? "" : " (skjult)"}` : "–");
const frameCount = (info) => Math.round(info.duration * fps);
const lastFrameTime = (info) => (frameCount(info) - 1) / fps;

// ---------- Stills ----------
async function renderStills(scene) {
  const w = await openScene(scene);
  const dir = cfg.dir("stills");
  await mkdir(dir, { recursive: true });
  const times = stills.split(",").map((s) => s.trim()).filter(Boolean);
  for (const raw of times) {
    const t = raw === "end" ? lastFrameTime(w.info) : Number(raw);
    if (!Number.isFinite(t)) throw new Error(`Ugyldig tid i --stills: ${raw}`);
    await seek(w, t);
    await writeFile(path.join(dir, `${scene.key}-${raw}.png`), await grab(w, "png"));
    console.log(`  ${scene.key}-${raw}.png  t=${t.toFixed(3)}  ${fmtState(await stateAt(w, t))}`);
  }
  console.log(`${scene.key}: lagret ${times.length} stillbilder i ${rel(dir)}/`);
  await w.context.close();
}

// ---------- Contact sheet ----------
/** One still per cue (and `--after` s later), per scripted beat and at both ends, tiled with labels into one PNG. */
async function renderContact(scene) {
  const w = await openScene(scene);
  const dir = cfg.dir("stills");
  await mkdir(dir, { recursive: true });
  const after = Number(afterArg ?? 0.5);
  if (!Number.isFinite(after) || after < 0) throw new Error(`--after må være et tall ≥ 0, ikke ${afterArg}`);
  const marks = await w.page.evaluate(() => {
    const d = window.DEMO;
    return { cues: d.cues ? d.cues() : [], events: d.events ? d.events() : [] };
  });
  if (!marks.cues.length) warn(scene, "ingen cue()-kall registrert (stille scene, eller cue hentet utenom sceneInfo) – arket viser bare start, slutt og beats");
  const tiles = planContact({ ...marks, after, lastFrame: lastFrameTime(w.info), fps });
  for (const tile of tiles) {
    await seek(w, tile.t);
    tile.png = await grab(w, "png");
    tile.state = await stateAt(w, tile.t);
    console.log(`  ${String(tiles.indexOf(tile) + 1).padStart(2)}  t=${tile.t.toFixed(2)}  ${tile.labels.join(" · ")}`);
  }
  const sheet = await w.context.newPage();
  await sheet.setContent(contactSheetHtml({ title: `${scene.key} – ${scene.slug}`, tiles, width: W, height: H }), { waitUntil: "load" });
  const out = path.join(dir, `${scene.key}-contact.png`);
  await writeFile(out, await sheet.screenshot({ fullPage: true, type: "png" }));
  console.log(`${scene.key}: kontaktark med ${tiles.length} bilder → ${rel(out)}`);
  await w.context.close();
}

// ---------- Clips (parallel frame ranges) ----------
function encoder(file) {
  const ff = spawn(ffmpeg, [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-c:v", capture === "jpeg" ? "mjpeg" : "png", "-framerate", String(fps), "-i", "-",
    "-vf", "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p",
    "-c:v", "libx264", "-preset", cfg.encode.preset, "-crf", String(cfg.encode.crf),
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
    "-r", String(fps), "-an", file,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  ff.stdin.on("error", () => {});
  return ff;
}

async function renderClips(list) {
  // Every scene is split into up to `jobs` frame ranges (≥ 1.5 s each). A pool of `jobs` workers, each with its
  // own page, takes ranges in scene order; a worker that finds no range plans the next scene (opens it, checks
  // fonts, measures, lints) and renders that scene's first range on the page it opened.
  const sceneQueue = [...list], chunkQueue = [], planning = new Set(), finals = [];
  let framesDone = 0, framesPlanned = 0;
  const tick = () => {
    const s = (performance.now() - t0) / 1000;
    process.stdout.write(`\rRendrer ${framesDone}/${framesPlanned} bilder · ${(framesDone / s).toFixed(1)} bilder/s · ${jobs} jobber   `);
  };

  async function planScene(scene) {
    const w = await openScene(scene);
    const total = frameCount(w.info);
    const start = await stateAt(w, 0), end = await stateAt(w, lastFrameTime(w.info));
    const lint = await w.page.evaluate(() => (window.DEMO.lint ? window.DEMO.lint() : []));
    const n = Math.max(1, Math.min(jobs, Math.ceil(total / (fps * 1.5))));
    const parts = Array.from({ length: n }, (_, i) => ({ f0: Math.floor(total * i / n), f1: Math.floor(total * (i + 1) / n) }));
    const out = outArg ? path.resolve(outArg) : scene.clip;
    const tmp = path.join(path.dirname(out), `.parts-${scene.key}-${process.pid}`);
    await mkdir(tmp, { recursive: true });
    parts.forEach((p, i) => { p.file = path.join(tmp, `${String(i).padStart(3, "0")}.mp4`); });
    const plan = { scene, info: w.info, total, parts, out, tmp, start, end, lint, left: n };
    framesPlanned += total;
    chunkQueue.push(...parts.slice(1).map((part) => ({ plan, part })));
    return { plan, part: parts[0], w };
  }
  async function nextJob() {
    for (;;) {
      if (chunkQueue.length) return chunkQueue.shift();
      if (sceneQueue.length) {
        const p = planScene(sceneQueue.shift());
        planning.add(p);
        try { return await p; } finally { planning.delete(p); }
      }
      if (!planning.size) return null;
      await Promise.race([...planning].map((p) => p.catch(() => {})));
    }
  }

  async function worker() {
    let w = null;
    for (;;) {
      const job = await nextJob();
      if (!job) break;
      const { plan, part } = job;
      if (job.w) {
        if (w) await w.context.close();
        w = job.w;
      } else if (!w || w.scene !== plan.scene) {
        if (w) await w.context.close();
        w = await openScene(plan.scene);
      }
      const ff = encoder(part.file);
      for (let f = part.f0; f < part.f1; f++) {
        await seek(w, f / fps);
        const frame = await grab(w);
        if (!ff.stdin.write(frame)) await once(ff.stdin, "drain");
        framesDone++;
        if (framesDone % 15 === 0) tick();
      }
      ff.stdin.end();
      const [code] = await once(ff, "close");
      if (code !== 0) throw new Error(`ffmpeg (del ${part.file}) avsluttet med kode ${code}`);
      if (--plan.left === 0) finals.push(finalize(plan).then(() => null, (e) => e));
    }
    if (w) await w.context.close();
  }
  await Promise.all(Array.from({ length: jobs }, worker));
  const errors = (await Promise.all(finals)).filter(Boolean);
  if (errors.length) throw errors[0];
  process.stdout.write("\n");
}

/** Joins the encoded ranges without re-encoding and muxes the voice (delayed by lead, padded to the clip length). */
async function finalize(plan) {
  const { scene, info, total, parts, out, tmp } = plan;
  await mkdir(path.dirname(out), { recursive: true });
  const list = path.join(tmp, "list.txt");
  await writeFile(list, parts.map((p) => `file '${p.file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const audioPath = resolveAudio(info, scene);
  if (audioPath && !existsSync(audioPath)) throw new Error(`Fant ikke lydfilen ${audioPath}`);
  const delayMs = Math.round(info.lead * 1000);
  const audioIn = audioPath ? ["-i", audioPath] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"];
  const audioFilter = audioPath
    ? `[1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${delayMs}:all=1,apad[a]`
    : `[1:a]anull[a]`;
  const ff = spawn(ffmpeg, [
    "-y", "-loglevel", "error",
    "-f", "concat", "-safe", "0", "-i", list,
    ...audioIn,
    "-filter_complex", audioFilter,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-t", (total / fps).toFixed(4), "-movflags", "+faststart",
    out,
  ], { stdio: ["ignore", "inherit", "inherit"] });
  const [code] = await once(ff, "close");
  if (code !== 0) throw new Error(`ffmpeg (sammenslåing ${rel(out)}) avsluttet med kode ${code}`);
  await rm(tmp, { recursive: true, force: true });
  const frames = videoFrames(out);
  if (frames !== total) console.warn(`\n  [${scene.key}] Advarsel: ${frames} bilder i klippet, forventet ${total}`);
  console.log(`\n${scene.key}: ferdig → ${rel(out)} (${total} bilder, ${(total / fps).toFixed(2)} s, ${parts.length} del${parts.length > 1 ? "er" : ""})`);
  console.log(`  start: ${fmtState(plan.start)}`);
  console.log(`  slutt: ${fmtState(plan.end)}`);
  for (const l of plan.lint ?? []) console.warn(`  advarsel: ${l}`);
}

// ---------- Boundary check ----------
function decodeToRgb(input, extraIn = []) {
  const r = spawnSync(ffmpeg, ["-v", "error", ...extraIn, "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "pipe:1"],
    { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return r.stdout;
}
const pngToRgb = (buf) => decodeToRgb(buf, ["-f", "png_pipe", "-i", "pipe:0", "-frames:v", "1"]);
function clipFrame(file, which) {
  const frameBytes = W * H * 3;
  if (which === "first") return decodeToRgb(undefined, ["-i", file, "-frames:v", "1"]);
  const buf = decodeToRgb(undefined, ["-sseof", "-1", "-i", file]);
  return buf.subarray(buf.length - frameBytes);
}
function compare(a, b) {
  let se = 0, diff = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0, p = 0; i < a.length; i += 3, p++) {
    const d0 = a[i] - b[i], d1 = a[i + 1] - b[i + 1], d2 = a[i + 2] - b[i + 2];
    se += d0 * d0 + d1 * d1 + d2 * d2;
    if (Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2)) > 24) {
      diff++;
      const x = p % W, y = (p - x) / W;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const mse = se / a.length;
  return { psnr: mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse), diff, box: diff ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null };
}

async function boundaries(list) {
  if (list.length < 2) { console.log("Trenger minst to scener for grensesjekk."); return; }
  const dir = cfg.dir("stills");
  await mkdir(dir, { recursive: true });
  const edge = new Map();   // key -> { first, last, start, end }
  if (!fromClips) {
    const queue = [...list];
    await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, async () => {
      for (let scene; (scene = queue.shift());) {
        const w = await openScene(scene);
        const lf = lastFrameTime(w.info);
        await seek(w, 0);
        const first = await grab(w, "png");
        const start = await stateAt(w, 0);
        await seek(w, lf);
        const last = await grab(w, "png");
        const end = await stateAt(w, lf);
        edge.set(scene.key, { first, last, start, end });
        await w.context.close();
      }
    }));
  }
  console.log(`Grensesjekk (${fromClips ? "klipp" : "scener"}): siste bilde i N mot første bilde i N+1`);
  let bad = 0;
  for (let i = 0; i + 1 < list.length; i++) {
    const A = list[i], B = list[i + 1];
    let a, b;
    if (fromClips) {
      if (!existsSync(A.clip) || !existsSync(B.clip)) { console.log(`  ${A.key}→${B.key}  mangler klipp`); continue; }
      a = clipFrame(A.clip, "last"); b = clipFrame(B.clip, "first");
    } else {
      a = pngToRgb(edge.get(A.key).last); b = pngToRgb(edge.get(B.key).first);
    }
    const c = compare(a, b);
    const limit = Math.ceil(W * H * 0.00001);
    const ok = c.diff <= limit;
    if (!ok) bad++;
    console.log(`  ${A.key}→${B.key}  ${ok ? "OK    " : "AVVIK "} PSNR ${c.psnr === Infinity ? "∞" : c.psnr.toFixed(1)} dB · ${c.diff} px avviker` +
      (c.box ? ` i x=${c.box.x} y=${c.box.y} ${c.box.w}×${c.box.h}` : ""));
    if (!fromClips) {
      const ea = edge.get(A.key), eb = edge.get(B.key);
      if (!ok || JSON.stringify({ ...ea.end, t: 0 }) !== JSON.stringify({ ...eb.start, t: 0 })) {
        console.log(`      ${A.key} slutt: ${fmtState(ea.end)}`);
        console.log(`      ${B.key} start: ${fmtState(eb.start)}`);
      }
      if (!ok) {
        await writeFile(path.join(dir, `${A.key}-end.png`), ea.last);
        await writeFile(path.join(dir, `${B.key}-0.png`), eb.first);
      }
    }
  }
  console.log(bad ? `${bad} grense(r) avviker – se stillbildene i ${rel(dir)}/` : "Alle grenser stemmer.");
}

// ---------- Main ----------
try {
  if (checkBoundaries) await boundaries(scenes);
  else if (stills !== null) for (const s of scenes) await renderStills(s);
  else if (contact) for (const s of scenes) await renderContact(s);
  else await renderClips(scenes);
  console.log(`Tid: ${elapsed()}`);
} finally {
  await browser.close();
}
