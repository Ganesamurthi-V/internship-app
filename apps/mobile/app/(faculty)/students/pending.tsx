/**
 * Pending student approvals — redesigned with gradient header.
 */

import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

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
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: students, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['students', 'pending'],
    queryFn: () => api.get<PendingStudent[]>('/students/pending'),
    staleTime: 30 * 1000,
  });

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const onApprove = (student: PendingStudent) => {
    Alert.alert(
      'Approve Student?',
      `${student.name} (${student.registerNumber}) will be able to log in.`,
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
    <View style={styles.container}>
      <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Pending Approvals</Text>
            <Text style={styles.headerSubtitle}>New student registrations awaiting review</Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {isLoading ? (
          <Text style={{ color: colors.textMuted, padding: 20 }}>Loading...</Text>
        ) : !students || students.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="check-circle" size={36} color={colors.success} />
            </View>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyBody}>No pending student registrations.</Text>
          </View>
        ) : (
          students.map((student) => (
            <View key={student.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{student.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.registerNum}>{student.registerNumber}</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>Pending</Text>
                </View>
              </View>

              <View style={styles.detailsGrid}>
                <DetailRow icon="school" value={student.departmentName ?? student.programme} />
                <DetailRow icon="calendar-today" value={`Year ${student.year ?? '-'} / Sec ${student.section ?? '-'}`} />
                <DetailRow icon="email" value={student.email} />
                <DetailRow icon="phone" value={student.mobile} />
                {student.organisationName ? <DetailRow icon="business" value={student.organisationName} /> : null}
                {student.internshipDomain ? <DetailRow icon="code" value={student.internshipDomain} /> : null}
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
                    <Button label="Cancel" variant="secondary" onPress={() => { setRejectingId(null); setRejectReason(''); }} />
                    <Button label="Reject" variant="danger" onPress={() => void onReject(student.id)} loading={processing === student.id} />
                  </View>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <Pressable style={styles.rejectBtn} onPress={() => setRejectingId(student.id)} disabled={processing === student.id}>
                    <MaterialIcons name="close" size={16} color={colors.danger} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </Pressable>
                  <Pressable style={styles.approveBtn} onPress={() => void onApprove(student)} disabled={processing === student.id}>
                    <MaterialIcons name="check" size={16} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve</Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function DetailRow({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon as any} size={15} color={colors.textMuted} />
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#ffffffcc', marginTop: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 100, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, ...shadow.card },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: colors.primary },
  studentName: { fontSize: 15, fontWeight: '700', color: colors.text },
  registerNum: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: 1 },
  pendingBadge: { backgroundColor: colors.warningBg, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: colors.warning },
  detailsGrid: { gap: 8, marginBottom: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailValue: { fontSize: 13, color: colors.text, flex: 1 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rejectForm: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.danger },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, backgroundColor: colors.primary },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted },
});
