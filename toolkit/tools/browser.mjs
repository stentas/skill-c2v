// Starts the installed Chromium-family browser used for rendering (shared by render.mjs and doctor.mjs).
//
// Order: CHROME_PATH or config "browser.executablePath" (alone – an explicit path never falls back), else the
// configured channel, then the rest of msedge, chrome, chromium. Only installed browsers are used.
import { chromium } from "playwright-core";

const CHANNELS = ["msedge", "chrome", "chromium"];

/** Ordered launch options: [{ label, args, executablePath }] or [{ label, args, channel }, ...]. */
export function browserCandidates(cfg) {
  const args = cfg.browser?.args ?? [];
  const explicit = process.env.CHROME_PATH || cfg.browser?.executablePath;
  if (explicit) {
    const executablePath = process.env.CHROME_PATH || cfg.abs(cfg.browser.executablePath);
    const source = process.env.CHROME_PATH ? "CHROME_PATH" : "browser.executablePath";
    return [{ label: `${source}=${executablePath}`, executablePath, args }];
  }
  const first = cfg.browser?.channel ?? "msedge";
  return [first, ...CHANNELS.filter((c) => c !== first)].map((channel) => ({ label: channel, channel, args }));
}

/** Per-OS install hints for a browser Playwright can drive. */
export function installHint() {
  return [
    "Installer en Chromium-basert nettleser:",
    "  macOS:          brew install --cask google-chrome   (eller microsoft-edge)",
    "  Debian/Ubuntu:  sudo apt install chromium   (eller Googles Chrome-.deb fra google.com/chrome)",
    "  Windows:        Edge er forhåndsinstallert",
    "Eller pek direkte på en binærfil: CHROME_PATH=/sti/til/nettleser (overstyrer alt annet).",
  ].join("\n");
}

/** Launches the first candidate that starts. Returns { browser, used } (used = the candidate object). */
export async function launchBrowser(cfg, { log = console.log } = {}) {
  const candidates = browserCandidates(cfg);
  const failures = [];
  for (const cand of candidates) {
    const { label, ...opts } = cand;
    try {
      const browser = await chromium.launch(opts);
      if (failures.length) log(`Nettleser: ${failures.map((f) => f.label).join(", ")} ikke funnet, bruker ${label}.`);
      return { browser, used: cand };
    } catch (e) {
      failures.push({ label, msg: String(e?.message ?? e).split("\n")[0] });
    }
  }
  throw new Error([
    "Kunne ikke starte nettleseren. Prøvde:",
    ...failures.map((f) => `  ${f.label}: ${f.msg}`),
    "",
    installHint(),
  ].join("\n"));
}
