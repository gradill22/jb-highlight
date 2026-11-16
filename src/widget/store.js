// localStorage persistence. One record per page, plus reader settings.

const PAGE_PREFIX  = "myst-annotate:";
const SETTINGS_KEY = "myst-annotate-settings";
const GOTO_KEY     = "myst-annotate-goto";

const read = function (storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
};

const write = function (storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("[myst-annotate] Could not save to browser storage:", e);
  }
};

const emptyPage = () => ({ title: "", highlights: [], annotations: [], pageNotes: [] });

/** { title, highlights[], annotations[], pageNotes[] } for a page pathname. */
export const loadPage = function (path) {
  return { ...emptyPage(), ...read(localStorage, PAGE_PREFIX + path) };
};

export const savePage = function (path, page) {
  const empty = !page.highlights.length && !page.annotations.length && !page.pageNotes.length;
  write(localStorage, PAGE_PREFIX + path, empty ? null : page);
};

/** Every stored page: [{ path, page }]. */
export const loadBook = function () {
  const pages = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PAGE_PREFIX)) {
        const path = key.slice(PAGE_PREFIX.length);
        pages.push({ path, page: loadPage(path) });
      }
    }
  } catch {
    // storage unavailable
  }
  return pages.sort((a, b) => a.path.localeCompare(b.path));
};

/** { lastColor, hidden } */
export const loadSettings = function () {
  return { lastColor: "yellow", hidden: false, ...read(localStorage, SETTINGS_KEY) };
};

export const saveSettings = function (settings) {
  write(localStorage, SETTINGS_KEY, settings);
};

/** A pending "go to item" request made from another page in the Whole book view. */
export const takeGoto = function (path) {
  const goto = read(sessionStorage, GOTO_KEY);
  if (!goto || goto.path !== path) return null;
  write(sessionStorage, GOTO_KEY, null);
  return goto;
};

export const setGoto = function (goto) {
  write(sessionStorage, GOTO_KEY, goto);
};

export const newId = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};
