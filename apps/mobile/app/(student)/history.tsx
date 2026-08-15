/**
 * The student's submission history.
 *
 * A flat list of days with their status, newest first. Tapping a declined day is the
 * path back to fixing it, which is why the decline note is shown inline rather than
 * hidden behind a tap.
 */

import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { SubmissionStatus } from '@ims/shared-types';
import { SUBMISSION_STATUSES } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { useSubmissionList } from '@/lib/api/hooks';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

type Filter = SubmissionStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...SUBMISSION_STATUSES.map((status) => ({
    value: status as Filter,
    label: status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Declined',
  })),
];

export default function StudentHistoryScreen() {
  const [filter, setFilter] = useState<Filter>('all');

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
            <ChipGroup
              options={FILTERS}
              value={filter}
              onChange={(next) => setFilter(next)}
            />
            {data ? (
              <Text style={styles.count}>
                {data.pagination.total} day{data.pagination.total === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>
                {filter === 'all'
                  ? 'Your submissions will appear here once you start answering.'
                  : `You have no ${filter} submissions.`}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.date}>{formatDate(item.submissionDate)}</Text>
                <Text style={styles.meta}>
                  {item.answers.length} answer{item.answers.length === 1 ? '' : 's'}
                  {item.documents.length > 0
                    ? ` \u00b7 ${item.documents.length} file${item.documents.length === 1 ? '' : 's'}`
                    : ''}
                </Text>
              </View>
              <StatusPill status={item.status} compact />
            </View>

            {item.reviewNote ? (
              <View style={styles.noteBox}>
                <Text style={styles.noteLabel}>Faculty note</Text>
                <Text style={styles.noteText}>{item.reviewNote}</Text>
              </View>
            ) : null}

            {/* First answer as a preview, so the list is scannable without tapping. */}
            {item.answers[0] ? (
              <View style={styles.preview}>
                <Text style={styles.previewPrompt} numberOfLines={1}>
                  {item.answers[0].promptSnapshot}
                </Text>
                <Text style={styles.previewText} numberOfLines={2}>
                  {item.answers[0].answerText}
                </Text>
              </View>
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}

function formatDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  header: { marginBottom: spacing.sm },
  count: { fontSize: fontSize.caption, color: colors.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rowMain: { flex: 1 },
  date: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  noteBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  noteLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 2,
  },
  noteText: { fontSize: fontSize.small, color: colors.text, lineHeight: 19 },
  preview: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  previewPrompt: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  previewText: { fontSize: fontSize.small, color: colors.text, marginTop: 2, lineHeight: 19 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
