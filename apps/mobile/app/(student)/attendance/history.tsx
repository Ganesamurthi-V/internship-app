/**
 * Attendance history — 12_Mobile_App_Spec §2.
 *
 * Server records and unsynced local drafts are merged into one timeline, so a student
 * reviewing their history offline sees the days they recorded in airplane mode instead
 * of gaps. Uses React Query (useAttendanceList) so the staleTime guard prevents
 * redundant fetches on every tab focus.
 */

import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { Attendance } from '@ims/shared-types';
import { ATTENDANCE_STATUS_LABELS, type AttendanceStatus } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useAttendanceList, useAttendanceSummary, useMyInternship } from '@/lib/api/hooks';
import { attendanceDrafts } from '@/lib/db/database';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface TimelineEntry {
  date: string;
  status: AttendanceStatus;
  reportingTime: string | null;
  leavingTime: string | null;
  totalHours: number | null;
  mentorVerified: boolean;
  pendingSync: boolean;
}

const STATUS_COLOURS: Record<AttendanceStatus, string> = {
  present: colors.present,
  absent: colors.absent,
  permission_leave: colors.leave,
  holiday: colors.holiday,
  weekly_off: colors.weeklyOff,
};

export default function AttendanceHistoryScreen() {
  const { data: internshipData } = useMyInternship();
  const internshipId = internshipData?.value?.internship?.id;

  const { data: summary } = useAttendanceSummary(internshipId);
  const { data: attendanceData, isLoading, isRefetching, refetch } = useAttendanceList(internshipId);

  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  /** Merges server records with local drafts. */
  const mergeEntries = useCallback(
    async (serverRecords: Attendance[] | undefined) => {
      if (!internshipId) return;

      const drafts = await attendanceDrafts.listForInternship(internshipId);
      const byDate = new Map<string, TimelineEntry>();

      // Local drafts first
      for (const draft of drafts) {
        byDate.set(draft.attendance_date, {
          date: draft.attendance_date,
          status: draft.status as AttendanceStatus,
          reportingTime: draft.reporting_time,
          leavingTime: draft.leaving_time,
          totalHours: null,
          mentorVerified: false,
          pendingSync: draft.sync_status !== 'synced',
        });
      }

      // Server records overlay — they carry computed hours and mentor verification
      if (serverRecords) {
        for (const record of serverRecords) {
          const existing = byDate.get(record.date);
          byDate.set(record.date, {
            date: record.date,
            status: record.status,
            reportingTime: record.reportingTime,
            leavingTime: record.leavingTime,
            totalHours: record.totalHours,
            mentorVerified: record.mentorVerified,
            pendingSync: existing?.pendingSync ?? false,
          });
        }
      }

      setEntries([...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)));
    },
    [internshipId],
  );

  // Merge whenever server data changes
  useEffect(() => {
    void mergeEntries(attendanceData?.value);
  }, [attendanceData, mergeEntries]);

  // Re-merge local drafts on focus (a new attendance may have been saved locally)
  useFocusEffect(
    useCallback(() => {
      void mergeEntries(attendanceData?.value);
    }, [attendanceData, mergeEntries]),
  );

  const offline = attendanceData?.cachedAt != null;

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.date}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListHeaderComponent={
          <View style={styles.header}>
            {summary ? (
              <Card>
                <View style={styles.summaryRow}>
                  <ProgressRing
                    percentage={summary.value.attendancePercentage}
                    caption={`${summary.value.daysAttended}/${summary.value.totalWorkingDays} days`}
                  />
                  <View style={styles.summaryFacts}>
                    <Fact label="Total hours" value={String(summary.value.totalHours)} />
                    <Fact label="Absent" value={String(summary.value.daysAbsent)} />
                    <Fact label="Leave" value={String(summary.value.daysLeave)} />
                    <Fact label="Holidays" value={String(summary.value.holidays)} />
                  </View>
                </View>
              </Card>
            ) : null}

            {offline ? (
              <Text style={styles.offline}>
                Offline \u2014 showing records saved on this device.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No attendance yet</Text>
              <Text style={styles.emptyBody}>
                Records appear here once you start marking attendance.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View
            style={styles.row}
            accessibilityLabel={`${item.date}. ${ATTENDANCE_STATUS_LABELS[item.status]}.${
              item.totalHours ? ` ${item.totalHours} hours.` : ''
            }${item.pendingSync ? ' Waiting to sync.' : ''}`}
          >
            <View style={[styles.statusBar, { backgroundColor: STATUS_COLOURS[item.status] }]} />
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.rowDate}>{item.date}</Text>
                <Text style={styles.rowStatus}>{ATTENDANCE_STATUS_LABELS[item.status]}</Text>
              </View>
              <View style={styles.rowBottom}>
                <Text style={styles.rowMeta}>
                  {item.reportingTime && item.leavingTime
                    ? `${item.reportingTime} \u2013 ${item.leavingTime}`
                    : '\u2014'}
                  {item.totalHours !== null ? `  \u00b7  ${item.totalHours} h` : ''}
                </Text>
                <View style={styles.tags}>
                  {item.mentorVerified ? <Text style={styles.verified}>verified</Text> : null}
                  {item.pendingSync ? <Text style={styles.pending}>pending sync</Text> : null}
                </View>
              </View>
            </View>
          </View>
        )}
      />
    </Screen>
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

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  header: { marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryFacts: { flex: 1, gap: spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  factValue: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  factLabel: { fontSize: fontSize.caption, color: colors.textMuted },
  offline: { fontSize: fontSize.caption, color: colors.warning, marginTop: spacing.sm },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statusBar: { width: 5 },
  rowBody: { flex: 1, padding: spacing.md, gap: 4 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowDate: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  rowStatus: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '600' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowMeta: { fontSize: fontSize.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  tags: { flexDirection: 'row', gap: spacing.sm },
  verified: { fontSize: fontSize.caption, color: colors.success, fontWeight: '700' },
  pending: { fontSize: fontSize.caption, color: colors.warning, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: fontSize.small, color: colors.textMuted, marginTop: spacing.xs },
});
