// Annotations, popover, sidebar, page notes, orphans, book view, shortcuts, mobile, dark mode.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  launch, newPage, highlights, stored, selectText, clickText, ui, floatVisible, confirmDialog,
} from "./helpers.mjs";

const PAGES = {
  "/book/index": "<h1>Page One</h1><p id=\"p1\">Alpha beta gamma delta epsilon zeta eta theta.</p><p id=\"p2\">Second paragraph with more words here.</p>",
  "/book/page2": "<h1>Page Two</h1><p id=\"q1\">Lorem ipsum dolor sit amet.</p>",
};
// Offsets into the article text, which starts with the h1 "Page One" (8 characters).
const H1 = 8;

const notes = async (page, path = "/book/index") => ((await stored(page, path)) || { annotations: [] }).annotations;
const card = (page, id) => ui(page, `.ma-list [data-id="${id}"]`);
const sidebarOpen = (page) => ui(page, ".ma-sidebar.is-open").count().then((n) => n === 1);

const seed = async function (page, path, record) {
  await page.evaluate(([p, r]) => localStorage.setItem("myst-annotate:" + p,
    JSON.stringify({ title: "", highlights: [], annotations: [], pageNotes: [], ...r })), [path, record]);
};
const reload = async function (page) {
  await page.reload();
  await page.waitForFunction(() => window.ready);
};

let browser;
before(async () => { browser = await launch(); });
after(() => browser.close());

describe("creating and editing annotations", () => {
  let page;
  before(async () => {
    page = await newPage(browser, { pages: PAGES });
    await page.open("/book/index");
  });

  test("Annotate opens the sidebar with a new card in edit mode, underlined in the page", async () => {
    await selectText(page, "#p1", 6, 16);
    await ui(page, ".ma-float .ma-annotate").click();
    assert.ok(await sidebarOpen(page));
    const [item] = await notes(page);
    assert.equal(item.text, "beta gamma");
    assert.equal(item.created, null);
    assert.deepEqual((await highlights(page))["myst-annotate-note"], ["beta gamma"]);

    const textarea = card(page, item.id).locator("textarea");
    assert.ok(await textarea.evaluate((el) => el.getRootNode().activeElement === el), "editor focused");
    assert.equal(await card(page, item.id).locator(".ma-quote").textContent(), "beta gamma");
    assert.ok(await card(page, item.id).getByRole("button", { name: "Save" }).isDisabled());
  });

  test("Save stores the Markdown body and renders it with math", async () => {
    await page.keyboard.type("**Key** idea: $x^2$");
    const [item] = await notes(page);
    assert.equal(item.draft, "**Key** idea: $x^2$", "draft saved while typing");
    await card(page, item.id).getByRole("button", { name: "Save" }).click();

    const [saved] = await notes(page);
    assert.equal(saved.body, "**Key** idea: $x^2$");
    assert.equal(saved.draft, undefined);
    assert.ok(saved.created > 0);
    const body = card(page, item.id).locator(".ma-md");
    assert.equal(await body.locator("strong").textContent(), "Key");
    assert.equal(await body.locator(".katex").count(), 1);
    assert.equal(await card(page, item.id).locator(".ma-meta").textContent(), "just now");
  });

  test("Edit with Preview, then Save marks it edited", async () => {
    const [item] = await notes(page);
    await card(page, item.id).getByRole("button", { name: "Edit" }).click();
    const textarea = card(page, item.id).locator("textarea");
    assert.equal(await textarea.inputValue(), "**Key** idea: $x^2$");
    await textarea.fill("Changed $$y$$");
    await card(page, item.id).getByRole("button", { name: "Preview" }).click();
    assert.equal(await card(page, item.id).locator(".ma-preview .katex-display").count(), 1);
    await card(page, item.id).getByRole("button", { name: "Save" }).click();

    const [saved] = await notes(page);
    assert.equal(saved.body, "Changed $$y$$");
    assert.ok(saved.updated >= saved.created);
    assert.match(await card(page, item.id).locator(".ma-meta").textContent(), /just now · edited just now/);
  });

  test("Cancel on a never-saved annotation removes it", async () => {
    await selectText(page, "#p2", 0, 6);
    await ui(page, ".ma-float .ma-annotate").click();
    assert.equal((await notes(page)).length, 2);
    const id = (await notes(page))[1].id;
    await card(page, id).getByRole("button", { name: "Cancel" }).click();
    assert.equal((await notes(page)).length, 1);
    assert.deepEqual((await highlights(page))["myst-annotate-note"], ["beta gamma"]);
  });

  test("an unsaved draft survives a reload and comes back in edit mode", async () => {
    await selectText(page, "#p2", 0, 6);
    await ui(page, ".ma-float .ma-annotate").click();
    await page.keyboard.type("half-written");
    await reload(page);
    assert.equal(await sidebarOpen(page), false, "sidebar does not open by itself");
    await ui(page, ".ma-edge").click();
    const draft = (await notes(page)).find((n) => n.text === "Second");
    assert.equal(await card(page, draft.id).locator("textarea").inputValue(), "half-written");
    await card(page, draft.id).getByRole("button", { name: "Save" }).click();
    assert.equal((await notes(page)).find((n) => n.id === draft.id).body, "half-written");
  });

  test("edge tab shows the number of annotations and page notes", async () => {
    assert.equal(await ui(page, ".ma-edge-count").textContent(), "2");
  });

  test("no page errors", () => assert.deepEqual(page.errors, []));
});

