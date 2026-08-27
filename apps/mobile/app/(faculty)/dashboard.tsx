/**
 * Faculty overview — redesigned with gradient header, icon cards, and modern layout.
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { FacultyDashboard as FacultyDashboardData } from '@ims/shared-types';
import { FacultyDashboardSkeleton } from '@/components/ui/SkeletonLoader';
import { useDashboard } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

export default function FacultyDashboardScreen() {
  const insets = useSafeAreaInsets();
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
    return <FacultyDashboardSkeleton />;
  }

  if (error || !dashboard) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Overview</Text>
        </LinearGradient>
        <View style={styles.errorCard}>
          <MaterialIcons name="error-outline" size={40} color={colors.danger} />
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : 'Could not load dashboard.'}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

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
              <Text style={styles.headerLabel}>Overview</Text>
              <Text style={styles.headerWelcome}>Welcome back,</Text>
              <Text style={styles.headerName}>{user?.name ?? 'Faculty'}</Text>
              <View style={styles.scopeBadge}>
                <MaterialIcons name="groups" size={14} color="#ffffffcc" />
                <Text style={styles.scopeText}>
                  {dashboard.totalStudents} student{dashboard.totalStudents === 1 ? '' : 's'} in your scope
                </Text>
              </View>
            </View>
            <Pressable style={styles.settingsButton} accessibilityLabel="Settings">
              <MaterialIcons name="settings" size={24} color="#ffffff" />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* ---- Pending Review Card ---- */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#eceef8' }]}>
                <MaterialIcons name="rate-review" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {dashboard.pendingReview === 0
                    ? 'No students waiting'
                    : `${dashboard.pendingReview} student${dashboard.pendingReview === 1 ? '' : 's'} waiting for review`}
                </Text>
                <Text style={styles.cardSubtitle}>
                  {dashboard.pendingReview === 0
                    ? 'You are all caught up.'
                    : 'Students are waiting on a decision.\nApproving marks their day as attended.'}
                </Text>
              </View>
              {dashboard.pendingReview > 0 && (
                <Pressable
                  style={styles.actionButton}
                  onPress={() => router.push('/(faculty)/review')}
                >
                  <Text style={styles.actionButtonText}>Open review queue</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#fff" />
                </Pressable>
              )}
            </View>
          </View>

          {/* ---- Today's Summary Card ---- */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="calendar-today" size={18} color={colors.primary} />
                <Text style={styles.sectionTitle}>Today's summary</Text>
              </View>
              <Pressable
                onPress={() => router.push('/(faculty)/students')}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Text style={styles.linkText}>View details</Text>
                <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.statsGrid}>
              <StatCircle
                icon="send"
                label="Submitted"
                value={dashboard.submittedToday}
                color="#414fb8"
                bgColor="#eceef8"
              />
              <StatCircle
                icon="check-circle"
                label="Approved"
                value={dashboard.approvedToday}
                color={colors.success}
                bgColor={colors.successBg}
              />
              <StatCircle
                icon="cancel"
                label="Declined"
                value={dashboard.declinedToday}
                color={colors.danger}
                bgColor={colors.dangerBg}
              />
              <StatCircle
                icon="schedule"
                label="Not submitted"
                value={dashboard.missingToday}
                color={colors.warning}
                bgColor={colors.warningBg}
              />
            </View>

            <Pressable
              style={styles.outlineButton}
              onPress={() => router.push('/(faculty)/students')}
            >
              <MaterialIcons name="groups" size={18} color={colors.textMuted} />
              <Text style={styles.outlineButtonText}>See who has not submitted</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* ---- Student Registrations Card ---- */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#eceef8' }]}>
                <MaterialIcons name="person-add" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Student Registrations</Text>
                <Text style={styles.cardSubtitle}>
                  New students need your approval before they{'\n'}can log in and start submitting.
                </Text>
              </View>
            </View>
            <Pressable
              style={styles.outlineButton}
              onPress={() => router.push('/(faculty)/students/pending')}
            >
              <Text style={styles.outlineButtonText}>View pending approvals</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* ---- Account Card ---- */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#eceef8' }]}>
                <MaterialIcons name="account-circle" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Account</Text>
                <Text style={styles.cardSubtitle}>
                  Signed in as{'\n'}{user?.email ?? 'faculty'}
                </Text>
              </View>
              <Pressable
                style={styles.signOutButton}
                onPress={() => void onSignOut()}
                disabled={signingOut}
              >
                <MaterialIcons name="logout" size={16} color={colors.danger} />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
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
  value: number;
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
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  linkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
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
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 12,
  },
  outlineButtonText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  actionButtonText: { fontSize: 13, color: '#fff', fontWeight: '700' },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
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
