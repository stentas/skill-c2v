// Checks links in every Markdown file under a root directory.
//
//   node tools/validate-links.mjs <root-dir> [--external]     (pnpm links)
//
// Checked: relative paths (must exist), #anchors (must match a heading in the target .md file).
// External http(s) links are only fetched with --external. mailto: links are skipped.
// Counting: `links` counts the links that were actually checked (skipped mailto/external ones are not counted).
//
// Also checks documentation drift against toolkit/package.json (see checkCommands):
//   - every `pnpm <name>` in inline code or fenced code blocks (prose is ignored) must be a script or a pnpm builtin;
//   - every script must be listed as `pnpm <name>` in toolkit/README.md.
// Exit code 1 when any link is broken or any command drifted.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set(["node_modules", ".git", "clips", "stills", "dist"]);
const INLINE = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REFDEF = /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/;
const HEADING = /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
const CODE_PATH = /^(\.\.?\/)?[A-Za-z0-9_.\-]+(\/[A-Za-z0-9_.\-]+)+$/;
const CODE_EXT = /\.(md|mjs|js|css|html|json|yaml|txt)$/;
const FENCE =/^ {0,3}(`{3,}|~{3,})/;
const PNPM_CMD = /\bpnpm\s+([a-z][a-z0-9:-]*)/g;
const PNPM_BUILTINS = new Set(["init", "install", "i", "add", "remove", "rm", "exec", "dlx", "create", "update", "up", "view", "pack",
  "run", "test", "why", "ls", "list", "outdated", "store", "approve-builds", "setup", "self-update"]);

/** GitHub-style anchor for a heading's text (without de-duplication suffix). */
export function slug(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

function findMarkdown(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) findMarkdown(full, out); }
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Heading anchors and link targets (with 1-based line numbers) of one Markdown file. */
function parse(file) {
  const anchors = new Set(), counts = new Map(), links = [];
  let fence = null;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach((raw, i) => {
    const f = raw.match(FENCE);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; return; }
    if (f) { fence = f[1]; return; }
    for (const m of raw.matchAll(/`+([^`]*)`+/g)) {
      const t = m[1].trim().replace(/\/$/, "");
      if (CODE_PATH.test(t) && CODE_EXT.test(t) && !/NN|MM/.test(t)) links.push({ line: i + 1, target: t, kind: "code" });
    }
    const line = raw.replace(/`+[^`]*`+/g, (m) => " ".repeat(m.length));
    const h = line.match(HEADING);
    if (h) {
      const base = slug(raw.match(HEADING)[1]), n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      anchors.add(n ? `${base}-${n}` : base);
    }
    const ref = line.match(REFDEF);
    if (ref) links.push({ line: i + 1, target: ref[1] });
    for (const m of line.matchAll(INLINE)) links.push({ line: i + 1, target: m[1].replace(/^<|>$/g, "") });
  });
  return { anchors, links };
}

/**
 * Documentation drift between package.json scripts and Markdown.
 * Rule A (unknown): `pnpm <name>` in inline code or fenced blocks (not prose) where name is neither a script nor a pnpm builtin.
 * Rule B (unlisted): a script that never appears as `pnpm <name>` in `commandsDoc`.
 */
export function checkCommands({ scripts, docs, commandsDoc }) {
  const known = new Set(scripts);
  const sortBy = (a, b) => (a.file !== b.file ? (a.file < b.file ? -1 : 1) : a.line - b.line || (a.command < b.command ? -1 : a.command > b.command ? 1 : 0));
  const dedupe = (list) => [...new Map(list.map((v) => [`${v.file}\0${v.line}\0${v.command}`, v])).values()].sort(sortBy);
  const unknown = [], listed = new Set();
  for (const { file, text } of docs) {
    let fence = null;
    text.split(/\r?\n/).forEach((raw, i) => {
      // Rule B counts a mention anywhere in the commands doc.
      if (file === commandsDoc) for (const m of raw.matchAll(PNPM_CMD)) listed.add(m[1]);
      // Rule A only looks at code: whole lines inside fenced blocks, backtick spans elsewhere.
      const f = raw.match(FENCE);
      if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null; }
      else if (f) { fence = f[1]; return; }
      const code = fence ? [raw] : [...raw.matchAll(/`+([^`]*)`+/g)].map((m) => m[1]);
      for (const part of code) {
        for (const m of part.matchAll(PNPM_CMD)) {
          if (!known.has(m[1]) && !PNPM_BUILTINS.has(m[1])) unknown.push({ file, line: i + 1, command: m[1] });
        }
      }
    });
  }
  const unlisted = scripts.filter((s) => !listed.has(s)).map((command) => ({ file: commandsDoc, line: 0, command }));
  return { unknown: dedupe(unknown), unlisted: dedupe(unlisted) };
}

