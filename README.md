# jb-highlight

A [Jupyter Book 2](https://jupyterbook.org) / [MyST](https://mystmd.org) plugin that lets readers highlight text on any page in one of five colors.

Select text inside a page and a small toolbar appears. Pick a color to highlight the selection, or pick **✕** to remove highlights under it. Highlights are saved in the reader's browser (`localStorage`, one entry per page) and come back when the page is opened again.

## Installation

From the folder that contains your `myst.yml`:

```bash
npm install jb-highlight
```

Then register the plugin in `myst.yml`:

```yaml
project:
  plugins:
    - node_modules/jb-highlight/inject-highlight.mjs
```

Build as usual (`jupyter-book build --html` or `jupyter-book start`). The log should include:

```
🔌 Inject Highlight JavaScript (node_modules/jb-highlight/inject-highlight.mjs) loaded: 0 directives, 0 roles, 1 transform
```

## How it works

- `inject-highlight.mjs` is a MyST transform plugin. It adds an `anywidget` node that points at `highlight.js` to the end of every page. MyST copies `highlight.js` into the site build, and the theme loads it in the browser.
- `highlight.js` is the widget. It draws highlights with the [CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API), so the page's HTML is never modified. Highlights are limited to the page's main `<article>`.

## Browser support

Any browser with the CSS Custom Highlight API: Chrome/Edge 105+, Safari 17.2+, Firefox 140+. In older browsers the plugin does nothing and logs a console warning.

## License

MIT
