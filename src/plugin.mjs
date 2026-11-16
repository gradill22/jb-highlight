// myst-annotate: MyST / Jupyter Book 2 plugin that adds the highlight & annotation widget to every page.
//
// The book theme is a React app and has no option for custom <script> tags, so the
// widget is injected as an `anywidget` node. MyST copies the referenced ES module into
// the build output and the theme imports it in the browser.
//
// The widget is bundled into this file, so the plugin also works on its own, e.g. when
// `plugins:` points at a URL and MyST downloads just this file into _build/cache/.
// It is written next to this file once, because MyST needs a file path to copy.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import WIDGET_SOURCE from "virtual:widget-source";

const hash = createHash("sha256").update(WIDGET_SOURCE).digest("hex").slice(0, 12);
const WIDGET_PATH = fileURLToPath(new URL(`./myst-annotate-widget-${hash}.js`, import.meta.url));
if (!fs.existsSync(WIDGET_PATH)) fs.writeFileSync(WIDGET_PATH, WIDGET_SOURCE);

const injectWidget = {
  name: "myst-annotate",
  doc: "Append the highlight & annotation widget to every page.",
  stage: "document",
  plugin: () => (tree, vfile) => {
    tree.children.push({
      type: "block",
      children: [
        {
          type: "anywidget",
          id: "myst-annotate",
          // MyST resolves widget paths relative to the page being built.
          esm: path.relative(path.dirname(vfile.path), WIDGET_PATH),
          model: {},
        },
      ],
    });
  },
};

const plugin = {
  name: "myst-annotate",
  author: "Grady Dillon",
  license: "MIT",
  transforms: [injectWidget],
};

export default plugin;
