// Colour highlighting: selection toolbar, layering, click-to-edit, persistence.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  launch, newPage, highlights, stored, selectText, textBox, clickText, ui, floatVisible, confirmDialog,
} from "./helpers.mjs";

const empty = (h, name) => !h[name] || h[name].length === 0;
const texts = async (page, path) => ((await stored(page, path)) || { highlights: [] }).highlights.map((i) => i.text);

let browser, page;
before(async () => {
  browser = await launch();
  page = await newPage(browser, {
    pages: {
      "/book/index": "<h1>Page One</h1><p id=\"p1\">Some text to highlight here. Another sentence with <strong>bold words</strong> in it.</p><p id=\"p2\">A second paragraph.</p>",
      "/book/page2": "<h1>Page Two</h1><p id=\"c1\">Alpha beta gamma delta epsilon zeta eta theta.</p>",
    },
  });
  await page.open("/book/index");
});
after(() => browser.close());

test("toolbar has Annotate, five swatches and ✕", async () => {
  await selectText(page, "#p2", 0, 8);
  assert.ok(await floatVisible(page));
  assert.equal(await ui(page, ".ma-float .ma-annotate").count(), 1);
  assert.deepEqual(await ui(page, ".ma-float .ma-swatch").evaluateAll((els) => els.map((e) => e.dataset.color)),
    ["yellow", "magenta", "cyan", "green", "red"]);
  assert.equal(await ui(page, ".ma-float .ma-clear").count(), 1);
});

test("drag-select then a swatch highlights in one click", async () => {
  await page.evaluate(() => getSelection().removeAllRanges());
  const box = await page.locator("#p2").boundingBox();
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  assert.ok(await floatVisible(page));
  const dragged = await page.evaluate(() => getSelection().toString());
  await ui(page, '.ma-swatch[data-color="green"]').click();
  assert.deepEqual((await highlights(page))["myst-annotate-green"], [dragged]);
  assert.equal(await floatVisible(page), false);
});

test("selection across an element boundary", async () => {
  await selectText(page, "#p1", 29, 4, "#p1 strong");
  await ui(page, '.ma-swatch[data-color="yellow"]').click();
  assert.deepEqual((await highlights(page))["myst-annotate-yellow"], ["Another sentence with bold"]);
});

test("page DOM is never modified", async () => {
  const html = await page.evaluate(() => document.getElementById("content").innerHTML);
  assert.ok(!html.includes("<mark"));
  assert.ok(html.includes("Another sentence with <strong>bold words</strong>"));
});

test("highlighting over a highlight stacks on top", async () => {
  await selectText(page, "#p1", 37, 45);
  await ui(page, '.ma-swatch[data-color="magenta"]').click();
  const h = await highlights(page);
  assert.deepEqual(h["myst-annotate-yellow"], ["Another ", " with bold"]);
  assert.deepEqual(h["myst-annotate-magenta"], ["sentence"]);
  assert.equal((await stored(page, "/book/index")).highlights.length, 3);
});

test("selections outside the article are ignored", async () => {
  await selectText(page, "#nav", 0, 7);
  assert.equal(await floatVisible(page), false);
});

test("highlights are restored after reload", async () => {
  await page.reload();
  await page.waitForFunction(() => window.ready);
  const h = await highlights(page);
  assert.deepEqual(h["myst-annotate-magenta"], ["sentence"]);
  assert.deepEqual(h["myst-annotate-yellow"], ["Another ", " with bold"]);
  assert.equal(h["myst-annotate-green"].length, 1);
});

test("✕ on a selection asks first; Cancel keeps, Delete removes overlapping highlights", async () => {
  await selectText(page, "#p1", 39, 41);
  await ui(page, ".ma-float .ma-clear").click();
  await confirmDialog(page, "Cancel");
  assert.equal((await stored(page, "/book/index")).highlights.length, 3);

  await selectText(page, "#p1", 39, 41);
  await ui(page, ".ma-float .ma-clear").click();
  await confirmDialog(page, "Delete");
  const h = await highlights(page);
  assert.ok(empty(h, "myst-annotate-magenta") && empty(h, "myst-annotate-yellow"));
  assert.equal((await stored(page, "/book/index")).highlights.length, 1);
});

test("saved offsets fall back to a text search when the page changes", async () => {
  await page.evaluate(() => { window.cleanup(); document.getElementById("content").insertAdjacentHTML("afterbegin", "<p>New intro paragraph.</p>"); });
  await page.evaluate(() => window.mount());
  assert.equal((await highlights(page))["myst-annotate-green"].length, 1);
});

test("navigation cleanup removes the UI and paint; storage is per page", async () => {
  await page.evaluate(() => window.cleanup());
  assert.deepEqual(await highlights(page), {});
  assert.equal(await page.locator("#myst-annotate").count(), 0);
  await page.open("/book/page2");
  assert.deepEqual(await highlights(page), {});
  await selectText(page, "#c1", 0, 5);
  await ui(page, '.ma-swatch[data-color="cyan"]').click();
  assert.deepEqual(await texts(page, "/book/page2"), ["Alpha"]);
  assert.equal((await stored(page, "/book/index")).highlights.length, 1);
});

