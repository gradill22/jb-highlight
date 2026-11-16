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

The plugin is a single file, `myst-annotate.mjs`. List it under `project.plugins` in your `myst.yml`, using one of the options below.

**From npm:** run this in the folder that contains your `myst.yml`:

```bash
npm install myst-annotate
```

```yaml
project:
  plugins:
    - node_modules/myst-annotate/dist/myst-annotate.mjs
```

**From GitHub**, without going through npm. The plugin is built during the install:

```bash
npm install github:gradill22/myst-annotate
```

Then use the same `node_modules/...` path as above.

**From a URL:** MyST downloads plugins listed as URLs. The URL must serve the JavaScript file itself, for example from a CDN that mirrors npm:

```yaml
project:
  plugins:
    - https://cdn.jsdelivr.net/npm/myst-annotate@0.1.0/dist/myst-annotate.mjs
```

> **`Error reading plugin: SyntaxError: Unexpected token '<'`** means the URL returned a web page (HTML), not JavaScript. A `github.com/…/blob/…` link does this, for example. The built plugin isn't committed to the repository, so use the npm, GitHub-install or CDN options above.

Build as usual (`jupyter-book build --html` or `jupyter-book start`). The log should include:

```
🔌 myst-annotate (node_modules/myst-annotate/dist/myst-annotate.mjs) loaded: 0 directives, 0 roles, 1 transform
```

## How it works

- `myst-annotate.mjs` is a MyST transform plugin. It adds an `anywidget` node to the end of every page. The browser widget is embedded in the plugin. When the plugin loads, it writes the widget next to itself as `myst-annotate-widget-<hash>.js`. MyST copies that file into the site build, and the theme loads it in the browser.
- The widget bundles everything it needs, including markdown-it, KaTeX and the KaTeX fonts, so a built book needs no network access. It is about 750 KB, or about 400 KB gzipped, and the browser caches it after the first page.
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
