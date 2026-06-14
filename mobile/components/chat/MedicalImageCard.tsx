import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MedicalImage } from '@/stores/chat.store';
import { COLORS } from '@/constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

// Load images through our backend proxy. The native image loader sends a
// generic User-Agent that Wikimedia/PubChem reject (403/429) for hotlinking,
// so direct URLs silently failed to render; the proxy fetches with a proper
// User-Agent from a host we control.
function proxied(url: string): string {
  if (!url) return url;
  if (!API_URL) return url;
  return `${API_URL}/api/v1/img?u=${encodeURIComponent(url)}`;
}

/**
 * A verified medical illustration shown below an AI answer. Full-width with
 * rounded corners, a loading skeleton while it loads, a source/title caption,
 * and tap-to-open fullscreen. Renders nothing if the image fails to load.
 */
export function MedicalImageCard({ image }: { image: MedicalImage }) {
  const { width } = useWindowDimensions();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [useProxy, setUseProxy] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  if (failed) return null; // never show a broken image

  // Try the backend proxy first; if that fails, fall back to the direct URL.
  const uri = useProxy ? proxied(image.url) : image.url;
  const onImgError = () => {
    if (useProxy) {
      setUseProxy(false); // retry with the original URL
      setLoaded(false);
    } else {
      setFailed(true);
    }
  };

  const cardWidth = width - 32;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => setFullscreen(true)}>
        <View style={[styles.imageBox, { width: cardWidth }]}>
          {!loaded && (
            <View style={styles.skeleton}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          )}
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            onError={onImgError}
          />
          {loaded && (
            <View style={styles.expandBadge}>
              <MaterialCommunityIcons name="arrow-expand" size={14} color="#fff" />
            </View>
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.caption}>
        <MaterialCommunityIcons name="image-outline" size={13} color={COLORS.textSecondary} />
        <Text style={styles.captionText} numberOfLines={2}>
          <Text style={styles.captionSource}>{image.source}</Text>
          {image.title ? ` · ${image.title}` : ''}
        </Text>
      </View>

      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fsBackdrop}>
          <TouchableOpacity style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri }} style={styles.fsImage} resizeMode="contain" />
          <Text style={styles.fsCaption} numberOfLines={3}>
            {image.source}
            {image.title ? ` · ${image.title}` : ''}
          </Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10, marginBottom: 4 },
  imageBox: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: COLORS.secondary,
    aspectRatio: 4 / 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  image: { width: '100%', height: '100%' },
  skeleton: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  expandBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 5,
  },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 2 },
  captionText: { flex: 1, fontSize: 12, color: COLORS.textSecondary },
  captionSource: { fontWeight: '700', color: COLORS.textSecondary },
  fsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  fsClose: { position: 'absolute', top: 50, right: 20, zIndex: 2, padding: 6 },
  fsImage: { width: '100%', height: '80%' },
  fsCaption: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    color: '#e2e8f0', fontSize: 13, textAlign: 'center',
  },
});
