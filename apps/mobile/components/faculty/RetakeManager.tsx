/**
 * Retake management for one student — the reviewer's side of attendance recovery.
 *
 * WHY THIS EXISTS AS A SCREEN AT ALL
 *
 * A missed day never appears in the review queue: there is no submission to list. So
 * without this the only way a reviewer could find the days a student was absent for
 * would be to read the history and subtract it from the calendar in their head, then
 * type the date by hand. This lists the days the server already counts as absent and
 * lets one be reopened in two taps.
 *
 * WHY A REASON IS REQUIRED
 *
 * Granting a retake is the only action in the app that can turn a recorded absence
 * into a recorded presence. That is the same weight as declining a submission, which
 * already requires a note, so the same rule applies: the reason is shown to the
 * student and stands as the justification on the record.
 *
 * Shared between the faculty and admin student screens, since both roles are reviewers.
 */

import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { MissedDay, RetakeInfo } from '@ims/shared-types';
import { RETAKE_DEFAULT_WINDOW_DAYS, RETAKE_REASON_MIN_LENGTH } from '@ims/shared-types';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/api/client';
import { useGrantRetake, useMissedDays, useRevokeRetake } from '@/lib/api/hooks';
import { formatLongDate, formatShortDate } from '@/lib/utils/dates';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

/** How many candidate days to show before the reviewer has to expand the list. */
const COLLAPSED_DAY_COUNT = 5;

