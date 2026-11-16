// inject-highlight.mjs
// MyST / Jupyter Book 2 plugin: adds the highlighter widget (highlight.js) to every page.
//
// The book theme is a React app and has no option for custom <script> tags, so the
// widget is injected as an `anywidget` node. MyST copies the referenced ES module into
// the build output and the theme imports it in the browser.

import path from "node:path";
import { fileURLToPath } from "node:url";

const WIDGET_PATH = fileURLToPath(new URL("./highlight.js", import.meta.url));

const injectHighlight = {
  name: "jb-highlight",
  doc: "Append the text highlighter widget to every page.",
  stage: "document",
  plugin: () => (tree, vfile) => {
    tree.children.push({
      type: "block",
      children: [
        {
          type: "anywidget",
          id: "jb-highlight",
          // MyST resolves widget paths relative to the page being built.
          esm: path.relative(path.dirname(vfile.path), WIDGET_PATH),
          model: {},
        },
      ],
    });
  },
};

const plugin = {
  name: "Inject Highlight JavaScript",
  author: "Grady Dillon (ARA)",
  license: "MIT",
  transforms: [injectHighlight],
};

export default plugin;