describe("clicking annotated text", () => {
  let page;
  before(async () => {
    page = await newPage(browser, { pages: PAGES });
    await page.open("/book/index");
    const t = Date.now();
    await seed(page, "/book/index", {
      highlights: [{ id: "h", start: H1 + 17, end: H1 + 22, color: "yellow", text: "delta" }],
      annotations: [
        { id: "n1", start: H1 + 11, end: H1 + 22, text: "gamma delta", body: "First **note**", created: t },
        { id: "n2", start: H1 + 17, end: H1 + 30, text: "delta epsilon", body: "Second note", created: t },
      ],
    });
    await reload(page);
  });

  test("opens a popover with every note under the point and focuses their cards", async () => {
    await clickText(page, "#p1", 18, 20); // inside "delta": both notes and the highlight
    const popNotes = ui(page, ".ma-float .ma-pop-note");
    assert.equal(await popNotes.count(), 2);
    assert.equal(await popNotes.first().locator("strong").textContent(), "note");
    assert.ok(await sidebarOpen(page));
    assert.deepEqual(await ui(page, ".ma-list .is-focused").evaluateAll((els) => els.map((e) => e.dataset.id)), ["n1", "n2"]);
  });

  test("the highlight under the point gets a swatch row that recolours it", async () => {
    assert.equal(await ui(page, ".ma-float .ma-pop-hl .ma-swatch").count(), 5);
    await ui(page, '.ma-float .ma-pop-hl .ma-swatch[data-color="cyan"]').click();
    assert.equal((await stored(page, "/book/index")).highlights[0].color, "cyan");
    const h = await highlights(page);
    assert.deepEqual(h["myst-annotate-cyan"], ["delta"]);
    assert.equal(h["myst-annotate-note"].length, 2, "underlines still drawn over the highlight");
  });

  test("a note without a highlight under it has no swatch row", async () => {
    await clickText(page, "#p1", 12, 14); // "gamma": note n1 only
    assert.equal(await ui(page, ".ma-float .ma-pop-note").count(), 1);
    assert.equal(await ui(page, ".ma-float .ma-pop-hl").count(), 0);
  });

  test("Edit in the popover opens the card editor in the sidebar", async () => {
    await ui(page, ".ma-float .ma-pop-note").getByRole("button", { name: "Edit" }).click();
    assert.equal(await floatVisible(page), false);
    const textarea = card(page, "n1").locator("textarea");
    assert.equal(await textarea.inputValue(), "First **note**");
    assert.ok(await textarea.evaluate((el) => el.getRootNode().activeElement === el));
    await card(page, "n1").getByRole("button", { name: "Cancel" }).click();
    assert.equal((await notes(page)).find((n) => n.id === "n1").body, "First **note**", "saved note kept on Cancel");
  });

  test("Delete in the popover asks first", async () => {
    await clickText(page, "#p1", 12, 14);
    await ui(page, ".ma-float .ma-pop-note").getByRole("button", { name: "Delete" }).click();
    await confirmDialog(page, "Cancel");
    assert.equal((await notes(page)).length, 2);
    await clickText(page, "#p1", 12, 14);
    await ui(page, ".ma-float .ma-pop-note").getByRole("button", { name: "Delete" }).click();
    await confirmDialog(page, "Delete");
    assert.deepEqual((await notes(page)).map((n) => n.id), ["n2"]);
  });

  test("Delete on a sidebar card asks first", async () => {
    await card(page, "n2").getByRole("button", { name: "Delete" }).click();
    await confirmDialog(page, "Delete");
    assert.deepEqual(await notes(page), []);
    assert.equal(await ui(page, ".ma-empty").textContent(), "No annotations yet. Select text and choose Annotate.");
  });

  test("no page errors", () => assert.deepEqual(page.errors, []));
});

