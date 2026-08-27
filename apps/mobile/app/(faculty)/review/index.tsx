/**
 * Review queue — redesigned with gradient header and modern cards.
 */

import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { SubmissionStatus } from '@ims/shared-types';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { ListSkeleton } from '@/components/ui/SkeletonLoader';
import { useSubmissionList } from '@/lib/api/hooks';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

type Filter = SubmissionStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'all', label: 'All' },
];

export default function ReviewQueueScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('pending');

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
        <Text style={styles.headerTitle}>Review</Text>
        <Text style={styles.headerSubtitle}>
          Review student submissions and mark attendance
        </Text>
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
                {data.pagination.total} submission{data.pagination.total === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? <ListSkeleton rows={4} /> : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialIcons
                  name={filter === 'pending' ? 'check-circle' : 'inbox'}
                  size={36}
                  color={filter === 'pending' ? colors.success : colors.textFaint}
                />
              </View>
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
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/(faculty)/review/${item.id}`)}
          >
            <View style={styles.cardRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {(item.student?.name ?? 'S').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.cardMain}>
                <Text style={styles.studentName}>{item.student?.name ?? 'Student'}</Text>
                <Text style={styles.registerNumber}>
                  {item.student?.registerNumber ?? ''}
                  {item.student?.section ? ` \u00b7 Section ${item.student.section}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {formatDate(item.submissionDate)} {'\u00b7'} {item.answers.length} answer
                  {item.answers.length === 1 ? '' : 's'}
                  {item.documents.length > 0
                    ? ` \u00b7 ${item.documents.length} file${item.documents.length === 1 ? '' : 's'}`
                    : ''}
                </Text>
              </View>
              <View style={styles.cardRight}>
                <StatusPill status={item.status} compact />
                <MaterialIcons name="chevron-right" size={20} color={colors.textFaint} />
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function formatDate(dateOnly: string): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 4 },
  list: { padding: 16, paddingBottom: 100 },
  filterRow: { marginBottom: 12 },
  count: { fontSize: 11, color: colors.textMuted, marginTop: 6 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    ...shadow.card,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eceef8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  cardMain: { flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  studentName: { fontSize: 14, fontWeight: '700', color: colors.text },
  registerNumber: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: 1 },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eceef8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
