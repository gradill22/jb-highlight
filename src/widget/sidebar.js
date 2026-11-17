// The sidebar: tabs, This page / Whole book scope, search, show/hide, and the cards.
import { h, icon, ICONS } from "./util.js";
import { meta, noteBody, iconButton, notePicker } from "./views.js";
import { renderMarkdown } from "./markdown.js";
import * as store from "./store.js";

const TABS = [
  { id: "annotations", label: "Annotations" },
  { id: "highlights",  label: "Highlights" },
  { id: "pageNotes",   label: "Page notes" },
  { id: "orphans",     label: "Orphans" },
];

const EMPTY = {
  annotations: "No annotations yet. Select text and choose Annotate.",
  highlights:  "No highlights yet. Select text and pick a colour.",
  pageNotes:   "No page notes yet.",
  orphans:     "No orphaned annotations.",
};

const byStart = (a, b) => a.start - b.start;
const newestFirst = (a, b) =>
  (b.created ?? Number.MAX_SAFE_INTEGER) - (a.created ?? Number.MAX_SAFE_INTEGER);

/** The items a tab lists for one page. */
const itemsFor = function (page, tab) {
  if (tab === "highlights")  return [...page.highlights].sort(byStart);
  if (tab === "annotations") return page.annotations.filter((a) => !a.orphan).sort(byStart);
  if (tab === "orphans")     return page.annotations.filter((a) => a.orphan);
  return [...page.pageNotes].sort(newestFirst);
};

const kindOf = (tab) => (tab === "highlights" || tab === "pageNotes" ? tab : "annotations");

export const tabFor = (kind, item) => (kind === "annotations" && item && item.orphan ? "orphans" : kind);

