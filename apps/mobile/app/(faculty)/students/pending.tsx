/**
 * Pending student approvals — faculty reviews new registrations.
 *
 * Faculty sees students in their department who registered but haven't been
 * approved yet. They can approve (allow login) or reject (block with reason).
 */

import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

interface PendingStudent {
  id: string;
  registerNumber: string;
  name: string;
  programme: string;
  departmentName: string | null;
  year: number | null;
  section: string | null;
  email: string;
  mobile: string;
  organisationName: string | null;
  organisationLocation: string | null;
  internshipDomain: string | null;
  internshipMode: string | null;
  status: string;
  createdAt: string;
}

export default function PendingStudentsScreen() {
  const queryClient = useQueryClient();
  const { data: students, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['students', 'pending'],
    queryFn: () => api.get<PendingStudent[]>('/students/pending'),
    staleTime: 30 * 1000,
  });

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const onApprove = async (student: PendingStudent) => {
    Alert.alert(
      'Approve Student?',
      `${student.name} (${student.registerNumber}) will be able to log in and submit daily answers.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setProcessing(student.id);
            try {
              await api.post(`/students/${student.id}/approve`);
              Alert.alert('Approved', `${student.name} can now log in.`);
              void queryClient.invalidateQueries({ queryKey: ['students', 'pending'] });
              void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            } catch (err) {
              Alert.alert('Error', err instanceof ApiError ? err.message : 'Try again.');
            } finally {
              setProcessing(null);
            }
          },
        },
      ],
    );
  };

  const onReject = async (studentId: string) => {
    if (rejectReason.trim().length < 3) {
      Alert.alert('Reason required', 'Explain why the profile is rejected.');
      return;
    }
    setProcessing(studentId);
    try {
      await api.post(`/students/${studentId}/reject`, { reason: rejectReason.trim() });
      Alert.alert('Rejected', 'The student has been notified.');
      setRejectingId(null);
      setRejectReason('');
      void queryClient.invalidateQueries({ queryKey: ['students', 'pending'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      Alert.alert('Error', err instanceof ApiError ? err.message : 'Try again.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Text style={styles.title}>Pending Approvals</Text>
      <Text style={styles.subtitle}>
        New student registrations awaiting your approval
      </Text>

      {isLoading ? (
        <Text style={styles.muted}>Loading...</Text>
      ) : !students || students.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="check-circle" size={48} color={colors.success} />
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptyBody}>No pending student registrations.</Text>
        </View>
      ) : (
        students.map((student) => (
          <Card key={student.id}>
            <View style={styles.studentHeader}>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{student.name}</Text>
                <Text style={styles.registerNum}>{student.registerNumber}</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>Pending</Text>
              </View>
            </View>

            <View style={styles.detailsGrid}>
              <DetailRow icon="school" label="Department" value={student.departmentName ?? student.programme} />
              <DetailRow icon="calendar-today" label="Year / Section"
                value={`${student.year ?? '-'} / ${student.section ?? '-'}`} />
              <DetailRow icon="email" label="Email" value={student.email} />
              <DetailRow icon="phone" label="Mobile" value={student.mobile} />
              {student.organisationName ? (
                <DetailRow icon="business" label="Organisation" value={student.organisationName} />
              ) : null}
              {student.internshipDomain ? (
                <DetailRow icon="code" label="Domain" value={student.internshipDomain} />
              ) : null}
              {student.internshipMode ? (
                <DetailRow icon="laptop" label="Mode" value={student.internshipMode} />
              ) : null}
            </View>

            {rejectingId === student.id ? (
              <View style={styles.rejectForm}>
                <TextField
                  label="Rejection reason"
                  required
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Why is this being rejected?"
                  multiline
                />
                <View style={styles.actionRow}>
                  <Button label="Cancel" variant="secondary"
                    onPress={() => { setRejectingId(null); setRejectReason(''); }} />
                  <Button label="Confirm Reject" variant="danger"
                    onPress={() => void onReject(student.id)}
                    loading={processing === student.id} />
                </View>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <Button label="Reject" variant="danger"
                  onPress={() => setRejectingId(student.id)}
                  disabled={processing === student.id} />
                <Button label="Approve" onPress={() => void onApprove(student)}
                  loading={processing === student.id} />
              </View>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon as any} size={16} color={colors.textMuted} />
      <Text style={styles.detailLabel}>{label}:</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: spacing.lg },
  muted: { fontSize: fontSize.body, color: colors.textMuted },

  studentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  studentInfo: { flex: 1 },
  studentName: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  registerNum: { fontSize: fontSize.caption, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: 2 },
  pendingBadge: { backgroundColor: colors.warningBg, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  pendingBadgeText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.warning },

  detailsGrid: { gap: spacing.sm, marginBottom: spacing.lg },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailLabel: { fontSize: fontSize.caption, color: colors.textMuted, width: 80 },
  detailValue: { fontSize: fontSize.small, color: colors.text, flex: 1 },

  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  rejectForm: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },

  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: fontSize.small, color: colors.textMuted },
});
