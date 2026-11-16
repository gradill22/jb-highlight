// The MyST plugin loads in a real Jupyter Book build and injects the widget on every page,
// whether myst.yml points at a local file or at a URL (which MyST downloads on its own).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginFile = path.join(repo, "dist/myst-annotate.mjs");

// Run jupyter-book's JS entry point with node: node_modules/.bin/jupyter-book is a
// shell script (or a .cmd file on Windows), which execFile cannot run everywhere.
const require = createRequire(import.meta.url);
const jupyterBookPkg = require.resolve("jupyter-book/package.json");
const jupyterBook = path.join(path.dirname(jupyterBookPkg), require(jupyterBookPkg).bin["jupyter-book"]);

/** Build a two-page book whose myst.yml lists `pluginEntry`, and check the output. */
const buildAndCheck = async function (pluginEntry) {
  const book = await fs.mkdtemp(path.join(os.tmpdir(), "myst-annotate-"));
  try {
    await fs.writeFile(path.join(book, "myst.yml"), [
      "version: 1",
      "project:",
      "  title: Test",
      "  plugins:",
      `    - ${await pluginEntry(book)}`,
      "  toc:",
      "    - file: index.md",
      "    - file: sub/page.md",
      "site:",
      // The real book theme is downloaded at build time; a stub is enough to process content.
      "  template: ./stub",
    ].join("\n"));
    await fs.mkdir(path.join(book, "stub"));
    await fs.writeFile(path.join(book, "stub/template.yml"), "myst: v1\nkind: site\n");
    await fs.mkdir(path.join(book, "sub"));
    await fs.writeFile(path.join(book, "index.md"), "# Home\n\nSome text.\n");
    await fs.writeFile(path.join(book, "sub/page.md"), "# Nested\n\nMore text.\n");

    const { stdout, stderr } = await promisify(execFile)(process.execPath, [jupyterBook, "build", "--site"], { cwd: book });
    const log = stdout + stderr;
    assert.match(log, /myst-annotate .* loaded: 0 directives, 0 roles, 1 transform/);
    assert.doesNotMatch(log, /⛔|Error/, log);

    const assets = await fs.readdir(path.join(book, "_build/site/public"));
    const widgets = assets.filter((f) => /^myst-annotate-widget-[0-9a-f]+\.js$/.test(f));
    assert.equal(widgets.length, 1, `one widget asset in ${assets}`);
    const widget = await fs.readFile(path.join(book, "_build/site/public", widgets[0]), "utf8");
    assert.equal(widget, await fs.readFile(path.join(repo, "dist/widget.js"), "utf8"), "the bundled widget");

    for (const page of ["index", "page"]) {
      const json = await fs.readFile(path.join(book, `_build/site/content/${page}.json`), "utf8");
      assert.ok(json.includes(`"type":"anywidget","id":"myst-annotate","esm":"/${widgets[0]}"`), `${page} has the widget`);
    }
  } finally {
    await fs.rm(book, { recursive: true, force: true });
  }
};

test("plugin listed as a local path (installed as npm would)", { timeout: 300_000 }, async () => {
  await buildAndCheck(async (book) => {
    // Lay the plugin out as `npm install myst-annotate` does. Keeping it inside the book also
    // keeps it on the same drive on Windows, where paths cannot be relative across drives.
    const dir = path.join(book, "node_modules/myst-annotate/dist");
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(pluginFile, path.join(dir, "myst-annotate.mjs"));
    return "node_modules/myst-annotate/dist/myst-annotate.mjs";
  });
});

test("plugin listed as a URL (MyST downloads only that one file)", { timeout: 300_000 }, async () => {
  const source = await fs.readFile(pluginFile);
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/javascript" });
    res.end(source);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await buildAndCheck(() => `http://127.0.0.1:${server.address().port}/myst-annotate.mjs`);
  } finally {
    server.close();
  }
});
