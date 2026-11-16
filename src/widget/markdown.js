// Markdown (markdown-it, raw HTML disabled) with $…$ / $$…$$ math rendered by KaTeX.
import MarkdownIt from "markdown-it";
import katex from "katex";

const tex = (src, displayMode) =>
  katex.renderToString(src, { displayMode, throwOnError: false, trust: false });

/** Inline `$…$` (or `$$…$$`, rendered as display math). Pandoc-style rules for `$`. */
const mathInline = function (state, silent) {
  const src = state.src;
  const pos = state.pos;
  if (src[pos] !== "$") return false;

  const display = src[pos + 1] === "$";
  const delim   = display ? "$$" : "$";
  const start   = pos + delim.length;
  if (!display && /\s/.test(src[start] || " ")) return false;

  let end = start;
  for (;;) {
    end = src.indexOf(delim, end);
    if (end === -1 || end + delim.length > state.posMax) return false;
    if (src[end - 1] !== "\\") break;
    end += 1;
  }
  if (end === start) return false;
  if (!display && (/\s/.test(src[end - 1]) || /\d/.test(src[end + 1] || ""))) return false;

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = src.slice(start, end);
    token.meta = { display };
  }
  state.pos = end + delim.length;
  return true;
};

/** A block that starts with `$$` and ends with a line ending in `$$`. */
const mathBlock = function (state, startLine, endLine, silent) {
  const lineText = (line) => state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;

  const first = lineText(startLine);
  if (!first.startsWith("$$")) return false;

  const rest = first.slice(2).trimEnd();
  let content;
  let last = startLine;
  if (rest.endsWith("$$")) {
    content = rest.slice(0, -2);
  } else {
    if (rest.includes("$$")) return false; // inline display math followed by text
    const lines = [rest];
    for (last = startLine + 1; ; last++) {
      if (last >= endLine) return false;
      const text = lineText(last).trimEnd();
      if (text.endsWith("$$")) {
        lines.push(text.slice(0, -2));
        break;
      }
      lines.push(text);
    }
    content = lines.join("\n");
  }

  if (silent) return true;
  state.line = last + 1;
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content;
  token.map = [startLine, state.line];
  return true;
};

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.block.ruler.before("fence", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
md.inline.ruler.after("escape", "math_inline", mathInline);
md.renderer.rules.math_inline = (tokens, idx) => tex(tokens[idx].content, tokens[idx].meta.display);
md.renderer.rules.math_block  = (tokens, idx) => `<div class="ma-math-block">${tex(tokens[idx].content, true)}</div>\n`;

export const renderMarkdown = (src) => md.render(src);
