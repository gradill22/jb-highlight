// Build dist/: the MyST plugin and the bundled browser widget (markdown-it + KaTeX included).
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist     = path.join(root, "dist");
const katexDir = path.join(root, "node_modules/katex/dist");

/**
 * KaTeX's stylesheet, split in two: @font-face rules (which only work in the document,
 * not in a shadow root) with the woff2 fonts inlined, and everything else.
 */
async function katexCss() {
  const fontFaces = [];
  const rest = (await fs.readFile(path.join(katexDir, "katex.min.css"), "utf8"))
    .replace(/@font-face\{[^}]*\}/g, (rule) => { fontFaces.push(rule); return ""; });

  const fonts = await Promise.all(fontFaces.map(async (rule) => {
    const file = rule.match(/url\((fonts\/[^)]+\.woff2)\)/)[1];
    const data = (await fs.readFile(path.join(katexDir, file))).toString("base64");
    return rule.replace(/src:[^;}]*/, `src:url(data:font/woff2;base64,${data}) format("woff2")`);
  }));
  return { fonts: fonts.join(""), rest };
}

const katexCssPlugin = {
  name: "katex-css",
  setup(b) {
    b.onResolve({ filter: /^virtual:katex-css$/ }, (args) => ({ path: args.path, namespace: "katex-css" }));
    b.onLoad({ filter: /.*/, namespace: "katex-css" }, async () => {
      const { fonts, rest } = await katexCss();
      return {
        contents: `export const katexFonts = ${JSON.stringify(fonts)};\nexport const katexCss = ${JSON.stringify(rest)};`,
        loader: "js",
      };
    });
  },
};

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist);

await build({
  entryPoints: [path.join(root, "src/widget/index.js")],
  outfile: path.join(dist, "widget.js"),
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  loader: { ".css": "text" },
  plugins: [katexCssPlugin],
  logLevel: "warning",
});

await fs.copyFile(path.join(root, "src/plugin.mjs"), path.join(dist, "myst-annotate.mjs"));

const { size } = await fs.stat(path.join(dist, "widget.js"));
console.log(`dist/myst-annotate.mjs, dist/widget.js (${(size / 1024).toFixed(0)} KB)`);
