/**
 * Admin Students — view all students across all departments.
 */

import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { useStudentList } from '@/lib/api/hooks';
import { colors, shadow, spacing } from '@/constants/theme';

type Filter = 'all' | 'submitted' | 'missing';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Not submitted' },
  { value: 'submitted', label: 'Submitted' },
];

export default function AdminStudentsScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isRefetching, refetch } = useStudentList({
    search: search.trim().length > 1 ? search.trim() : undefined,
    submittedToday: filter === 'all' ? undefined : filter === 'submitted',
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
                placeholder="Search name or register number"
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
                {search.length > 0 ? 'Try a different search.' : 'No students registered yet.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
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
                <Text style={styles.meta}>
                  {item.summary.daysApproved}/{item.summary.daysSubmitted} approved
                  {item.summary.approvalPercentage !== null ? ` \u00b7 ${item.summary.approvalPercentage}%` : ''}
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
              </View>
            </View>
          </View>
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
  cardRight: { alignItems: 'flex-end' },
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
