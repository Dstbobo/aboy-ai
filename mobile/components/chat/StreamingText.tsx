import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { SvgXml } from 'react-native-svg';
import { COLORS } from '@/constants/theme';

interface Props {
  content: string;
  isStreaming?: boolean;
}

/**
 * Renders AI markdown full width. Diagram support: any ```svg fenced block in
 * the response is rendered as an actual vector diagram via react-native-svg;
 * remaining markdown (headings, tables, lists) renders normally around it.
 */
export function StreamingText({ content, isStreaming }: Props) {
  const { width } = useWindowDimensions();
  const segments = splitSvgBlocks(content);

  return (
    <View>
      {segments.map((seg, i) =>
        seg.type === 'svg' ? (
          <View key={i} style={styles.svgWrap}>
            <SvgXml xml={seg.value} width={width - 32} height={undefined} />
          </View>
        ) : (
          <Markdown key={i} style={markdownStyles}>
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
    // Only render if it looks like a complete, valid <svg> element.
    if (xml.startsWith('<svg') && xml.endsWith('</svg>')) {
      out.push({ type: 'svg', value: xml });
    } else {
      out.push({ type: 'md', value: '```\n' + xml + '\n```' });
    }
    last = re.lastIndex;
  }
  if (last < md.length) out.push({ type: 'md', value: md.slice(last) });
  return out.length ? out : [{ type: 'md', value: md }];
}

const styles = StyleSheet.create({
  cursor: {
    width: 8,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
    marginTop: 2,
  },
  svgWrap: { marginVertical: 10, alignItems: 'center' },
});

const markdownStyles = {
  body: { color: COLORS.text, fontSize: 15, lineHeight: 23 },
  heading1: { color: COLORS.text, fontWeight: '800' as const, fontSize: 20, marginVertical: 10 },
  heading2: { color: COLORS.text, fontWeight: '700' as const, fontSize: 17, marginVertical: 8 },
  heading3: { color: COLORS.text, fontWeight: '700' as const, fontSize: 15.5, marginVertical: 6 },
  strong: { fontWeight: '700' as const, color: COLORS.text },
  em: { fontStyle: 'italic' as const },
  code_inline: {
    backgroundColor: COLORS.secondary,
    color: COLORS.primaryDark,
    paddingHorizontal: 4,
    borderRadius: 3,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  fence: {
    backgroundColor: '#f4f5f7',
    padding: 12,
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  table: { borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, borderRadius: 6 },
  th: { padding: 6, fontWeight: '700' as const },
  td: { padding: 6 },
  bullet_list: { paddingLeft: 4 },
  ordered_list: { paddingLeft: 4 },
  list_item: { marginVertical: 3 },
};