async function checkUrl(url) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10_000) });
    if (res.status === 405 || res.status === 403 || res.status < 400) return null;
    return `HTTP ${res.status}`;
  } catch (err) {
    return `network error (${err.cause?.code ?? err.name})`;
  }
}

async function pool(tasks, limit) {
  let next = 0;
  const worker = async () => { while (next < tasks.length) await tasks[next++](); };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

export async function validate(root, { external = false } = {}) {
  root = path.resolve(root);
  const files = findMarkdown(root);
  const cache = new Map();
  const info = (f) => cache.get(f) ?? (cache.set(f, parse(f)), cache.get(f));
  const broken = [], pending = [];
  let links = 0;

  for (const file of files) {
    const rel = path.relative(root, file);
    for (const { line, target, kind } of info(file).links) {
      const fail = (reason) => broken.push({ file: rel, line, target, reason });
      if (kind === "code") {
        // Only checked when the first segment is a directory in the file's dir or the root; else it is an example path.
        const bases = [path.dirname(file), root], first = target.split("/")[0];
        const isDir = (b) => { try { return fs.statSync(path.join(b, first)).isDirectory(); } catch { return false; } };
        if (!bases.some(isDir)) continue;
        links++;
        if (!bases.some((b) => fs.existsSync(path.resolve(b, target)))) fail("code path not found");
        continue;
      }
      if (/^https?:\/\//i.test(target)) {
        if (!external) continue;
        links++;
        pending.push(async () => { const r = await checkUrl(target); if (r) fail(r); });
        continue;
      }
      if (/^mailto:/i.test(target) || target === "") continue;
      links++;
      const hashAt = target.indexOf("#");
      const rawFragment = hashAt < 0 ? "" : target.slice(hashAt + 1);
      const rawPath = target.slice(0, hashAt < 0 ? undefined : hashAt).replace(/\?.*$/, "");
      let fragment = rawFragment, p = rawPath;
      try { fragment = decodeURIComponent(rawFragment); p = decodeURIComponent(rawPath); } catch { /* keep raw */ }
      const dest = p === "" ? file : p.startsWith("/") ? path.join(root, p) : path.resolve(path.dirname(file), p);
      if (p !== "" && !fs.existsSync(dest)) { fail("file not found"); continue; }
      if (fragment && (p === "" || (dest.endsWith(".md") && fs.statSync(dest).isFile())) &&
          !info(dest).anchors.has(fragment.toLowerCase())) {
        fail(p === "" ? "anchor not found in this file" : "anchor not found in target file");
      }
    }
  }
  await pool(pending, 8);
  broken.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  const docs = files.map((f) => ({ file: path.relative(root, f), text: fs.readFileSync(f, "utf8") }));
  return { files: files.length, links, broken, docs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const root = args.find((a) => !a.startsWith("--")) ?? process.cwd();
  const r = await validate(root, { external: args.includes("--external") });
  for (const b of r.broken) console.log(`${b.file}:${b.line}  ${b.target}  — ${b.reason}`);
  // Drift check: scripts come from the toolkit's package.json (one level above this file), paths are relative to root.
  const toolkit = path.resolve(import.meta.dirname, "..");
  const rel = (p) => path.relative(path.resolve(root), p).split(path.sep).join("/");
  const pkgRel = rel(path.join(toolkit, "package.json"));
  const scripts = Object.keys(JSON.parse(fs.readFileSync(path.join(toolkit, "package.json"), "utf8")).scripts ?? {});
  const c = checkCommands({ scripts, docs: r.docs, commandsDoc: rel(path.join(toolkit, "README.md")) });
  for (const u of c.unknown) console.log(`${u.file}:${u.line}: pnpm ${u.command} — not a script in ${pkgRel}`);
  for (const u of c.unlisted) console.log(`${u.file}: pnpm ${u.command} — script not listed under Commands`);
  console.log(`${r.files} files, ${r.links} links checked, ${r.broken.length} broken, ${c.unknown.length} unknown commands, ${c.unlisted.length} unlisted scripts`);
  process.exit(r.broken.length || c.unknown.length || c.unlisted.length ? 1 : 0);
}
