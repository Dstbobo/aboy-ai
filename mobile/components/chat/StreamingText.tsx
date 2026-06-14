import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SvgXml } from 'react-native-svg';
import { COLORS } from '@/constants/theme';

interface Props {
  content: string;
  isStreaming?: boolean;
}

// Common drug names highlighted in a distinct colour.
const DRUGS = [
  'metformin', 'insulin', 'aspirin', 'paracetamol', 'acetaminophen', 'ibuprofen',
  'amoxicillin', 'ceftriaxone', 'azithromycin', 'warfarin', 'heparin', 'atorvastatin',
  'simvastatin', 'lisinopril', 'ramipril', 'amlodipine', 'losartan', 'metoprolol',
  'bisoprolol', 'furosemide', 'spironolactone', 'omeprazole', 'pantoprazole',
  'salbutamol', 'albuterol', 'prednisolone', 'prednisone', 'hydrocortisone',
  'morphine', 'codeine', 'tramadol', 'diazepam', 'lorazepam', 'haloperidol',
  'levothyroxine', 'digoxin', 'clopidogrel', 'gentamicin', 'ciprofloxacin',
  'vancomycin', 'paclitaxel', 'methotrexate', 'oxytocin', 'magnesium sulfate',
];
const DRUG_RE = new RegExp(`\\b(${DRUGS.join('|')})\\b`, 'gi');

/**
 * Models sometimes wrap an answer (or a diagram) in a ``` fence. Code fences
 * render as raw monospace — fine for real code, wrong for diagrams/prose.
 * Unwrap a single outer fence, and convert "diagram" fences (arrows, no real
 * code) into plain text so flow charts read cleanly.
 */
function normalizeMarkdown(md: string): string {
  let out = md.replace(/\\n/g, '\n').trim();

  // Whole-answer fence unwrap (except svg, which we render as a vector).
  const whole = out.match(/^```([a-zA-Z]*)\n([\s\S]*?)\n?```$/);
  if (whole && whole[1] !== 'svg') out = whole[2];

  // Convert diagram-ish fenced blocks to plain text. A block is a "diagram"
  // when it has arrows/box-drawing and is NOT a known programming language.
  const CODE_LANGS = /^(py|python|js|javascript|ts|typescript|sql|json|bash|sh|java|c|cpp|go|rust|kotlin|swift|html|css|xml|yaml)$/i;
  out = out.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (m, lang, body) => {
    if (lang === 'svg') return m;
    const looksDiagram = /[→↓←↑⟶▶│┌┐└┘├┤▼►|]|->|=>/.test(body) && !CODE_LANGS.test(lang || '');
    return looksDiagram ? `\n${body.trim()}\n` : m;
  });

  return out;
}

export function StreamingText({ content, isStreaming }: Props) {
  const { width } = useWindowDimensions();
  const segments = splitSvgBlocks(normalizeMarkdown(content));

  return (
    <View>
      {segments.map((seg, i) =>
        seg.type === 'svg' ? (
          <View key={i} style={styles.svgWrap}>
            <SvgXml xml={seg.value} width={width - 32} height={undefined} />
          </View>
        ) : (
          <Markdown key={i} style={markdownStyles} rules={rules}>
            {seg.value}
          </Markdown>
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

// Custom render rules: alternating table rows + drug-name highlighting.
const rules = {
  // Colour drug names inside any text node.
  text: (node: any, _children: any, _parent: any, st: any) => {
    const content: string = node.content ?? '';
    if (!DRUG_RE.test(content)) {
      return <Text key={node.key} style={st.text}>{content}</Text>;
    }
    DRUG_RE.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = DRUG_RE.exec(content)) !== null) {
      if (m.index > last) parts.push(content.slice(last, m.index));
      parts.push(
        <Text key={`${node.key}-${m.index}`} style={styles.drug}>{m[0]}</Text>,
      );
      last = m.index + m[0].length;
    }
    if (last < content.length) parts.push(content.slice(last));
    return <Text key={node.key} style={st.text}>{parts}</Text>;
  },
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

const styles = StyleSheet.create({
  cursor: { width: 8, height: 16, backgroundColor: COLORS.primary, borderRadius: 1, marginTop: 2 },
  svgWrap: { marginVertical: 10, alignItems: 'center' },
  drug: { color: COLORS.primaryDark, fontWeight: '700' },
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