describe("sidebar tabs, search, orphans and book view", () => {
  let page;
  before(async () => {
    page = await newPage(browser, { pages: PAGES });
    await page.open("/book/index");
    const t = Date.now() - 864e5;
    await seed(page, "/book/index", {
      title: "Page One",
      highlights: [
        { id: "h1", start: H1 + 0, end: H1 + 5, color: "green", text: "Alpha" },
        { id: "gone", start: 0, end: 4, color: "red", text: "Text that is not on the page" },
      ],
      annotations: [
        { id: "a1", start: H1 + 6, end: H1 + 10, text: "beta", body: "about beta", created: t },
        { id: "o1", start: 0, end: 4, text: "Removed sentence", body: "orphaned note", created: t },
      ],
    });
    await seed(page, "/book/page2", {
      title: "Page Two",
      annotations: [{ id: "q", start: 8 + 6, end: 8 + 11, text: "ipsum", body: "on page two", created: t }],
    });
    await reload(page);
    await page.keyboard.press("Alt+Shift+A");
  });

  test("Alt+Shift+A opens the sidebar", async () => {
    assert.ok(await sidebarOpen(page));
  });

  test("orphaned highlights are dropped; orphaned annotations get an Orphans tab", async () => {
    assert.deepEqual((await stored(page, "/book/index")).highlights.map((h) => h.id), ["h1"]);
    assert.deepEqual(await ui(page, ".ma-tab").evaluateAll((els) => els.map((e) => e.dataset.tab)),
      ["annotations", "highlights", "pageNotes", "orphans"]);
    assert.deepEqual(await ui(page, ".ma-list [data-id]").evaluateAll((els) => els.map((e) => e.dataset.id)), ["a1"]);
    await ui(page, '.ma-tab[data-tab="orphans"]').click();
    assert.deepEqual(await ui(page, ".ma-list [data-id]").evaluateAll((els) => els.map((e) => e.dataset.id)), ["o1"]);
    assert.equal(await card(page, "o1").locator(".ma-quote").textContent(), "Removed sentence");
  });

  test("Highlights tab lists highlights; clicking one scrolls to and flashes it", async () => {
    await ui(page, '.ma-tab[data-tab="highlights"]').click();
    assert.equal(await card(page, "h1").locator(".ma-hl-text").textContent(), "Alpha");
    await card(page, "h1").locator(".ma-hl-text").click();
    assert.deepEqual((await highlights(page))["myst-annotate-flash"], ["Alpha"]);
  });

  test("Page notes: newest first, with timestamps", async () => {
    await ui(page, '.ma-tab[data-tab="pageNotes"]').click();
    assert.equal(await ui(page, ".ma-empty").textContent(), "No page notes yet.");
    for (const text of ["older note", "newer note"]) {
      await ui(page, ".ma-new-note").click();
      await page.keyboard.type(text);
      await ui(page, ".ma-list").getByRole("button", { name: "Save" }).click();
      await page.waitForTimeout(5);
    }
    assert.deepEqual(await ui(page, ".ma-list .ma-md").evaluateAll((els) => els.map((e) => e.textContent.trim())),
      ["newer note", "older note"]);
    assert.equal((await stored(page, "/book/index")).pageNotes.length, 2);
  });

  test("search filters by note text and by quoted text", async () => {
    await ui(page, '.ma-tab[data-tab="annotations"]').click();
    await ui(page, ".ma-search").fill("BETA");
    assert.equal(await ui(page, ".ma-list [data-id]").count(), 1);
    await ui(page, ".ma-search").fill("about");
    assert.equal(await ui(page, ".ma-list [data-id]").count(), 1);
    await ui(page, ".ma-search").fill("nothing like this");
    assert.equal(await ui(page, ".ma-empty").textContent(), "No matches.");
    await ui(page, ".ma-search").fill("");
  });

  test("Whole book groups items by page title", async () => {
    await ui(page, '.ma-seg[data-scope="book"]').click();
    assert.deepEqual(await ui(page, ".ma-group-title").allTextContents(), ["Page One", "Page Two"]);
    assert.equal(await ui(page, '.ma-tab[data-tab="annotations"] .ma-tab-count').textContent(), "2");
  });

  test("clicking another page's item opens that page, its card and its text", async () => {
    await card(page, "q").locator(".ma-md").click();
    await page.waitForURL("**/book/page2");
    await page.waitForFunction(() => window.ready);
    assert.ok(await sidebarOpen(page));
    assert.deepEqual(await ui(page, ".ma-list .is-focused").evaluateAll((els) => els.map((e) => e.dataset.id)), ["q"]);
    assert.deepEqual((await highlights(page))["myst-annotate-flash"], ["ipsum"]);
  });

  test("Alt+Shift+A closes the sidebar again", async () => {
    await page.keyboard.press("Alt+Shift+A");
    assert.equal(await sidebarOpen(page), false);
  });

  test("no page errors", () => assert.deepEqual(page.errors, []));
});

