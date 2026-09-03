/**
 * Labelled text input with error and helper text.
 *
 * 12_Mobile_App_Spec §9 requires every `TextInput` to carry an `accessibilityLabel`,
 * and requires error messages to be announced. The error is rendered in an
 * `accessibilityLiveRegion="polite"` container so TalkBack and VoiceOver speak it when
 * it appears, instead of the user discovering it only by navigating back to the field.
 *
 * Passing `secureTextEntry` also gets a show/hide toggle inside the right edge of the
 * input. Password rules are worth nothing if the person typing cannot check what they
 * typed, and this matters most where a password is being *set* for someone else — an
 * admin creating a faculty account has to read the value back before handing it over.
 */

import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
  /**
   * Show/hide toggle for `secureTextEntry` fields. On by default; set `false` for the
   * rare field that should never be readable on screen.
   */
  showPasswordToggle?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    helper,
    required = false,
    multiline = false,
    accessory,
    footer,
    showPasswordToggle = true,
    secureTextEntry,
    ...inputProps
  },
  ref,
) {
  const [revealed, setRevealed] = useState(false);
  const withToggle = Boolean(secureTextEntry) && showPasswordToggle;

  const input = (
    <TextInput
      ref={ref}
      // Autocorrect and sentence casing exist to rewrite prose. Applied to a password
      // they corrupt it, and they become reachable the moment the field is revealed.
      autoCapitalize={secureTextEntry ? 'none' : undefined}
      autoCorrect={secureTextEntry ? false : undefined}
      {...inputProps}
      multiline={multiline}
      secureTextEntry={secureTextEntry && !revealed}
      style={[
        withToggle ? null : styles.inputBox,
        styles.inputText,
        withToggle ? styles.inputInRow : null,
        multiline && styles.multiline,
        error && !withToggle ? styles.inputError : null,
      ]}
      placeholderTextColor={colors.textFaint}
      accessibilityLabel={label}
      // React Native's AccessibilityState has no `invalid` member, so the error is
      // announced by the live region below and folded into the hint here instead.
      accessibilityHint={error ?? helper}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {accessory}
      </View>

      {withToggle ? (
        // The border moves to this row so the eye sits inside the field outline rather
        // than beside it, and so the focus/error outline still frames both together.
        <View style={[styles.inputBox, styles.inputRow, error ? styles.inputError : null]}>
          {input}
          <Pressable
            onPress={() => setRevealed((prev) => !prev)}
            hitSlop={10}
            style={styles.revealButton}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <MaterialIcons
              name={revealed ? 'visibility' : 'visibility-off'}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
        </View>
      ) : (
        input
      )}

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
  // Split from `inputText` so that a field with a trailing button can put the outline on
  // the wrapping row while the TextInput keeps only its typography and padding.
  inputBox: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  inputText: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  // The row owns the outline and the 48pt floor; the input only has to fill it.
  inputInRow: { flex: 1 },
  // Stretched rather than padded vertically so the tap target fills the field height.
  revealButton: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  // Right-aligned so a live count sits under the end of the input and does not compete
  // with the error text that appears below it.
  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xs },
  inputError: { borderColor: colors.danger, borderWidth: 1.5 },
  error: { marginTop: spacing.xs, fontSize: fontSize.small, color: colors.danger },
  helper: { marginTop: spacing.xs, fontSize: fontSize.caption, color: colors.textMuted },
});
