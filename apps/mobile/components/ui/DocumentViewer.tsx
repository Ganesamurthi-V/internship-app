/**
 * In-app document viewer for student verification documents.
 *
 * PDFs are downloaded via expo-file-system (reliable on mobile networks), then rendered
 * locally by react-native-pdf. Images render inline in a WebView.
 *
 * The previous implementation pointed a WebView at docs.google.com/gview, which leaked
 * the signed URL to a third party and failed with net::ERR_FAILED on Android. This
 * version keeps the credential on the direct path to Supabase Storage.
 */

import { useEffect, useRef, useState } from 'react';
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
import { File, Directory, Paths, DownloadTask } from 'expo-file-system';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors } from '@/constants/theme';

interface DocumentViewerProps {
  visible: boolean;
  url: string;
  filename?: string;
  mimeType?: string;
  onClose: () => void;
}

const SURFACE = '#1a1d2e';

/**
 * `react-native-pdf`, resolved on first use instead of imported at module scope.
 *
 * It depends on `react-native-blob-util`, whose `fs.js` calls `getConstants()` on its
 * native module while the module is still being evaluated. That lookup uses
 * `TurboModuleRegistry.get`, which returns `null` rather than throwing when the module is
 * absent from the binary — so the call becomes `null.getConstants()` and the import throws.
 *
 * A static import puts that throw in the import graph of every screen that shows a
 * document, and it took out three unrelated routes at once (review detail, pending
 * approvals, the answer form). Each was reported only as "missing the required default
 * export", because the module never finished evaluating and so never assigned one.
 *
 * Requiring it here moves that failure inside a `try` and confines it to the PDF branch:
 * the surrounding screen still loads and the viewer offers the device's own PDF app. A
 * renderer for an optional preview should not be a hard dependency of a review workflow.
 */
type PdfComponent = typeof import('react-native-pdf').default;
let cachedPdf: PdfComponent | null | undefined;

function resolvePdfRenderer(): PdfComponent | null {
  if (cachedPdf !== undefined) return cachedPdf;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedPdf = (require('react-native-pdf') as { default: PdfComponent }).default;
  } catch {
    cachedPdf = null;
  }
  return cachedPdf;
}

export function DocumentViewer({ visible, url, filename, mimeType, onClose }: DocumentViewerProps) {
  const insets = useSafeAreaInsets();

  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  const [paging, setPaging] = useState<{ url: string; page: number; total: number } | null>(null);
  const [localPdf, setLocalPdf] = useState<{ url: string; path: string } | null>(null);
  const [progress, setProgress] = useState(0);

  const error = failure?.url === url ? failure.message : null;
  const pages = paging?.url === url ? paging : null;
  const pdfPath = localPdf?.url === url ? localPdf.path : null;

  // Tracks the URL currently being downloaded so the effect never re-enters for the
  // same file. A `downloading` state variable cannot do this: setting it would re-run
  // the effect, whose cleanup would then cancel the very download that set it.
  const downloadingUrlRef = useRef<string | null>(null);

  const isImage =
    mimeType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(filename ?? '');

  // Resolved during render rather than in an effect, so the download below can be skipped
  // entirely when there is nothing able to display the result.
  const Pdf = isImage ? null : resolvePdfRenderer();
  const canRenderPdf = Pdf !== null;

  const fail = (message: string) => setFailure({ url, message });

  // Download PDF to local cache using expo-file-system, which handles mobile networks
  // reliably. react-native-pdf's built-in downloader (react-native-blob-util) throws
  // on content-length mismatches from interrupted connections.
  useEffect(() => {
    if (!visible || !url || isImage || pdfPath || error) return;
    // No renderer means the bytes have nowhere to go; the device viewer fetches its own.
    if (!canRenderPdf) return;
    if (downloadingUrlRef.current === url) return;

    downloadingUrlRef.current = url;
    let cancelled = false;
    const cacheDir = new Directory(Paths.cache, 'doc-viewer');
    const localFile = new File(cacheDir, `doc-${Date.now()}.pdf`);

    const doDownload = async () => {
      setProgress(0);
      try {
        if (!cacheDir.exists) {
          cacheDir.create();
        }

        const task = new DownloadTask(url, localFile, {
          onProgress: (p) => {
            if (p.totalBytes > 0) {
              setProgress(p.bytesWritten / p.totalBytes);
            }
          },
        });

        const result = await task.downloadAsync();
        if (cancelled) {
          try { localFile.delete(); } catch {}
          return;
        }

        if (!result || !result.exists) {
          fail('Download failed. Check your connection and try again.');
          return;
        }

        setLocalPdf({ url, path: result.uri });
      } catch (e) {
        if (!cancelled) {
          fail(e instanceof Error ? e.message : 'Download failed. Check your connection.');
        }
      } finally {
        if (downloadingUrlRef.current === url) downloadingUrlRef.current = null;
      }
    };

    void doDownload();
    return () => { cancelled = true; };
  }, [visible, url, isImage, pdfPath, error, canRenderPdf]);

  // Clean up cached file when viewer closes
  useEffect(() => {
    if (!visible && localPdf) {
      try { new File(localPdf.path).delete(); } catch {}
      setLocalPdf(null);
    }
  }, [visible]);

  const openInDeviceViewer = async () => {
    try {
      await Linking.openURL(url);
    } catch {
      fail('No app on this device can open this file.');
    }
  };

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

  if (!visible || !url) return null;

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
            onSecondary={() => {
              downloadingUrlRef.current = null;
              setFailure(null);
              setLocalPdf(null);
            }}
          />
        ) : isImage ? (
          <WebView
            style={styles.webview}
            source={{ html: imageHtml }}
            originWhitelist={['*']}
            scalesPageToFit
            startInLoadingState
            renderLoading={() => <Loading label="Loading document..." progress={0} />}
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
        ) : !Pdf ? (
          <Message
            icon="picture-as-pdf"
            tint="#ffffffcc"
            title={filename ?? 'PDF document'}
            body="This build cannot preview PDFs in the app. Opens in your device's PDF viewer instead."
            actionIcon="open-in-new"
            actionLabel="Open in device viewer"
            onAction={() => void openInDeviceViewer()}
          />
        ) : pdfPath ? (
          <Pdf
            style={styles.pdf}
            source={{ uri: pdfPath }}
            trustAllCerts={false}
            fitPolicy={0}
            spacing={8}
            enableAntialiasing
            enableDoubleTapZoom
            renderActivityIndicator={() => <Loading label="Rendering PDF..." progress={1} />}
            onLoadComplete={(numberOfPages) =>
              setPaging({ url, page: 1, total: numberOfPages })
            }
            onPageChanged={(page, numberOfPages) =>
              setPaging({ url, page, total: numberOfPages })
            }
            onError={(e) => fail(e.message || 'The file could not be read as a PDF.')}
          />
        ) : (
          <Loading
            label={
              progress > 0 && progress < 1
                ? `Downloading... ${Math.round(progress * 100)}%`
                : 'Downloading document...'
            }
            progress={progress}
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

function Loading({ label, progress }: { label: string; progress: number }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
      {progress > 0 && progress < 1 ? (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
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
  progressBar: {
    width: 200,
    height: 3,
    backgroundColor: '#ffffff20',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
});
