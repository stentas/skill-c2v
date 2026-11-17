// Resolves the ffmpeg binary and reads media facts with it (no ffprobe needed).
//
//   FFMPEG_PATH=/path/to/ffmpeg    wins; else the ffmpeg-static binary from `pnpm install`; else `ffmpeg` on PATH.
//
// CLI: runs the resolved ffmpeg with the given arguments, e.g. to list streams and duration of a clip:
//   node tools/ffbin.mjs -i clip.mp4          (pnpm ffmpeg -i clip.mp4)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

let bundled = null;
try { bundled = (await import("ffmpeg-static")).default; } catch { /* not installed – fall back to PATH */ }

export const ffmpeg = process.env.FFMPEG_PATH ||
  (typeof bundled === "string" && existsSync(bundled) ? bundled : "ffmpeg");

const run = (argv) => spawnSync(ffmpeg, argv, { encoding: "utf8", maxBuffer: 1 << 26 });
const missing = `Fant ikke ffmpeg (${ffmpeg}). Kjør "pnpm install" i videomappen (ffmpeg-static), eller sett FFMPEG_PATH.`;

/** Throws a readable error when the resolved ffmpeg cannot be run. */
export function assertFfmpeg() {
  const r = spawnSync(ffmpeg, ["-version"], { stdio: "ignore" });
  if (r.error || r.status !== 0) throw new Error(missing);
}

/** Seconds from the "Duration: HH:MM:SS.cc" line of ffmpeg's input banner, or null. */
export function parseDuration(log) {
  const m = log.match(/^\s*Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/m);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

/** Duration and stream types of a media file, read from `ffmpeg -i` (exits 1 without an output; expected). */
export function probe(file) {
  const raw = run(["-hide_banner", "-i", file]).stderr ?? "";
  const duration = parseDuration(raw);
  if (/No such file/.test(raw) || duration === null) throw new Error(`Kunne ikke lese ${file}:\n${raw}`);
  return { duration, hasVideo: /Stream #\d+:\d+.*: Video:/.test(raw), hasAudio: /Stream #\d+:\d+.*: Audio:/.test(raw), raw };
}

/**
 * Number of video frames (packets) in a clip, counted by stream copy without decoding; null if none.
 * Counts the per-packet lines of the framecrc muxer: some ffmpeg builds (e.g. 6.1 from ffmpeg-static)
 * omit "frame=" from the progress line on stream copy, so the progress line is only a fallback.
 */
export function videoFrames(file) {
  const r = run(["-hide_banner", "-v", "error", "-i", file, "-map", "0:v", "-c", "copy", "-f", "framecrc", "-"]);
  const packets = (r.stdout ?? "").split(/\r?\n/).filter((line) => /^\d+,/.test(line)).length;
  if (packets > 0) return packets;
  const log = run(["-hide_banner", "-i", file, "-map", "0:v", "-c", "copy", "-f", "null", "-"]).stderr ?? "";
  const all = [...log.matchAll(/frame=\s*(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = spawnSync(ffmpeg, process.argv.slice(2), { stdio: "inherit" });
  if (r.error) { console.error(missing); process.exit(1); }
  process.exit(r.status ?? 1);
}
