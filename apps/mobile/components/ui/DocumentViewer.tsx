/**
 * In-app document viewer — renders PDFs and images inline without downloading.
 *
 * PDFs are rendered through Google Docs Viewer (wraps the signed URL).
 * Images are loaded directly in a WebView.
 *
 * Usage:
 *   <DocumentViewer visible={true} url={signedUrl} filename="file.pdf" onClose={() => {}} />
 */

import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors } from '@/constants/theme';

interface DocumentViewerProps {
  visible: boolean;
  url: string;
  filename?: string;
  mimeType?: string;
  onClose: () => void;
}

export function DocumentViewer({ visible, url, filename, mimeType, onClose }: DocumentViewerProps) {
  const insets = useSafeAreaInsets();

  if (!visible || !url) return null;

  const isImage = mimeType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(filename ?? '');

  // For PDFs, use Google Docs Viewer which renders them inline.
  // For images, load directly in a WebView with centered styling.
  const viewerUrl = isImage
    ? url
    : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`;

  const htmlForImage = `
    <!DOCTYPE html>
    <html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1d2e; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        img { max-width: 100%; max-height: 100vh; object-fit: contain; }
      </style>
    </head><body>
      <img src="${url}" alt="${filename ?? 'Document'}" />
    </body></html>
  `;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <MaterialIcons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.filename} numberOfLines={1}>{filename ?? 'Document'}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* WebView */}
        {isImage ? (
          <WebView
            style={styles.webview}
            source={{ html: htmlForImage }}
            originWhitelist={['*']}
            scalesPageToFit
            startInLoadingState
            renderLoading={() => <LoadingIndicator />}
          />
        ) : (
          <WebView
            style={styles.webview}
            source={{ uri: viewerUrl }}
            originWhitelist={['*']}
            startInLoadingState
            renderLoading={() => <LoadingIndicator />}
            javaScriptEnabled
          />
        )}
      </View>
    </Modal>
  );
}

function LoadingIndicator() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>Loading document...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1d2e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#1a1d2e',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filename: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  webview: { flex: 1, backgroundColor: '#1a1d2e' },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1d2e',
  },
  loadingText: { color: '#ffffff99', fontSize: 13, marginTop: 12 },
});
