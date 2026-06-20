import { useCallback } from 'react';
import * as ImageManipulator from 'expo-image-manipulator';
import { useChatStore } from '@/stores/chat.store';
import { analyzeImage } from '@/services/vision.service';

/**
 * Shared "analyze an image and show the result in the chat" flow, used by both
 * Camera (snap) and Photos (gallery). Downscales the image, posts it to the
 * existing /api/v1/vision (Gemini) endpoint, and pushes the question + answer
 * into the conversation.
 */
export function useImageAnalysis() {
  const addUserMessage = useChatStore((s) => s.addUserMessage);
  const addAssistantMessage = useChatStore((s) => s.addAssistantMessage);
  const setLoading = useChatStore((s) => s.setLoading);

  return useCallback(
    async (uri: string, label = '📷 Explain this image') => {
      try {
        const scaled = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
        );
        addUserMessage(label);
        setLoading(true);
        const text = await analyzeImage(scaled.uri);
        addAssistantMessage(
          'vis' + Date.now(),
          text || 'I could not read that image. Please try a clearer, well-lit photo.',
          [],
          false,
        );
      } catch {
        addAssistantMessage(
          'viserr' + Date.now(),
          'Sorry, I could not analyze that image. Please try again with a clearer, well-lit photo.',
          [],
          false,
        );
      } finally {
        setLoading(false);
      }
    },
    [addUserMessage, addAssistantMessage, setLoading],
  );
}
