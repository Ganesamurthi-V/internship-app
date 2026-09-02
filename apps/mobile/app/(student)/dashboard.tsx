/**
 * Student home — redesigned with gradient header, icon cards, and modern layout.
 */

import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { StudentDashboard as StudentDashboardData } from '@ims/shared-types';
import { StudentDashboardSkeleton } from '@/components/ui/SkeletonLoader';
import { useDashboard } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { describeWorkingDays } from '@ims/shared-types';
import { describeDaysUntil, formatLongDate, formatShortDate } from '@/lib/utils/dates';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

export default function StudentDashboardScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data, isLoading, isRefetching, refetch, error } = useDashboard();

  const dashboard =
    data?.role === 'student' ? (data.dashboard as StudentDashboardData) : null;

  if (isLoading) {
    return <StudentDashboardSkeleton />;
  }

  if (error || !dashboard) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Dashboard</Text>
        </LinearGradient>
        <View style={styles.errorCard}>
          <MaterialIcons name="error-outline" size={40} color={colors.danger} />
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Could not load dashboard.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
          <Pressable
            style={styles.signOutButtonError}
            onPress={() => { void logout(); router.replace('/(auth)/login'); }}
          >
            <MaterialIcons name="logout" size={16} color={colors.danger} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const { today, summary } = dashboard;
  const noQuestions = today.questionCount === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* ---- Gradient Header ---- */}
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerLabel}>Dashboard</Text>
              <Text style={styles.headerWelcome}>Welcome back,</Text>
              <Text style={styles.headerName}>{dashboard.student.name || user?.name || 'Student'}</Text>
              <View style={styles.scopeBadge}>
                <MaterialIcons name="school" size={14} color="#ffffffcc" />
                <Text style={styles.scopeText}>{formatDate(today.date)}</Text>
              </View>
            </View>
            <Pressable
              style={styles.settingsButton}
              onPress={() => router.push('/(student)/profile')}
              accessibilityLabel="Profile"
            >
              <MaterialIcons name="person" size={24} color="#ffffff" />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* ---- Today's Action Card ---- */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.iconCircle, { backgroundColor: noQuestions ? colors.warningBg : today.submitted ? colors.successBg : '#eceef8' }]}>
                <MaterialIcons
                  name={noQuestions ? 'info' : today.submitted ? 'check-circle' : 'assignment'}
                  size={24}
                  color={noQuestions ? colors.warning : today.submitted ? colors.success : colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {noQuestions
                    ? 'Nothing to answer yet'
                    : today.submitted
                      ? 'Today is done'
                      : 'Answer today\'s questions'}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {noQuestions
                    ? 'Your department has not set up any questions. Check back later.'
                    : today.submitted
                      ? statusExplanation(today.status)
                      : `${today.questionCount} question${today.questionCount === 1 ? '' : 's'} to answer. This marks your attendance.`}
                </Text>
              </View>
            </View>
            {!noQuestions && (
              <Pressable
                style={[styles.actionButton, today.submitted && today.status !== 'declined' && { backgroundColor: colors.primaryLight }]}
                onPress={() => router.push('/(student)/answer')}
              >
                <Text style={styles.actionButtonText}>
                  {today.submitted
                    ? today.status === 'declined' ? 'Fix and resubmit' : 'View your answers'
                    : 'Start answering'}
                </Text>
                <MaterialIcons name="chevron-right" size={18} color="#fff" />
              </Pressable>
            )}
            {today.submitted && today.status && (
              <View style={[styles.statusBadge, statusBadgeColor(today.status)]}>
                <Text style={[styles.statusBadgeText, { color: statusTextColor(today.status) }]}>
                  {today.status === 'approved' ? 'Approved' : today.status === 'declined' ? 'Declined' : 'Pending review'}
                </Text>
              </View>
            )}
          </View>

          {/* ---- Retake cards ----
              Directly under today's card, because a retake is time-boxed and a grant
              the student never notices is a grant that expires unused. Each one is its
              own tappable card rather than a single summary line: the student has to
              answer a specific day, so the day and its deadline have to be visible
              without opening anything. */}
          {dashboard.retakes.map((retake) => (
            <Pressable
              key={retake.id}
              style={styles.retakeCard}
              onPress={() =>
                router.push({
                  pathname: '/(student)/answer',
                  params: { date: retake.targetDate },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Answer the retake for ${formatLongDate(retake.targetDate)}`}
            >
              <View style={styles.retakeIcon}>
                <MaterialIcons name="event-available" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.retakeTitle}>
                  Retake for {formatShortDate(retake.targetDate)}
                </Text>
                <Text style={styles.retakeSubtitle}>
                  One attempt. Answer by {formatShortDate(retake.expiresOn)} (
                  {describeDaysUntil(retake.expiresOn, today.date)}) and this day counts
                  as present once approved.
                </Text>
                {retake.reason ? (
                  <Text style={styles.retakeReason} numberOfLines={2}>
                    {retake.grantedByName ? `${retake.grantedByName}: ` : ''}
                    {retake.reason}
                  </Text>
                ) : null}
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.primary} />
            </Pressable>
          ))}

          {/* ---- Attendance Summary Card ---- */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="bar-chart" size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Your attendance</Text>
              </View>
              <Pressable
                onPress={() => router.push('/(student)/history')}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={styles.linkText}>See all</Text>
                <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
              </Pressable>
            </View>

            {summary.internshipDays === 0 ? (
              <Text style={styles.cardSubtitle}>
                Your attendance appears here once your internship start date is recorded.
              </Text>
            ) : (
              <>
                {/* Every count goes through `?? 0`, so zero absences render as "0"
                    rather than as an empty circle that reads like missing data. */}
                <View style={styles.statsGrid}>
                  <StatCircle
                    icon="check-circle"
                    label="Present"
                    value={summary.daysApproved ?? 0}
                    color={colors.success}
                    bgColor={colors.successBg}
                  />
                  <StatCircle
                    icon="cancel"
                    label="Absent"
                    value={summary.daysAbsent ?? 0}
                    color={colors.danger}
                    bgColor={colors.dangerBg}
                  />
                  <StatCircle
                    icon="schedule"
                    label="Awaiting"
                    value={summary.daysPending ?? 0}
                    color={colors.warning}
                    bgColor={colors.warningBg}
                  />
                  <StatCircle
                    icon="percent"
                    label="Attendance"
                    value={
                      summary.attendancePercentage !== null
                        ? `${summary.attendancePercentage}%`
                        : '\u2014'
                    }
                    color={colors.primary}
                    bgColor={colors.infoBg}
                  />
                </View>
                {/* The two counter-intuitive parts of the rule, stated plainly: you begin
                    at 100%, and answering on time protects you even before it is reviewed. */}
                <Text style={styles.attendanceNote}>
                  You start at 100% of your {summary.internshipDays} internship days and
                  only lose ground when a working day closes without an approved answer.

                </Text>
              </>
            )}
          </View>

          {/* Both figures remain on the attendance card above, and the history screen is
              still reachable from the "See all" link there. */}

          {/* ---- Recent Submissions ---- */}
          {dashboard.recentSubmissions.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="history" size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>Recent days</Text>
                </View>
                <Pressable
                  onPress={() => router.push('/(student)/history')}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text style={styles.linkText}>View all</Text>
                  <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
                </Pressable>
              </View>
              {dashboard.recentSubmissions.slice(0, 5).map((submission) => (
                <View key={submission.id} style={styles.recentRow}>
                  <Text style={styles.recentDate}>{submission.submissionDate}</Text>
                  <View style={[styles.miniPill, miniPillColor(submission.status)]}>
                    <Text style={[styles.miniPillText, { color: miniPillTextColor(submission.status) }]}>
                      {submission.status === 'approved' ? 'Approved' : submission.status === 'declined' ? 'Declined' : 'Pending'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

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

function statusBadgeColor(status: string) {
  if (status === 'approved') return { backgroundColor: colors.successBg };
  if (status === 'declined') return { backgroundColor: colors.dangerBg };
  return { backgroundColor: colors.warningBg };
}

function statusTextColor(status: string) {
  if (status === 'approved') return colors.success;
  if (status === 'declined') return colors.danger;
  return colors.warning;
}

function miniPillColor(status: string) {
  if (status === 'approved') return { backgroundColor: colors.successBg };
  if (status === 'declined') return { backgroundColor: colors.dangerBg };
  return { backgroundColor: colors.warningBg };
}

function miniPillTextColor(status: string) {
  if (status === 'approved') return colors.success;
  if (status === 'declined') return colors.danger;
  return colors.warning;
}

function StatCircle({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={styles.statItem}>
      <View style={[styles.statCircle, { backgroundColor: bgColor }]}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function formatDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerLabel: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  headerWelcome: { fontSize: 13, color: '#ffffffcc', marginTop: 4 },
  headerName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  scopeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#ffffff20',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scopeText: { fontSize: 12, color: '#ffffffcc' },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff20',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    ...shadow.card,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  attendanceNote: { fontSize: 11, color: colors.textMuted, marginTop: 14, lineHeight: 15 },
  retakeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.infoBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  retakeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  retakeSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  retakeReason: { fontSize: 11, color: colors.textMuted, marginTop: 5, fontStyle: 'italic', lineHeight: 15 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  linkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  actionButtonText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 10,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  recentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  recentDate: { fontSize: 13, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  miniPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  miniPillText: { fontSize: 11, fontWeight: '700' },
  signOutButtonError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    marginTop: 8,
  },
  signOutText: { fontSize: 13, color: colors.danger, fontWeight: '700' },
  errorCard: {
    margin: 20,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
  },
  errorText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