export const createSidebar = function (app) {
  const ui = {
    open: false, tab: "annotations", scope: "page", search: "",
    focus: new Set(), preview: new Set(), editFocus: null,
  };

  // ── Static parts ──

  const count = h("span", { class: "ma-edge-count" });
  const edge = h("button", {
    type: "button", class: "ma-edge", title: "Annotations (Alt+Shift+A)",
    "aria-label": "Toggle annotations sidebar", onclick: () => sidebar.toggle(),
  }, icon(ICONS.annotate), count);

  const eye = iconButton("eye", "Hide highlights and underlines", () => app.toggleHidden(), { class: "ma-icon-btn ma-eye" });
  const close = iconButton("close", "Close sidebar", () => sidebar.close(), { class: "ma-icon-btn ma-close" });

  const scopeButtons = [["page", "This page"], ["book", "Whole book"]].map(([id, label]) =>
    h("button", { type: "button", class: "ma-seg", "data-scope": id, onclick: () => { ui.scope = id; render(); } }, label));

  const search = h("input", {
    type: "search", class: "ma-search", placeholder: "Search notes and quotes", "aria-label": "Search",
    oninput: () => { ui.search = search.value; renderList(); },
  });

  const tabBar = h("div", { class: "ma-tabs", role: "tablist" });
  const list = h("div", { class: "ma-list" });

  const panel = h("aside", { class: "ma-sidebar", "aria-label": "Annotations" },
    h("header", { class: "ma-head" },
      h("div", { class: "ma-head-row" }, h("strong", { class: "ma-title" }, "Notes"), eye, close),
      h("div", { class: "ma-segs" }, scopeButtons),
      search,
      tabBar,
    ),
    list,
  );
  app.shadow.append(edge, panel);

  // ── Data ──

  /** [{ path, page }] for the current scope; the current page always uses live state. */
  const groups = function () {
    const current = { path: app.path, page: app.page };
    if (ui.scope === "page") return [current];
    return store.loadBook().map((g) => (g.path === app.path ? current : g));
  };

  const matches = function (item) {
    const q = ui.search.trim().toLowerCase();
    if (!q) return true;
    return [item.text, item.body, item.draft].some((s) => (s || "").toLowerCase().includes(q));
  };

  // ── Cards ──

  const editor = function (path, kind, item) {
    const previewing = ui.preview.has(item.id);
    const save = h("button", {
      type: "button", class: "ma-btn ma-btn-primary", disabled: !item.draft.trim(),
      onclick: () => app.saveNote(path, kind, item.id),
    }, "Save");

    const textarea = h("textarea", {
      class: "ma-textarea", rows: 4, "aria-label": "Note",
      placeholder: "Write a note… Markdown and $math$ are supported.",
      oninput: () => {
        item.draft = textarea.value;
        app.updateDraft(path, kind, item.id, textarea.value);
        save.disabled = !textarea.value.trim();
      },
    });
    textarea.value = item.draft;

    const toggle = (on) => { if (on) ui.preview.add(item.id); else ui.preview.delete(item.id); renderList(); };
    return h("div", { class: "ma-editor" },
      h("div", { class: "ma-segs ma-segs-small" },
        h("button", { type: "button", class: `ma-seg${previewing ? "" : " is-active"}`, onclick: () => toggle(false) }, "Write"),
        h("button", { type: "button", class: `ma-seg${previewing ? " is-active" : ""}`, onclick: () => toggle(true) }, "Preview"),
      ),
      previewing
        ? h("div", { class: "ma-md ma-preview", html: renderMarkdown(item.draft) || "<em>Nothing to preview</em>" })
        : textarea,
      h("div", { class: "ma-editor-actions" },
        h("button", { type: "button", class: "ma-btn", onclick: () => app.cancelEdit(path, kind, item.id) }, "Cancel"),
        save,
      ),
    );
  };

  const card = function (path, kind, item) {
    const focused = ui.focus.has(item.id) ? " is-focused" : "";
    const open = (e) => {
      if (e.target.closest("button, textarea, a, .ma-editor")) return;
      app.goTo(path, kind, item.id);
    };

    if (kind === "highlights") {
      const color = app.COLORS.find((c) => c.id === item.color) || app.COLORS[0];
      return h("div", { class: `ma-card ma-hl-row${focused}`, "data-id": item.id, onclick: open },
        h("span", { class: "ma-dot", style: `background-color: ${color.hex}`, title: color.label }),
        h("span", { class: "ma-hl-text" }, item.text),
        iconButton("annotate", "Annotate highlight", () => app.annotateHighlight(path, item, ui.scope)),
        iconButton("trash", "Delete highlight", () => app.removeItem(path, kind, item.id)),
      );
    }

    const editing = item.draft !== undefined;
    // Annotations whose text is on the page can be highlighted from their card.
    const highlightable = kind === "annotations" && !item.orphan && !editing;
    const { toggle, picker } = highlightable ? notePicker(app, path, item) : {};
    return h("article", { class: `ma-card${focused}`, "data-id": item.id, onclick: open },
      kind === "annotations" ? h("blockquote", { class: "ma-quote" }, item.text) : null,
      editing ? editor(path, kind, item) : noteBody(item.body),
      h("footer", { class: "ma-card-foot" },
        meta(item),
        editing ? null : [
          toggle,
          iconButton("edit", "Edit", () => app.startEdit(path, kind, item.id)),
          iconButton("trash", "Delete", () => app.removeItem(path, kind, item.id)),
        ],
      ),
      picker,
    );
  };

  // ── Rendering ──

  const renderTabs = function (all) {
    const counts = Object.fromEntries(TABS.map(({ id }) =>
      [id, all.reduce((n, g) => n + itemsFor(g.page, id).length, 0)]));
    if (ui.tab === "orphans" && !counts.orphans) ui.tab = "annotations";

    tabBar.replaceChildren(...TABS
      .filter(({ id }) => id !== "orphans" || counts.orphans)
      .map(({ id, label }) => h("button", {
        type: "button", role: "tab", class: `ma-tab${ui.tab === id ? " is-active" : ""}`,
        "data-tab": id, "aria-selected": String(ui.tab === id),
        onclick: () => { ui.tab = id; renderList(); renderTabs(groups()); },
      }, label, h("span", { class: "ma-tab-count" }, counts[id]))));
  };

  const renderList = function () {
    const all = groups();
    const kind = kindOf(ui.tab);
    const sections = [];

    if (ui.scope === "page" && ui.tab === "pageNotes") {
      sections.push(h("button", { type: "button", class: "ma-btn ma-new-note", onclick: () => app.newPageNote() },
        icon(ICONS.note), "New page note"));
    }

    let shown = 0;
    for (const { path, page } of all) {
      const items = itemsFor(page, ui.tab).filter(matches);
      shown += items.length;
      if (!items.length) continue;
      const cards = items.map((item) => card(path, kind, item));
      sections.push(ui.scope === "book"
        ? h("section", { class: "ma-group" },
            h("h3", { class: "ma-group-title", title: path }, page.title || path), cards)
        : cards);
    }
    if (!shown) {
      sections.push(h("p", { class: "ma-empty" },
        ui.search.trim() ? "No matches." : ui.scope === "book" ? "Nothing here in this book yet." : EMPTY[ui.tab]));
    }
    list.replaceChildren(...sections.flat());

    if (ui.editFocus) {
      const textarea = list.querySelector(`[data-id="${ui.editFocus}"] textarea`);
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
      ui.editFocus = null;
    }
    const first = list.querySelector(".is-focused");
    if (first) first.scrollIntoView({ block: "nearest" });
  };

  const render = function () {
    panel.classList.toggle("is-open", ui.open);
    edge.classList.toggle("is-open", ui.open);
    edge.setAttribute("aria-expanded", String(ui.open));
    count.textContent = app.page.annotations.length + app.page.pageNotes.length;

    const hidden = app.settings.hidden;
    eye.replaceChildren(icon(hidden ? ICONS.eyeOff : ICONS.eye));
    eye.setAttribute("aria-pressed", String(hidden));
    eye.title = hidden ? "Show highlights and underlines" : "Hide highlights and underlines";
    eye.setAttribute("aria-label", eye.title);

    scopeButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.scope === ui.scope));
    if (!ui.open) return;
    renderTabs(groups());
    renderList();
  };

  const sidebar = {
    get isOpen() { return ui.open; },
    render,

    /** Open, optionally switching tab/scope, marking cards, and focusing an editor. */
    open({ tab, scope, focus, editId } = {}) {
      ui.open = true;
      if (tab) ui.tab = tab;
      if (scope) ui.scope = scope;
      if (focus) ui.focus = new Set(focus);
      if (editId) ui.editFocus = editId;
      render();
    },
    close() {
      ui.open = false;
      ui.focus.clear();
      render();
    },
    toggle() {
      if (ui.open) sidebar.close();
      else sidebar.open();
    },
  };
  return sidebar;
};