test("clicking plain text opens nothing; clicking a highlight opens its toolbar above it", async () => {
  await page.evaluate(() => localStorage.setItem("myst-annotate:/book/page2", JSON.stringify({ title: "Page Two", annotations: [], pageNotes: [], highlights: [
    { id: "b", start: 14, end: 18, color: "yellow", text: "beta" },
    { id: "d", start: 25, end: 30, color: "green", text: "delta" },
    { id: "e", start: 44, end: 47, color: "red", text: "eta" }] })));
  await page.reload();
  await page.waitForFunction(() => window.ready);

  await clickText(page, "#c1", 0, 5);
  assert.equal(await floatVisible(page), false);

  const box = await clickText(page, "#c1", 17, 22);
  assert.ok(await floatVisible(page));
  const tip = await ui(page, ".ma-float").boundingBox();
  assert.ok(tip.y + tip.height <= box.top, "toolbar sits above the highlight");
});

test("✕ on a clicked highlight removes only that one (after confirming)", async () => {
  await ui(page, ".ma-float .ma-clear").click();
  await confirmDialog(page);
  assert.deepEqual(await texts(page, "/book/page2"), ["beta", "eta"]);
});

test("a colour on a clicked highlight recolours it", async () => {
  await clickText(page, "#c1", 6, 10);
  await ui(page, '.ma-float .ma-swatch[data-color="cyan"]').click();
  assert.deepEqual((await stored(page, "/book/page2")).highlights.map((i) => i.color), ["cyan", "red"]);
});

test("clicking elsewhere closes the toolbar", async () => {
  await clickText(page, "#c1", 36, 39);
  assert.ok(await floatVisible(page));
  await clickText(page, "#c1", 0, 5);
  assert.equal(await floatVisible(page), false);
});

test("stacked highlights: removing the top one reveals the one below", async () => {
  await page.evaluate(() => localStorage.removeItem("myst-annotate:/book/page2"));
  await page.reload();
  await page.waitForFunction(() => window.ready);
  await selectText(page, "#c1", 6, 30);
  await ui(page, '.ma-swatch[data-color="yellow"]').click();
  await selectText(page, "#c1", 11, 22);
  await ui(page, '.ma-swatch[data-color="magenta"]').click();
  let h = await highlights(page);
  assert.deepEqual(h["myst-annotate-yellow"], ["beta ", " epsilon"]);
  assert.deepEqual(h["myst-annotate-magenta"], ["gamma delta"]);

  await clickText(page, "#c1", 17, 22);
  await ui(page, ".ma-float .ma-clear").click();
  await confirmDialog(page);
  h = await highlights(page);
  assert.deepEqual(h["myst-annotate-yellow"], ["beta gamma delta epsilon"]);
  assert.ok(empty(h, "myst-annotate-magenta"));
});

test("a highlight that fully covers an older one replaces it; clicks act on the visible layer", async () => {
  await selectText(page, "#c1", 0, 35);
  await ui(page, '.ma-swatch[data-color="cyan"]').click();
  assert.deepEqual((await stored(page, "/book/page2")).highlights.map((i) => i.color), ["cyan"]);
  await selectText(page, "#c1", 31, 39);
  await ui(page, '.ma-swatch[data-color="red"]').click();
  const h = await highlights(page);
  assert.deepEqual(h["myst-annotate-cyan"], ["Alpha beta gamma delta epsilon "]);
  assert.deepEqual(h["myst-annotate-red"], ["zeta eta"]);
  await clickText(page, "#c1", 2, 3);
  await ui(page, '.ma-float .ma-swatch[data-color="green"]').click();
  assert.deepEqual((await stored(page, "/book/page2")).highlights.map((i) => i.color), ["green", "red"]);
});

test("toolbar flips below the text when there is no room above", async () => {
  await page.evaluate(() => {
    document.body.style.paddingTop = "0";
    document.getElementById("nav").style.display = "none";
    document.querySelector("h1").style.display = "none";
  });
  const box = await textBox(page, "#c1", 0, 5);
  assert.ok(box.top < 44, `precondition: no room above (top=${box.top})`);
  await clickText(page, "#c1", 2, 3);
  let tip = await ui(page, ".ma-float").boundingBox();
  assert.ok(tip.y >= box.bottom, "highlight toolbar below");
  await page.mouse.click(5, 300);
  await selectText(page, "#c1", 6, 10);
  tip = await ui(page, ".ma-float").boundingBox();
  assert.ok(tip.y >= box.bottom, "selection toolbar below");
});

test("no page errors", () => {
  assert.deepEqual(page.errors, []);
});
