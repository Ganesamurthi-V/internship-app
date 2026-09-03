/**
 * In-app document viewer for a student's uploaded verification documents.
 *
 * PDFs render page by page with `react-native-pdf`; images render in a WebView.
 *
 * The PDF path used to point a WebView at `docs.google.com/gview?url=<signed url>`,
 * which was removed for two reasons:
 *
 *   - It put a credential in a third party's URL. The signed URL *is* the authorization
 *     to read a private document, so embedding it in a request to Google granted Google
 *     read access to a student's offer letter for the life of the token. `lib/storage.ts`
 *     states the rule it broke: private bucket, no public URLs, ever.
 *   - It was the only part of the chain that could fail invisibly. Everything else is
 *     ours and returns a diagnosable status; gview is an undocumented endpoint whose
 *     failures surface as a bare `net::ERR_FAILED`, which is what was reported.
 *
 * `react-native-pdf` fetches the bytes itself and rasterises them natively, so the
 * signed URL now goes only to our own storage, and a failure arrives as a real error
 * with a status attached instead of a blank Chromium page.
 *
 * The device's own viewer is kept as a fallback on the error path. A PDF this library
 * cannot parse is not necessarily one the reviewer cannot read, and an approval decision
 * should not be blocked by our choice of renderer.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Pdf from 'react-native-pdf';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors } from '@/constants/theme';

interface DocumentViewerProps {
  visible: boolean;
  url: string;
  filename?: string;
  mimeType?: string;
  onClose: () => void;
}

/** Dark chrome, kept local so the viewer reads as an overlay rather than a screen. */
const SURFACE = '#1a1d2e';

export function DocumentViewer({ visible, url, filename, mimeType, onClose }: DocumentViewerProps) {
  const insets = useSafeAreaInsets();

  // Both pieces of state are keyed by url. The component stays mounted between
  // documents, so plain state would carry one document's error or page count onto the
  // next one opened.
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  const [paging, setPaging] = useState<{ url: string; page: number; total: number } | null>(null);

  const error = failure?.url === url ? failure.message : null;
  const pages = paging?.url === url ? paging : null;

  if (!visible || !url) return null;

  const isImage =
    mimeType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(filename ?? '');

  const fail = (message: string) => setFailure({ url, message });

  const openInDeviceViewer = async () => {
    try {
      await Linking.openURL(url);
    } catch {
      fail('No app on this device can open this file.');
    }
  };

  // The filename is deliberately not interpolated into this markup — it is attacker
  // controlled at upload time, and the header above already displays it.
  const imageHtml = `
    <!DOCTYPE html>
    <html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: ${SURFACE}; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        img { max-width: 100%; max-height: 100vh; object-fit: contain; }
      </style>
    </head><body>
      <img src="${encodeURI(url)}" alt="Document" />
    </body></html>
  `;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <MaterialIcons name="close" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.filename} numberOfLines={1}>{filename ?? 'Document'}</Text>
          {pages && pages.total > 0 && !error ? (
            <Text style={styles.pageCount} accessibilityLabel={`Page ${pages.page} of ${pages.total}`}>
              {pages.page}/{pages.total}
            </Text>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {error ? (
          <Message
            icon="error-outline"
            tint={colors.danger}
            title="Could not open the document"
            body={error}
            actionIcon="open-in-new"
            actionLabel="Open in device viewer"
            onAction={() => void openInDeviceViewer()}
            secondaryLabel="Try again"
            onSecondary={() => setFailure(null)}
          />
        ) : isImage ? (
          <WebView
            style={styles.webview}
            source={{ html: imageHtml }}
            originWhitelist={['*']}
            scalesPageToFit
            startInLoadingState
            renderLoading={() => <Loading label="Loading document..." />}
            onError={({ nativeEvent }) =>
              fail(nativeEvent.description || 'The image could not be loaded.')
            }
            onHttpError={({ nativeEvent }) =>
              fail(
                nativeEvent.statusCode === 400
                  ? 'The preview link has expired. Close this and open the document again.'
                  : `The image could not be loaded (HTTP ${nativeEvent.statusCode}).`,
              )
            }
          />
        ) : (
          <Pdf
            style={styles.pdf}
            // `cache: false` because each open mints a fresh signed URL, so a cache keyed
            // on the URL would never hit and would just accumulate copies of private
            // documents in the app's cache directory.
            source={{ uri: url, cache: false }}
            // This library defaults `trustAllCerts` to true, which disables certificate
            // validation on the fetch it performs. Off, explicitly: the URL is a bearer
            // credential and must not be sent over a connection we have not verified.
            trustAllCerts={false}
            fitPolicy={0}
            spacing={8}
            enableAntialiasing
            enableDoubleTapZoom
            renderActivityIndicator={(progress) => (
              <Loading
                label={
                  progress > 0 && progress < 1
                    ? `Loading document... ${Math.round(progress * 100)}%`
                    : 'Loading document...'
                }
              />
            )}
            onLoadComplete={(numberOfPages) =>
              setPaging({ url, page: 1, total: numberOfPages })
            }
            onPageChanged={(page, numberOfPages) =>
              setPaging({ url, page, total: numberOfPages })
            }
            onError={(e) => {
              const status = (e as { status?: number }).status;
              fail(
                status === 400 || status === 403
                  ? 'The preview link has expired. Close this and open the document again.'
                  : e.message || 'The file could not be read as a PDF.',
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

function Message({
  icon,
  tint,
  title,
  body,
  actionIcon,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tint: string;
  title: string;
  body: string;
  actionIcon: keyof typeof MaterialIcons.glyphMap;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.message}>
      <MaterialIcons name={icon} size={56} color={tint} />
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      <Pressable style={styles.action} onPress={onAction} accessibilityRole="button">
        <MaterialIcons name={actionIcon} size={18} color="#fff" />
        <Text style={styles.actionText}>{actionLabel}</Text>
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable style={styles.secondary} onPress={onSecondary} accessibilityRole="button">
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: SURFACE,
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
  pageCount: {
    minWidth: 36,
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff99',
    textAlign: 'right',
  },
  webview: { flex: 1, backgroundColor: SURFACE },
  pdf: { flex: 1, width: '100%', backgroundColor: SURFACE },

  message: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginTop: 4,
  },
  messageBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#ffffff99',
    textAlign: 'center',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    marginTop: 8,
  },
  actionText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  secondary: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryText: { fontSize: 14, fontWeight: '600', color: '#ffffff99' },

  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE,
  },
  loadingText: { color: '#ffffff99', fontSize: 13, marginTop: 12 },
});
