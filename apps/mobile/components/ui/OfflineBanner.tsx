/**
 * Offline / syncing banner — 12_Mobile_App_Spec §3, 06_App_Flow §4.
 *
 * Three states, in priority order:
 *   offline           -> "You're offline — submissions will sync automatically"
 *   syncing           -> "Syncing…"
 *   pending & online  -> "N item(s) waiting to sync"  (tap to retry)
 *
 * Renders nothing when connected with an empty queue, so a healthy app has no banner.
 *
 * The offline copy is deliberately reassuring rather than alarming: 01_PRD §5.1 and
 * 02_SRS §5 make offline a supported mode, not an error, and a student in an office
 * basement should not think their work is being lost.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing, touchTarget } from '@/constants/theme';
import { useSyncStore } from '@/stores/syncStore';

export function OfflineBanner() {
  const isConnected = useSyncStore((state) => state.isConnected);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const triggerSync = useSyncStore((state) => state.triggerSync);

  if (isConnected && !isSyncing && pendingCount === 0) return null;

  const state = !isConnected ? 'offline' : isSyncing ? 'syncing' : 'pending';

  const message =
    state === 'offline'
      ? "You're offline — submissions will sync automatically"
      : state === 'syncing'
        ? 'Syncing your submissions\u2026'
        : `${pendingCount} item${pendingCount === 1 ? '' : 's'} waiting to sync`;

  const palette =
    state === 'offline'
      ? { background: colors.warningBg, text: colors.warning }
      : { background: colors.infoBg, text: colors.info };

  // Only the actionable state is tappable; retrying while offline would do nothing.
  const canRetry = state === 'pending';

  const body = (
    <View style={[styles.banner, { backgroundColor: palette.background }]}>
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
      {canRetry ? <Text style={[styles.action, { color: palette.text }]}>Retry</Text> : null}
    </View>
  );

  if (!canRetry) {
    return (
      <View
        accessibilityRole="alert"
        accessibilityLabel={message}
        accessibilityLiveRegion="polite"
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => void triggerSync()}
      accessibilityRole="button"
      accessibilityLabel={`${message}. Tap to retry now.`}
      style={styles.pressable}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { minHeight: touchTarget },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  text: { fontSize: fontSize.small, fontWeight: '500', flex: 1 },
  action: { fontSize: fontSize.small, fontWeight: '700', marginLeft: spacing.md },
});
