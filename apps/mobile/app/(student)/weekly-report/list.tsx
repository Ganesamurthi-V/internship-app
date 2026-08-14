/**
 * Weekly reports list — timeline view (12_Mobile_App_Spec §2).
 */

import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { WeeklyReport } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useCurrentWeek, useMyInternship, useWeeklyReports } from '@/lib/api/hooks';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export default function WeeklyReportListScreen() {
  const { data: internshipData } = useMyInternship();
  const internshipId = internshipData?.value?.internship?.id;

  const { data: reportsData, isLoading, refetch } = useWeeklyReports(internshipId);
  const { data: currentWeekData } = useCurrentWeek(internshipId);

  const reports = (reportsData?.value ?? []) as WeeklyReport[];
  const currentWeek = currentWeekData?.value;

  if (!internshipId) {
    return (
      <Screen>
        <Card title="No internship">
          <Text style={styles.muted}>Register an internship first.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen refreshing={isLoading} onRefresh={() => void refetch()}>
      {currentWeek && !currentWeek.reportExists ? (
        <Card title={`Week ${currentWeek.weekNumber} — Current`} subtitle={`${currentWeek.weekStartDate} to ${currentWeek.weekEndDate}`}>
          <Text style={styles.muted}>
            Days attended: {currentWeek.daysAttended} • Hours: {currentWeek.totalHours}
          </Text>
          <View style={styles.spacer} />
          <Button
            label="Start this week's report"
            onPress={() => router.push(`/(student)/weekly-report/${currentWeek.weekNumber}`)}
          />
        </Card>
      ) : null}

      {reports.length === 0 && !currentWeek ? (
        <Card title="No reports yet">
          <Text style={styles.muted}>Weekly reports will appear here as you submit them.</Text>
        </Card>
      ) : null}

      {reports.map((report) => (
        <Card
          key={report.id}
          title={`Week ${report.weekNumber}`}
          subtitle={`${report.weekStartDate} to ${report.weekEndDate}`}
          onPress={() => router.push(`/(student)/weekly-report/${report.weekNumber}`)}
        >
          <View style={styles.row}>
            <Text style={styles.meta}>Days: {report.daysAttended ?? '-'}</Text>
            <Text style={styles.meta}>Hours: {report.totalHours ?? '-'}</Text>
            <Text style={[styles.badge, report.submittedAt ? styles.badgeGreen : styles.badgeYellow]}>
              {report.submittedAt ? 'Submitted' : 'Draft'}
            </Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  spacer: { height: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  badge: { fontSize: fontSize.caption, fontWeight: '700', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  badgeGreen: { backgroundColor: colors.successBg, color: colors.success },
  badgeYellow: { backgroundColor: colors.warningBg, color: colors.warning },
});
