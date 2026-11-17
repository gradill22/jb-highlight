/**
 * myst-annotate widget — local highlighting and annotation for Jupyter Book 2 / MyST.
 *
 * An anywidget ES module; the plugin (myst-annotate.mjs) adds it to every page.
 * Marks are drawn with the CSS Custom Highlight API, so the page DOM (owned by the
 * React-based theme) is never modified. Everything is stored in localStorage.
 */
import { katexFonts, katexCss } from "virtual:katex-css";
import uiCss from "./styles.css";
import { locate, rangeFromOffsets, selectionOffsets, rectAt } from "./anchor.js";
import * as store from "./store.js";
import { createFloat } from "./float.js";
import { createSidebar, tabFor } from "./sidebar.js";
import { createDialog } from "./dialog.js";
import { h, isEditable } from "./util.js";

const COLORS = [
  { id: "yellow",  label: "Yellow",  hex: "#FFD600", fg: "#333" },
  { id: "magenta", label: "Magenta", hex: "#F800A0", fg: "#fff" },
  { id: "cyan",    label: "Cyan",    hex: "#00BCD4", fg: "#fff" },
  { id: "green",   label: "Green",   hex: "#4CAF50", fg: "#fff" },
  { id: "red",     label: "Red",     hex: "#F44336", fg: "#fff" },
];

const HOST_ID      = "myst-annotate";
const DOC_STYLE_ID = "myst-annotate-styles";
const HL_PREFIX    = "myst-annotate-";   // CSS highlight names: myst-annotate-<color>
const NOTE_HL      = "myst-annotate-note";
const FLASH_HL     = "myst-annotate-flash";

// Page-level styles. The UI itself lives in a shadow root; these must be in the document:
// ::highlight() rules, KaTeX @font-face rules, and the theme variables the UI inherits.
const DOC_STYLES = `
#${HOST_ID} {
  position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 1000;
  --ma-bg: #fff; --ma-fg: #1f2937; --ma-muted: #6b7280; --ma-border: rgba(0,0,0,.14);
  --ma-surface: #f3f4f6; --ma-accent: #D97706; --ma-focus: #2563eb; --ma-danger: #dc2626; --ma-danger-hover: #b91c1c;
  --ma-shadow: 0 6px 20px rgba(0,0,0,.18);
}
.dark #${HOST_ID} {
  --ma-bg: #1f2937; --ma-fg: #e5e7eb; --ma-muted: #9ca3af; --ma-border: rgba(255,255,255,.16);
  --ma-surface: #111827; --ma-accent: #FBBF24; --ma-focus: #60a5fa; --ma-danger: #dc2626; --ma-danger-hover: #b91c1c;
  --ma-shadow: 0 6px 20px rgba(0,0,0,.5);
}
${COLORS.map(({ id, hex, fg }) =>
  `::highlight(${HL_PREFIX}${id}) { background-color: ${hex}; color: ${fg}; }`).join("\n")}
::highlight(${NOTE_HL}) { text-decoration: underline dotted #D97706 0.15em; }
.dark ::highlight(${NOTE_HL}) { text-decoration-color: #FBBF24; }
::highlight(${FLASH_HL}) { background-color: rgba(37, 99, 235, .3); }
${katexFonts}
`;

const injectDocStyles = function () {
  if (document.getElementById(DOC_STYLE_ID)) return;
  document.head.append(h("style", { id: DOC_STYLE_ID }, DOC_STYLES));
};

/** Split overlapping highlights into pieces, each owned by the topmost (latest) highlight. */
const visibleSegments = function (highlights) {
  const cuts = [...new Set(highlights.flatMap((i) => [i.start, i.end]))].sort((a, b) => a - b);
  const segments = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    const start = cuts[k];
    const end   = cuts[k + 1];
    const item  = highlights.findLast((i) => i.start <= start && i.end >= end);
    if (!item) continue;
    const prev = segments[segments.length - 1];
    if (prev && prev.item === item && prev.end === start) prev.end = end;
    else segments.push({ start, end, item });
  }
  return segments;
};

const LABELS = { annotations: "annotation", pageNotes: "page note" };

