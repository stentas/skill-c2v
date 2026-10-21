// Checks that this machine can render: Node version, ffmpeg, a launchable browser, and the font bundle.
//
//   node tools/doctor.mjs [--config <file>]      (pnpm doctor)
//
// One line per check (✓/✗); exits 1 if any required check fails. The fonts and TTS checks (kokoro-js installed,
// Kokoro model for tts.dtype in the cache) are informational only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";   // its error message ends with installHint()
import { loadConfig } from "./config.mjs";
import { assertFfmpeg, ffmpeg } from "./ffbin.mjs";
import { cacheDir, MODEL_MB, modelFile } from "./tts.mjs";   // no kokoro-js load: it is imported only to synthesise

const toolkit = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const i = args.indexOf("--config");
const configArg = i === -1 ? null : args[i + 1] ?? "";

let failed = 0;
const ok = (msg) => console.log(`✓ ${msg}`);
const bad = (msg, detail) => {
  failed++;
  console.log(`✗ ${msg}`);
  if (detail) console.log(detail.replace(/^(?=.)/gm, "    "));
};

// ---------- Node ----------
const pkg = JSON.parse(readFileSync(path.join(toolkit, "package.json"), "utf8"));
const need = Number(/(\d+)/.exec(pkg.engines?.node ?? "")?.[1] ?? 0);
const have = Number(process.versions.node.split(".")[0]);
if (have >= need) ok(`Node ${process.versions.node} (krever ${pkg.engines?.node ?? "–"})`);
else bad(`Node ${process.versions.node} er for gammel – krever ${pkg.engines.node}`, "Installer en nyere Node fra nodejs.org (eller via nvm/fnm).");

// ---------- ffmpeg ----------
try {
  assertFfmpeg();
  const first = (spawnSync(ffmpeg, ["-version"], { encoding: "utf8" }).stdout ?? "").split("\n")[0].trim();
  ok(`ffmpeg: ${ffmpeg}\n    ${first}`);
} catch (e) {
  bad("ffmpeg mangler", e.message);
}

// ---------- Browser ----------
let cfg = null;
try {
  cfg = loadConfig({ explicit: configArg, start: process.cwd(), fallbackRoot: toolkit });
  console.log(`  konfigurasjon: ${cfg.file ?? "ingen video.config.json funnet – bruker standardverdier"}`);
} catch (e) {
  bad("Kunne ikke lese konfigurasjonen", e.message);
}
if (cfg) {
  try {
    const { browser, used } = await launchBrowser(cfg, { log: (m) => console.log(`  ${m}`) });
    const version = browser.version();
    await browser.close();
    ok(`Nettleser: ${used.label} (${version})`);
  } catch (e) {
    bad("Fant ingen nettleser som kunne startes", e.message);
  }
}

// ---------- Fonts (informational) ----------
const fontsCss = path.join(toolkit, "fonts", "fonts.css");
if (existsSync(fontsCss)) ok(`Fonter: ${path.relative(process.cwd(), fontsCss) || fontsCss}`);
else console.log(`- Fonter: fant ikke ${fontsCss} (valgfritt – scener uten egne fonter trenger den ikke)`);

// ---------- TTS (informational) ----------
const kokoroPkg = path.join(toolkit, "node_modules", "kokoro-js", "package.json");
if (existsSync(kokoroPkg)) ok(`TTS: kokoro-js ${JSON.parse(readFileSync(kokoroPkg, "utf8")).version}`);
else console.log("- TTS: kokoro-js mangler (valgfritt – pnpm install)");
const dtype = cfg?.tts?.dtype ?? "fp32";
if (existsSync(modelFile(dtype))) ok(`Kokoro-modell (${dtype}) i ${cacheDir()}`);
else console.log(`- Kokoro-modell (${dtype}) ikke lastet ned ennå – pnpm tts laster den${MODEL_MB[dtype] ? ` (${MODEL_MB[dtype]} MB)` : ""} første gang (cache ${cacheDir()})`);

console.log(failed ? `\n${failed} sjekk(er) feilet.` : "\nAlt klart til rendering.");
process.exit(failed ? 1 : 0);
