/**
 * One student: their record, their totals, and every day they submitted.
 *
 * Tapping a day goes to the review screen, so this doubles as a per-student review
 * path when a reviewer is working through one person rather than the whole queue.
 */

import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StatusPill } from '@/components/ui/StatusPill';
import { useStudentDetail } from '@/lib/api/hooks';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function StudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch, isRefetching } = useStudentDetail(id);

  if (isLoading && !data) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading\u2026</Text>
      </Screen>
    );
  }

  if (error && !data) {
    return (
      <Screen>
        <Card title="Could not load the student">
          <Text style={styles.muted}>
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </Text>
          <View style={styles.spacer} />
          <Button label="Try again" onPress={() => void refetch()} />
        </Card>
      </Screen>
    );
  }

  if (!data) return null;

  const { student, summary, history } = data;

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Card title={student.name} subtitle={student.registerNumber}>
        <View style={styles.facts}>
          <Row label="Programme" value={student.programme} />
          <Row label="Department" value={student.department?.name ?? '\u2014'} />
          <Row label="Year" value={student.year !== null ? String(student.year) : '\u2014'} />
          <Row label="Section" value={student.section ?? '\u2014'} />
          <Row label="Email" value={student.studentEmail} />
        </View>
      </Card>

      <Card title="Attendance">
        {summary.daysSubmitted === 0 ? (
          <Text style={styles.muted}>This student has not submitted anything yet.</Text>
        ) : (
          <View style={styles.summaryRow}>
            <ProgressRing
              percentage={summary.approvalPercentage ?? 0}
              caption={`${summary.daysApproved}/${summary.daysSubmitted} days`}
            />
            <View style={styles.summaryFacts}>
              <Fact label="Approved" value={summary.daysApproved} tone={colors.success} />
              <Fact label="Pending" value={summary.daysPending} tone={colors.warning} />
              <Fact label="Declined" value={summary.daysDeclined} tone={colors.danger} />
            </View>
          </View>
        )}
      </Card>

      <Card title={`Submissions (${history.length})`}>
        {history.length === 0 ? (
          <Text style={styles.muted}>Nothing submitted yet.</Text>
        ) : (
          history.map((submission) => (
            <View
              key={submission.id}
              style={styles.historyRow}
              onTouchEnd={() => router.push(`/(faculty)/review/${submission.id}`)}
            >
              <Text style={styles.historyDate}>{submission.submissionDate}</Text>
              <View style={styles.historyRight}>
                <StatusPill status={submission.status} compact />
                <MaterialIcons name="chevron-right" size={18} color={colors.textFaint} />
              </View>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Fact({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  spacer: { height: spacing.md },
  facts: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { fontSize: fontSize.small, color: colors.textMuted, flexShrink: 0 },
  rowValue: {
    fontSize: fontSize.small,
    color: colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryFacts: { flex: 1, gap: spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  factLabel: { fontSize: fontSize.small, color: colors.textMuted },
  factValue: { fontSize: fontSize.subtitle, fontWeight: '700', fontVariant: ['tabular-nums'] },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historyDate: {
    fontSize: fontSize.small,
    color: colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  historyRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
