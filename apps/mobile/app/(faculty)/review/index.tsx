/**
 * The review queue.
 *
 * Defaults to pending, because that is the only status that needs action. Each row
 * carries enough — student, date, answer count — to decide whether to open it.
 */

import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { SubmissionStatus } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { useSubmissionList } from '@/lib/api/hooks';
import { colors, fontSize, spacing } from '@/constants/theme';

type Filter = SubmissionStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
];

export default function ReviewQueueScreen() {
  const [filter, setFilter] = useState<Filter>('pending');

  const { data, isLoading, isRefetching, refetch } = useSubmissionList(
    filter === 'all' ? {} : { status: filter },
  );

  const items = data?.items ?? [];

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListHeaderComponent={
          <View style={styles.header}>
            <ChipGroup options={FILTERS} value={filter} onChange={(next) => setFilter(next)} />
            {data ? (
              <Text style={styles.count}>
                {data.pagination.total} submission{data.pagination.total === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <MaterialIcons
                name={filter === 'pending' ? 'check-circle' : 'inbox'}
                size={40}
                color={filter === 'pending' ? colors.success : colors.textFaint}
              />
              <Text style={styles.emptyTitle}>
                {filter === 'pending' ? 'All caught up' : 'Nothing here'}
              </Text>
              <Text style={styles.emptyBody}>
                {filter === 'pending'
                  ? 'No submissions are waiting for review.'
                  : `No ${filter} submissions.`}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(faculty)/review/${item.id}`)}>
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.studentName}>
                  {item.student?.name ?? 'Student'}
                </Text>
                <Text style={styles.registerNumber}>
                  {item.student?.registerNumber ?? ''}
                  {item.student?.section ? ` \u00b7 Section ${item.student.section}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {formatDate(item.submissionDate)} \u00b7 {item.answers.length} answer
                  {item.answers.length === 1 ? '' : 's'}
                  {item.documents.length > 0
                    ? ` \u00b7 ${item.documents.length} file${item.documents.length === 1 ? '' : 's'}`
                    : ''}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <StatusPill status={item.status} compact />
                <MaterialIcons name="chevron-right" size={22} color={colors.textFaint} />
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

function formatDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  header: { marginBottom: spacing.sm },
  count: { fontSize: fontSize.caption, color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowMain: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  studentName: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  registerNumber: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: fontSize.small, color: colors.textMuted, textAlign: 'center' },
});
