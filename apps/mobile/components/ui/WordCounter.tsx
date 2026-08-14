/**
 * Live word counter — 12_Mobile_App_Spec §3, 01_PRD §4.3, 02_SRS §2.3.
 *
 * The activities field is capped at 200 words and the learning field at 100, and both
 * show a live counter. The count comes from `countWords` in @ims/shared-validation —
 * the exact function the server validates with — so a student can never see "198/200"
 * and then have the submission rejected.
 *
 * 01_PRD §4.3 also asks for a 150–200 word target on activities, so `recommendedMin`
 * renders a gentle "aim for at least N" hint that never blocks submission.
 */

import { StyleSheet, Text, View } from 'react-native';
import { countWords } from '@ims/shared-validation';
import { colors, fontSize } from '@/constants/theme';

interface WordCounterProps {
  value: string;
  max: number;
  /** Soft target. Below this the counter hints, but the field stays valid. */
  recommendedMin?: number;
}

export function WordCounter({ value, max, recommendedMin }: WordCounterProps) {
  const count = countWords(value);
  const isOver = count > max;
  // "Near" starts at 90% so the warning arrives with time to edit, not at 199.
  const isNear = !isOver && count >= max * 0.9;
  const isBelowTarget = recommendedMin !== undefined && count > 0 && count < recommendedMin;

  const color = isOver
    ? colors.danger
    : isNear
      ? colors.warning
      : isBelowTarget
        ? colors.textMuted
        : colors.textMuted;

  return (
    <View style={styles.container}>
      {isBelowTarget && !isOver ? (
        <Text style={styles.hint}>aim for {recommendedMin}+</Text>
      ) : null}
      <Text
        style={[styles.count, { color }, isOver && styles.over]}
        // Announced as a single phrase; the raw "12/200" reads poorly aloud.
        accessibilityLabel={
          isOver
            ? `${count} words. Over the ${max} word limit by ${count - max}.`
            : `${count} of ${max} words used.`
        }
        accessibilityLiveRegion={isOver ? 'polite' : 'none'}
      >
        {count}/{max}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hint: { fontSize: fontSize.caption, color: colors.textFaint },
  count: { fontSize: fontSize.caption, fontVariant: ['tabular-nums'] },
  over: { fontWeight: '700' },
});
