/**
 * Daily attendance form — 01_PRD §4.2, 02_SRS §2.2, 06_App_Flow §4.
 *
 * Field set and behaviour are taken directly from the flow document:
 *   - date, auto-filled and read-only
 *   - status chips: Present / Absent / Permission-Leave / Holiday / Weekly Off
 *   - if Present: reporting time, leaving time, mode chips, optional proof
 *   - if Absent or Leave: reason (required)
 *
 * Two design rules from the documents are load-bearing here:
 *
 *  1. "Proof upload must remain optional. Do not block submission if proof is
 *     unavailable." (01_PRD §4.2) — there is no validation path that requires it.
 *
 *  2. Submission always writes to the local database first and lets the sync engine
 *     deliver it. Online and offline therefore take the *same* code path, which is why
 *     an offline submission cannot behave differently from an online one — there is no
 *     second implementation to diverge.
 */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  ATTENDANCE_MODES,
  ATTENDANCE_MODE_LABELS,
  ATTENDANCE_STATUSES,
  ATTENDANCE_STATUSES_REQUIRING_REASON,
  ATTENDANCE_STATUS_LABELS,
  NON_WORKING_ATTENDANCE_STATUSES,
  type AttendanceMode,
  type AttendanceStatus,
} from '@ims/shared-types';
import { calculateTotalHours, createAttendanceSchema } from '@ims/shared-validation';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/Chips';
import { TextField } from '@/components/ui/TextField';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { useMyInternship } from '@/lib/api/hooks';
import { attendanceDrafts } from '@/lib/db/database';
import { generateClientId } from '@/lib/utils/id';
import { useSyncStore } from '@/stores/syncStore';
import { colors, fontSize, spacing } from '@/constants/theme';

