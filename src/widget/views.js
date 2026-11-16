// View pieces shared by the popover and the sidebar.
import { h, icon, ICONS, relativeTime, fullDate } from "./util.js";
import { renderMarkdown } from "./markdown.js";

/** "3 days ago · edited 2 hours ago" with full dates on hover. */
export const meta = function (item) {
  if (!item.created) return h("div", { class: "ma-meta" }, h("em", {}, "Unsaved draft"));
  return h("div", { class: "ma-meta" },
    h("time", { title: fullDate(item.created) }, relativeTime(item.created)),
    item.updated ? [" · ", h("span", { title: fullDate(item.updated) }, `edited ${relativeTime(item.updated)}`)] : null,
  );
};

export const noteBody = (src) => h("div", { class: "ma-md", html: renderMarkdown(src) });

/** Button that keeps the page selection alive when pressed. */
const button = (attrs, ...children) =>
  h("button", { type: "button", onmousedown: (e) => e.preventDefault(), ...attrs }, ...children);

/** The five colour swatches plus the clear swatch (a white circle with a red slash). */
export const swatchRow = function (app, onPick, onClear) {
  return [
    ...app.COLORS.map(({ id, label, hex }) => button({
      class: "ma-swatch", title: `Highlight ${label}`, "aria-label": `Highlight in ${label}`,
      "data-color": id, style: `background-color: ${hex}`, onclick: () => onPick(id),
    })),
    button({
      class: "ma-swatch ma-swatch-clear", title: "Remove highlight", "aria-label": "Remove highlight",
      "data-color": "clear", onclick: onClear,
    }),
  ];
};

/** ✕ that closes a floating box. */
export const dismissButton = (onclick) =>
  button({ class: "ma-dismiss", title: "Close", "aria-label": "Close", onclick }, "✕");

/**
 * Highlighter icon plus a hidden colour picker for an annotation's quoted text.
 * Returns { toggle, picker }; place the toggle among the card's actions and the picker below them.
 */
export const notePicker = function (app, path, item, { onDone, onToggle } = {}) {
  const range = { start: item.start, end: item.end, text: item.text };
  const picker = h("div", { class: "ma-picker", hidden: true },
    swatchRow(app,
      (color) => { app.highlight(range, color, path); if (onDone) onDone(); },
      () => { app.clearHighlights(range, path); if (onDone) onDone(); }));
  const toggle = iconButton("highlighter", "Highlight", () => {
    picker.hidden = !picker.hidden;
    toggle.setAttribute("aria-expanded", String(!picker.hidden));
    if (onToggle) onToggle();
  }, { "aria-expanded": "false" });
  return { toggle, picker };
};

/** Icon button that keeps the page selection alive when pressed. */
export const iconButton = function (iconName, label, onclick, extra = {}) {
  return h("button", {
    type: "button", class: "ma-icon-btn", title: label, "aria-label": label,
    onmousedown: (e) => e.preventDefault(), onclick, ...extra,
  }, icon(ICONS[iconName]));
};
