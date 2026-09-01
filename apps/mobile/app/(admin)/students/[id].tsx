/**
 * Admin student detail — read-only monitoring view.
 *
 * Mirrors the faculty student detail screen, but the submission history rows are
 * not tappable: the admin section has no review route, so linking them would be a
 * dead end. Admins oversee across departments; reviewing stays with faculty.
 */

import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { StatusPill } from '@/components/ui/StatusPill';
import { describeWorkingDays } from '@ims/shared-types';
import { RetakeManager } from '@/components/faculty/RetakeManager';
import { useStudentDetail } from '@/lib/api/hooks';
import { PROGRAMME_LABEL } from '@/constants/academics';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

export default function AdminStudentDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch, isRefetching } = useStudentDetail(id);

  if (isLoading && !data) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#2d3a8c', '#414fb8', '#5b6abf']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Student</Text>
        </LinearGradient>
        <Text style={{ padding: 20, color: colors.textMuted }}>Loading...</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#2d3a8c', '#414fb8', '#5b6abf']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Student</Text>
        </LinearGradient>
        <View style={styles.errorCard}>
          <Text style={{ color: colors.textMuted }}>{error instanceof Error ? error.message : 'Error'}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!data) return null;

  const { student, summary, history } = data;

  return (
    <View style={styles.container}>
      {/* Gradient Header */}
      <LinearGradient colors={['#2d3a8c', '#414fb8', '#5b6abf']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{student.name}</Text>
            <Text style={styles.headerSub}>{student.registerNumber} {'\u00b7'} {student.department?.name ?? PROGRAMME_LABEL}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="person" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Profile</Text>
          </View>
          <InfoRow icon="school" label="Programme" value={PROGRAMME_LABEL} />
          <InfoRow icon="business" label="Department" value={student.department?.name ?? '\u2014'} />
          <InfoRow icon="calendar-today" label="Year" value={student.year !== null ? String(student.year) : '\u2014'} />
          <InfoRow icon="groups" label="Section" value={student.section ?? '\u2014'} />
          <InfoRow icon="email" label="Email" value={student.studentEmail} last />
        </View>

        {/* Attendance Card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="bar-chart" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Attendance</Text>
          </View>
          {summary.internshipDays === 0 ? (
            <Text style={styles.muted}>
              Attendance starts once this student's internship dates are recorded.
            </Text>
          ) : (
            <View style={styles.summaryRow}>
              <ProgressRing
                percentage={summary.attendancePercentage ?? 0}
                caption={
                  (summary.daysAbsent ?? 0) === 0
                    ? `${summary.internshipDays} day internship`
                    : `${summary.daysAbsent} of ${summary.internshipDays} missed`
                }
              />
              <View style={styles.summaryFacts}>
                <Fact label="Present" value={summary.daysApproved ?? 0} tone={colors.success} />
                <Fact label="Absent" value={summary.daysAbsent ?? 0} tone={colors.danger} />
                <Fact label="Awaiting review" value={summary.daysPending ?? 0} tone={colors.warning} />
                <Fact label="Declined" value={summary.daysDeclined ?? 0} tone={colors.textMuted} />
              </View>
            </View>
          )}
          {/* Spells out the rule, because the two counter-intuitive parts of it — that a
              student opens at 100%, and that a day awaiting review is not held against
              them — are both invisible from the numbers alone. */}
          <Text style={styles.attendanceNote}>
            Starts at 100% and drops only when a working day closes without an approved
            answer. A day awaiting review does not count against the student.
            {summary.workingDays && summary.workingDays.length > 0
              ? ` Counted on ${describeWorkingDays(summary.workingDays)}.`
              : ''}
            {(summary.daysRecoverable ?? 0) > 0
              ? ` ${summary.daysRecoverable} absent day${summary.daysRecoverable === 1 ? '' : 's'} ${summary.daysRecoverable === 1 ? 'has' : 'have'} a retake open.`
              : ''}
          </Text>
        </View>

        {/* Retakes — an admin is a reviewer with institution-wide scope, so the same
            grant controls apply here as on the faculty screen. */}
        {id ? <RetakeManager studentId={id} /> : null}

        {/* Submissions Card — read-only, admins do not review */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="history" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Submissions ({history.length})</Text>
          </View>
          {history.length === 0 ? (
            <Text style={styles.muted}>Nothing submitted yet.</Text>
          ) : (
            history.map((submission) => (
              <View key={submission.id} style={styles.historyRow}>
                <View style={styles.historyDateCircle}>
                  <Text style={styles.historyDay}>{new Date(`${submission.submissionDate}T00:00:00Z`).getUTCDate()}</Text>
                  <Text style={styles.historyMonth}>{new Date(`${submission.submissionDate}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}</Text>
                </View>
                <Text style={styles.historyDate}>{submission.submissionDate}</Text>
                <View style={styles.historyRight}>
                  <StatusPill status={submission.status} compact />
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.infoIconBox}>
        <MaterialIcons name={icon as any} size={16} color={colors.primary} />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: '#ffffffcc', marginTop: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 100, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, ...shadow.card },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  attendanceNote: { fontSize: 11, color: colors.textMuted, marginTop: 12, lineHeight: 15 },
  errorCard: { margin: 20, padding: 20, backgroundColor: '#fff', borderRadius: 14, gap: 12, alignItems: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 10 },
  infoIconBox: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  infoLabel: { flex: 1, fontSize: 13, color: colors.textMuted },
  infoValue: { flex: 1.5, fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryFacts: { flex: 1, gap: spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  factLabel: { fontSize: fontSize.small, color: colors.textMuted },
  factValue: { fontSize: fontSize.subtitle, fontWeight: '700', fontVariant: ['tabular-nums'] },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  historyDateCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  historyDay: { fontSize: 14, fontWeight: '800', color: colors.primary, lineHeight: 16 },
  historyMonth: { fontSize: 9, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  historyDate: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  historyRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
