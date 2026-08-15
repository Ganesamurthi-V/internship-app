/**
 * Submission status badge.
 *
 * Colour and text both carry the meaning, never colour alone — a colour-blind user
 * has to be able to tell approved from declined.
 */

import { StyleSheet, Text, View } from 'react-native';
import type { SubmissionStatus } from '@ims/shared-types';
import { SUBMISSION_STATUS_LABELS } from '@ims/shared-types';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

const TONE: Record<SubmissionStatus, { bg: string; fg: string }> = {
  approved: { bg: colors.successBg, fg: colors.success },
  pending: { bg: colors.warningBg, fg: colors.warning },
  declined: { bg: colors.dangerBg, fg: colors.danger },
};

export function StatusPill({
  status,
  compact = false,
}: {
  status: SubmissionStatus;
  compact?: boolean;
}) {
  const tone = TONE[status];

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: tone.bg },
        compact ? styles.pillCompact : null,
      ]}
      accessibilityLabel={SUBMISSION_STATUS_LABELS[status]}
    >
      <Text style={[styles.label, { color: tone.fg }, compact ? styles.labelCompact : null]}>
        {SUBMISSION_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  pillCompact: { paddingHorizontal: spacing.sm, paddingVertical: 3 },
  label: { fontSize: fontSize.small, fontWeight: '700' },
  labelCompact: { fontSize: fontSize.caption },
});
