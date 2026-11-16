/**
 * highlight.js — Custom text highlighting for Jupyter Book 2 (MyST).
 *
 * This is an anywidget ES module; inject-highlight.mjs adds it to every page.
 * Select text in the page, then pick a colour from the floating toolbar.
 *
 * Highlights are drawn with the CSS Custom Highlight API, so the page DOM (which
 * the React-based theme owns) is never modified. They are persisted to
 * localStorage keyed by page pathname, as character offsets into the article
 * text, and restored automatically when the page is shown.
 */

// ── Configuration ──────────────────────────────────────────────────────────────

const COLORS = [
  { id: "yellow",  label: "Yellow",  hex: "#FFD600", fg: "#333" },
  { id: "magenta", label: "Magenta", hex: "#F800A0", fg: "#fff" },
  { id: "cyan",    label: "Cyan",    hex: "#00BCD4", fg: "#fff" },
  { id: "green",   label: "Green",   hex: "#4CAF50", fg: "#fff" },
  { id: "red",     label: "Red",     hex: "#F44336", fg: "#fff" },
];

const STORAGE_KEY_PREFIX = "jb-highlights:";
const TOOLTIP_ID         = "highlight-tooltip";
const STYLE_ID           = "jb-highlight-styles";
const HIGHLIGHT_PREFIX   = "jb-highlight-";

// The widget renders inside a shadow root, so page-level styles go in <head>.
const STYLES = `
#${TOOLTIP_ID} {
  position: absolute; z-index: 1000; display: none; align-items: center; gap: 6px;
  padding: 6px 8px; background: #fff; border: 1px solid rgba(0,0,0,.15);
  border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,.15);
}
#${TOOLTIP_ID} .hl-btn {
  width: 22px; height: 22px; padding: 0; border-radius: 50%;
  border: 2px solid rgba(0,0,0,.15); cursor: pointer;
}
#${TOOLTIP_ID} .hl-btn:hover { transform: scale(1.15); }
#${TOOLTIP_ID} .hl-divider { width: 1px; height: 20px; background: rgba(0,0,0,.15); }
#${TOOLTIP_ID} .hl-clear-btn {
  padding: 0 4px; border: none; background: none; color: #555;
  font-size: 14px; line-height: 1; cursor: pointer;
}
html.dark #${TOOLTIP_ID} { background: #1f2937; border-color: rgba(255,255,255,.2); }
html.dark #${TOOLTIP_ID} .hl-clear-btn { color: #ddd; }
${COLORS.map(({ id, hex, fg }) =>
  `::highlight(${HIGHLIGHT_PREFIX}${id}) { background-color: ${hex}; color: ${fg}; }`
).join("\n")}
`;

const injectStyles = function () {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
};

// ── Text offsets ───────────────────────────────────────────────────────────────

/** Character offset of a (node, offset) boundary point within root's text. */
const toTextOffset = function (root, node, offset) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
};

/** Build a Range covering the [start, end) character offsets of root's text. */
const rangeFromOffsets = function (root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range  = document.createRange();
  let pos = 0;
  let startSet = false;
  let node;
  while ((node = walker.nextNode())) {
    const next = pos + node.length;
    if (!startSet && start < next) {
      range.setStart(node, start - pos);
      startSet = true;
    }
    if (startSet && end <= next) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos = next;
  }
  return null;
};

/** Find a saved highlight in the page; falls back to a text search if the page changed. */
const locate = function (root, item) {
  const range = rangeFromOffsets(root, item.start, item.end);
  if (range && range.toString() === item.text) return range;

  const idx = root.textContent.indexOf(item.text);
  if (idx === -1) return null;
  item.start = idx;
  item.end   = idx + item.text.length;
  return rangeFromOffsets(root, item.start, item.end);
};

// ── Widget ─────────────────────────────────────────────────────────────────────

