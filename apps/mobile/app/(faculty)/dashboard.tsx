/**
 * Faculty dashboard — 06_App_Flow §7, 12_Mobile_App_Spec §2.
 *
 * The five summary cards named in the flow document, plus completion and cohort
 * attendance. Tapping "Missing Today's Log" drills into the student list filtered to
 * exactly that, which is the primary follow-up action the document describes.
 */

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
  const { data, isRefetching, refetch, isLoading, error } = useDashboard();

  const dashboard =
    data?.value.role === 'faculty' || data?.value.role === 'admin'
      ? (data.value.dashboard as FacultyDashboardData)
      : null;

  if (isLoading && !dashboard) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading dashboard\u2026</Text>
      </Screen>
    );
  }

  if (!dashboard) {
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

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Text style={styles.greeting}>{user?.name ?? 'Faculty'}</Text>

      {data?.cachedAt ? (
        <Text style={styles.stale}>
          Last synced {new Date(data.cachedAt).toLocaleString()}
        </Text>
      ) : null}

      <View style={styles.tileRow}>
        <SummaryCard
          label="Active internships"
          value={dashboard.activeInternships}
          onPress={() => router.push('/(faculty)/students')}
        />
        <SummaryCard
          label="Missing today's log"
          value={dashboard.missingTodaysLog}
          tone={dashboard.missingTodaysLog > 0 ? 'warning' : 'success'}
          onPress={() => router.push('/(faculty)/students?missingToday=1')}
        />
        <SummaryCard
          label="Pending approval"
          value={dashboard.pendingApproval}
          tone={dashboard.pendingApproval > 0 ? 'warning' : 'neutral'}
          onPress={() => router.push('/(faculty)/students?status=pending')}
        />
        <SummaryCard
          label="Documents to review"
          value={dashboard.pendingDocumentReview}
          tone={dashboard.pendingDocumentReview > 0 ? 'warning' : 'neutral'}
        />
        <SummaryCard
          label="Evaluations outstanding"
          value={dashboard.evaluationsOutstanding}
          tone={dashboard.evaluationsOutstanding > 0 ? 'warning' : 'success'}
        />
        <SummaryCard label="Completed" value={dashboard.completedInternships} tone="success" />
      </View>

      <Card title="Cohort attendance">
        <Text style={styles.metric}>
          {dashboard.averageAttendancePercentage !== null
            ? `${dashboard.averageAttendancePercentage}%`
            : '\u2014'}
        </Text>
        <Text style={styles.muted}>
          Mean attendance across active internships in your scope.
        </Text>
      </Card>

      <Card title="Students">
        <Text style={styles.muted}>
          Search and filter your students, review their attendance and daily logs, and verify
          documents.
        </Text>
        <View style={styles.spacer} />
        <Button label="Open student list" onPress={() => router.push('/(faculty)/students')} />
      </Card>

      <Card title="Account">
        <Button
          label="Sign out"
          variant="danger"
          onPress={() => {
            void logout().then(() => router.replace('/(auth)/login'));
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { fontSize: fontSize.title, fontWeight: '800', color: colors.text },
  stale: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  metric: { fontSize: fontSize.display, fontWeight: '800', color: colors.primary },
  spacer: { height: spacing.md },
});
