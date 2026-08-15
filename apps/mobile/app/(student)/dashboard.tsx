/**
 * Student home.
 *
 * Answers one question above the fold: is today done, and if not, what do I do about
 * it. Everything else on the screen is context.
 */

import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { StudentDashboard as StudentDashboardData } from '@ims/shared-types';
import { SUBMISSION_STATUS_LABELS } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card, SummaryCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StatusPill } from '@/components/ui/StatusPill';
import { useDashboard } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function StudentDashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const { data, isLoading, isRefetching, refetch, error } = useDashboard();

  const dashboard =
    data?.role === 'student' ? (data.dashboard as StudentDashboardData) : null;

  if (isLoading && !dashboard) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading\u2026</Text>
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

  const { today, summary } = dashboard;
  const noQuestions = today.questionCount === 0;

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Text style={styles.greeting}>Hello, {dashboard.student.name || user?.name || 'student'}</Text>
      <Text style={styles.date}>{formatDate(today.date)}</Text>

      {/* ---- The one thing that matters: today ---- */}
      {noQuestions ? (
        <Card title="Nothing to answer yet">
          <Text style={styles.body}>
            Your department has not set up any questions. Check back later.
          </Text>
        </Card>
      ) : today.submitted ? (
        <Card title="Today is done">
          <View style={styles.statusRow}>
            <StatusPill status={today.status ?? 'pending'} />
          </View>
          <Text style={styles.body}>{statusExplanation(today.status)}</Text>
          <View style={styles.spacer} />
          <Button
            label={today.status === 'declined' ? 'Fix and resubmit' : 'View your answers'}
            variant={today.status === 'declined' ? 'primary' : 'secondary'}
            onPress={() => router.push('/(student)/answer')}
          />
        </Card>
      ) : (
        <Card title="Answer today's questions" subtitle="This marks your attendance.">
          <Text style={styles.body}>
            {today.questionCount} question{today.questionCount === 1 ? '' : 's'} to answer. Your
            attendance is recorded once faculty approve your answers.
          </Text>
          <View style={styles.spacer} />
          <Button label="Start" onPress={() => router.push('/(student)/answer')} />
        </Card>
      )}

      {/* ---- Running totals ---- */}
      <Card title="Your attendance">
        {summary.daysSubmitted === 0 ? (
          <Text style={styles.muted}>
            Nothing yet. Your first submission will show up here.
          </Text>
        ) : (
          <View style={styles.summaryRow}>
            <ProgressRing
              percentage={summary.approvalPercentage ?? 0}
              caption={`${summary.daysApproved}/${summary.daysSubmitted} days`}
            />
            <View style={styles.summaryFacts}>
              <Fact label="Approved" value={String(summary.daysApproved)} tone="success" />
              <Fact label="Awaiting review" value={String(summary.daysPending)} tone="warning" />
              <Fact label="Declined" value={String(summary.daysDeclined)} tone="danger" />
            </View>
          </View>
        )}
      </Card>

      {/* ---- Recent days ---- */}
      {dashboard.recentSubmissions.length > 0 ? (
        <Card title="Recent days">
          {dashboard.recentSubmissions.map((submission) => (
            <View key={submission.id} style={styles.recentRow}>
              <Text style={styles.recentDate}>{submission.submissionDate}</Text>
              <StatusPill status={submission.status} compact />
            </View>
          ))}
          <View style={styles.spacer} />
          <Button
            label="See all"
            variant="secondary"
            onPress={() => router.push('/(student)/history')}
          />
        </Card>
      ) : null}

      <View style={styles.tileRow}>
        <SummaryCard
          label="Days approved"
          value={summary.daysApproved}
          tone={summary.daysApproved > 0 ? 'success' : 'neutral'}
        />
        <SummaryCard
          label="Awaiting review"
          value={summary.daysPending}
          tone={summary.daysPending > 0 ? 'warning' : 'neutral'}
        />
      </View>
    </Screen>
  );
}

/** Says what the status means for the student, not just what it is called. */
function statusExplanation(status: StudentDashboardData['today']['status']): string {
  switch (status) {
    case 'approved':
      return 'Your answers were approved. Today counts towards your attendance.';
    case 'declined':
      return 'Your answers were declined. Open them to see why and submit again.';
    default:
      return 'Your answers are with faculty for review.';
  }
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'danger';
}) {
  const toneColor =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.danger;

  return (
    <View style={styles.fact}>
      <Text style={[styles.factValue, { color: toneColor }]}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
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
  greeting: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
  },
  date: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: spacing.md },
  body: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 21 },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  spacer: { height: spacing.md },
  statusRow: { flexDirection: 'row', marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryFacts: { flex: 1, gap: spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  factValue: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  factLabel: { fontSize: fontSize.caption, color: colors.textMuted },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recentDate: {
    fontSize: fontSize.small,
    color: colors.text,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  tileRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
});
