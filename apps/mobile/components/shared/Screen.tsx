/**
 * Screen wrapper — 12_Mobile_App_Spec §3 (`shared/Screen.tsx`).
 *
 * Safe-area padding plus an optional scroll container, and the offline banner pinned
 * at the top so every screen reports connectivity without repeating the markup
 * (06_App_Flow §4 "Offline Banner Behaviour").
 */

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/constants/theme';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

interface ScreenProps {
  children: ReactNode;
  /** Set false for screens that manage their own scrolling, e.g. a FlatList. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Hides the connectivity banner, for the login screen where it adds noise. */
  hideOfflineBanner?: boolean;
  padded?: boolean;
  footer?: ReactNode;
}

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  hideOfflineBanner = false,
  padded = true,
  footer,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        padded && styles.padded,
        // Leaves room for the home indicator and any sticky footer.
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh
          ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={colors.primary} />
          : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded]}>{children}</View>
  );

  return (
    <View style={styles.container}>
      {!hideOfflineBanner && <OfflineBanner />}
      {/* `padding` on iOS and `height` on Android is the combination that keeps a
          focused input visible without the layout jumping. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {content}
      </KeyboardAvoidingView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  padded: { padding: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
