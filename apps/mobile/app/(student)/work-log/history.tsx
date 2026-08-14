/**
 * Work log history — 12_Mobile_App_Spec §2 ("Scrollable log cards").
 *
 * Searchable, per 02_SRS §7 ("Daily activity history (searchable by date, tech,
 * keyword)"). The search is sent to the server, which has trigram and GIN indexes for
 * it; when offline the local drafts are filtered in memory instead so the box still
 * does something useful.
 */

import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { DailyWorkLog } from '@ims/shared-types';
import { COMPLETION_STATUS_LABELS, DELIVERABLE_TYPE_LABELS } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { useMyInternship } from '@/lib/api/hooks';
import { workLogDrafts } from '@/lib/db/database';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface LogEntry {
  workDate: string;
  activities: string;
  technologies: string[];
  completionStatus: string | null;
  deliverableType: string | null;
  learning: string | null;
  mentorInteraction: boolean;
  pendingSync: boolean;
}

export default function WorkLogHistoryScreen() {
  const { data: internshipData } = useMyInternship();
  const internshipId = internshipData?.value?.internship?.id;

  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(
    async (term: string) => {
      if (!internshipId) return;
      setLoading(true);

      try {
        const records = await api.get<DailyWorkLog[]>('/work-logs', {
          internshipId,
          search: term || undefined,
        });
        setOffline(false);
        setEntries(
          records.map((record) => ({
            workDate: record.workDate,
            activities: record.activities,
            technologies: record.technologies,
            completionStatus: record.completionStatus,
            deliverableType: record.deliverableType,
            learning: record.learning,
            mentorInteraction: record.mentorInteraction,
            pendingSync: false,
          })),
        );
      } catch (error) {
        if (!(error instanceof ApiError && error.isNetworkError)) {
          setEntries([]);
          setLoading(false);
          return;
        }

        // Offline: fall back to local drafts, filtered client-side.
        setOffline(true);
        const drafts = await workLogDrafts.listForInternship(internshipId);
        const lower = term.toLowerCase();

        setEntries(
          drafts
            .map((draft) => ({
              workDate: draft.work_date,
              activities: draft.activities,
              technologies: workLogDrafts.parseTechnologies(draft),
              completionStatus: draft.completion_status,
              deliverableType: draft.deliverable_type,
              learning: draft.learning,
              mentorInteraction: draft.mentor_interaction === 1,
              pendingSync: draft.sync_status !== 'synced',
            }))
            .filter(
              (entry) =>
                term.length === 0 ||
                entry.activities.toLowerCase().includes(lower) ||
                entry.technologies.some((tag) => tag.toLowerCase().includes(lower)) ||
                (entry.learning ?? '').toLowerCase().includes(lower),
            ),
        );
      }

      setLoading(false);
    },
    [internshipId],
  );

  useEffect(() => {
    void load('');
  }, [load]);

  // Debounced search, so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(search), 350);
    return () => clearTimeout(timer);
  }, [search, load]);

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.workDate}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => void load(search)}
        ListHeaderComponent={
          <View>
            <TextField
              label="Search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search activities, technologies or learning"
              autoCapitalize="none"
            />
            {offline ? (
              <Text style={styles.offline}>
                Offline \u2014 searching records saved on this device.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {search ? 'No matching logs' : 'No work logs yet'}
              </Text>
              <Text style={styles.emptyBody}>
                {search
                  ? 'Try a different search term.'
                  : 'Your daily logs will appear here once you start submitting them.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.date}>{item.workDate}</Text>
              {item.pendingSync ? <Text style={styles.pending}>pending sync</Text> : null}
            </View>

            <Text style={styles.activities} numberOfLines={4}>
              {item.activities}
            </Text>

            {item.technologies.length > 0 ? (
              <View style={styles.tagRow}>
                {item.technologies.map((tag) => (
                  <Text key={tag} style={styles.tag}>
                    {tag}
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={styles.metaRow}>
              {item.completionStatus ? (
                <Text style={styles.meta}>
                  {COMPLETION_STATUS_LABELS[
                    item.completionStatus as keyof typeof COMPLETION_STATUS_LABELS
                  ] ?? item.completionStatus}
                </Text>
              ) : null}
              {item.deliverableType ? (
                <Text style={styles.meta}>
                  {DELIVERABLE_TYPE_LABELS[
                    item.deliverableType as keyof typeof DELIVERABLE_TYPE_LABELS
                  ] ?? item.deliverableType}
                </Text>
              ) : null}
              {item.mentorInteraction ? <Text style={styles.meta}>mentor interaction</Text> : null}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  offline: { fontSize: fontSize.caption, color: colors.warning, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  pending: { fontSize: fontSize.caption, color: colors.warning, fontWeight: '700' },
  activities: { fontSize: fontSize.small, color: colors.text, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    fontSize: fontSize.caption,
    color: colors.info,
    backgroundColor: colors.infoBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  meta: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
