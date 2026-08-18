const MarkdownIt = require('markdown-it');

// Answers are normally far below these limits. Keep the parser and native
// renderer bounded if a provider, stored conversation, or streaming response
// supplies adversarially large markdown.
const MAX_MARKDOWN_CHARS = 24_000;
const MAX_MARKDOWN_LINES = 320;
const MAX_TOP_LEVEL_CHILDREN = 180;
const TRUNCATION_NOTICE = '\n\n_Answer shortened for safe display._';

function constrainMarkdown(input) {
  let value = typeof input === 'string' ? input : '';
  let truncated = false;
  const contentBudget = MAX_MARKDOWN_CHARS - TRUNCATION_NOTICE.length;

  if (value.length > contentBudget) {
    value = value.slice(0, contentBudget);
    truncated = true;
  }

  const lines = value.split('\n');
  if (lines.length > MAX_MARKDOWN_LINES) {
    value = lines.slice(0, MAX_MARKDOWN_LINES).join('\n');
    truncated = true;
  }

  if (!truncated) return value;
  return value.trimEnd() + TRUNCATION_NOTICE;
}

// The bundled parser has quadratic linkification and smart-quote advisories.
// Disable both core rules as well as their options. Plain-text URLs and quote
// runs never enter those scanners, while explicit Markdown citations remain.
const secureMarkdownIt = MarkdownIt({
  typographer: false,
  linkify: false,
}).disable(['linkify', 'smartquotes']);

module.exports = {
  MAX_MARKDOWN_CHARS,
  MAX_MARKDOWN_LINES,
  MAX_TOP_LEVEL_CHILDREN,
  constrainMarkdown,
  secureMarkdownIt,
};
