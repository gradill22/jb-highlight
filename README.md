# myst-annotate

Private, local highlighting and annotation for [Jupyter Book 2](https://jupyterbook.org) and other [MyST](https://mystmd.org) sites, in the spirit of [Hypothesis](https://web.hypothes.is/) but without any social features. There are no accounts and no servers. Everything is stored in the reader's own browser.

## What readers can do

- **Highlight:** select text and pick one of five colours from the toolbar. Highlights can overlap: a new one is drawn on top, and removing it shows the one underneath again.
- **Annotate:** select text and choose **Annotate**. The sidebar opens with a new note. Notes support Markdown and LaTeX math (`$…$` and `$$…$$`), with a Write/Preview toggle. Annotated text gets a dotted amber underline.
- **Page notes:** notes about the whole page, written from the sidebar.
- **Click marked text** to bring up a popover for the notes under that point, with Edit and Delete. If the text is highlighted, the popover also lets you recolour or remove the highlight.
- **Sidebar:** opened from the tab on the right edge or with **Alt/⌥+Shift+A**. It has these parts:
  - tabs for Annotations, Highlights, Page notes and Orphans (notes whose text is no longer on the page)
  - a **This page / Whole book** switch
  - search
  - an eye button that hides or shows every mark
- **Keyboard:** with text selected, **A** annotates and **H** highlights in the colour you used last.
- **Drafts:** unsaved notes are kept and come back the next time you open the page.
- Deleting anything asks for confirmation first. The UI follows the theme's light and dark modes, and on narrow screens the sidebar covers the full width.

## Installation

From the folder that contains your `myst.yml`:

```bash
npm install myst-annotate
```

Then register the plugin in `myst.yml`:

```yaml
project:
  plugins:
    - node_modules/myst-annotate/dist/myst-annotate.mjs
```

Build as usual (`jupyter-book build --html` or `jupyter-book start`). The log should include:

```
🔌 myst-annotate (node_modules/myst-annotate/dist/myst-annotate.mjs) loaded: 0 directives, 0 roles, 1 transform
```

## How it works

- `myst-annotate.mjs` is a MyST transform plugin. It adds an `anywidget` node to the end of every page, pointing at `widget.js`. MyST copies the widget into the site build and the theme loads it in the browser.
- `widget.js` bundles everything it needs, including markdown-it, KaTeX and the KaTeX fonts, so a built book needs no network access. It is about 750 KB, or about 400 KB gzipped, and the browser caches it after the first page.
- Marks are drawn with the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API), so the page's HTML is never modified. The UI lives in a shadow root, so the theme's styles don't affect it.
- Data is kept in `localStorage`, one entry per page (`myst-annotate:<path>`). Marks are anchored by character position within the page's `<article>`, with a fallback that searches for the quoted text if the page has changed.

## Browser support

Any browser with the CSS Custom Highlight API: Chrome/Edge 105+, Safari 17.2+, Firefox 140+. In older browsers the plugin does nothing and logs a console warning.

## Development

```bash
npm install
npm run build   # writes dist/
npm test        # builds, then runs the plugin, Markdown and browser (Playwright) tests
```

`docs/SPEC.md` is the approved feature specification.

## License

MIT
