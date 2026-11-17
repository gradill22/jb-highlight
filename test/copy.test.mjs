// Copying text: selection toolbar, clicked highlight, annotation popover, sidebar highlight rows.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  launch, newPage, highlights, selectText, clickText, ui, floatVisible, readClipboard,
} from "./helpers.mjs";

const PAGES = {
  "/book/index": "<h1>Page One</h1><p id=\"p1\">Alpha beta gamma delta epsilon zeta eta theta.</p><p id=\"p2\">Second paragraph with more words here.</p>",
};
const H1 = 8; // the article text starts with the h1 "Page One"

const labels = (locator) => locator.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const toast = (page) => ui(page, ".ma-toast");
/** Copying is asynchronous: wait for the message, then return its text. */
const toastText = async (page) => {
  await toast(page).waitFor({ state: "visible" });
  return toast(page).textContent();
};

let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

for (const secure of [true, false]) {
  test(`Copy in the selection toolbar copies the exact selection and keeps it selected (${secure ? "https: Clipboard API" : "http: copy-command fallback"})`, async () => {
    const page = await newPage(browser, { pages: PAGES, secure });
    await page.open("/book/index");
    await selectText(page, "#p2", 0, 7); // "Second " (with its trailing space)
    await ui(page, ".ma-float .ma-copy").click();
    assert.equal(await floatVisible(page), false, "toolbar closes");
    assert.equal(await page.evaluate(() => getSelection().toString()), "Second ", "text stays selected");
    assert.equal(await toastText(page), "Copied");
    assert.equal(await readClipboard(page), "Second ");
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

describe("copy buttons", () => {
  let page;
  const t = Date.now();
  before(async () => {
    page = await newPage(browser, { pages: PAGES, secure: true });
    await page.open("/book/index");
    await page.evaluate((record) => localStorage.setItem("myst-annotate:/book/index", JSON.stringify(record)), {
      title: "Page One",
      // Yellow " beta gamma delta epsilon " (spaces at both ends) with magenta "gamma delta" on top.
      highlights: [
        { id: "y", start: H1 + 5, end: H1 + 31, color: "yellow", text: " beta gamma delta epsilon " },
        { id: "m", start: H1 + 11, end: H1 + 22, color: "magenta", text: "gamma delta" },
      ],
      annotations: [
        { id: "n1", start: H1 + 39, end: H1 + 44, text: "theta", body: "**First** note", created: t },
        { id: "n2", start: H1 + 36, end: H1 + 45, text: "eta theta", body: "Second note", created: t },
      ],
      pageNotes: [{ id: "p", body: "A page note", created: t }],
    });
    await page.reload();
    await page.waitForFunction(() => window.ready);
  });

  test("both toolbars end with the colours, then Copy, then ✕", async () => {
    await selectText(page, "#p2", 0, 6);
    const order = () => ui(page, ".ma-float").evaluate((el) => [...el.children].slice(-4).map((c) =>
      c.getAttribute("data-color") || c.className));
    assert.deepEqual(await order(), ["clear", "ma-divider", "ma-icon-btn ma-copy", "ma-dismiss"]);
    await page.mouse.click(5, 5);
    await clickText(page, "#p1", 7, 9); // yellow "beta"
    assert.deepEqual(await order(), ["clear", "ma-divider", "ma-icon-btn ma-copy", "ma-dismiss"]);
  });

  test("Copy on a clicked highlight copies the whole highlight, trimmed", async () => {
    await ui(page, ".ma-float .ma-copy").click();
    assert.equal(await floatVisible(page), false);
    assert.equal(await toastText(page), "Copied");
    assert.equal(await readClipboard(page), "beta gamma delta epsilon");
    assert.equal((await highlights(page))["myst-annotate-yellow"].length, 2, "highlights unchanged");
  });

  test("each note in the popover has its own Copy, which copies that note's annotated text", async () => {
    await clickText(page, "#p1", 40, 43); // inside "theta": both notes
    const noteEls = ui(page, ".ma-float .ma-pop-note");
    assert.equal(await noteEls.count(), 2);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await labels(noteEls.nth(i).locator(".ma-pop-foot button")),
        ["Copy annotated text", "Highlight", "Edit", "Delete"]);
    }
    const second = await noteEls.nth(1).getAttribute("data-id");
    await noteEls.nth(1).getByRole("button", { name: "Copy annotated text" }).click();
    assert.equal(await floatVisible(page), false);
    assert.equal(await readClipboard(page), second === "n2" ? "eta theta" : "theta");
    assert.equal(await ui(page, ".ma-float .ma-pop-hl .ma-copy").count(), 0, "no Copy on the popover's highlight row");
  });

  test("Highlights-tab rows: Annotate, Copy, Delete; Copy copies the trimmed highlight and says so by the row", async () => {
    // Clicking annotated text in the previous test already opened the sidebar.
    if (!(await ui(page, ".ma-sidebar.is-open").count())) await ui(page, ".ma-edge").click();
    await ui(page, '.ma-tab[data-tab="highlights"]').click();
    const row = ui(page, '.ma-list [data-id="y"]');
    assert.deepEqual(await labels(row.locator("button")), ["Annotate highlight", "Copy highlight", "Delete highlight"]);
    await row.getByRole("button", { name: "Copy highlight" }).click();
    assert.equal(await toastText(page), "Copied");
    const rowBox = await row.boundingBox();
    const toastBox = await toast(page).boundingBox();
    assert.equal(await readClipboard(page), "beta gamma delta epsilon");
    assert.ok(toastBox.y + toastBox.height <= rowBox.y + 1 && rowBox.y - toastBox.y < 60, "message just above the row");
    assert.ok(toastBox.x >= rowBox.x && toastBox.x + toastBox.width <= rowBox.x + rowBox.width, "message within the row's width");
  });

  test("the message disappears after about 1.5 seconds", async () => {
    await page.waitForTimeout(1700);
    assert.equal(await toast(page).isVisible(), false);
  });

  test("annotation and page-note cards in the sidebar have no Copy button", async () => {
    await ui(page, '.ma-tab[data-tab="annotations"]').click();
    assert.equal(await ui(page, ".ma-list .ma-card").count(), 2);
    assert.equal(await ui(page, '.ma-list [aria-label^="Copy"]').count(), 0);
    await ui(page, '.ma-tab[data-tab="pageNotes"]').click();
    assert.equal(await ui(page, '.ma-list [aria-label^="Copy"]').count(), 0);
  });

  test("no page errors", () => assert.deepEqual(page.errors, []));
});