const render = function ({ el }) {
  if (!(window.CSS && CSS.highlights)) {
    console.warn("[jb-highlight] This browser does not support the CSS Custom Highlight API.");
    return;
  }

  // Highlights are limited to the page's article; `el` lives in a shadow root inside it.
  const host = el.getRootNode().host;
  const root = (host && host.closest("article")) || document.body;
  const storageKey = STORAGE_KEY_PREFIX + location.pathname;

  let items = [];   // [{ start, end, color, text }], later items are drawn on top
  let painted = []; // [{ item, range }] for the visible piece of each highlight
  let activeItem = null; // saved highlight the tooltip acts on after it is clicked

  // ── Persistence ──

  const load = function () {
    try {
      items = JSON.parse(localStorage.getItem(storageKey)) || [];
    } catch {
      items = [];
    }
  };

  const save = function () {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (e) {
      console.warn("[jb-highlight] Could not persist highlights:", e);
    }
  };

  // ── Painting ──

  const clearPaint = function () {
    COLORS.forEach(({ id }) => CSS.highlights.delete(HIGHLIGHT_PREFIX + id));
  };

  /** Split overlapping highlights into pieces, each owned by the topmost (latest) highlight. */
  const visibleSegments = function () {
    const found = items.filter((item) => locate(root, item));
    const cuts = [...new Set(found.flatMap((i) => [i.start, i.end]))].sort((a, b) => a - b);
    const segments = [];
    for (let k = 0; k < cuts.length - 1; k++) {
      const start = cuts[k];
      const end   = cuts[k + 1];
      const item  = found.findLast((i) => i.start <= start && i.end >= end);
      if (!item) continue;
      const prev = segments[segments.length - 1];
      if (prev && prev.item === item && prev.end === start) prev.end = end;
      else segments.push({ start, end, item });
    }
    return segments;
  };

  const paint = function () {
    clearPaint();
    painted = [];
    visibleSegments().forEach(({ start, end, item }) => {
      const range = rangeFromOffsets(root, start, end);
      if (!range) return;
      painted.push({ item, range });
      const name = HIGHLIGHT_PREFIX + item.color;
      if (!CSS.highlights.has(name)) CSS.highlights.set(name, new Highlight());
      CSS.highlights.get(name).add(range);
    });
  };

  // ── Highlight application ──

  /** The current selection as text offsets, or null if it is empty or outside root. */
  const selectionOffsets = function () {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    return {
      start: toTextOffset(root, range.startContainer, range.startOffset),
      end:   toTextOffset(root, range.endContainer,   range.endOffset),
      text:  range.toString(),
    };
  };

  /** Drop every saved highlight that overlaps [start, end). */
  const removeOverlapping = function ({ start, end }) {
    items = items.filter((item) => item.end <= start || item.start >= end);
  };

  const applyHighlight = function (colorId) {
    if (activeItem) {
      activeItem.color = colorId;
      save();
      paint();
      return;
    }
    const sel = selectionOffsets();
    if (!sel) return;
    // The new highlight goes on top; older ones it fully covers would never show again.
    items = items.filter((item) => item.start < sel.start || item.end > sel.end);
    items.push({ ...sel, color: colorId });
    window.getSelection().removeAllRanges();
    save();
    paint();
  };

  const removeHighlightAtSelection = function () {
    if (activeItem) {
      items = items.filter((item) => item !== activeItem);
      save();
      paint();
      return;
    }
    const sel = selectionOffsets();
    if (!sel) return;
    removeOverlapping(sel);
    window.getSelection().removeAllRanges();
    save();
    paint();
  };

  // ── Tooltip ──

  const buildTooltip = function () {
    const tip = document.createElement("div");
    tip.id = TOOLTIP_ID;
    tip.setAttribute("role", "toolbar");
    tip.setAttribute("aria-label", "Highlight color picker");

    COLORS.forEach(({ id, hex, label }) => {
      const btn = document.createElement("button");
      btn.className = "hl-btn";
      btn.title = `Highlight ${label}`;
      btn.style.backgroundColor = hex;
      btn.dataset.color = id;
      btn.setAttribute("aria-label", `Highlight in ${label}`);
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep the selection alive
        applyHighlight(id);
        hideTooltip();
      });
      tip.appendChild(btn);
    });

    // Divider + clear button
    const divider = document.createElement("span");
    divider.className = "hl-divider";
    tip.appendChild(divider);

    const clear = document.createElement("button");
    clear.className = "hl-clear-btn";
    clear.title = "Remove highlight";
    clear.setAttribute("aria-label", "Remove highlight");
    clear.textContent = "✕";
    clear.addEventListener("mousedown", (e) => {
      e.preventDefault();
      removeHighlightAtSelection();
      hideTooltip();
    });
    tip.appendChild(clear);

    document.body.appendChild(tip);
    return tip;
  };

  const tooltip = buildTooltip();

  /** Show the tooltip centred on x, above `top`, or below `bottom` if there is no room above. */
  const showTooltip = function (x, top, bottom) {
    tooltip.style.display = "flex";

    const tw = tooltip.offsetWidth  || 200;
    const th = tooltip.offsetHeight || 40;
    const margin = 8;

    let left = x - tw / 2;
    let y    = top - th - margin;
    if (y < margin) y = Math.min(bottom + margin, window.innerHeight - th - margin);

    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
    y    = Math.max(margin, y);

    tooltip.style.left = `${left + window.scrollX}px`;
    tooltip.style.top  = `${y    + window.scrollY}px`;
  };

  const hideTooltip = function () {
    tooltip.style.display = "none";
    activeItem = null;
  };

  /** The visible highlight (and its line box) under viewport point (x, y), if any. */
  const highlightAt = function (x, y) {
    for (const { item, range } of painted) {
      for (const rect of range.getClientRects()) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return { item, rect };
        }
      }
    }
    return null;
  };

  // ── Event wiring ──

  const onSelectionChange = function () {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === "" ||
        !root.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      // Only hide if the mouse isn't over the tooltip and it isn't open for a clicked highlight
      if (tooltip.matches(":hover") || activeItem) return;
      hideTooltip();
      return;
    }

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width) return;
    showTooltip(rect.left + rect.width / 2, rect.top, rect.bottom);
  };

  const onMousedown = function (e) {
    if (tooltip.contains(e.target)) return; // click inside tooltip — handled by buttons
    hideTooltip();
  };

  // Clicking an existing highlight opens the tooltip for it (recolour or remove).
  const onClick = function (e) {
    if (tooltip.contains(e.target)) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return; // a text selection — handled by selectionchange
    const hit = highlightAt(e.clientX, e.clientY);
    if (!hit) return;
    activeItem = hit.item;
    showTooltip(hit.rect.left + hit.rect.width / 2, hit.rect.top, hit.rect.bottom);
  };

  // ── Init ──

  injectStyles();
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mousedown", onMousedown);
  document.addEventListener("click", onClick);
  load();
  paint();

  // Called by the theme when the page is left (client-side navigation).
  return function cleanup() {
    document.removeEventListener("selectionchange", onSelectionChange);
    document.removeEventListener("mousedown", onMousedown);
    document.removeEventListener("click", onClick);
    tooltip.remove();
    clearPaint();
  };
};

export default { render };
