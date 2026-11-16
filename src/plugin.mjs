// myst-annotate: MyST / Jupyter Book 2 plugin that adds the highlight & annotation widget to every page.
//
// The book theme is a React app and has no option for custom <script> tags, so the
// widget is injected as an `anywidget` node. MyST copies the referenced ES module into
// the build output and the theme imports it in the browser.

import path from "node:path";
import { fileURLToPath } from "node:url";

const WIDGET_PATH = fileURLToPath(new URL("./widget.js", import.meta.url));

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
