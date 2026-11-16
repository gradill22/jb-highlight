// Text anchoring: map between DOM ranges and character offsets into the article text.

/** Character offset of a (node, offset) boundary point within root's text. */
export const toTextOffset = function (root, node, offset) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
};

/** Build a Range covering the [start, end) character offsets of root's text. */
export const rangeFromOffsets = function (root, start, end) {
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

/** Find a saved item in the page; falls back to a text search if the page changed. */
export const locate = function (root, item) {
  const range = rangeFromOffsets(root, item.start, item.end);
  if (range && range.toString() === item.text) return range;

  const idx = root.textContent.indexOf(item.text);
  if (idx === -1) return null;
  item.start = idx;
  item.end   = idx + item.text.length;
  return rangeFromOffsets(root, item.start, item.end);
};

/** The current selection as text offsets, or null if it is empty or outside root. */
export const selectionOffsets = function (root) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.toString().trim() === "") return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return {
    start: toTextOffset(root, range.startContainer, range.startOffset),
    end:   toTextOffset(root, range.endContainer,   range.endOffset),
    text:  range.toString(),
    rect:  range.getBoundingClientRect(),
  };
};

/** The first of a range's line boxes that contains viewport point (x, y). */
export const rectAt = function (range, x, y) {
  for (const rect of range.getClientRects()) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return rect;
  }
  return null;
};
