import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SvgXml } from 'react-native-svg';
import { COLORS } from '@/constants/theme';
import {
  MAX_TOP_LEVEL_CHILDREN,
  constrainMarkdown,
  secureMarkdownIt,
} from '@/utils/markdownSafety';

// The package implements this prop but its bundled TypeScript declaration
// omits it. Keep the adapter local until the upstream type catches up.
const BoundedMarkdown = Markdown as React.ComponentType<
  React.ComponentProps<typeof Markdown> & { maxTopLevelChildren?: number }
>;

interface Props {
  content: string;
  isStreaming?: boolean;
}

// Known programming languages → rendered as dark code panels. Anything else
// containing arrows/box-drawing is treated as an ASCII diagram.
const CODE_LANGS = /^(py|python|js|javascript|ts|typescript|sql|json|bash|sh|java|c|cpp|go|rust|kotlin|swift|html|css|xml|yaml)$/i;
const DIAGRAM_RE = /[→↓←↑⟶▶│┌┐└┘├┤▼►─━┃]|->|=>|\|/;

function isDiagram(lang: string, body: string): boolean {
  return DIAGRAM_RE.test(body) && !CODE_LANGS.test((lang || '').trim());
}

/**
 * Models sometimes wrap an entire answer in a ``` fence — unwrap that single
 * outer fence so prose renders normally. Real code and ASCII diagrams keep
 * their fences; the custom `fence` rule styles each appropriately (dark panel
 * for code, clean light textbook block for diagrams).
 */
function normalizeMarkdown(md: string): string {
  let out = md.replace(/\\n/g, '\n').trim();

  // Whole-answer fence unwrap (except svg, code, or a diagram — those stay).
  const whole = out.match(/^```([a-zA-Z]*)\n([\s\S]*?)\n?```$/);
  if (whole && whole[1] !== 'svg' && !CODE_LANGS.test(whole[1]) && !isDiagram(whole[1], whole[2])) {
    out = whole[2];
  }

  return out;
}

export function StreamingText({ content, isStreaming }: Props) {
  const { width } = useWindowDimensions();
  const segments = splitSvgBlocks(constrainMarkdown(normalizeMarkdown(content)));

  return (
    <View>
      {segments.map((seg, i) =>
        seg.type === 'svg' ? (
          <View key={i} style={styles.svgWrap}>
            <SvgXml xml={seg.value} width={width - 32} height={undefined} />
          </View>
        ) : (
          <BoundedMarkdown
            key={i}
            style={markdownStyles}
            rules={rules}
            markdownit={secureMarkdownIt}
            maxTopLevelChildren={MAX_TOP_LEVEL_CHILDREN}
          >
            {seg.value}
          </BoundedMarkdown>
        ),
      )}
      {isStreaming && <View style={styles.cursor} />}
    </View>
  );
}

type Segment = { type: 'md' | 'svg'; value: string };

function splitSvgBlocks(md: string): Segment[] {
  const out: Segment[] = [];
  const re = /```svg\s*([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    if (m.index > last) out.push({ type: 'md', value: md.slice(last, m.index) });
    const xml = m[1].trim();
    if (xml.startsWith('<svg') && xml.endsWith('</svg>')) out.push({ type: 'svg', value: xml });
    else out.push({ type: 'md', value: '```\n' + xml + '\n```' });
    last = re.lastIndex;
  }
  if (last < md.length) out.push({ type: 'md', value: md.slice(last) });
  return out.length ? out : [{ type: 'md', value: md }];
}

// Custom render rules. We intentionally do NOT override the `text` rule —
// overriding it drops the library's inheritedStyles, which breaks **bold**,
// *italic* and link styling (they render flat). Let the library handle inline
// text natively; we only customise code/diagram blocks and table rows.
const rules = {
  // Fenced blocks: dark panel for real code, clean light textbook block for
  // ASCII diagrams (dark text on white, monospace kept for alignment).
  fence: (node: any) => renderBlock(node),
  code_block: (node: any) => renderBlock(node),
  // Alternating row background on table bodies.
  tbody: (node: any, children: any[]) =>
    React.createElement(
      View,
      { key: node.key },
      React.Children.map(children, (child, i) =>
        child ? React.cloneElement(child, { style: [child.props?.style, i % 2 ? styles.rowAlt : styles.rowEven] }) : child,
      ),
    ),
};

function renderBlock(node: any) {
  const lang: string = node.sourceInfo ?? '';
  const body: string = (node.content ?? '').replace(/\n$/, '');
  const diagram = isDiagram(lang, body);
  return (
    <View key={node.key} style={diagram ? styles.diagramBox : styles.codeBox}>
      <Text style={diagram ? styles.diagramText : styles.codeText}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cursor: { width: 8, height: 16, backgroundColor: COLORS.primary, borderRadius: 1, marginTop: 2 },
  // Light, textbook-style ASCII diagram: white card, dark text, monospace.
  diagramBox: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, padding: 12, marginVertical: 8,
  },
  diagramText: { color: COLORS.text, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 18 },
  // Real code: dark terminal panel.
  codeBox: { backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginVertical: 8 },
  codeText: { color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12.5, lineHeight: 18 },
  svgWrap: { marginVertical: 10, alignItems: 'center' },
  rowEven: { backgroundColor: '#ffffff' },
  rowAlt: { backgroundColor: '#f3f6f9' },
});

const markdownStyles = {
  body: { color: COLORS.text, fontSize: 15, lineHeight: 23 },
  heading1: { color: COLORS.text, fontWeight: '800' as const, fontSize: 20, marginVertical: 10 },
  heading2: { color: COLORS.text, fontWeight: '700' as const, fontSize: 17, marginVertical: 8 },
  heading3: { color: COLORS.text, fontWeight: '700' as const, fontSize: 15.5, marginVertical: 6 },
  strong: { fontWeight: '700' as const, color: COLORS.text },
  em: { fontStyle: 'italic' as const },
  code_inline: {
    backgroundColor: COLORS.secondary, color: COLORS.primaryDark,
    paddingHorizontal: 4, borderRadius: 3, fontSize: 13, fontFamily: 'monospace',
  },
  // Real code blocks only — monospace with a panel background.
  fence: {
    backgroundColor: '#0f172a', color: '#e2e8f0',
    padding: 12, borderRadius: 8, fontSize: 12.5, fontFamily: 'monospace',
  },
  code_block: {
    backgroundColor: '#0f172a', color: '#e2e8f0',
    padding: 12, borderRadius: 8, fontSize: 12.5, fontFamily: 'monospace',
  },
  // Tables — visible borders, full width, readable.
  table: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, marginVertical: 8, width: '100%' as const },
  thead: { backgroundColor: COLORS.primary },
  th: { padding: 8, fontWeight: '700' as const, color: '#ffffff', fontSize: 13.5 },
  tr: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, flexDirection: 'row' as const },
  td: { padding: 8, fontSize: 13.5, color: COLORS.text },
  bullet_list: { paddingLeft: 4 },
  ordered_list: { paddingLeft: 4 },
  list_item: { marginVertical: 3 },
  blockquote: {
    backgroundColor: COLORS.secondary, borderLeftWidth: 3, borderLeftColor: COLORS.primary,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, marginVertical: 6,
  },
};
