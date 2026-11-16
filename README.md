# myst-annotate

Private, local highlighting and annotation for [Jupyter Book 2](https://jupyterbook.org) and other [MyST](https://mystmd.org) sites, in the spirit of [Hypothesis](https://web.hypothes.is/) but without any social features. There are no accounts and no servers. Everything is stored in the reader's own browser.

## What readers can do

- **Highlight:** select text and pick one of five colours from the toolbar. The last swatch, a white circle with a red slash, clears highlights from the selection. **✕** closes the toolbar and leaves the text selected. Highlights can overlap: a new one is drawn on top, and removing it shows the one underneath again.
- **Annotate:** select text and choose **Annotate**. The sidebar opens with a new note. Notes support Markdown and LaTeX math (`$…$` and `$$…$$`), with a Write/Preview toggle. Annotated text gets a dotted amber underline.
- **Page notes:** notes about the whole page, written from the sidebar.
- **Click marked text** to bring up a popover for the notes under that point, with Highlight, Edit and Delete. If the text is highlighted, the popover also lets you recolour or remove the highlight.
- **Highlight a note's text:** the highlighter icon next to Edit, on a note's sidebar card or in its popover, opens the colour swatches for that note's quoted text.
- **Sidebar:** opened from the tab on the right edge or with **Alt/⌥+Shift+A**. It has these parts:
  - tabs for Annotations, Highlights, Page notes and Orphans (notes whose text is no longer on the page)
  - a **This page / Whole book** switch
  - search
  - an eye button that hides or shows every mark
- **Keyboard:** with text selected, **A** annotates and **H** highlights in the colour you used last.
- **Drafts:** unsaved notes are kept and come back the next time you open the page.
- Deleting a note asks for confirmation first. Removing a highlight doesn't. The UI follows the theme's light and dark modes, and on narrow screens the sidebar covers the full width.

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
npm install --allow-git=root github:gradill22/myst-annotate
```

Then use the same `node_modules/...` path as above.

- **Why `--allow-git=root`:** npm 12 refuses dependencies fetched from git unless you allow them (the error is `EALLOWGIT`). `--allow-git=root` allows only the git dependencies listed in your own `package.json`. To skip the flag on later installs, put `allow-git=root` in the project's `.npmrc`. npm 11 and earlier don't need it.
- **Safe to ignore:** npm 12 may also warn that `myst-annotate`'s `prepare` script was blocked. npm has already built the plugin while preparing the git package, so the installed plugin is complete.

**From a URL:** MyST downloads plugins listed as URLs. The URL must serve the JavaScript file itself. Every GitHub release has the plugin attached:

```yaml
project:
  plugins:
    - https://github.com/gradill22/myst-annotate/releases/download/v0.1.0/myst-annotate.mjs
```

A CDN that mirrors npm works too, for example `https://cdn.jsdelivr.net/npm/myst-annotate@0.1.0/dist/myst-annotate.mjs`. Pinning a version keeps your book from changing unexpectedly. MyST keeps a downloaded plugin for up to 30 minutes before fetching it again.

> **`Error reading plugin: SyntaxError: Unexpected token '<'`** means the URL returned a web page (HTML), not JavaScript. A `github.com/…/blob/…` link does this, for example. The built plugin isn't committed to the repository, so use one of the options above.

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

[CI](.github/workflows/ci.yml) runs `npm test` for every pull request and every push to `main`, on Linux and Windows with Node 22 and 24.

On npm 12, `npm install` warns that `esbuild`'s install script was blocked because it isn't covered by `allowScripts`. The build doesn't need that script: esbuild's JavaScript API finds its native binary on its own, so the warning is safe to ignore.

`docs/SPEC.md` is the approved feature specification.

### Releasing

1. Set the new version in `package.json` (for example with `npm version patch`, which also commits and tags it) and push to `main`.
2. Publish a GitHub release whose tag is `v` plus that version, for example `v0.1.1`.

The [release workflow](.github/workflows/release.yml) then runs the tests and attaches `myst-annotate.mjs` to the release. It also publishes the package to npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is stored in GitHub. The workflow fails if the tag doesn't match `package.json`, and it skips the npm step for versions that are already published.

Trusted publishing only works once the package exists on npm and is linked to this repository. The first version is published by hand:

```bash
npm login
npm publish
npx npm@11.21.1 trust github myst-annotate --file release.yml --repo gradill22/myst-annotate --allow-publish
```

## License

MIT
