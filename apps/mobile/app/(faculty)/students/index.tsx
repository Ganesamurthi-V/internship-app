/**
 * Student directory.
 *
 * The "not submitted today" filter is the one a reviewer reaches for most, so it is a
 * one-tap chip rather than buried in a filter sheet.
 */

import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { TextField } from '@/components/ui/TextField';
import { useStudentList } from '@/lib/api/hooks';
import { colors, fontSize, spacing } from '@/constants/theme';

type Filter = 'all' | 'submitted' | 'missing';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'missing', label: 'Not submitted' },
  { value: 'submitted', label: 'Submitted' },
];

export default function StudentsScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, isRefetching, refetch } = useStudentList({
    search: search.trim().length > 1 ? search.trim() : undefined,
    submittedToday: filter === 'all' ? undefined : filter === 'submitted',
  });

  const items = data?.items ?? [];

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <TextField
              label="Search"
              value={search}
              onChangeText={setSearch}
              placeholder="Name or register number"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <ChipGroup options={FILTERS} value={filter} onChange={(next) => setFilter(next)} />
            {data ? (
              <Text style={styles.count}>
                {data.pagination.total} student{data.pagination.total === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No students found</Text>
              <Text style={styles.emptyBody}>
                {search.length > 0
                  ? 'Try a different search.'
                  : filter === 'missing'
                    ? 'Everyone has submitted today.'
                    : 'No students are assigned to your department yet.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(faculty)/students/${item.id}`)}>
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.registerNumber}>
                  {item.registerNumber}
                  {item.section ? ` \u00b7 Section ${item.section}` : ''}
                  {item.year ? ` \u00b7 Year ${item.year}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {item.summary.daysApproved}/{item.summary.daysSubmitted} days approved
                  {item.summary.approvalPercentage !== null
                    ? ` \u00b7 ${item.summary.approvalPercentage}%`
                    : ''}
                </Text>
              </View>
              <View style={styles.rowRight}>
                {item.submittedToday && item.todayStatus ? (
                  <StatusPill status={item.todayStatus} compact />
                ) : (
                  <View style={styles.missingPill}>
                    <Text style={styles.missingText}>Not today</Text>
                  </View>
                )}
                <MaterialIcons name="chevron-right" size={22} color={colors.textFaint} />
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  header: { marginBottom: spacing.sm },
  count: { fontSize: fontSize.caption, color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowMain: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  registerNumber: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  meta: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  missingPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
  },
  missingText: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
