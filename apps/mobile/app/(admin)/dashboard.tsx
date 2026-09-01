/**
 * Admin Dashboard — overview of all faculty and students across departments.
 */

import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { LIVE_REFETCH_INTERVAL_MS, useDashboard } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { colors, shadow, spacing } from '@/constants/theme';
import type { FacultyDashboard as FacultyDashboardData } from '@ims/shared-types';

interface FacultyItem {
  id: string;
  email: string;
  name: string | null;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: string;
}

export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { data: dashData, isRefetching, refetch, dataUpdatedAt, isFetching } = useDashboard();

  // The header's Faculty tile comes from here, so it polls on the same cadence as
  // the dashboard counters. Without a matching interval the three header numbers
  // would drift out of step with each other.
  const { data: faculty } = useQuery({
    queryKey: ['faculty'],
    queryFn: () => api.get<FacultyItem[]>('/faculty'),
    refetchInterval: LIVE_REFETCH_INTERVAL_MS,
  });

  const lastUpdatedLabel = useRelativeTime(dataUpdatedAt);
  const [signingOut, setSigningOut] = useState(false);

  const dashboard = dashData && dashData.role !== 'student'
    ? (dashData.dashboard as FacultyDashboardData)
    : null;

  const onSignOut = async (): Promise<void> => {
    setSigningOut(true);
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Gradient Header */}
        <LinearGradient colors={['#2d3a8c', '#414fb8', '#5b6abf']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          {/* Sign out lives only in the Account card below, so the header stays
              clean and the action is harder to hit by accident. */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerLabel}>Admin Panel</Text>
              <Text style={styles.headerWelcome}>Welcome back,</Text>
              <Text style={styles.headerName}>{user?.name ?? 'Administrator'}</Text>
            </View>
          </View>

          {/* Makes the auto-refresh visible, so a figure that has not changed is
              distinguishable from a screen that has stopped updating. The dot
              carries the in-flight state rather than the text, which would
              otherwise reflow every fifteen seconds. */}
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, isFetching && styles.liveDotActive]} />
            <Text
              style={styles.liveText}
              accessibilityLabel={`Figures update automatically. Last updated ${lastUpdatedLabel}.`}
            >
              Live {'\u00b7'} updated {lastUpdatedLabel}
            </Text>
          </View>

          {/* Stats row in header */}
          <View style={styles.headerStats}>
            <View style={styles.headerStat}>
              <Text style={styles.headerStatValue}>{faculty?.length ?? 0}</Text>
              <Text style={styles.headerStatLabel}>Faculty</Text>
            </View>
            <View style={styles.headerStatDivider} />
            <View style={styles.headerStat}>
              <Text style={styles.headerStatValue}>{dashboard?.totalStudents ?? 0}</Text>
              <Text style={styles.headerStatLabel}>Students</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Quick Actions */}
          <View style={styles.tileRow}>
            <Pressable style={[styles.tile, { backgroundColor: '#eceef8' }]} onPress={() => router.push('/(admin)/faculty')}>
              <View style={[styles.tileIcon, { backgroundColor: '#d9dcf5' }]}>
                <MaterialIcons name="person-add" size={20} color={colors.primary} />
              </View>
              <Text style={styles.tileLabel}>Manage{'\n'}Faculty</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.primary} style={styles.tileArrow} />
            </Pressable>

            <Pressable style={[styles.tile, { backgroundColor: colors.warningBg }]} onPress={() => router.push('/(admin)/students')}>
              <View style={[styles.tileIcon, { backgroundColor: '#fce6b3' }]}>
                <MaterialIcons name="groups" size={20} color={colors.warning} />
              </View>
              <Text style={styles.tileLabel}>All{'\n'}Students</Text>
              <MaterialIcons name="chevron-right" size={18} color={colors.warning} style={styles.tileArrow} />
            </Pressable>
          </View>

          {/* Pending Reviews */}
          {dashboard && dashboard.pendingReview > 0 && (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <View style={[styles.iconCircle, { backgroundColor: colors.warningBg }]}>
                  <MaterialIcons name="rate-review" size={22} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{dashboard.pendingReview} pending review{dashboard.pendingReview === 1 ? '' : 's'}</Text>
                  <Text style={styles.cardSubtitle}>Student submissions awaiting faculty review</Text>
                </View>
              </View>
            </View>
          )}

          {/* Faculty Overview */}
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <MaterialIcons name="admin-panel-settings" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Faculty</Text>
              <Pressable onPress={() => router.push('/(admin)/faculty')} style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.linkText}>View all</Text>
                <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
              </Pressable>
            </View>

            {faculty && faculty.length > 0 ? (
              faculty.slice(0, 3).map((f) => (
                <View key={f.id} style={styles.facultyRow}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{(f.name ?? f.email).charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.facultyName}>{f.name ?? f.email}</Text>
                    <Text style={styles.facultyDept}>{f.departmentName ?? 'No department'}</Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No faculty accounts created yet.</Text>
            )}
          </View>

          {/* Account */}
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.iconCircle, { backgroundColor: '#eceef8' }]}>
                <MaterialIcons name="account-circle" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Account</Text>
                <Text style={styles.cardSubtitle}>Signed in as {user?.email ?? 'admin'}</Text>
              </View>
              <Pressable style={styles.signOutBtn} onPress={() => void onSignOut()} disabled={signingOut}>
                <MaterialIcons name="logout" size={14} color={colors.danger} />
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * A "3s ago" label that keeps counting between refetches.
 *
 * React Query only re-renders when it fetches, so without its own tick the label
 * would freeze at "just now" for the whole poll interval and read as though the
 * screen had stopped working.
 */
function useRelativeTime(timestamp: number): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  if (!timestamp) return 'never';

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  headerLabel: { fontSize: 13, color: '#ffffffaa', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  headerWelcome: { fontSize: 13, color: '#ffffffcc', marginTop: 8 },
  headerName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ffffff66' },
  liveDotActive: { backgroundColor: '#8ce8b4' },
  liveText: { fontSize: 11, color: '#ffffffcc', fontVariant: ['tabular-nums'] },
  headerStats: { flexDirection: 'row', backgroundColor: '#ffffff15', borderRadius: 14, padding: 14, marginTop: 18, alignItems: 'center' },
  headerStat: { flex: 1, alignItems: 'center' },
  headerStatValue: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerStatLabel: { fontSize: 11, color: '#ffffffcc', marginTop: 2 },
  headerStatDivider: { width: 1, height: 30, backgroundColor: '#ffffff30' },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, ...shadow.card },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  linkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  iconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tileRow: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: 14, padding: 16, minHeight: 100 },
  tileIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  tileLabel: { fontSize: 13, fontWeight: '700', color: colors.text, lineHeight: 18 },
  tileArrow: { position: 'absolute', top: 16, right: 16 },
  facultyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  facultyName: { fontSize: 13, fontWeight: '600', color: colors.text },
  facultyDept: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.danger },
  signOutText: { fontSize: 12, fontWeight: '700', color: colors.danger },
  muted: { fontSize: 13, color: colors.textMuted },
});
