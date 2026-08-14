/**
 * Faculty student list — 12_Mobile_App_Spec §2, 06_App_Flow §7.
 *
 * Search plus the two filters the flow document drills into from the dashboard:
 * "Missing Today's Log" and pending approval. The list is always scoped server-side to
 * the faculty member's department and coordinated internships, so the filters can only
 * narrow it.
 *
 * Approve and reject act directly from the row, which is milestone 3 of the first
 * development milestone in 10_Project_Setup_README ("Faculty can approve the internship
 * on their device").
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { StudentListItem } from '@ims/shared-types';
import { INTERNSHIP_STATUS_LABELS } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export default function FacultyStudentsScreen() {
  const params = useLocalSearchParams<{ missingToday?: string; status?: string }>();

  const [search, setSearch] = useState('');
  const [items, setItems] = useState<StudentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Today's date, used for the "missing today's log" filter. */
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      setMessage(null);

      try {
        const result = await api.list<StudentListItem>('/students', {
          search: term || undefined,
          missingLogOn: params.missingToday === '1' ? todayIso : undefined,
          status: params.status || undefined,
          pageSize: 50,
        });
        setItems(result.items);
      } catch (error) {
        setMessage(
          error instanceof ApiError ? error.message : 'Could not load the student list.',
        );
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [params.missingToday, params.status, todayIso],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(search), 350);
    return () => clearTimeout(timer);
  }, [search, load]);

  /** Approve or reject a pending registration. Reject demands a reason. */
  const decide = async (internshipId: string, approve: boolean): Promise<void> => {
    if (!approve) {
      // Alert.prompt is iOS-only, so a reason is collected via a simple confirm and a
      // fixed message. A dedicated review screen is listed as remaining work.
      Alert.alert(
        'Return this registration?',
        'The student will be asked to correct and resubmit it.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Return',
            style: 'destructive',
            onPress: () => {
              void submit(internshipId, false, 'Please review and correct your registration details.');
            },
          },
        ],
      );
      return;
    }

    await submit(internshipId, true);
  };

  const submit = async (
    internshipId: string,
    approve: boolean,
    rejectionReason?: string,
  ): Promise<void> => {
    setBusyId(internshipId);
    try {
      if (approve) {
        await api.post(`/internships/${internshipId}/approve`, {});
      } else {
        await api.post(`/internships/${internshipId}/reject`, { rejectionReason });
      }
      await load(search);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not update the internship.');
    } finally {
      setBusyId(null);
    }
  };

  const heading =
    params.missingToday === '1'
      ? "Missing today's log"
      : params.status === 'pending'
        ? 'Pending approval'
        : 'All students';

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.student.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => void load(search)}
        ListHeaderComponent={
          <View>
            <Text style={styles.heading}>{heading}</Text>
            <TextField
              label="Search"
              value={search}
              onChangeText={setSearch}
              placeholder="Name, register number or email"
              autoCapitalize="none"
            />
            {message ? (
              <View style={styles.messageBox} accessibilityLiveRegion="polite">
                <Text style={styles.messageText}>{message}</Text>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No students found</Text>
              <Text style={styles.emptyBody}>
                {search ? 'Try a different search term.' : 'Nothing matches this filter.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const internship = item.internship;
          const isPending = internship?.status === 'pending';

          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.student.name}</Text>
                  <Text style={styles.meta}>
                    {item.student.registerNumber} \u00b7 {item.student.programme}
                  </Text>
                  {internship ? (
                    <Text style={styles.meta}>
                      {internship.organisation?.name ?? 'Organisation not set'} \u00b7{' '}
                      {INTERNSHIP_STATUS_LABELS[internship.status]}
                    </Text>
                  ) : (
                    <Text style={styles.meta}>No internship registered</Text>
                  )}
                </View>

                <View style={styles.stats}>
                  <Text style={styles.percentage}>
                    {item.attendancePercentage !== null ? `${item.attendancePercentage}%` : '\u2014'}
                  </Text>
                  {item.missingTodayLog ? (
                    <Text style={styles.missing}>no log today</Text>
                  ) : null}
                  {item.pendingDocumentCount > 0 ? (
                    <Text style={styles.docs}>{item.pendingDocumentCount} docs</Text>
                  ) : null}
                </View>
              </View>

              {isPending && internship ? (
                <View style={styles.actions}>
                  <View style={styles.action}>
                    <Button
                      label="Approve"
                      onPress={() => void decide(internship.id, true)}
                      loading={busyId === internship.id}
                    />
                  </View>
                  <View style={styles.action}>
                    <Button
                      label="Return"
                      variant="secondary"
                      onPress={() => void decide(internship.id, false)}
                      disabled={busyId === internship.id}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg },
  heading: { fontSize: fontSize.title, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  messageBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  messageText: { color: colors.danger, fontSize: fontSize.small },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  info: { flex: 1, gap: 2 },
  name: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: fontSize.caption, color: colors.textMuted },
  stats: { alignItems: 'flex-end', gap: 2 },
  percentage: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  missing: { fontSize: fontSize.caption, color: colors.danger, fontWeight: '700' },
  docs: { fontSize: fontSize.caption, color: colors.warning, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: fontSize.small, color: colors.textMuted, marginTop: spacing.xs },
});
