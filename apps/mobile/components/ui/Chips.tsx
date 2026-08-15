/**
 * Single-select chip group.
 *
 * Used for choice-type question answers, status filters and the question editor's
 * type picker — anywhere a small fixed set is faster to tap than a dropdown is to
 * open.
 *
 * Selection uses `accessibilityRole="radio"` with `checked` state, so a screen reader
 * describes the group correctly instead of announcing a row of unrelated buttons.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

interface ChipGroupProps<T extends string> {
  label?: string;
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | undefined;
  required?: boolean;
  /** Renders the group read-only, for a submission that can no longer be changed. */
  disabled?: boolean;
}

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  required = false,
  disabled = false,
}: ChipGroupProps<T>) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: selected, selected, disabled }}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : styles.chipUnselected,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text
                style={[styles.chipText, selected ? styles.chipTextSelected : undefined]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  required: { color: colors.danger },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    // Height meets the 48 touch target; horizontal padding keeps the label readable.
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipUnselected: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.small, fontWeight: '600', color: colors.text },
  chipTextSelected: { color: colors.onPrimary },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  error: { marginTop: spacing.xs, fontSize: fontSize.small, color: colors.danger },
});
