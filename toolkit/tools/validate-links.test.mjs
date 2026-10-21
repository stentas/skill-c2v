import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkCommands, slug, validate } from "./validate-links.mjs";

let root;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "links-"));
  fs.mkdirSync(path.join(root, "sub"));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.writeFileSync(path.join(root, "img.png"), "");
  fs.writeFileSync(path.join(root, "b.md"), "# Second part\n");
  fs.writeFileSync(path.join(root, "sub", "c.md"), "[up](../a.md)\n\n![img](../img.png)\n");
  fs.writeFileSync(path.join(root, "node_modules", "skip.md"), "[bad](nowhere.md)\n");
  fs.writeFileSync(path.join(root, "a.md"), [
    "## Setup and run",
    "",
    "[b](b.md) and [s](#setup-and-run) and [b2](b.md#second-part)",
    "[x](missing.md)",
    "[y](#nope)",
    "[z](b.md#nope)",
    "",
    "```",
    "[ignored](nothing.md)",
    "```",
    "",
    "`[also](ignored.md)`",
    "[ext](https://example.com/) and [mail](mailto:x@y.z)",
    "`b.md` `sub/c.md` `sub/missing.md` `scenes/04-x.html` `tools/<x>.md`",
    "",
  ].join("\n"));
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

test("reports broken links in file order", async () => {
  const r = await validate(root, { external: false });
  assert.equal(r.files, 3);
  assert.deepEqual(r.broken.map((b) => b.target), ["missing.md", "#nope", "b.md#nope", "sub/missing.md"]);
  assert.deepEqual(r.broken.map((b) => [b.file, b.line]), [["a.md", 4], ["a.md", 5], ["a.md", 6], ["a.md", 14]]);
  assert.equal(r.broken[3].reason, "code path not found");
  // Counting choice: only links actually checked count. The https and mailto links are skipped, and so are
  // code paths that are bare names (`b.md`, no slash), placeholders, or whose first dir exists nowhere (`scenes/...`).
  // a.md contributes 6 real links + 2 code paths (sub/c.md, sub/missing.md); sub/c.md contributes 2.
  assert.equal(r.links, 10);
});

const CMD_DOC = "toolkit/README.md";
const cmds = (scripts, docs) => checkCommands({ scripts, docs, commandsDoc: CMD_DOC });

test("checkCommands accepts scripts and pnpm builtins", () => {
  const r = cmds(["render"], [{ file: CMD_DOC, text: "| `pnpm render` |\n```\npnpm install\n```\n" }]);
  assert.deepEqual(r, { unknown: [], unlisted: [] });
});

test("checkCommands reports an unknown command with its line", () => {
  const r = cmds(["render"], [{ file: CMD_DOC, text: "`pnpm render`" }, { file: "README.md", text: "a\n\nRun `pnpm alignn`.\n" }]);
  assert.deepEqual(r.unknown, [{ file: "README.md", line: 3, command: "alignn" }]);
  assert.deepEqual(r.unlisted, []);
});

test("checkCommands reports a script missing from the commands doc", () => {
  const r = cmds(["render", "stills"], [{ file: CMD_DOC, text: "`pnpm render`" }, { file: "README.md", text: "`pnpm stills`" }]);
  assert.deepEqual(r.unlisted, [{ file: CMD_DOC, line: 0, command: "stills" }]);
  assert.deepEqual(r.unknown, []);
});

test("checkCommands de-duplicates per line but not across lines", () => {
  const r = cmds(["render"], [{ file: CMD_DOC, text: "`pnpm render`\n`pnpm nope` and `pnpm nope`\n`pnpm nope`\n" }]);
  assert.deepEqual(r.unknown.map((u) => u.line), [2, 3]);
});

test("checkCommands parses only the command word, not trailing paths", () => {
  const r = cmds(["render"], [{ file: CMD_DOC, text: "```\npnpm render scenes/04.html\npnpm render:all\n```\n" }]);
  assert.deepEqual(r.unknown, [{ file: CMD_DOC, line: 3, command: "render:all" }]);
  assert.deepEqual(r.unlisted, []);
});

test("checkCommands ignores pnpm mentions in prose", () => {
  const r = cmds(["render"], [{ file: CMD_DOC, text: "`pnpm render`" }, { file: "a.md", text: "Here pnpm resolves it, see `pnpm init`.\n" }]);
  assert.deepEqual(r, { unknown: [], unlisted: [] });
});

test("checkCommands reports the line inside a fenced block", () => {
  const r = cmds(["render"], [{ file: CMD_DOC, text: "`pnpm render`" }, { file: "a.md", text: "intro\n```sh\npnpm alignn\n```\npnpm after\n" }]);
  assert.deepEqual(r.unknown, [{ file: "a.md", line: 3, command: "alignn" }]);
});

test("slug follows GitHub style", () => {
  assert.equal(slug("Config reference (`video.config.json`)"), "config-reference-videoconfigjson");
  assert.equal(slug("Engine API"), "engine-api");
});
