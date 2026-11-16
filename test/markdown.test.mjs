// Markdown + math rendering (runs in Node; no browser needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/widget/markdown.js";

test("inline math $…$ renders with KaTeX", () => {
  const html = renderMarkdown("Energy $E = mc^2$ here");
  assert.match(html, /class="katex"/);
  assert.ok(!html.includes("$"));
});

test("display math $$…$$ on its own lines renders in display mode", () => {
  const html = renderMarkdown("Before\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nAfter");
  assert.match(html, /class="ma-math-block"><span class="katex-display">/);
  assert.match(html, /<p>Before<\/p>/);
  assert.match(html, /<p>After<\/p>/);
});

test("single-line $$…$$ block and inline $$…$$", () => {
  assert.match(renderMarkdown("$$a+b$$"), /katex-display/);
  assert.match(renderMarkdown("see $$a+b$$ inline"), /katex-display/);
});

test("currency and escaped dollars are not math", () => {
  assert.ok(!renderMarkdown("It costs $5 and $10.").includes("katex"));
  assert.ok(!renderMarkdown("Price \\$5 \\$").includes("katex"));
  assert.ok(!renderMarkdown("a $ b $ c").includes("katex"));
});

test("Markdown formatting, links and line breaks", () => {
  const html = renderMarkdown("**bold** _it_ `code`\nnext line\n\nhttps://example.com");
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>it<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<br>/);
  assert.match(html, /<a href="https:\/\/example.com">/);
});

test("raw HTML is not rendered", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script"));
  assert.match(html, /&lt;img/);
});

test("invalid TeX shows an error instead of throwing", () => {
  assert.match(renderMarkdown("$\\frac{$"), /katex-error|katex/);
});
