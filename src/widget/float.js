// The floating toolbar / popover shown over the page.
import { h, icon, ICONS } from "./util.js";
import { meta, noteBody, iconButton, swatchRow, dismissButton, notePicker } from "./views.js";

export const createFloat = function (app) {
  const el = h("div", { class: "ma-float", hidden: true });
  app.shadow.append(el);
  let mode = null; // "selection" | "highlight" | "notes"
  let anchorRect = null;
  let activeHighlight = null; // the clicked highlight, while its toolbar is open

  /** Centre on the viewport rect; above it, or below if there is no room above. */
  const position = function (rect) {
    el.hidden = false;
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const margin = 8;

    let left = rect.left + rect.width / 2 - tw / 2;
    let top  = rect.top - th - margin;
    if (top < margin) top = Math.min(rect.bottom + margin, window.innerHeight - th - margin);

    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));
    top  = Math.max(margin, top);

    el.style.left = `${left + window.scrollX}px`;
    el.style.top  = `${top  + window.scrollY}px`;
  };

  const button = (attrs, ...children) =>
    h("button", { type: "button", onmousedown: (e) => e.preventDefault(), ...attrs }, ...children);

  const divider = () => h("span", { class: "ma-divider" });

  /** The Annotate button, identical in the selection and highlight toolbars. */
  const annotateButton = (onclick) =>
    button({ class: "ma-annotate", title: "Annotate (A)", onclick }, icon(ICONS.annotate), h("span", {}, "Annotate"));

  /** Copy button: closes the box, keeps any selection, and shows "Copied" where the box was. */
  const copyButton = (getText, label = "Copy") => iconButton("copy", label, () => {
    const rect = el.getBoundingClientRect();
    float.hide();
    app.copy(getText(), rect);
  }, { class: "ma-icon-btn ma-copy" });

  const show = function (newMode, className, children, rect) {
    mode = newMode;
    anchorRect = rect;
    activeHighlight = null;
    el.className = `ma-float ${className}`;
    el.setAttribute("role", newMode === "notes" ? "dialog" : "toolbar");
    el.replaceChildren(...children.flat(Infinity).filter(Boolean));
    position(rect);
  };

  const float = {
    get mode() { return mode; },
    get activeHighlight() { return activeHighlight; },
    hovered: () => el.matches(":hover"),

    showSelection(sel) {
      show("selection", "ma-toolbar", [
        annotateButton(() => app.annotateSelection()),
        divider(),
        swatchRow(app, (color) => app.highlightSelection(color), () => app.clearSelection()),
        divider(),
        copyButton(() => sel.text, "Copy text"),
        // Close the toolbar but leave the text selected.
        dismissButton(() => float.hide()),
      ], sel.rect);
    },

    /** Toolbar for a clicked highlight, laid out like the selection toolbar: annotate, recolour or remove it. */
    showHighlight(item, rect) {
      show("highlight", "ma-toolbar", [
        annotateButton(() => { float.hide(); app.annotateHighlight(app.path, item); }),
        divider(),
        swatchRow(app,
          (color) => { float.hide(); app.recolor(item, color); },
          () => { float.hide(); app.removeItem(app.path, "highlights", item.id); }),
        divider(),
        copyButton(() => item.text.trim(), "Copy text"),
        dismissButton(() => float.hide()),
      ], rect);
      activeHighlight = item;
    },

    /** Popover for clicked annotations, plus the highlight under the point (if any). */
    showNotes(notes, highlight, rect) {
      show("notes", "ma-popover", [
        dismissButton(() => float.hide()),
        notes.map((item) => {
          const { toggle, picker } = notePicker(app, app.path, item, {
            onDone: () => float.hide(),
            onToggle: () => position(anchorRect),
          });
          return h("div", { class: "ma-pop-note", "data-id": item.id },
            item.created ? noteBody(item.body) : null,
            h("div", { class: "ma-pop-foot" },
              meta(item),
              copyButton(() => item.text, "Copy annotated text"),
              toggle,
              iconButton("edit", "Edit", () => { float.hide(); app.startEdit(app.path, "annotations", item.id); }),
              iconButton("trash", "Delete", () => { float.hide(); app.removeItem(app.path, "annotations", item.id); }),
            ),
            picker,
          );
        }),
        highlight ? h("div", { class: "ma-pop-hl" },
          swatchRow(app,
            (color) => { float.hide(); app.recolor(highlight, color); },
            () => { float.hide(); app.removeItem(app.path, "highlights", highlight.id); }),
        ) : null,
      ], rect);
    },

    hide() {
      mode = null;
      activeHighlight = null;
      el.hidden = true;
    },
  };
  return float;
};
