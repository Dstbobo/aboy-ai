import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { MedicalImage } from '@/stores/chat.store';
import { COLORS } from '@/constants/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

// Load images through our backend proxy. The native image loader sends a
// generic User-Agent that Wikimedia/PubChem reject (403/429) for hotlinking,
// so direct URLs fail to render; the proxy fetches with a proper User-Agent
// from a host we control.
function proxied(url: string): string {
  if (!url || !API_URL) return url;
  return `${API_URL}/api/v1/img?u=${encodeURIComponent(url)}`;
}

// Hard cap on how long we'll wait for an image before giving up — guarantees
// we never leave a placeholder/spinner that loads forever.
const LOAD_TIMEOUT_MS = 10000;

type Status = 'loading' | 'loaded' | 'failed';

/**
 * A verified medical illustration shown below an AI answer.
 *
 * Contract: either a real, working image renders — or nothing renders. There is
 * never a broken image and never a spinner that hangs:
 *   - loads via the backend proxy (reliable), with a direct-URL fallback
 *   - a faint placeholder is shown ONLY briefly while decoding
 *   - on error, or if it hasn't loaded within LOAD_TIMEOUT_MS, the whole card
 *     collapses to null
 */
export function MedicalImageCard({ image }: { image: MedicalImage }) {
  const { width } = useWindowDimensions();
  const [status, setStatus] = useState<Status>('loading');
  const [useProxy, setUseProxy] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!settled.current) setStatus('failed'); // never hang on a slow/dead image
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  if (status === 'failed' || !image?.url) return null; // image or nothing — clean

  const uri = useProxy ? proxied(image.url) : image.url;
  const cardWidth = width - 32;

  const onLoad = () => {
    settled.current = true;
    setStatus('loaded');
  };
  const onError = () => {
    if (useProxy) {
      setUseProxy(false); // one retry with the original URL
    } else {
      settled.current = true;
      setStatus('failed');
    }
  };

  const loaded = status === 'loaded';

  return (
    <View style={styles.wrap}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => setFullscreen(true)} disabled={!loaded}>
        <View style={[styles.imageBox, { width: cardWidth }]}>
          {!loaded && <View style={styles.placeholder} />}
          <Image
            // key forces a fresh load attempt when we switch proxy→direct
            key={uri}
            source={{ uri }}
            style={[styles.image, !loaded && styles.hidden]}
            // 'contain' so labelled diagrams are never cropped at the edges.
            resizeMode="contain"
            onLoad={onLoad}
            onError={onError}
          />
          {loaded && (
            <View style={styles.expandBadge}>
              <MaterialCommunityIcons name="arrow-expand" size={14} color="#fff" />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {loaded && (
        <View style={styles.caption}>
          <MaterialCommunityIcons name="image-outline" size={13} color={COLORS.textSecondary} />
          <Text style={styles.captionText} numberOfLines={2}>
            <Text style={styles.captionSource}>{image.source}</Text>
            {image.title ? ` · ${image.title}` : ''}
          </Text>
        </View>
      )}

      <Modal visible={fullscreen} transparent animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fsBackdrop}>
          <TouchableOpacity style={styles.fsClose} onPress={() => setFullscreen(false)} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={28} color={COLORS.text} />
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
    // White, not the tinted surface: anatomy PNGs are transparent with dark
    // labels — a white backing keeps the labels readable.
    backgroundColor: '#ffffff',
    aspectRatio: 4 / 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  image: { width: '100%', height: '100%' },
  hidden: { opacity: 0 },
  placeholder: { ...StyleSheet.absoluteFillObject, backgroundColor: '#ffffff' },
  expandBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 5,
  },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 2 },
  captionText: { flex: 1, fontSize: 12, color: COLORS.textSecondary },
  captionSource: { fontWeight: '700', color: COLORS.textSecondary },
  // White fullscreen backdrop: transparent diagrams + dark labels stay legible
  // (a black backdrop made the labels disappear).
  fsBackdrop: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  fsClose: { position: 'absolute', top: 50, right: 20, zIndex: 2, padding: 6 },
  fsImage: { width: '100%', height: '80%' },
  fsCaption: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    color: COLORS.textSecondary, fontSize: 13, textAlign: 'center',
  },
});
