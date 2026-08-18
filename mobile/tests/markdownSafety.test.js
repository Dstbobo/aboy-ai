const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_MARKDOWN_CHARS,
  MAX_MARKDOWN_LINES,
  MAX_TOP_LEVEL_CHILDREN,
  constrainMarkdown,
  secureMarkdownIt,
} = require('../utils/markdownSafety');

function inlineChildren(tokens) {
  return tokens.flatMap((token) => token.children || []);
}

test('oversized provider output is bounded before markdown parsing', () => {
  const malicious = `mailto:${'a.'.repeat(MAX_MARKDOWN_CHARS * 3)}@example.test`;
  const constrained = constrainMarkdown(malicious);

  assert.ok(constrained.length <= MAX_MARKDOWN_CHARS);
  assert.match(constrained, /Answer shortened for safe display/);
  assert.doesNotThrow(() => secureMarkdownIt.parse(constrained, {}));
});

test('pathological line counts are bounded before native rendering', () => {
  const constrained = constrainMarkdown(
    Array.from({ length: MAX_MARKDOWN_LINES * 4 }, (_, index) => `# heading ${index}`).join('\n'),
  );

  assert.ok(constrained.split('\n').length <= MAX_MARKDOWN_LINES + 2);
  assert.equal(MAX_TOP_LEVEL_CHILDREN, 180);
});

test('plain URLs and mail addresses never enter automatic linkification', () => {
  assert.equal(secureMarkdownIt.options.linkify, false);
  const tokens = secureMarkdownIt.parse(
    `www.example.test ${'mailto:a.'.repeat(2_000)}user@example.test`,
    {},
  );

  assert.equal(
    inlineChildren(tokens).some((token) => token.type === 'link_open'),
    false,
  );
});

test('pathological quote runs bypass the vulnerable smartquotes rule', () => {
  assert.equal(secureMarkdownIt.options.typographer, false);
  const constrained = constrainMarkdown('"'.repeat(MAX_MARKDOWN_CHARS * 2));

  assert.ok(constrained.length <= MAX_MARKDOWN_CHARS);
  assert.doesNotThrow(() => secureMarkdownIt.parse(constrained, {}));
});

test('explicit medical citation links remain available', () => {
  const tokens = secureMarkdownIt.parse(
    '[WHO guidance](https://www.who.int/health-topics)',
    {},
  );

  assert.equal(
    inlineChildren(tokens).some((token) => token.type === 'link_open'),
    true,
  );
});
