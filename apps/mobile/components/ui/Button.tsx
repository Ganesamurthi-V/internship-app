/**
 * Button.
 *
 * Accessibility, per 02_SRS §8 and 12_Mobile_App_Spec §9:
 *   - `minHeight` is the shared 48 touch target,
 *   - `accessibilityRole="button"` and a label on every instance,
 *   - `accessibilityState` carries disabled and busy, so a screen reader announces a
 *     submitting button as busy rather than silently doing nothing.
 */

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  /** Overrides the label for screen readers when the label alone lacks context. */
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = true,
  icon,
  accessibilityLabel,
}: ButtonProps) {
  const isInactive = disabled || loading;
  const palette = PALETTES[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.background, borderColor: palette.border },
        fullWidth && styles.fullWidth,
        pressed && !isInactive && styles.pressed,
        isInactive && styles.inactive,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const PALETTES: Record<Variant, { background: string; text: string; border: string }> = {
  primary: { background: colors.primary, text: colors.onPrimary, border: colors.primary },
  secondary: { background: colors.surface, text: colors.primary, border: colors.borderStrong },
  danger: { background: colors.danger, text: colors.onPrimary, border: colors.danger },
  ghost: { background: 'transparent', text: colors.primary, border: 'transparent' },
};

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: fontSize.body, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  // Opacity rather than a grey fill, so the disabled state still meets contrast.
  inactive: { opacity: 0.5 },
});
