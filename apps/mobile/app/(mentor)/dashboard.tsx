/**
 * Mentor dashboard — 12_Mobile_App_Spec §2, 02_SRS §1.4.
 *
 * Lists only the mentor's assigned students. The scoping is enforced server-side by
 * `requireMentorId`, so this screen cannot widen it — which is what 09_Test_Plan §3
 * ("Mentor cannot evaluate a student not assigned to them") depends on.
 */

import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { MentorDashboard as MentorDashboardData } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card, SummaryCard } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useDashboard, useMentorStudents } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export default function MentorDashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const { data, isRefetching, refetch } = useDashboard();
  const { data: studentsData, isLoading: studentsLoading } = useMentorStudents();

  const dashboard =
    data?.value.role === 'mentor' ? (data.value.dashboard as MentorDashboardData) : null;
  const students = studentsData?.value ?? [];

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Text style={styles.greeting}>{user?.name ?? 'Mentor'}</Text>

      {dashboard ? (
        <View style={styles.tileRow}>
          <SummaryCard label="Assigned students" value={dashboard.assignedStudents} />
          <SummaryCard
            label="Attendance to verify"
            value={dashboard.unverifiedAttendanceCount}
            tone={dashboard.unverifiedAttendanceCount > 0 ? 'warning' : 'success'}
          />
          <SummaryCard
            label="Evaluations pending"
            value={dashboard.pendingEvaluations}
            tone={dashboard.pendingEvaluations > 0 ? 'warning' : 'success'}
          />
        </View>
      ) : null}

      <Card title="Your students">
        {studentsLoading && students.length === 0 ? (
          <Text style={styles.muted}>Loading\u2026</Text>
        ) : students.length === 0 ? (
          <Text style={styles.muted}>
            No students are assigned to you yet. The institution will let you know when an
            evaluation is requested.
          </Text>
        ) : (
          <View style={styles.list}>
            {students.map((student) => (
              <View key={student.internshipId} style={styles.studentRow}>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{student.studentName}</Text>
                  <Text style={styles.studentMeta}>
                    {student.registerNumber} \u00b7 {student.programme}
                  </Text>
                  <Text style={styles.studentMeta}>
                    {student.startDate} to {student.endDate}
                  </Text>
                </View>
                <View style={styles.studentStats}>
                  <Text style={styles.percentage}>
                    {student.attendancePercentage !== null
                      ? `${student.attendancePercentage}%`
                      : '\u2014'}
                  </Text>
                  {student.unverifiedAttendanceCount > 0 ? (
                    <Text style={styles.toVerify}>
                      {student.unverifiedAttendanceCount} to verify
                    </Text>
                  ) : null}
                  <Text
                    style={
                      student.evaluation?.digitalConfirmation ? styles.evalDone : styles.evalPending
                    }
                  >
                    {student.evaluation?.digitalConfirmation ? 'evaluated' : 'evaluation pending'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
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
  greeting: { fontSize: fontSize.title, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  list: { gap: spacing.md },
  studentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  studentInfo: { flex: 1, gap: 2 },
  studentName: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  studentMeta: { fontSize: fontSize.caption, color: colors.textMuted },
  studentStats: { alignItems: 'flex-end', gap: 2 },
  percentage: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.primary, fontVariant: ['tabular-nums'] },
  toVerify: { fontSize: fontSize.caption, color: colors.warning, fontWeight: '600' },
  evalDone: { fontSize: fontSize.caption, color: colors.success, fontWeight: '600' },
  evalPending: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
});
