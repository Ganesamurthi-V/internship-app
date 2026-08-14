/**
 * Student dashboard — 06_App_Flow §4, 12_Mobile_App_Spec §2.
 *
 * The shape of this screen is dictated by the flow document: a "Today" card with two
 * checkboxes (attendance, work log), the internship summary with the attendance ring,
 * and conditional cards for the weekly report and final assessment.
 *
 * Offline behaviour: the dashboard query falls back to the local cache, and the
 * checklist is reconciled against unsynced local drafts — so a student who marked
 * attendance in airplane mode sees the tick immediately rather than an empty checkbox
 * that would invite a duplicate submission.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { StudentDashboard as StudentDashboardData } from '@ims/shared-types';
import { INTERNSHIP_STATUS_LABELS } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card, SummaryCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { SyncBadge } from '@/components/ui/SyncBadge';
import { useDashboard } from '@/lib/api/hooks';
import { attendanceDrafts, workLogDrafts } from '@/lib/db/database';
import { useAuthStore } from '@/stores/authStore';
import { useSyncStore } from '@/stores/syncStore';
import { colors, fontSize, spacing } from '@/constants/theme';

/** Local draft state for today, used to reconcile the checklist offline. */
interface LocalToday {
  attendance: boolean;
  workLog: boolean;
}

/**
 * Placeholder for the flows that are not built yet: the registration wizard, the
 * documents checklist, weekly reports and the final assessment.
 *
 * The cards are kept because they are what the dashboard is *for* (06_App_Flow §4/§5/§6
 * all drive off them), but a button that navigated to a missing route would crash. This
 * says so honestly instead. The backend endpoints behind all four already exist.
 */
function notBuiltYet(feature: string): void {
  Alert.alert(
    `${feature} is not in this build`,
    'The API for this is ready, but the screen has not been built yet.',
    [{ text: 'OK' }],
  );
}

