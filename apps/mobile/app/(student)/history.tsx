/**
 * Student submission history — redesigned with gradient header and modern cards.
 */

import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { SubmissionStatus } from '@ims/shared-types';
import { SUBMISSION_STATUSES } from '@ims/shared-types';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { useSubmissionList } from '@/lib/api/hooks';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

type Filter = SubmissionStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...SUBMISSION_STATUSES.map((status) => ({
    value: status as Filter,
    label: status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Declined',
  })),
];

export default function StudentHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');

  const { data, isLoading, isRefetching, refetch } = useSubmissionList(
    filter === 'all' ? {} : { status: filter },
  );

  const items = data?.items ?? [];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#414fb8', '#5b6abf', '#7b85d4']}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <Text style={styles.headerTitle}>History</Text>
        <Text style={styles.headerSubtitle}>Your daily submission records</Text>
      </LinearGradient>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListHeaderComponent={
          <View style={styles.filterRow}>
            <ChipGroup options={FILTERS} value={filter} onChange={(next) => setFilter(next)} />
            {data ? (
              <Text style={styles.count}>
                {data.pagination.total} day{data.pagination.total === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? <ListSkeleton rows={4} /> : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="history" size={32} color={colors.textFaint} />
              </View>
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
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.dateCircle}>
                <Text style={styles.dateDay}>{new Date(`${item.submissionDate}T00:00:00Z`).getUTCDate()}</Text>
                <Text style={styles.dateMonth}>{new Date(`${item.submissionDate}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}</Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.dateText}>{formatDate(item.submissionDate)}</Text>
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
                <MaterialIcons name="info" size={14} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.noteLabel}>Faculty note</Text>
                  <Text style={styles.noteText}>{item.reviewNote}</Text>
                </View>
              </View>
            ) : null}

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
          </View>
        )}
      />
    </View>
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
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 4 },
  list: { padding: 16, paddingBottom: 100 },
  filterRow: { marginBottom: 12 },
  count: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 16, fontWeight: '800', color: colors.primary, lineHeight: 18 },
  dateMonth: { fontSize: 9, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  rowMain: { flex: 1 },
  dateText: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  noteBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.dangerBg, borderRadius: 10, padding: 12, marginTop: 10 },
  noteLabel: { fontSize: 10, fontWeight: '700', color: colors.danger },
  noteText: { fontSize: 12, color: colors.text, lineHeight: 17, marginTop: 1 },
  preview: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  previewPrompt: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  previewText: { fontSize: 13, color: colors.text, marginTop: 2, lineHeight: 18 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
