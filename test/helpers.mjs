// Test harness: serves dist/widget.js on a fake origin and mounts it the way
// @myst-theme/anywidget's AnyWidgetRenderer does (shadow root inside the <article>).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const WIDGET = readFileSync(new URL("../dist/widget.js", import.meta.url), "utf8");
export const ORIGIN = "http://book.test";

export const DEFAULT_PAGES = {
  "/book/index": "<h1>Page One</h1><p id=\"p1\">Some text to highlight here. Another sentence with <strong>bold words</strong> in it.</p><p id=\"p2\">A second paragraph.</p>",
  "/book/page2": "<h1>Page Two</h1><p id=\"p1\">Alpha beta gamma delta epsilon zeta eta theta.</p>",
};

const html = (content) => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test book</title></head>
<body style="margin:8px; padding-top:80px; font:16px/1.5 sans-serif">
<nav id="nav">Sidebar navigation text</nav>
<article class="article"><div id="content">${content}</div><div id="host"></div></article>
<script type="module">
  import widget from "/widget.js";
  window.mount = async () => {
    const host = document.getElementById("host");
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const el = document.createElement("div");
    shadow.replaceChildren(el);
    window.cleanup = await widget.render({ model: {}, el });
  };
  await window.mount();
  window.ready = true;
</script></body></html>`;

export const launch = () => chromium.launch();

/** A new page serving `pages` ({ pathname: articleHtml }). */
export const newPage = async function (browser, { pages = DEFAULT_PAGES, ...contextOptions } = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.route(`${ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/widget.js") return route.fulfill({ contentType: "text/javascript", body: WIDGET });
    return route.fulfill({ contentType: "text/html", body: html(pages[pathname] ?? "<p>Missing page</p>") });
  });
  page.open = async (path) => {
    await page.goto(ORIGIN + path);
    await page.waitForFunction(() => window.ready);
  };
  return page;
};

/** { highlightName: [range text, …] } for every registered CSS highlight. */
export const highlights = (page) => page.evaluate(() =>
  Object.fromEntries([...CSS.highlights].map(([name, h]) => [name, [...h].map((r) => r.toString())])));

/** The stored record for a page. */
export const stored = (page, path) => page.evaluate((p) =>
  JSON.parse(localStorage.getItem("myst-annotate:" + p) || "null"), path);

/** Select characters [a, b) of the first text node of `selector` (or across to `endSelector`). */
export const selectText = async function (page, selector, a, b, endSelector) {
  await page.evaluate(([selector, a, b, endSelector]) => {
    const start = document.querySelector(selector).firstChild;
    const end = endSelector ? document.querySelector(endSelector).firstChild : start;
    const range = document.createRange();
    range.setStart(start, a);
    range.setEnd(end, b);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, [selector, a, b, endSelector]);
  await page.waitForTimeout(50);
};

/** Viewport box of characters [a, b) of the first text node of `selector`. */
export const textBox = (page, selector, a, b) => page.evaluate(([selector, a, b]) => {
  const node = document.querySelector(selector).firstChild;
  const range = document.createRange();
  range.setStart(node, a);
  range.setEnd(node, b);
  const r = range.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom };
}, [selector, a, b]);

export const clickText = async function (page, selector, a, b) {
  const box = await textBox(page, selector, a, b);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(50);
  return box;
};

/** Playwright CSS locators pierce the widget's open shadow root. */
export const ui = (page, selector) => page.locator(`#myst-annotate ${selector}`);

export const floatVisible = (page) => ui(page, ".ma-float").isVisible();

export const confirmDialog = async function (page, choice = "Delete") {
  const dialog = ui(page, ".ma-dialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: choice }).click();
  await page.waitForTimeout(50);
};
