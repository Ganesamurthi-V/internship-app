/**
 * Student submission history — with attendance summary, graph, and submission list.
 */

import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Svg, { Circle } from 'react-native-svg';
import type { SubmissionStatus, StudentDashboard as StudentDashboardData } from '@ims/shared-types';
import { SUBMISSION_STATUSES } from '@ims/shared-types';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { useDashboard, useSubmissionList } from '@/lib/api/hooks';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

type Filter = SubmissionStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...SUBMISSION_STATUSES.map((status) => ({
    value: status as Filter,
    label: status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Declined',
  })),
];

export default function StudentHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');

  const { data: dashData } = useDashboard();
  const { data, isLoading, isRefetching, refetch } = useSubmissionList(
    filter === 'all' ? {} : { status: filter },
  );

  const items = data?.items ?? [];
  const dashboard = dashData?.role === 'student' ? (dashData.dashboard as StudentDashboardData) : null;
  const summary = dashboard?.summary;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#414fb8', '#5b6abf', '#7b85d4']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <Text style={styles.headerTitle}>History</Text>
        <Text style={styles.headerSubtitle}>Your attendance and submission records</Text>
      </LinearGradient>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListHeaderComponent={
          <View>
            {/* Attendance Summary Card */}
            {summary && summary.daysSubmitted > 0 && (
              <View style={styles.attendanceCard}>
                <View style={styles.attendanceHeader}>
                  <MaterialIcons name="bar-chart" size={18} color={colors.primary} />
                  <Text style={styles.attendanceTitle}>Attendance Overview</Text>
                </View>

                <View style={styles.attendanceBody}>
                  {/* Progress Ring */}
                  <View style={styles.ringSection}>
                    <AttendanceRing percentage={summary.approvalPercentage ?? 0} />
                    <Text style={styles.ringCaption}>
                      {summary.daysApproved}/{summary.daysSubmitted} days
                    </Text>
                  </View>

                  {/* Stats */}
                  <View style={styles.statsSection}>
                    <StatRow icon="check-circle" label="Approved" value={summary.daysApproved} color={colors.success} />
                    <StatRow icon="schedule" label="Pending" value={summary.daysPending} color={colors.warning} />
                    <StatRow icon="cancel" label="Declined" value={summary.daysDeclined} color={colors.danger} />
                    <StatRow icon="event" label="Total Days" value={summary.daysSubmitted} color={colors.primary} />
                  </View>
                </View>

                {/* Visual bar graph */}
                <View style={styles.graphSection}>
                  <Text style={styles.graphTitle}>Breakdown</Text>
                  <View style={styles.barRow}>
                    <View style={styles.barLabelCol}>
                      <Text style={styles.barLabel}>Approved</Text>
                      <Text style={styles.barLabel}>Pending</Text>
                      <Text style={styles.barLabel}>Declined</Text>
                    </View>
                    <View style={styles.barCol}>
                      <BarItem value={summary.daysApproved} max={summary.daysSubmitted} color={colors.success} />
                      <BarItem value={summary.daysPending} max={summary.daysSubmitted} color={colors.warning} />
                      <BarItem value={summary.daysDeclined} max={summary.daysSubmitted} color={colors.danger} />
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Filters */}
            <View style={styles.filterRow}>
              <ChipGroup options={FILTERS} value={filter} onChange={(next) => setFilter(next)} />
              {data ? (
                <Text style={styles.count}>
                  {data.pagination.total} day{data.pagination.total === 1 ? '' : 's'}
                </Text>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? <ListSkeleton rows={4} /> : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="history" size={32} color={colors.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>
                {filter === 'all'
                  ? 'Your submissions will appear here once you start answering.'
                  : `You have no ${filter} submissions.`}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.dateCircle}>
                <Text style={styles.dateDay}>{new Date(`${item.submissionDate}T00:00:00Z`).getUTCDate()}</Text>
                <Text style={styles.dateMonth}>{new Date(`${item.submissionDate}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.dateText}>{formatDate(item.submissionDate)}</Text>
                <Text style={styles.meta}>
                  {item.answers.length} answer{item.answers.length === 1 ? '' : 's'}
                  {item.documents.length > 0
                    ? ` \u00b7 ${item.documents.length} file${item.documents.length === 1 ? '' : 's'}`
                    : ''}
                </Text>
              </View>
              <StatusPill status={item.status} compact />
            </View>

            {item.reviewNote ? (
              <View style={styles.noteBox}>
                <MaterialIcons name="info" size={14} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noteLabel}>Faculty note</Text>
                  <Text style={styles.noteText}>{item.reviewNote}</Text>
                </View>
              </View>
            ) : null}

            {item.answers[0] ? (
              <View style={styles.preview}>
                <Text style={styles.previewPrompt} numberOfLines={1}>
                  {item.answers[0].promptSnapshot}
                </Text>
                <Text style={styles.previewText} numberOfLines={2}>
                  {item.answers[0].questionType === 'file_upload'
                    ? (item.answers[0].document?.originalFilename ?? 'File attached')
                    : item.answers[0].answerText}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AttendanceRing({ percentage }: { percentage: number }) {
  const size = 110;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clamped / 100) * circumference;
  const colour = clamped >= 85 ? colors.success : clamped >= 75 ? colors.warning : colors.danger;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceAlt} strokeWidth={strokeWidth} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colour} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={`${circumference}`} strokeDashoffset={offset} strokeLinecap="round"
          rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <Text style={{ position: 'absolute', fontSize: 20, fontWeight: '800', color: colour }}>{Math.round(clamped)}%</Text>
    </View>
  );
}

function StatRow({ icon, label, value, color }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; value: number; color: string }) {
  return (
    <View style={styles.statRow}>
      <MaterialIcons name={icon} size={16} color={color} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function BarItem({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

function formatDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 4 },
  list: { padding: 16, paddingBottom: 100 },

  // Attendance summary card
  attendanceCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, ...shadow.card },
  attendanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  attendanceTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  attendanceBody: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ringSection: { alignItems: 'center' },
  ringCaption: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  statsSection: { flex: 1, gap: 8 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabel: { flex: 1, fontSize: 13, color: colors.textMuted },
  statValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },

  // Bar graph
  graphSection: { marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  graphTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 10 },
  barRow: { flexDirection: 'row', gap: 10 },
  barLabelCol: { width: 70, gap: 10, justifyContent: 'center' },
  barLabel: { fontSize: 11, color: colors.textMuted },
  barCol: { flex: 1, gap: 10, justifyContent: 'center' },
  barTrack: { height: 20, backgroundColor: colors.surfaceAlt, borderRadius: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 10, minWidth: 4 },
  barValue: { fontSize: 11, fontWeight: '700', color: colors.text, marginLeft: 8 },

  // Filters
  filterRow: { marginBottom: 12 },
  count: { fontSize: 11, color: colors.textMuted, marginTop: 6 },

  // Submission cards
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '800', color: colors.primary, lineHeight: 18 },
  dateMonth: { fontSize: 9, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  rowMain: { flex: 1 },
  dateText: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  noteBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.dangerBg, borderRadius: 10, padding: 12, marginTop: 10 },
  noteLabel: { fontSize: 10, fontWeight: '700', color: colors.danger },
  noteText: { fontSize: 12, color: colors.text, lineHeight: 17, marginTop: 1 },
  preview: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  previewPrompt: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  previewText: { fontSize: 13, color: colors.text, marginTop: 2, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
