/**
 * Pending student approvals — with expandable detail view and document viewer.
 */

import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  workingHoursPerDay: number | null;
  mentorName: string | null;
  mentorDesignation: string | null;
  mentorContact: string | null;
  facultyCoordinator: string | null;
  offerLetterDocId: string | null;
  joiningLetterDocId: string | null;
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
  const [detailStudent, setDetailStudent] = useState<PendingStudent | null>(null);

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

              {/* View Details Button */}
              <Pressable style={styles.viewDetailsBtn} onPress={() => setDetailStudent(student)}>
                <MaterialIcons name="visibility" size={16} color={colors.primary} />
                <Text style={styles.viewDetailsBtnText}>View Details</Text>
                <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
              </Pressable>

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

      {/* Student Detail Modal */}
      {detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          onClose={() => setDetailStudent(null)}
          onApprove={() => { setDetailStudent(null); onApprove(detailStudent); }}
          onReject={() => { setDetailStudent(null); setRejectingId(detailStudent.id); }}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Student Detail Modal — shows all registration info page by page
// ---------------------------------------------------------------------------

function StudentDetailModal({
  student,
  onClose,
  onApprove,
  onReject,
}: {
  student: PendingStudent;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [opening, setOpening] = useState(false);
  const pages = ['Personal', 'Internship', 'Mentor', 'Documents'];

  const openDocument = async (docId: string | null) => {
    if (!docId) { Alert.alert('No document', 'No file was uploaded.'); return; }
    setOpening(true);
    try {
      const result = await api.get<{ downloadUrl: string }>(`/documents/${docId}`);
      await Linking.openURL(result.downloadUrl);
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        {/* Header */}
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[detailStyles.header, { paddingTop: insets.top + 12 }]}>
          <View style={detailStyles.headerRow}>
            <Pressable onPress={onClose} style={detailStyles.closeBtn}>
              <MaterialIcons name="close" size={22} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={detailStyles.headerName}>{student.name}</Text>
              <Text style={detailStyles.headerSub}>{student.registerNumber} \u00b7 {student.departmentName ?? student.programme}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Page tabs */}
        <View style={detailStyles.tabs}>
          {pages.map((label, i) => (
            <Pressable key={label} style={[detailStyles.tab, page === i && detailStyles.tabActive]} onPress={() => setPage(i)}>
              <Text style={[detailStyles.tabText, page === i && detailStyles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={detailStyles.content} showsVerticalScrollIndicator={false}>
          {page === 0 && (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Personal Details</Text>
              <InfoRow label="Full Name" value={student.name} />
              <InfoRow label="Register Number" value={student.registerNumber} />
              <InfoRow label="Department" value={student.departmentName ?? student.programme} />
              <InfoRow label="Year" value={student.year ? String(student.year) : '-'} />
              <InfoRow label="Section" value={student.section ?? '-'} />
              <InfoRow label="Email" value={student.email} />
              <InfoRow label="Mobile" value={student.mobile} />
              <InfoRow label="Registered On" value={new Date(student.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} />
            </View>
          )}

          {page === 1 && (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Internship Details</Text>
              <InfoRow label="Organisation" value={student.organisationName ?? '-'} />
              <InfoRow label="Location" value={student.organisationLocation ?? '-'} />
              <InfoRow label="Domain" value={student.internshipDomain ?? '-'} />
              <InfoRow label="Mode" value={student.internshipMode ?? '-'} />
              <InfoRow label="Start Date" value={student.startDate ?? '-'} />
              <InfoRow label="End Date" value={student.endDate ?? '-'} />
              <InfoRow label="Duration" value={student.durationDays ? `${student.durationDays} days` : '-'} />
              <InfoRow label="Hours / Day" value={student.workingHoursPerDay ? String(student.workingHoursPerDay) : '-'} />
            </View>
          )}

          {page === 2 && (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Mentor Details</Text>
              <InfoRow label="Mentor Name" value={student.mentorName ?? '-'} />
              <InfoRow label="Designation" value={student.mentorDesignation ?? '-'} />
              <InfoRow label="Contact" value={student.mentorContact ?? '-'} />
              <InfoRow label="Faculty Coordinator" value={student.facultyCoordinator ?? '-'} />
            </View>
          )}

          {page === 3 && (
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Documents</Text>

              <View style={detailStyles.docCard}>
                <View style={detailStyles.docIcon}>
                  <MaterialIcons name="picture-as-pdf" size={22} color={student.offerLetterDocId ? colors.primary : colors.textFaint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={detailStyles.docTitle}>Internship Offer Letter</Text>
                  <Text style={detailStyles.docStatus}>{student.offerLetterDocId ? 'Uploaded' : 'Not uploaded'}</Text>
                </View>
                {student.offerLetterDocId && (
                  <Pressable style={detailStyles.viewDocBtn} onPress={() => void openDocument(student.offerLetterDocId)} disabled={opening}>
                    <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
                    <Text style={detailStyles.viewDocText}>{opening ? 'Opening...' : 'View'}</Text>
                  </Pressable>
                )}
              </View>

              <View style={detailStyles.docCard}>
                <View style={detailStyles.docIcon}>
                  <MaterialIcons name="picture-as-pdf" size={22} color={student.joiningLetterDocId ? colors.primary : colors.textFaint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={detailStyles.docTitle}>Joining Letter / Proof</Text>
                  <Text style={detailStyles.docStatus}>{student.joiningLetterDocId ? 'Uploaded' : 'Not uploaded'}</Text>
                </View>
                {student.joiningLetterDocId && (
                  <Pressable style={detailStyles.viewDocBtn} onPress={() => void openDocument(student.joiningLetterDocId)} disabled={opening}>
                    <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
                    <Text style={detailStyles.viewDocText}>{opening ? 'Opening...' : 'View'}</Text>
                  </Pressable>
                )}
              </View>

              {!student.offerLetterDocId && !student.joiningLetterDocId && (
                <View style={detailStyles.noDocsBox}>
                  <MaterialIcons name="info-outline" size={18} color={colors.textMuted} />
                  <Text style={detailStyles.noDocsText}>No documents were uploaded during registration.</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom actions */}
        <View style={[detailStyles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={detailStyles.footerRejectBtn} onPress={onReject}>
            <MaterialIcons name="close" size={18} color={colors.danger} />
            <Text style={detailStyles.footerRejectText}>Reject</Text>
          </Pressable>
          <Pressable style={detailStyles.footerApproveBtn} onPress={onApprove}>
            <MaterialIcons name="check" size={18} color="#fff" />
            <Text style={detailStyles.footerApproveText}>Approve</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.infoRow}>
      <Text style={detailStyles.infoLabel}>{label}</Text>
      <Text style={detailStyles.infoValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
  detailsGrid: { gap: 8, marginBottom: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailValue: { fontSize: 13, color: colors.text, flex: 1 },
  viewDetailsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: '#eceef8', marginBottom: 12 },
  viewDetailsBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
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

const detailStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: '#ffffffcc', marginTop: 2 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  tabActive: { backgroundColor: '#eceef8' },
  tabText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 100 },
  section: { gap: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  infoLabel: { fontSize: 13, color: colors.textMuted, flex: 1 },
  infoValue: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1.5, textAlign: 'right' },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, ...shadow.card },
  docIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  docTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  docStatus: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  viewDocBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eceef8' },
  viewDocText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  noDocsBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 14, marginTop: 8 },
  noDocsText: { fontSize: 13, color: colors.textMuted, flex: 1 },
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerRejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.danger },
  footerRejectText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  footerApproveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary },
  footerApproveText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
