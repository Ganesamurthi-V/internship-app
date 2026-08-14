/**
 * "Pending Sync (N)" badge — 12_Mobile_App_Spec §3, 06_App_Flow §4.
 *
 * Renders nothing when the queue is empty, so it only ever appears when there is
 * something to tell the student about.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';
import { useSyncStore } from '@/stores/syncStore';

interface SyncBadgeProps {
  /** Compact form for a header slot; full form for inside a card. */
  compact?: boolean;
}

export function SyncBadge({ compact = false }: SyncBadgeProps) {
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const isSyncing = useSyncStore((state) => state.isSyncing);
  const triggerSync = useSyncStore((state) => state.triggerSync);

  if (pendingCount === 0 && !isSyncing) return null;

  const text = isSyncing
    ? 'Syncing\u2026'
    : compact
      ? String(pendingCount)
      : `Pending Sync (${pendingCount})`;

  const accessibilityLabel = isSyncing
    ? 'Syncing your submissions'
    : `${pendingCount} submission${pendingCount === 1 ? '' : 's'} waiting to sync. Tap to sync now.`;

  return (
    <Pressable
      onPress={() => void triggerSync()}
      disabled={isSyncing}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: isSyncing }}
      style={[styles.pressable, compact && styles.compactPressable]}
    >
      <View style={[styles.badge, compact && styles.compactBadge]}>
        <Text style={styles.text}>{text}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { minHeight: touchTarget, justifyContent: 'center' },
  // The header slot cannot afford 48pt; the tap area is still comfortable.
  compactPressable: { minHeight: 36, marginRight: spacing.md, justifyContent: 'center' },
  badge: {
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
  },
  compactBadge: { paddingHorizontal: spacing.sm, minWidth: 26, alignItems: 'center' },
  text: { color: colors.onPrimary, fontSize: fontSize.caption, fontWeight: '700' },
});
