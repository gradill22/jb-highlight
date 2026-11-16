// The MyST plugin loads in a real Jupyter Book build and injects the widget on every page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jupyterBook = path.join(repo, "node_modules/.bin/jupyter-book");

test("jupyter-book build loads the plugin and emits the widget", { timeout: 300_000 }, async () => {
  const book = await fs.mkdtemp(path.join(os.tmpdir(), "myst-annotate-"));
  try {
    const plugin = path.relative(book, path.join(repo, "dist/myst-annotate.mjs"));
    await fs.writeFile(path.join(book, "myst.yml"), [
      "version: 1",
      "project:",
      "  title: Test",
      "  plugins:",
      `    - ${plugin}`,
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

    const { stdout, stderr } = await promisify(execFile)(jupyterBook, ["build", "--site"], { cwd: book });
    assert.match(stdout + stderr, /myst-annotate .* loaded: 0 directives, 0 roles, 1 transform/);

    const assets = await fs.readdir(path.join(book, "_build/site/public"));
    const widgets = assets.filter((f) => /^widget-[0-9a-f]+\.js$/.test(f));
    assert.equal(widgets.length, 1, `one widget asset in ${assets}`);

    for (const page of ["index", "page"]) {
      const json = await fs.readFile(path.join(book, `_build/site/content/${page}.json`), "utf8");
      assert.ok(json.includes(`"type":"anywidget","id":"myst-annotate","esm":"/${widgets[0]}"`), `${page} has the widget`);
    }
  } finally {
    await fs.rm(book, { recursive: true, force: true });
  }
});
