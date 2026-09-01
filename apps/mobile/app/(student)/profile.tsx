/**
 * Student profile — redesigned with gradient header and modern cards.
 */

import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useMyProfile } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { PROGRAMME_LABEL } from '@/constants/academics';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { data: student, isLoading, isRefetching, refetch } = useMyProfile();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async (): Promise<void> => {
    setSigningOut(true);
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.container}>
      {/* Gradient Header */}
      <LinearGradient
        colors={['#414fb8', '#5b6abf', '#7b85d4']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerContent}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(student?.name ?? user?.name ?? 'S').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.headerName}>{student?.name ?? user?.name ?? 'Student'}</Text>
          <Text style={styles.headerEmail}>{user?.email ?? ''}</Text>
          {student?.registerNumber && (
            <View style={styles.regBadge}>
              <MaterialIcons name="badge" size={13} color="#ffffffcc" />
              <Text style={styles.regBadgeText}>{student.registerNumber}</Text>
            </View>
          )}
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {/* Academic Info Card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="school" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Academic Details</Text>
          </View>

          {isLoading && !student ? (
            <Text style={styles.muted}>Loading...</Text>
          ) : student ? (
            <View style={styles.detailsGrid}>
              <DetailRow icon="school" label="Programme" value={PROGRAMME_LABEL} />
              <DetailRow icon="business" label="Department" value={student.department?.name ?? '\u2014'} />
              <DetailRow icon="calendar-today" label="Year" value={student.year !== null ? String(student.year) : '\u2014'} />
              <DetailRow icon="groups" label="Section" value={student.section ?? '\u2014'} />
              <DetailRow icon="email" label="Email" value={student.studentEmail} />
              <DetailRow icon="phone" label="Mobile" value={student.mobile ?? '\u2014'} />
            </View>
          ) : (
            <Text style={styles.muted}>Could not load your profile.</Text>
          )}
        </View>

        {/* How Attendance Works Card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="info-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>How attendance works</Text>
          </View>
          <Text style={styles.infoText}>
            Answer the daily questions each day. Your faculty coordinator reviews your answers and
            any files you attach. Once approved, that day counts towards your attendance.
          </Text>
        </View>

        {/* Account Card */}
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <MaterialIcons name="account-circle" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Account</Text>
          </View>
          <Text style={styles.infoText}>
            Signing out removes your saved login on this device.
          </Text>
          <Pressable
            style={styles.signOutButton}
            onPress={() => void onSignOut()}
            disabled={signingOut}
          >
            <MaterialIcons name="logout" size={16} color={colors.danger} />
            <Text style={styles.signOutText}>{signingOut ? 'Signing out...' : 'Sign out'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon as any} size={16} color={colors.textMuted} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 28, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, alignItems: 'center' },
  headerContent: { alignItems: 'center' },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ffffff30', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  headerName: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerEmail: { fontSize: 13, color: '#ffffffcc', marginTop: 3 },
  regBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#ffffff20', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  regBadgeText: { fontSize: 12, color: '#ffffffcc', fontWeight: '600', fontVariant: ['tabular-nums'] },
  content: { padding: 16, paddingBottom: 100, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, ...shadow.card },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  infoText: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },
  detailsGrid: { gap: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailLabel: { fontSize: 12, color: colors.textMuted, width: 85 },
  detailValue: { fontSize: 13, color: colors.text, fontWeight: '600', flex: 1 },
  signOutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.danger },
  signOutText: { fontSize: 14, fontWeight: '700', color: colors.danger },
});
