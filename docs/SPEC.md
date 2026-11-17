# myst-annotate — specification (approved)

A local-only, no-social-features take on Hypothesis for Jupyter Book 2 / MyST sites. Everything is stored in the reader's own browser.

Items marked **[proposed]** were suggested by Claude and approved as written.

## 1. Selection toolbar

- Appears above the selected text, or below it when there's no room above (as today).
- Layout: `[ ✎ Annotate | 🟡 🟣 🔵 🟢 🔴 ⊘ | ⧉ ✕ ]`. Every action is one click.
  - **Annotate** creates an annotation on the selection (see §3).
  - **Swatches** highlight in that colour (current behaviour, including layering).
  - **⊘ clear swatch** (white circle, red slash; the last "colour") removes **highlights only** under the selection, with no confirmation. Annotations aren't affected.
  - **⧉ Copy** copies the selected text exactly. The toolbar closes, the text stays selected, and "Copied" appears briefly where the toolbar was ("Couldn't copy" on failure). Plain-HTTP pages, which lack the Clipboard API, use the copy command.
  - **✕** closes the toolbar and leaves the text selected.
- Shortcuts while the toolbar is showing: **A** = annotate, **H** = highlight in the last colour used (yellow by default). They're ignored while focus is in a text field.

## 2. On-page marks

- **Highlights:** unchanged (5 colours, layered, newest on top).
- **Annotations:** a dotted underline that looks different from MyST's own dotted underlines (grey for abbreviations, blue for cross-reference links, both 0.1em thick). **[proposed]** amber `#D97706` (dark mode `#FBBF24`), 0.15em thick. A note can sit on highlighted text and both stay visible.
- **Show/hide:** an eye button in the sidebar header hides or shows all highlights and underlines. The choice is remembered across pages.

## 3. Annotations

- **Body:** Markdown with a **Write / Preview** toggle. Math with `$…$` (inline) and `$$…$$` (display), rendered with KaTeX. Raw HTML in notes is not rendered (it's shown as text).
- **No tags.**
- **Creating:** clicking Annotate opens the sidebar with a new card in edit mode, in document order. Buttons are **Save** and **Cancel**.
- **Overlaps:** any number of annotations can cover the same text.
- **Timestamps:** created time, plus "edited …" if changed later. Relative ("3 days ago"), with the full date on hover.
- **Drafts:** unsaved text, including a new annotation that was never saved, is kept and comes back in edit mode next time.
- **Deleting:** a styled in-page confirmation dialog (Cancel / Delete), in light and dark mode. Removing a highlight never asks.
- **Highlighting a note's text:** a highlighter icon next to Edit, on the sidebar card and in the popover, opens the 5 colours + ⊘ for the note's quoted text. Not shown for orphans or while editing.

## 4. Clicking marked text: popover

- Clicking annotated or highlighted text opens a popover at that spot:
  - every annotation under the point, each with its rendered body, timestamps, **⧉ Copy** (copies the annotated text, not the note), the highlighter, **✎ Edit** and **🗑 Delete**;
  - **[proposed]** a row of swatches + ⊘ below them, only if a highlight is under the point;
  - a **✕** in the popover's top-right corner closes it;
  - highlight only, no annotation: the same toolbar as for selected text, `[ ✎ Annotate | 🟡 🟣 🔵 🟢 🔴 ⊘ | ⧉ ✕ ]`. **⧉ Copy** copies the whole highlight, trimmed. **Annotate** (or **A**) starts a note on the **whole** clicked highlight, including parts a newer highlight covers, trimmed of leading/trailing spaces, in the sidebar's Annotations tab. The note is independent of the highlight. The popover for annotated text has no Annotate button.
- Clicking annotated text also opens the sidebar and marks those annotations' cards (auto-open).
- **[proposed]** ✎ Edit in the popover opens that card in edit mode in the sidebar, so all editing happens in one place.

## 5. Sidebar

- On the right side, 360px wide, opening over the page. Below 640px it covers the full width and has a close button. Touch selection works.
- Opened and closed by an **edge tab** that shows the count for the current page, and by **Alt/⌥+Shift+A**. It opens by itself when you create an annotation or click annotated text.
- Header controls:
  - tabs: **Annotations · Highlights · Page notes · Orphans**. **[proposed]** The Orphans tab only appears when there are orphans.
  - **This page / Whole book** toggle
  - **search box**, which filters by note text and quoted text in the current tab and scope
  - **eye toggle** (show/hide marks)
- **Annotations tab:** cards in document order, showing the quote, rendered body, timestamps, Edit and Delete. Clicking a card scrolls to its text and briefly flashes it.
- **Annotation and page-note cards** have no Copy button.
- **Highlights tab:** each highlight's quote with its colour, in document order. Click to scroll to it; delete (no confirmation). Icons: Annotate, Copy (the whole highlight, trimmed; "Copied" appears by the row), Delete. Annotate starts a note on the whole highlight (trimmed), in the Annotations tab. In the Whole book view, a highlight on another page gets its note on that page, edited in this sidebar.
- **Page notes tab:** a "New page note" button. Notes about the whole page, with the same editor, timestamps, drafts and delete as annotations, newest first.
- **Orphans tab:** annotations whose text can't be found any more, after both the saved position and the text search fail. Shows the quote and body; they can be edited or deleted.
- **Orphaned highlights** (text no longer found) are deleted from storage silently.
- **Whole book:** the same tabs, with items grouped by page under the page's title. Clicking an item on another page opens that page, scrolls to the item and opens its card.

## 6. Storage

- `localStorage`, one record per page: `myst-annotate:<pathname>` → `{ title, highlights[], annotations[], pageNotes[] }`. Sidebar and visibility settings are stored under separate keys.
- **[proposed]** No migration from the old `jb-highlights:` keys, since that format was never released.
- No export or import.

## 7. Packaging

- npm package **`myst-annotate`**.
- Source lives in `src/`. An **esbuild** step (`npm run build`, also run automatically by `npm publish`) bundles the widget, the Markdown parser (**[proposed]** markdown-it), KaTeX and its CSS and fonts into `dist/`. No network access is needed at runtime.
- KaTeX fonts are embedded as `woff2` data URLs, because MyST copies only the widget's single JS file into the build. **[proposed]** Expected widget size: about 600–800 KB (about 200–250 KB gzipped). It loads once and is then cached.
- Per-page use: releases (from v0.2.1) also attach `myst-annotate-widget.js`, which a page can embed with the `{anywidget}` directive instead of listing the plugin site-wide. Only one copy of the widget runs per page.
- Usage: `npm install myst-annotate`, then in `myst.yml`:
  ```yaml
  project:
    plugins:
      - node_modules/myst-annotate/dist/myst-annotate.mjs
  ```
- Playwright browser tests and a plugin build test are in `test/`, run with `npm test` (devDependencies only, not shipped).
- The repo stays `gradill22/jb-highlight` unless you rename it.