/**
 * Put text on the clipboard. The async Clipboard API only exists on HTTPS (and localhost)
 * pages, so plain-HTTP books fall back to the copy command, whose copy event we fill in.
 * Neither way changes the page's selection.
 */
const copyToClipboard = async function (text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const fill = (e) => {
      e.clipboardData.setData("text/plain", text);
      e.preventDefault();
    };
    document.addEventListener("copy", fill, { once: true });
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.removeEventListener("copy", fill);
    }
  }
};

const createApp = function (root) {
  injectDocStyles();
  const host = h("div", { id: HOST_ID });
  const shadow = host.attachShadow({ mode: "open" });
  shadow.append(h("style", {}, katexCss + uiCss));
  document.body.append(host);

  const app = {
    COLORS,
    root,
    shadow,
    path: location.pathname,
    page: null,
    settings: store.loadSettings(),
  };
  app.page = store.loadPage(app.path);

  let painted = { highlights: [], notes: [] }; // [{ item, range }] currently drawn
  let pendingSel = null;                        // selection the toolbar acts on

  // ── Persistence & painting ──

  const pageTitle = () => ((root.querySelector("h1") || {}).textContent || document.title).trim();

  const persist = function () {
    app.page.title = pageTitle();
    store.savePage(app.path, app.page);
  };

  const clearPaint = function () {
    COLORS.forEach(({ id }) => CSS.highlights.delete(HL_PREFIX + id));
    CSS.highlights.delete(NOTE_HL);
  };

  const paint = function () {
    const before = JSON.stringify(app.page);
    clearPaint();
    painted = { highlights: [], notes: [] };

    // Orphans: highlights are dropped, annotations are flagged. Skip while the page has no text yet.
    const hasText = root.textContent.trim() !== "";
    if (hasText) app.page.highlights = app.page.highlights.filter((item) => locate(root, item));
    const notes = [];
    for (const item of app.page.annotations) {
      const range = locate(root, item);
      if (hasText) {
        if (range) delete item.orphan;
        else item.orphan = true;
      }
      if (range) notes.push({ item, range });
    }
    if (JSON.stringify(app.page) !== before) persist();
    if (app.settings.hidden) return;

    for (const { start, end, item } of visibleSegments(app.page.highlights)) {
      const range = rangeFromOffsets(root, start, end);
      if (!range) continue;
      painted.highlights.push({ item, range });
      const name = HL_PREFIX + item.color;
      if (!CSS.highlights.has(name)) CSS.highlights.set(name, new Highlight());
      CSS.highlights.get(name).add(range);
    }
    painted.notes = notes;
    if (notes.length) CSS.highlights.set(NOTE_HL, new Highlight(...notes.map((n) => n.range)));
  };

  /** Apply fn to a page's record (current page or another one), save, and redraw. */
  const mutate = function (path, fn) {
    if (path === app.path) {
      fn(app.page);
      persist();
      paint();
    } else {
      const page = store.loadPage(path);
      fn(page);
      store.savePage(path, page);
    }
    sidebar.render();
  };

  const find = (page, kind, id) => page[kind].find((i) => i.id === id);

  // ── Highlights ──

  const rememberColor = function (color) {
    app.settings.lastColor = color;
    store.saveSettings(app.settings);
  };

  /** Highlight a text range ({ start, end, text }) on this page or, from the book view, another one. */
  app.highlight = function (sel, color, path = app.path) {
    rememberColor(color);
    mutate(path, (page) => {
      // The new highlight goes on top; older ones it fully covers would never show again.
      page.highlights = page.highlights.filter((i) => i.start < sel.start || i.end > sel.end);
      page.highlights.push({ id: store.newId(), start: sel.start, end: sel.end, text: sel.text, color });
    });
  };

  app.recolor = function (item, color) {
    rememberColor(color);
    mutate(app.path, () => { item.color = color; });
  };

  /** Remove every highlight overlapping a text range. */
  app.clearHighlights = function (range, path = app.path) {
    const overlaps = (i) => i.start < range.end && i.end > range.start;
    mutate(path, (page) => { page.highlights = page.highlights.filter((i) => !overlaps(i)); });
  };

  // ── Notes (annotations and page notes) ──

  app.annotate = function (sel) {
    const item = { id: store.newId(), start: sel.start, end: sel.end, text: sel.text, body: "", draft: "", created: null };
    mutate(app.path, (page) => page.annotations.push(item));
    sidebar.open({ tab: "annotations", scope: "page", focus: [item.id], editId: item.id });
  };

  /**
   * Annotate a highlight's whole text (including any part a newer highlight covers),
   * trimmed of leading/trailing spaces. The note is independent of the highlight.
   * `scope` keeps the sidebar in its This page / Whole book view.
   */
  app.annotateHighlight = function (path, highlight, scope = "page") {
    const { start, end, text } = highlight;
    const lead  = text.length - text.trimStart().length;
    const trail = text.length - text.trimEnd().length;
    if (!text.trim()) return;
    const item = {
      id: store.newId(), start: start + lead, end: end - trail, text: text.trim(),
      body: "", draft: "", created: null,
    };
    mutate(path, (page) => page.annotations.push(item));
    sidebar.open({ tab: "annotations", scope, focus: [item.id], editId: item.id });
  };

  app.newPageNote = function () {
    const item = { id: store.newId(), body: "", draft: "", created: null };
    mutate(app.path, (page) => page.pageNotes.unshift(item));
    sidebar.open({ tab: "pageNotes", scope: "page", focus: [item.id], editId: item.id });
  };

  app.startEdit = function (path, kind, id) {
    let item;
    mutate(path, (page) => {
      item = find(page, kind, id);
      if (item && item.draft === undefined) item.draft = item.body;
    });
    sidebar.open({ tab: tabFor(kind, item), focus: [id], editId: id });
  };

  /** Keep unsaved text (no redraw, so the editor keeps focus). */
  app.updateDraft = function (path, kind, id, text) {
    const page = path === app.path ? app.page : store.loadPage(path);
    const item = find(page, kind, id);
    if (!item) return;
    item.draft = text;
    if (path === app.path) persist();
    else store.savePage(path, page);
  };

  app.saveNote = function (path, kind, id) {
    mutate(path, (page) => {
      const item = find(page, kind, id);
      if (!item || !item.draft.trim()) return;
      item.body = item.draft;
      delete item.draft;
      if (item.created) item.updated = Date.now();
      else item.created = Date.now();
    });
  };

  /** Discard the draft; a note that was never saved is removed. */
  app.cancelEdit = function (path, kind, id) {
    mutate(path, (page) => {
      const item = find(page, kind, id);
      if (!item) return;
      if (item.created) delete item.draft;
      else page[kind] = page[kind].filter((i) => i !== item);
    });
  };

  /** Delete an item. Notes ask for confirmation first; highlights are removed at once. */
  app.removeItem = async function (path, kind, id) {
    if (kind !== "highlights" && !(await dialog.confirm(`Delete this ${LABELS[kind]}?`))) return;
    mutate(path, (page) => { page[kind] = page[kind].filter((i) => i.id !== id); });
  };

  // ── Copying ──

  /** Copy text, then briefly say so near `rect` (a viewport rect). */
  app.copy = async function (text, rect) {
    const ok = await copyToClipboard(text);
    toast(ok ? "Copied" : "Couldn't copy", rect);
  };

  let toastTimer = null;
  const toast = function (message, rect) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.left + rect.width / 2 - toastEl.offsetWidth / 2,
      window.innerWidth - toastEl.offsetWidth - margin));
    let top = rect.top - toastEl.offsetHeight - margin;
    if (top < margin) top = rect.bottom + margin;
    toastEl.style.left = `${left}px`;
    toastEl.style.top  = `${top}px`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1500);
  };

  // ── Navigation ──

  /** Scroll to an item on this page, flash it, and mark its card. */
  const reveal = function (kind, id) {
    const item = find(app.page, kind, id);
    if (!item) return;
    sidebar.open({ tab: tabFor(kind, item), focus: [id] });
    if (kind === "pageNotes" || item.orphan) return;
    const range = locate(root, item);
    if (!range) return;
    const rect = range.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top - window.innerHeight / 3, behavior: "smooth" });
    CSS.highlights.set(FLASH_HL, new Highlight(range));
    setTimeout(() => CSS.highlights.delete(FLASH_HL), 1500);
  };

  app.goTo = function (path, kind, id) {
    if (path === app.path) {
      reveal(kind, id);
    } else {
      store.setGoto({ path, kind, id });
      location.href = path;
    }
  };

  app.toggleHidden = function () {
    app.settings.hidden = !app.settings.hidden;
    store.saveSettings(app.settings);
    float.hide();
    paint();
    sidebar.render();
  };

  // ── Selection toolbar actions ──

  const takeSelection = function () {
    const sel = pendingSel;
    pendingSel = null;
    float.hide();
    window.getSelection().removeAllRanges();
    return sel;
  };

  app.annotateSelection  = () => { const sel = takeSelection(); if (sel) app.annotate(sel); };
  app.highlightSelection = (color) => { const sel = takeSelection(); if (sel) app.highlight(sel, color); };
  app.clearSelection     = () => { const sel = takeSelection(); if (sel) app.clearHighlights(sel); };

  // ── UI ──

  const toastEl = h("div", { class: "ma-toast", role: "status", hidden: true });
  shadow.append(toastEl);
  const dialog  = createDialog(shadow);
  const float   = createFloat(app);
  const sidebar = createSidebar(app);

  // ── Events ──

  const inUi = (e) => e.composedPath().includes(host);

  const onSelectionChange = function () {
    const sel = selectionOffsets(root);
    if (sel && sel.rect.width) {
      pendingSel = sel;
      float.showSelection(sel);
      return;
    }
    // Keep the toolbar while the pointer is on it, and keep popovers for clicked marks.
    if (float.mode === "selection" && !float.hovered()) {
      pendingSel = null;
      float.hide();
    }
  };

  const onMousedown = function (e) {
    if (!inUi(e)) float.hide();
  };

  // Clicking marked text opens the popover (annotations) or the highlight toolbar.
  const onClick = function (e) {
    if (inUi(e) || app.settings.hidden) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // a text selection — handled by selectionchange

    const x = e.clientX;
    const y = e.clientY;
    const notes = painted.notes.filter(({ range }) => rectAt(range, x, y));
    const hl = painted.highlights.find(({ range }) => rectAt(range, x, y));
    const hit = notes[0] || hl;
    if (!hit) return;

    const rect = rectAt(hit.range, x, y);
    if (notes.length) {
      const items = notes.map((n) => n.item);
      float.showNotes(items, hl ? hl.item : null, rect);
      sidebar.open({ tab: "annotations", scope: "page", focus: items.map((i) => i.id) });
    } else {
      float.showHighlight(hl.item, rect);
    }
  };

  const onKeydown = function (e) {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === "KeyA") {
      e.preventDefault();
      sidebar.toggle();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || isEditable(e)) return;
    const key = e.key.toLowerCase();
    // A also works in a clicked highlight's toolbar, whose Annotate button advertises it.
    if (float.mode === "highlight" && key === "a") {
      e.preventDefault();
      const highlight = float.activeHighlight;
      float.hide();
      app.annotateHighlight(app.path, highlight);
      return;
    }
    if (float.mode !== "selection" || !pendingSel) return;
    if (key === "a") {
      e.preventDefault();
      app.annotateSelection();
    } else if (key === "h") {
      e.preventDefault();
      app.highlightSelection(app.settings.lastColor);
    }
  };

  // ── Init ──

  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mousedown", onMousedown);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeydown);
  paint();
  sidebar.render();

  const goto = store.takeGoto(app.path);
  if (goto) reveal(goto.kind, goto.id);

  // Called by the theme when the page is left (client-side navigation).
  return function cleanup() {
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("mousedown", onMousedown);
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeydown);
    clearPaint();
    CSS.highlights.delete(FLASH_HL);
    host.remove();
  };
};

const render = function ({ el }) {
  if (!(window.CSS && CSS.highlights)) {
    console.warn("[myst-annotate] This browser does not support the CSS Custom Highlight API.");
    return;
  }
  // Marks are limited to the page's article; `el` lives in a shadow root inside it.
  const anchorHost = el.getRootNode().host;
  const root = (anchorHost && anchorHost.closest("article")) || document.body;
  return createApp(root);
};

export default { render };