/** Today's date in the device's own timezone, as `YYYY-MM-DD`. */
function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AttendanceTodayScreen() {
  const { data: internshipData, isLoading } = useMyInternship();
  const triggerSync = useSyncStore((state) => state.triggerSync);
  const isConnected = useSyncStore((state) => state.isConnected);

  const internship = internshipData?.value?.internship ?? null;
  const internshipId = internship?.id;
  const date = todayLocal();

  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [reportingTime, setReportingTime] = useState<string | null>(null);
  const [leavingTime, setLeavingTime] = useState<string | null>(null);
  const [mode, setMode] = useState<AttendanceMode | null>(null);
  const [leaveReason, setLeaveReason] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [existingDraft, setExistingDraft] = useState<{ synced: boolean } | null>(null);

  /**
   * Load any draft already recorded for today, so reopening the screen shows what was
   * entered rather than a blank form inviting a duplicate.
   */
  useEffect(() => {
    if (!internshipId) return;

    void (async () => {
      const draft = await attendanceDrafts.findByDate(internshipId, date);
      if (!draft) return;

      setStatus(draft.status as AttendanceStatus);
      setReportingTime(draft.reporting_time);
      setLeavingTime(draft.leaving_time);
      setMode(draft.mode as AttendanceMode | null);
      setLeaveReason(draft.leave_reason ?? '');
      setExistingDraft({ synced: draft.sync_status === 'synced' });
    })();
  }, [internshipId, date]);

  const isNonWorking = status !== null && NON_WORKING_ATTENDANCE_STATUSES.includes(status);
  const needsReason = status !== null && ATTENDANCE_STATUSES_REQUIRING_REASON.includes(status);

  /** Live preview of the auto-calculated hours (01_PRD §4.2 "Total hours (auto-calculated)"). */
  const totalHours = useMemo(
    () => calculateTotalHours(reportingTime, leavingTime),
    [reportingTime, leavingTime],
  );

  const onSubmit = async (): Promise<void> => {
    if (!internshipId || !status) {
      setErrors({ status: 'Select an attendance status.' });
      return;
    }

    setSubmitting(true);
    setErrors({});

    // Validate with the same schema the server uses, so the student sees the same
    // message locally that the API would return.
    const candidate = {
      internshipId,
      date,
      status,
      reportingTime: isNonWorking ? null : reportingTime,
      leavingTime: isNonWorking ? null : leavingTime,
      mode: isNonWorking ? null : mode,
      leaveReason: leaveReason.trim().length > 0 ? leaveReason.trim() : null,
      clientId: null,
    };

    const parsed = createAttendanceSchema.safeParse(candidate);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setSubmitting(false);
      return;
    }

    try {
      // Reuse the existing clientId when editing an unsent draft; the upsert keys on
      // (internship, date) and keeps the original id.
      const existing = await attendanceDrafts.findByDate(internshipId, date);

      await attendanceDrafts.upsert({
        clientId: existing?.client_id ?? generateClientId(),
        internshipId,
        date,
        status,
        reportingTime: parsed.data.reportingTime ?? null,
        leavingTime: parsed.data.leavingTime ?? null,
        mode: parsed.data.mode ?? null,
        leaveReason: parsed.data.leaveReason ?? null,
      });

      // Fire and forget: the record is already durable locally, so a failed sync is not
      // a failed submission.
      void triggerSync();

      router.back();
    } catch (error) {
      setErrors({
        _: error instanceof Error ? error.message : 'Could not save your attendance.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading\u2026</Text>
      </Screen>
    );
  }

  if (!internship || (internship.status !== 'approved' && internship.status !== 'active')) {
    return (
      <Screen>
        <Card title="Not available yet">
          <Text style={styles.muted}>
            You can record attendance once your internship registration has been approved.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label={existingDraft ? 'Update attendance' : 'Submit attendance'}
          onPress={() => void onSubmit()}
          loading={submitting}
        />
      }
    >
      <Card title={formatDate(date)} subtitle={internship.organisation?.name ?? undefined}>
        {existingDraft ? (
          <Text style={existingDraft.synced ? styles.synced : styles.pendingNote}>
            {existingDraft.synced
              ? 'Already recorded. Changes will be sent as an edit.'
              : 'Saved on this device, waiting to sync.'}
          </Text>
        ) : (
          <Text style={styles.muted}>
            {isConnected
              ? 'Your attendance is saved on this device and synced immediately.'
              : "You're offline. This will be saved and synced automatically."}
          </Text>
        )}
      </Card>

      <ChipGroup<AttendanceStatus>
        label="Attendance status"
        required
        options={ATTENDANCE_STATUSES.map((value) => ({
          value,
          label: ATTENDANCE_STATUS_LABELS[value],
        }))}
        value={status}
        onChange={setStatus}
        error={errors.status}
      />

      {/* Times and mode only apply to a day actually worked. */}
      {status !== null && !isNonWorking ? (
        <>
          <View style={styles.timeRow}>
            <TimePickerField
              label="Reporting time"
              value={reportingTime}
              onChange={setReportingTime}
              error={errors.reportingTime}
            />
            <TimePickerField
              label="Leaving time"
              value={leavingTime}
              onChange={setLeavingTime}
              error={errors.leavingTime}
            />
          </View>

          {totalHours !== null ? (
            <View style={styles.hoursBox} accessibilityLiveRegion="polite">
              <Text style={styles.hoursLabel}>Total hours</Text>
              <Text style={styles.hoursValue}>{totalHours}</Text>
            </View>
          ) : null}

          <ChipGroup<AttendanceMode>
            label="Attendance mode"
            options={ATTENDANCE_MODES.map((value) => ({
              value,
              label: ATTENDANCE_MODE_LABELS[value],
            }))}
            value={mode}
            onChange={setMode}
            error={errors.mode}
          />
        </>
      ) : null}

      {needsReason ? (
        <TextField
          label="Reason"
          required
          multiline
          value={leaveReason}
          onChangeText={setLeaveReason}
          error={errors.leaveReason}
          placeholder="Briefly explain the absence or leave"
          helper="Required for absence and permission leave."
        />
      ) : null}

      {/*
        Proof upload is intentionally presented as clearly optional, per the design rule
        in 01_PRD §4.2. It is wired to the documents flow, which is not yet built, so the
        control is omitted rather than shown as a dead end.
      */}
      {status !== null && !isNonWorking ? (
        <Card title="Attendance proof (optional)">
          <Text style={styles.muted}>
            Proof is never required. Submit without it if your organisation does not provide one.
          </Text>
        </Card>
      ) : null}

      {errors._ ? (
        <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{errors._}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function formatDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  synced: { fontSize: fontSize.small, color: colors.success, fontWeight: '600' },
  pendingNote: { fontSize: fontSize.small, color: colors.warning, fontWeight: '600' },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  hoursBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  hoursLabel: { fontSize: fontSize.small, color: colors.success, fontWeight: '600' },
  hoursValue: {
    fontSize: fontSize.subtitle,
    color: colors.success,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: 10, padding: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.small },
});
