/**
 * Labelled text input with error and helper text.
 *
 * 12_Mobile_App_Spec §9 requires every `TextInput` to carry an `accessibilityLabel`,
 * and requires error messages to be announced. The error is rendered in an
 * `accessibilityLiveRegion="polite"` container so TalkBack and VoiceOver speak it when
 * it appears, instead of the user discovering it only by navigating back to the field.
 */

import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  helper?: string | undefined;
  required?: boolean;
  /** Renders a taller multi-line box, for activity and reflection fields. */
  multiline?: boolean;
  /** Slot for a WordCounter, shown on the right of the label row. */
  accessory?: React.ReactNode;
  /**
   * Slot rendered directly beneath the input, above any error or helper text.
   *
   * Separate from `accessory` because a live word count belongs next to what is being
   * counted, and because it has to stay visible when an error appears — the moment a
   * student is over the limit is exactly when they need to see the number.
   */
  footer?: React.ReactNode;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, helper, required = false, multiline = false, accessory, footer, ...inputProps },
  ref,
) {
  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {accessory}
      </View>

      <TextInput
        ref={ref}
        {...inputProps}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          error ? styles.inputError : null,
        ]}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
        // React Native's AccessibilityState has no `invalid` member, so the error is
        // announced by the live region below and folded into the hint here instead.
        accessibilityHint={error ?? helper}
      />

      {footer ? <View style={styles.footer}>{footer}</View> : null}

      {error ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text },
  required: { color: colors.danger },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  // Right-aligned so a live count sits under the end of the input and does not compete
  // with the error text that appears below it.
  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  inputError: { borderColor: colors.danger, borderWidth: 1.5 },
  error: { marginTop: spacing.xs, fontSize: fontSize.small, color: colors.danger },
  helper: { marginTop: spacing.xs, fontSize: fontSize.caption, color: colors.textMuted },
});
