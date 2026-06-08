import React from 'react';
import { View, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { COLORS } from '@/constants/theme';

interface Props {
  content: string;
  isStreaming?: boolean;
}

export function StreamingText({ content, isStreaming }: Props) {
  return (
    <View>
      <Markdown style={markdownStyles}>{content}</Markdown>
      {isStreaming && <View style={styles.cursor} />}
    </View>
  );
}

const styles = StyleSheet.create({
  cursor: {
    width: 8,
    height: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 1,
    marginTop: 2,
  },
});

const markdownStyles = {
  body: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  heading1: { color: COLORS.text, fontWeight: '700' as const, fontSize: 18, marginVertical: 8 },
  heading2: { color: COLORS.text, fontWeight: '700' as const, fontSize: 16, marginVertical: 6 },
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
    backgroundColor: COLORS.secondary,
    padding: 12,
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  bullet_list: { paddingLeft: 8 },
  ordered_list: { paddingLeft: 8 },
  list_item: { marginVertical: 2 },
};
