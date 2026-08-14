/**
 * Time picker producing an `HH:MM` string.
 *
 * The API and the database both store times as zero-padded 24-hour text, so this
 * component converts to and from that form rather than exposing a Date. That keeps the
 * timezone question from ever arising: a reporting time of 09:00 is 09:00 regardless of
 * where the device thinks it is.
 *
 * 09_Test_Plan §4 requires the picker to render correctly across iOS 15/17 and Android
 * 11/14, which is why the Android dialog is opened imperatively and the iOS spinner is
 * rendered inline — the two platforms disagree about what a time picker is.
 */

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

interface TimePickerFieldProps {
  label: string;
  /** `HH:MM` or null when unset. */
  value: string | null;
  onChange: (value: string) => void;
  error?: string | undefined;
  required?: boolean;
  helper?: string | undefined;
}

/** `HH:MM` -> Date on an arbitrary fixed day; only the time components are read back. */
function toDate(value: string | null): Date {
  const date = new Date();
  if (value) {
    const [hours, minutes] = value.split(':').map(Number);
    date.setHours(hours ?? 9, minutes ?? 0, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

function toTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function TimePickerField({
  label,
  value,
  onChange,
  error,
  required = false,
  helper,
}: TimePickerFieldProps) {
  const [visible, setVisible] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date): void => {
    // Android fires 'dismissed' on cancel; iOS reports every scroll as 'set'.
    if (Platform.OS === 'android') setVisible(false);
    if (event.type === 'dismissed' || !selected) return;
    onChange(toTimeString(selected));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>

      <Pressable
        onPress={() => setVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value ? `Currently ${value}.` : 'Not set.'} Tap to change.`}
        style={({ pressed }) => [
          styles.field,
          error ? styles.fieldError : null,
          pressed && styles.pressed,
        ]}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>
          {value ?? 'Select time'}
        </Text>
      </Pressable>

      {error ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}

      {visible ? (
        <>
          <DateTimePicker
            value={toDate(value)}
            mode="time"
            // The inline spinner is far easier to use than the compact iOS control here.
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleChange}
            // 09_Test_Plan §4: India uses 24-hour time.
            is24Hour
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => setVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Done choosing time"
              style={styles.doneButton}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg, flex: 1 },
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  required: { color: colors.danger },
  field: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  fieldError: { borderColor: colors.danger, borderWidth: 1.5 },
  pressed: { opacity: 0.85 },
  valueText: { fontSize: fontSize.body, color: colors.text, fontVariant: ['tabular-nums'] },
  placeholderText: { fontSize: fontSize.body, color: colors.textFaint },
  error: { marginTop: spacing.xs, fontSize: fontSize.small, color: colors.danger },
  helper: { marginTop: spacing.xs, fontSize: fontSize.caption, color: colors.textMuted },
  doneButton: { alignSelf: 'flex-end', minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: spacing.lg },
  doneText: { color: colors.primary, fontWeight: '700', fontSize: fontSize.body },
});
