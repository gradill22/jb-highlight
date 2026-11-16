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

/** Icon button that keeps the page selection alive when pressed. */
export const iconButton = function (iconName, label, onclick, extra = {}) {
  return h("button", {
    type: "button", class: "ma-icon-btn", title: label, "aria-label": label,
    onmousedown: (e) => e.preventDefault(), onclick, ...extra,
  }, icon(ICONS[iconName]));
};
