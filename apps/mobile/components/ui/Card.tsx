/**
 * Card container, plus the summary tile used by the dashboards.
 *
 * `SummaryCard` backs the faculty summary cards in 06_App_Flow §7 ("Active
 * Internships: 48", "Missing Today's Log: 12", …). When `onPress` is supplied it
 * becomes the drill-down control described there.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, shadow, spacing, touchTarget } from '@/constants/theme';

interface CardProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function Card({ children, title, subtitle, onPress, accessibilityLabel }: CardProps) {
  const body = (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {body}
    </Pressable>
  );
}

interface SummaryCardProps {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  onPress?: () => void;
  hint?: string;
}

export function SummaryCard({ label, value, tone = 'neutral', onPress, hint }: SummaryCardProps) {
  const palette = TONES[tone];

  const body = (
    <View style={[styles.summary, { backgroundColor: palette.background }]}>
      <Text style={[styles.summaryValue, { color: palette.text }]}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={2}>
        {label}
      </Text>
      {hint ? <Text style={styles.summaryHint}>{hint}</Text> : null}
    </View>
  );

  if (!onPress) {
    return (
      <View style={styles.summaryWrapper} accessibilityLabel={`${label}: ${value}`}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Tap to view.`}
      style={({ pressed }) => [styles.summaryWrapper, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const TONES = {
  neutral: { background: colors.surface, text: colors.primary },
  success: { background: colors.successBg, text: colors.success },
  warning: { background: colors.warningBg, text: colors.warning },
  danger: { background: colors.dangerBg, text: colors.danger },
} as const;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  title: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 2 },
  pressed: { opacity: 0.85 },

  // Two per row with the parent's 12pt gap.
  summaryWrapper: { flexBasis: '48%', flexGrow: 1, minHeight: touchTarget },
  summary: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  summaryValue: { fontSize: fontSize.heading, fontWeight: '800', fontVariant: ['tabular-nums'] },
  summaryLabel: { fontSize: fontSize.small, color: colors.text, marginTop: spacing.xs },
  summaryHint: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
});