export function RetakeManager({ studentId }: { studentId: string }) {
  const { data: missedDays, isLoading } = useMissedDays(studentId);
  const grant = useGrantRetake();
  const revoke = useRevokeRetake();

  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<MissedDay | null>(null);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const days = missedDays ?? [];

  // Two lists from one payload: days already reopened, and days that could be. The
  // server returns them together because they are the same days at different stages.
  // The open list is built as pairs so the non-null retake is provable rather than
  // asserted — a filter on `day.retake?.isActive` does not narrow `day.retake`.
  const granted = days.flatMap((day) =>
    day.retake && day.retake.isActive ? [{ day, retake: day.retake }] : [],
  );
  const candidates = days.filter((day) => !day.retake?.isActive);
  const visibleCandidates = expanded ? candidates : candidates.slice(0, COLLAPSED_DAY_COUNT);

  const closeModal = (): void => {
    setTarget(null);
    setReason('');
    setFormError(null);
  };

  const onGrant = async (): Promise<void> => {
    if (!target) return;
    setFormError(null);

    if (reason.trim().length < RETAKE_REASON_MIN_LENGTH) {
      setFormError(`Say why, in at least ${RETAKE_REASON_MIN_LENGTH} characters.`);
      return;
    }

    try {
      await grant.mutateAsync({
        studentId,
        targetDate: target.date,
        reason: reason.trim(),
      });
      closeModal();
    } catch (error) {
      setFormError(
        error instanceof ApiError ? error.message : 'Could not grant the retake. Try again.',
      );
    }
  };

  const onRevoke = (day: MissedDay, retakeId: string): void => {
    Alert.alert(
      'Withdraw this retake?',
      `${formatLongDate(day.date)} will close again before the student uses their attempt.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => {
            void revoke.mutateAsync(retakeId).catch((error: unknown) => {
              Alert.alert(
                'Could not withdraw',
                error instanceof ApiError ? error.message : 'Try again.',
              );
            });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <MaterialIcons name="event-repeat" size={18} color={colors.primary} />
        <Text style={styles.sectionTitle}>Retakes</Text>
      </View>

      <Text style={styles.intro}>
        A day the student missed is counted absent and cannot be answered any more.
        Reopening one gives them a single attempt, and it counts as present once you
        approve it.
      </Text>

      {isLoading ? (
        <Text style={styles.muted}>Loading days...</Text>
      ) : days.length === 0 ? (
        <Text style={styles.muted}>
          Every elapsed day is approved. There is nothing to reopen.
        </Text>
      ) : (
        <>
          {/* ---- Already reopened ---- */}
          {granted.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>Open now</Text>
              {granted.map(({ day, retake }) => (
                <GrantedRow
                  key={day.date}
                  day={day}
                  retake={retake}
                  onRevoke={() => onRevoke(day, retake.id)}
                  busy={revoke.isPending}
                />
              ))}
            </View>
          ) : null}

          {/* ---- Candidates ---- */}
          {candidates.length > 0 ? (
            <View style={styles.group}>
              <Text style={styles.groupLabel}>
                Counted absent ({candidates.length})
              </Text>
              {visibleCandidates.map((day) => (
                <CandidateRow key={day.date} day={day} onPress={() => setTarget(day)} />
              ))}

              {candidates.length > COLLAPSED_DAY_COUNT ? (
                <Pressable
                  onPress={() => setExpanded((previous) => !previous)}
                  style={styles.expandRow}
                  accessibilityRole="button"
                >
                  <Text style={styles.expandText}>
                    {expanded
                      ? 'Show fewer'
                      : `Show all ${candidates.length} days`}
                  </Text>
                  <MaterialIcons
                    name={expanded ? 'expand-less' : 'expand-more'}
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </>
      )}

      {/* ---- Grant modal ---- */}
      <Modal
        visible={target !== null}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalSheet}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Reopen a day</Text>
                <Pressable
                  onPress={closeModal}
                  style={styles.modalClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <MaterialIcons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              {target ? (
                <View style={styles.modalTargetBox}>
                  <MaterialIcons name="event" size={18} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTargetDate}>{formatLongDate(target.date)}</Text>
                    <Text style={styles.modalTargetMeta}>
                      {describeStatus(target.status)}
                    </Text>
                  </View>
                </View>
              ) : null}

              <TextField
                label="Why are you reopening this day?"
                required
                multiline
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Student was hospitalised and produced a medical certificate."
                error={formError ?? undefined}
                helper={`The student sees this. It stays on the record as the reason their attendance changed.`}
              />

              <View style={styles.modalNote}>
                <MaterialIcons name="schedule" size={16} color={colors.textMuted} />
                <Text style={styles.modalNoteText}>
                  They get one attempt, within {RETAKE_DEFAULT_WINDOW_DAYS} days from
                  today. The day closes again as soon as they submit, or when the deadline
                  passes.
                </Text>
              </View>

              <Button
                label="Reopen this day"
                onPress={() => void onGrant()}
                loading={grant.isPending}
              />
              <View style={{ height: spacing.sm }} />
              <Button label="Cancel" variant="ghost" onPress={closeModal} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

/** A day that is currently reopened. */
function GrantedRow({
  day,
  retake,
  onRevoke,
  busy,
}: {
  day: MissedDay;
  retake: RetakeInfo;
  onRevoke: () => void;
  busy: boolean;
}) {
  return (
    <View style={[styles.row, styles.rowOpen]}>
      <View style={styles.dateCircleOpen}>
        <MaterialIcons name="lock-open" size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDate}>{formatShortDate(day.date)}</Text>
        <Text style={styles.rowMeta}>
          One attempt, open until {formatShortDate(retake.expiresOn)}
        </Text>
        {retake.reason ? (
          <Text style={styles.rowReason} numberOfLines={2}>
            {retake.reason}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onRevoke}
        disabled={busy}
        style={styles.revokeBtn}
        accessibilityRole="button"
        accessibilityLabel={`Withdraw the retake for ${formatLongDate(day.date)}`}
      >
        <Text style={styles.revokeText}>Withdraw</Text>
      </Pressable>
    </View>
  );
}

/** A day counted absent that could be reopened. */
function CandidateRow({ day, onPress }: { day: MissedDay; onPress: () => void }) {
  // A grant that exists but can no longer be used: answered, withdrawn, or lapsed.
  const spent = day.retake !== null && !day.retake.isActive;

  return (
    <View style={styles.row}>
      <View style={styles.dateCircle}>
        <Text style={styles.dateDay}>
          {new Date(`${day.date}T00:00:00Z`).getUTCDate()}
        </Text>
        <Text style={styles.dateMonth}>
          {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(undefined, {
            month: 'short',
            timeZone: 'UTC',
          })}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDate}>{formatShortDate(day.date)}</Text>
        <Text style={styles.rowMeta}>
          {describeStatus(day.status)}
          {spent ? ` \u00b7 ${describeSpentRetake(day.retake)}` : ''}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        style={styles.grantBtn}
        accessibilityRole="button"
        accessibilityLabel={`Reopen ${formatLongDate(day.date)}`}
      >
        <MaterialIcons name="lock-open" size={14} color={colors.primary} />
        <Text style={styles.grantText}>{spent ? 'Reopen again' : 'Reopen'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Why an existing grant is no longer usable.
 *
 * "Used" is checked before the deadline, because a retake that was answered and then
 * declined is also past nothing — it is spent, and saying "expired" would suggest the
 * student simply ran out of time.
 */
function describeSpentRetake(retake: RetakeInfo | null): string {
  if (!retake) return '';
  if (retake.revokedAt) return 'retake withdrawn';
  if (retake.usedAt) return 'retake already used';
  return 'retake expired';
}

/** Why the day is not counted present, in the reviewer's terms. */
function describeStatus(status: MissedDay['status']): string {
  switch (status) {
    case 'missing':
      return 'Never answered';
    case 'pending':
      return 'Answered, awaiting your review';
    case 'declined':
      return 'You declined this day';
  }
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, padding: 16, ...shadow.card },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  intro: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginBottom: 14 },
  muted: { fontSize: 13, color: colors.textMuted },

  group: { marginBottom: spacing.md },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowOpen: {
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderBottomWidth: 0,
  },
  dateCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCircleOpen: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: { fontSize: 14, fontWeight: '800', color: colors.text, lineHeight: 16 },
  dateMonth: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  rowDate: { fontSize: 13, fontWeight: '700', color: colors.text },
  rowMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowReason: { fontSize: 11, color: colors.textMuted, marginTop: 3, fontStyle: 'italic' },

  grantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  grantText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  revokeBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  revokeText: { fontSize: 12, fontWeight: '700', color: colors.danger },

  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 10,
  },
  expandText: { fontSize: 12, fontWeight: '600', color: colors.primary },

  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.text },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTargetBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  modalTargetDate: { fontSize: fontSize.small, fontWeight: '700', color: colors.text },
  modalTargetMeta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 1 },
  modalNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  modalNoteText: { flex: 1, fontSize: fontSize.caption, color: colors.textMuted, lineHeight: 16 },
});
