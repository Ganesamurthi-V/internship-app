/**
 * Admin Students — view all students across all departments.
 */

import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StatusPill } from '@/components/ui/StatusPill';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { useStudentList } from '@/lib/api/hooks';
import { colors, shadow } from '@/constants/theme';

export default function AdminStudentsScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  // Search covers name, register number and department name; the backend matches
  // all three, so one input is enough and no status filter is needed here.
  const { data, isLoading, isRefetching, refetch } = useStudentList({
    search: search.trim().length > 1 ? search.trim() : undefined,
  });

  const items = data?.items ?? [];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#2d3a8c', '#414fb8', '#5b6abf']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>All Students</Text>
        <Text style={styles.headerSubtitle}>Monitor students across all departments</Text>
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
                placeholder="Search by name, register number or department"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch('')}>
                  <MaterialIcons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
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
                {search.length > 0 ? 'Try a different search.' : 'No students registered yet.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(admin)/students/${item.id}`)}>
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
                {item.departmentName ? (
                  <Text style={styles.department} numberOfLines={1}>{item.departmentName}</Text>
                ) : null}
                {/* Percentage first, since that is what an admin scans for, then the
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
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 4 },
  list: { padding: 16, paddingBottom: 100 },
  searchSection: { marginBottom: 12, gap: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, height: 44, gap: 8, ...shadow.card },
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
  department: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] },
  missingPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceAlt },
  missingText: { fontSize: 10, color: colors.textMuted, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