describe("show/hide and keyboard shortcuts", () => {
  let page;
  before(async () => {
    page = await newPage(browser, { pages: PAGES });
    await page.open("/book/index");
    await seed(page, "/book/index", {
      highlights: [{ id: "h", start: H1, end: H1 + 5, color: "green", text: "Alpha" }],
      annotations: [{ id: "a", start: H1 + 6, end: H1 + 10, text: "beta", body: "b", created: 1 }],
    });
    await reload(page);
  });

  test("the eye button hides every mark, is remembered, and can be undone", async () => {
    await ui(page, ".ma-edge").click();
    await ui(page, ".ma-eye").click();
    assert.deepEqual(await highlights(page), {});
    assert.equal(await ui(page, ".ma-eye").getAttribute("aria-pressed"), "true");
    await clickText(page, "#p1", 7, 9);
    assert.equal(await floatVisible(page), false, "hidden marks are not clickable");

    await reload(page);
    assert.deepEqual(await highlights(page), {}, "still hidden after reload");
    await ui(page, ".ma-edge").click();
    await ui(page, ".ma-eye").click();
    const h = await highlights(page);
    assert.deepEqual(h["myst-annotate-green"], ["Alpha"]);
    assert.deepEqual(h["myst-annotate-note"], ["beta"]);
  });

  test("H highlights the selection in the last colour used", async () => {
    await selectText(page, "#p2", 0, 6);
    await ui(page, '.ma-swatch[data-color="magenta"]').click();
    await selectText(page, "#p2", 7, 16);
    await page.keyboard.press("h");
    const h = await highlights(page);
    assert.deepEqual(h["myst-annotate-magenta"], ["Second", "paragraph"]);
  });

  test("A annotates the selection; typing a/h in the editor is just text", async () => {
    await selectText(page, "#p2", 22, 26);
    await page.keyboard.press("a");
    const created = (await notes(page)).find((n) => n.text === "more");
    assert.ok(created, "annotation created");
    await page.keyboard.type("aha");
    assert.equal(await card(page, created.id).locator("textarea").inputValue(), "aha");
    assert.equal((await notes(page)).length, 2);
  });

  test("A and H do nothing without a selection", async () => {
    await page.mouse.click(5, 5);
    const before = JSON.stringify(await stored(page, "/book/index"));
    await page.keyboard.press("h");
    await page.keyboard.press("a");
    assert.equal(JSON.stringify(await stored(page, "/book/index")), before);
  });

  test("no page errors", () => assert.deepEqual(page.errors, []));
});

describe("narrow screens and dark mode", () => {
  test("below 640px the sidebar is full width with its own close button; touch works", async () => {
    const page = await newPage(browser, { pages: PAGES, viewport: { width: 375, height: 700 }, hasTouch: true, isMobile: true });
    await page.open("/book/index");
    await selectText(page, "#p1", 0, 5);
    await ui(page, '.ma-swatch[data-color="yellow"]').tap();
    assert.deepEqual((await highlights(page))["myst-annotate-yellow"], ["Alpha"]);

    await ui(page, ".ma-edge").tap();
    await page.waitForTimeout(300); // slide-in transition
    const box = await ui(page, ".ma-sidebar").boundingBox();
    assert.equal(Math.round(box.width), 375);
    assert.equal(Math.round(box.x), 0);
    assert.equal(await ui(page, ".ma-edge").isVisible(), false);
    await ui(page, ".ma-close").tap();
    await page.waitForTimeout(300);
    assert.equal(await ui(page, ".ma-sidebar").isVisible(), false);
    assert.deepEqual(page.errors, []);
  });

  test("the UI follows the theme's .dark class", async () => {
    const page = await newPage(browser, { pages: PAGES });
    await page.open("/book/index");
    await ui(page, ".ma-edge").click();
    const bg = () => ui(page, ".ma-sidebar").evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(await bg(), "rgb(255, 255, 255)");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    assert.equal(await bg(), "rgb(31, 41, 55)");
  });
});
