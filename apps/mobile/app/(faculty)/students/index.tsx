/**
 * Student directory — redesigned with gradient header and modern cards.
 */

import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { usePendingStudents, useStudentList } from '@/lib/api/hooks';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

type Filter = 'all' | 'submitted' | 'missing';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Not submitted' },
  { value: 'submitted', label: 'Submitted' },
];

export default function StudentsScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isRefetching, refetch } = useStudentList({
    search: search.trim().length > 1 ? search.trim() : undefined,
    submittedToday: filter === 'all' ? undefined : filter === 'submitted',
  });

  // Shares its cache with the approvals screen this button leads to, so the badge and
  // that list can never disagree about how many are waiting.
  const { data: pendingStudents } = usePendingStudents();
  const pendingCount = pendingStudents?.length ?? 0;

  const items = data?.items ?? [];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#414fb8', '#5b6abf', '#7b85d4']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Students</Text>
            <Text style={styles.headerSubtitle}>View and manage students in your scope</Text>
          </View>

          {/* The only route to pending approvals, so it lives here rather than on the
              dashboard — the pending screen is a sibling of this one in the same stack.
              The count is shown because an unapproved student cannot log in at all, and
              a reviewer who never learns a registration arrived never approves it. */}
          <Pressable
            style={styles.pendingButton}
            onPress={() => router.push('/(faculty)/students/pending')}
            accessibilityRole="button"
            accessibilityLabel={
              pendingCount > 0
                ? `Review ${pendingCount} pending registration${pendingCount === 1 ? '' : 's'}`
                : 'Pending registrations'
            }
          >
            <MaterialIcons name="person-add" size={20} color="#fff" />
            {pendingCount > 0 ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </LinearGradient>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={20} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Name or register number"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')}>
                  <MaterialIcons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <ChipGroup options={FILTERS} value={filter} onChange={(next) => setFilter(next)} />
            {data ? (
              <Text style={styles.count}>
                {data.pagination.total} student{data.pagination.total === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? <ListSkeleton rows={5} /> : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="groups" size={32} color={colors.textFaint} />
              </View>
              <Text style={styles.emptyTitle}>No students found</Text>
              <Text style={styles.emptyBody}>
                {search.length > 0
                  ? 'Try a different search.'
                  : filter === 'missing'
                    ? 'Everyone has submitted today.'
                    : 'No students assigned to your department yet.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(faculty)/students/${item.id}`)}>
            <View style={styles.cardRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardMain}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.registerNumber}>
                  {item.registerNumber}
                  {item.section ? ` \u00b7 Sec ${item.section}` : ''}
                  {item.year ? ` \u00b7 Year ${item.year}` : ''}
                </Text>
                {/* Percentage first, since that is what a reviewer scans for, then the
                    days behind it. Absent is always printed, including as 0, so a clean
                    record reads as a fact rather than as missing data. */}
                <Text style={styles.meta}>
                  {item.summary.attendancePercentage !== null
                    ? `${item.summary.attendancePercentage}% \u00b7 ${item.summary.daysAbsent ?? 0} absent of ${item.summary.internshipDays} days`
                    : 'Attendance not started'}
                </Text>
              </View>
              <View style={styles.cardRight}>
                {item.submittedToday && item.todayStatus ? (
                  <StatusPill status={item.todayStatus} compact />
                ) : (
                  <View style={styles.missingPill}>
                    <Text style={styles.missingText}>Not today</Text>
                  </View>
                )}
                <MaterialIcons name="chevron-right" size={20} color={colors.textFaint} />
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 4 },
  pendingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff20',
    alignItems: 'center',
    justifyContent: 'center',
    // The badge sits outside the circle, so it must not be clipped.
    position: 'relative',
  },
  pendingBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    // Separates the badge from the gradient behind it.
    borderWidth: 1.5,
    borderColor: '#5b6abf',
  },
  pendingBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  list: { padding: 16, paddingBottom: 100 },
  searchSection: { marginBottom: 12, gap: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    gap: 8,
    ...shadow.card,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  count: { fontSize: 11, color: colors.textMuted },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, ...shadow.card },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  cardMain: { flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  registerNumber: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: 1 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] },
  missingPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  missingText: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
