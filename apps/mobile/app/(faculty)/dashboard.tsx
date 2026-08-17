/**
 * Faculty overview.
 *
 * The pending-review count is the number that drives action, so it leads and doubles
 * as the entry point to the queue.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { FacultyDashboard as FacultyDashboardData } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card, SummaryCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useDashboard } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function FacultyDashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data, isLoading, isRefetching, refetch, error } = useDashboard();

  const dashboard =
    data && data.role !== 'student' ? (data.dashboard as FacultyDashboardData) : null;

  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async (): Promise<void> => {
    setSigningOut(true);
    await logout();
    router.replace('/(auth)/login');
  };

  if (isLoading) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading\u2026</Text>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Card title="Could not load the dashboard">
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
        <Card title="Nothing to show">
          <Text style={styles.muted}>
            Could not load the faculty dashboard. This may happen if you are logged in as a
            student. Try signing out and logging in with a faculty account.
          </Text>
          <View style={styles.spacer} />
          <Button label="Try again" onPress={() => void refetch()} />
          <View style={styles.spacer} />
          <Button label="Sign out" variant="danger" onPress={() => void onSignOut()} loading={signingOut} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Text style={styles.greeting}>{user?.name ?? 'Faculty'}</Text>
      <Text style={styles.subtitle}>
        {dashboard.totalStudents} student{dashboard.totalStudents === 1 ? '' : 's'} in your scope
      </Text>

      {/* ---- The work waiting ---- */}
      <Card
        title={
          dashboard.pendingReview === 0
            ? 'Nothing to review'
            : `${dashboard.pendingReview} waiting for review`
        }
      >
        {dashboard.pendingReview === 0 ? (
          <Text style={styles.muted}>You are all caught up.</Text>
        ) : (
          <>
            <Text style={styles.body}>
              Students are waiting on a decision. Approving marks their day as attended.
            </Text>
            <View style={styles.spacer} />
            <Button label="Open review queue" onPress={() => router.push('/(faculty)/review')} />
          </>
        )}
      </Card>

      {/* ---- Today at a glance ---- */}
      <Card title="Today">
        <View style={styles.factList}>
          <Fact label="Submitted" value={dashboard.submittedToday} tone="neutral" />
          <Fact label="Approved" value={dashboard.approvedToday} tone="success" />
          <Fact label="Declined" value={dashboard.declinedToday} tone="danger" />
          <Fact label="Not submitted" value={dashboard.missingToday} tone="warning" />
        </View>
        <View style={styles.spacer} />
        <Button
          label="See who has not submitted"
          variant="secondary"
          onPress={() => router.push('/(faculty)/students')}
        />
      </Card>

      <View style={styles.tileRow}>
        <SummaryCard
          label="Awaiting review"
          value={dashboard.pendingReview}
          tone={dashboard.pendingReview > 0 ? 'warning' : 'success'}
          onPress={() => router.push('/(faculty)/review')}
        />
        <SummaryCard
          label="Active questions"
          value={dashboard.activeQuestions}
          tone={dashboard.activeQuestions === 0 ? 'danger' : 'neutral'}
          onPress={() => router.push('/(faculty)/questions')}
        />
      </View>

      {/* Without questions there is nothing for students to answer, which makes this
          the most important thing on the screen when it happens. */}
      {dashboard.activeQuestions === 0 ? (
        <Card title="No questions set up">
          <Text style={styles.body}>
            Students cannot submit anything until at least one question exists. Add one to start
            collecting attendance.
          </Text>
          <View style={styles.spacer} />
          <Button label="Add a question" onPress={() => router.push('/(faculty)/questions')} />
        </Card>
      ) : null}

      {/* ---- Pending student approvals ---- */}
      <Card title="Student Registrations">
        <Text style={styles.body}>
          New students need your approval before they can log in and start submitting.
        </Text>
        <View style={styles.spacer} />
        <Button
          label="View pending approvals"
          variant="secondary"
          onPress={() => router.push('/(faculty)/students/pending')}
        />
      </Card>

      {/* ---- Sign out ---- */}
      <Card title="Account">
        <Text style={styles.muted}>Signed in as {user?.email ?? 'faculty'}.</Text>
        <View style={styles.spacer} />
        <Button
          label="Sign out"
          variant="danger"
          onPress={() => void onSignOut()}
          loading={signingOut}
        />
      </Card>
    </Screen>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneColor =
    tone === 'success'
      ? colors.success
      : tone === 'warning'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : colors.text;

  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, { color: toneColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.title, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: spacing.md },
  body: { fontSize: fontSize.body, color: colors.textMuted, lineHeight: 21 },
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  spacer: { height: spacing.md },
  factList: { gap: spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  factLabel: { fontSize: fontSize.small, color: colors.textMuted },
  factValue: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tileRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
});
