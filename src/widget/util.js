// Small DOM and formatting helpers.

/** h("button", { class: "x", onclick: fn, title: "…" }, "text", childNode, [more]) */
export const h = function (tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "html") el.innerHTML = value;
    else if (key in el && typeof value !== "string") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
};

/** Inline SVG icon (24×24 viewBox, stroked). */
export const icon = function (pathData) {
  const ns  = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("ma-icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", pathData);
  svg.append(path);
  return svg;
};

export const ICONS = {
  annotate: "M4 5h16v11H9l-5 4z M8 9h8 M8 12h5",
  edit:     "M4 20h4L19 9l-4-4L4 16z M14 6l4 4",
  trash:    "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13",
  close:    "M6 6l12 12 M18 6L6 18",
  eye:      "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
  eyeOff:   "M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9 M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2",
  note:     "M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5",
};

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const UNITS = [
  ["year",   365 * 864e5],
  ["month",  30 * 864e5],
  ["week",   7 * 864e5],
  ["day",    864e5],
  ["hour",   36e5],
  ["minute", 6e4],
];

/** "3 days ago" */
export const relativeTime = function (ts, now = Date.now()) {
  const diff = ts - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
};

export const fullDate = (ts) => new Date(ts).toLocaleString();

/** Is the event's real target (through shadow roots) a text field? */
export const isEditable = function (e) {
  const target = e.composedPath()[0];
  return target instanceof Element &&
    (target.matches("input, textarea, select") || target.isContentEditable);
};