export default function StudentDashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const refreshPendingCount = useSyncStore((state) => state.refreshPendingCount);

  const { data, isLoading, isRefetching, refetch, error } = useDashboard();
  const [localToday, setLocalToday] = useState<LocalToday>({ attendance: false, workLog: false });

  const dashboard =
    data?.value.role === 'student' ? (data.value.dashboard as StudentDashboardData) : null;

  const internshipId = dashboard?.internship?.id;
  const todayDate = dashboard?.today.date;

  /**
   * Checks the local drafts for today. Runs on focus, so returning from the attendance
   * form updates the tick without waiting for a server round trip.
   */
  const reconcileLocal = useCallback(async () => {
    if (!internshipId || !todayDate) return;

    const [attendance, workLog] = await Promise.all([
      attendanceDrafts.findByDate(internshipId, todayDate),
      workLogDrafts.findByDate(internshipId, todayDate),
    ]);

    setLocalToday({ attendance: attendance !== null, workLog: workLog !== null });
    await refreshPendingCount();
  }, [internshipId, todayDate, refreshPendingCount]);

  useFocusEffect(
    useCallback(() => {
      void reconcileLocal();
      void refetch();
    }, [reconcileLocal, refetch]),
  );

  useEffect(() => {
    void reconcileLocal();
  }, [reconcileLocal]);

  if (isLoading && !dashboard) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading your dashboard\u2026</Text>
      </Screen>
    );
  }

  if (error && !dashboard) {
    return (
      <Screen>
        <Card title="Could not load your dashboard">
          <Text style={styles.muted}>
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </Text>
          <View style={styles.spacer} />
          <Button label="Try again" onPress={() => void refetch()} />
        </Card>
      </Screen>
    );
  }

  if (!dashboard) {
    return (
      <Screen>
        <Text style={styles.muted}>No dashboard data available.</Text>
      </Screen>
    );
  }

  // A student with no internship, or one still pending, cannot log anything yet
  // (06_App_Flow §3 ends at the "Pending Approval" screen).
  const internship = dashboard.internship;
  const canLogDaily =
    internship !== null && (internship.status === 'approved' || internship.status === 'active');

  const attendanceDone = dashboard.today.attendanceSubmitted || localToday.attendance;
  const workLogDone = dashboard.today.workLogSubmitted || localToday.workLog;

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Text style={styles.greeting}>Hello, {user?.name ?? 'student'}</Text>

      {data?.cachedAt ? (
        <Text style={styles.stale}>
          Showing saved data from {new Date(data.cachedAt).toLocaleString()}
        </Text>
      ) : null}

      {pendingCount > 0 ? (
        <View style={styles.badgeRow}>
          <SyncBadge />
        </View>
      ) : null}

      {/* ---- No internship yet: the registration call to action ---- */}
      {!internship ? (
        <Card title="Register your internship" subtitle="This is the first step.">
          <Text style={styles.body}>
            Add your organisation, dates and mentor details, then upload your offer letter and
            joining proof.
          </Text>
          <View style={styles.spacer} />
          <Button
            label="Register Internship"
            onPress={() => notBuiltYet('The registration wizard')}
          />
        </Card>
      ) : null}

      {/* ---- Pending or rejected approval ---- */}
      {internship && !canLogDaily ? (
        <Card
          title={INTERNSHIP_STATUS_LABELS[internship.status]}
          subtitle={internship.organisation?.name ?? undefined}
        >
          {internship.status === 'pending' ? (
            <Text style={styles.body}>
              Your registration has been submitted and is waiting for your faculty coordinator.
              You will get a notification once it is approved.
            </Text>
          ) : internship.status === 'rejected' ? (
            <>
              <Text style={styles.rejected}>
                {internship.rejectionReason ?? 'Your registration needs changes.'}
              </Text>
              <View style={styles.spacer} />
              <Button
                label="Update registration"
                onPress={() => notBuiltYet('The registration wizard')}
              />
            </>
          ) : (
            <Text style={styles.body}>
              This internship is {INTERNSHIP_STATUS_LABELS[internship.status].toLowerCase()}.
            </Text>
          )}
        </Card>
      ) : null}

      {/* ---- Today's checklist ---- */}
      {canLogDaily ? (
        <Card title="Today" subtitle={formatToday(dashboard.today.date)}>
          <ChecklistRow
            label="Attendance"
            done={attendanceDone}
            pendingSync={localToday.attendance && !dashboard.today.attendanceSubmitted}
            onPress={() => router.push('/(student)/attendance/today')}
          />
          <ChecklistRow
            label="Work log"
            done={workLogDone}
            pendingSync={localToday.workLog && !dashboard.today.workLogSubmitted}
            onPress={() => router.push('/(student)/work-log/today')}
          />
        </Card>
      ) : null}

      {/* ---- Internship summary with the attendance ring ---- */}
      {internship && dashboard.attendanceSummary ? (
        <Card title={internship.organisation?.name ?? 'Internship'}>
          <View style={styles.summaryRow}>
            <ProgressRing
              percentage={dashboard.attendanceSummary.attendancePercentage}
              caption={`${dashboard.attendanceSummary.daysAttended}/${dashboard.attendanceSummary.totalWorkingDays} days`}
            />
            <View style={styles.summaryFacts}>
              <Fact label="Total hours" value={String(dashboard.attendanceSummary.totalHours)} />
              <Fact label="Absent" value={String(dashboard.attendanceSummary.daysAbsent)} />
              <Fact label="Leave" value={String(dashboard.attendanceSummary.daysLeave)} />
              {dashboard.duration ? (
                <Fact
                  label="Duration"
                  value={`${dashboard.duration.calendarDays} days`}
                />
              ) : null}
            </View>
          </View>
          <View style={styles.spacer} />
          <Button
            label="View attendance history"
            variant="secondary"
            onPress={() => router.push('/(student)/attendance/history')}
          />
        </Card>
      ) : null}

      {/* ---- Weekly report card, shown when the week is closing ---- */}
      {canLogDaily && dashboard.currentWeek ? (
        <Card
          title={`Week ${dashboard.currentWeek.weekNumber}`}
          subtitle={
            dashboard.currentWeek.reportSubmitted
              ? 'Report submitted'
              : `Week ends ${dashboard.currentWeek.weekEndDate}`
          }
        >
          {dashboard.currentWeek.reportSubmitted ? (
            <Text style={styles.done}>This week\u2019s report is in.</Text>
          ) : (
            <>
              <Text style={styles.body}>
                {dashboard.currentWeek.dueSoon
                  ? 'Your weekly report is due. Days and hours are filled in for you.'
                  : 'You can start this week\u2019s report at any time.'}
              </Text>
              <View style={styles.spacer} />
              <Button
                label={dashboard.currentWeek.dueSoon ? 'Submit weekly report' : 'Open weekly report'}
                variant={dashboard.currentWeek.dueSoon ? 'primary' : 'secondary'}
                onPress={() => notBuiltYet('The weekly report form')}
              />
            </>
          )}
        </Card>
      ) : null}

      {/* ---- Final assessment, once unlocked ---- */}
      {dashboard.finalAssessment?.unlocked && !dashboard.finalAssessment.submitted ? (
        <Card title="Final assessment" subtitle="Your internship period has ended">
          <Text style={styles.body}>
            Complete your final assessment, self-ratings and document checklist to close out your
            internship record.
          </Text>
          <View style={styles.spacer} />
          <Button
            label="Start final assessment"
            onPress={() => notBuiltYet('The final assessment form')}
          />
        </Card>
      ) : null}

      {dashboard.finalAssessment?.submitted ? (
        <Card title="Internship complete">
          <Text style={styles.done}>
            Your final assessment has been submitted. Thank you.
          </Text>
        </Card>
      ) : null}

      {/* ---- Documents ---- */}
      {internship ? (
        <View style={styles.tileRow}>
          <SummaryCard
            label="Documents pending review"
            value={dashboard.pendingDocumentCount}
            tone={dashboard.pendingDocumentCount > 0 ? 'warning' : 'success'}
            onPress={() => notBuiltYet('The documents checklist')}
          />
          <SummaryCard
            label="Unread notifications"
            value={dashboard.unreadNotificationCount}
            tone={dashboard.unreadNotificationCount > 0 ? 'warning' : 'neutral'}
          />
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * One checklist line. The tick is the primary signal; "Saved offline" distinguishes a
 * local draft from a confirmed server record so the student knows sync is still owed.
 */
function ChecklistRow({
  label,
  done,
  pendingSync,
  onPress,
}: {
  label: string;
  done: boolean;
  pendingSync: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      label={`${done ? '\u2713' : '\u25cb'}  ${label}${pendingSync ? '  \u2014 saved offline' : ''}`}
      variant={done ? 'secondary' : 'primary'}
      onPress={onPress}
      accessibilityLabel={
        done
          ? pendingSync
            ? `${label} recorded and saved offline, waiting to sync. Tap to review.`
            : `${label} submitted. Tap to review.`
          : `${label} not submitted. Tap to record it.`
      }
    />
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

/** "Mon, 14 Aug 2026", matching the header in 06_App_Flow §4. */
function formatToday(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.title, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  stale: { fontSize: fontSize.caption, color: colors.warning, marginBottom: spacing.md },
  badgeRow: { marginBottom: spacing.md },
  body: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 21 },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  done: { fontSize: fontSize.body, color: colors.success, fontWeight: '600' },
  rejected: { fontSize: fontSize.body, color: colors.danger, lineHeight: 21 },
  spacer: { height: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryFacts: { flex: 1, gap: spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  factValue: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  factLabel: { fontSize: fontSize.caption, color: colors.textMuted },
  tileRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
});
