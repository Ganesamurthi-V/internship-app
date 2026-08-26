/**
 * Pending student approvals — with expandable detail view and document viewer.
 */

import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { DocumentViewer } from '@/components/ui/DocumentViewer';
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
// Student Detail Modal — full-screen, matches design screenshot
// ---------------------------------------------------------------------------

const PAGE_DEFS = [
  { label: 'Personal',   icon: 'person-outline'     as const },
  { label: 'Internship', icon: 'work-outline'        as const },
  { label: 'Mentor',     icon: 'groups'              as const },
  { label: 'Documents',  icon: 'description'         as const },
];

// Icon and subtitle shown in the white card header per page
const PAGE_HEADER: { icon: keyof typeof MaterialIcons.glyphMap; subtitle: string }[] = [
  { icon: 'person',       subtitle: "Review and verify the student's personal information." },
  { icon: 'work',         subtitle: "Details about the student's internship placement." },
  { icon: 'people',       subtitle: "Industry mentor and faculty coordinator information." },
  { icon: 'description',  subtitle: 'Uploaded verification documents.' },
];

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
  const [docViewerUrl, setDocViewerUrl] = useState('');
  const [docViewerName, setDocViewerName] = useState('');
  const [docViewerVisible, setDocViewerVisible] = useState(false);

  const openDocument = async (docId: string | null, name: string) => {
    if (!docId) { Alert.alert('No document', 'No file was uploaded.'); return; }
    setOpening(true);
    try {
      const result = await api.get<{ downloadUrl: string }>(`/documents/${docId}`);
      setDocViewerUrl(result.downloadUrl);
      setDocViewerName(name);
      setDocViewerVisible(true);
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setOpening(false);
    }
  };

  const ph = PAGE_HEADER[page]!;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={ds.root}>
        {/* ── Gradient header ── */}
        <LinearGradient
          colors={['#414fb8', '#5b6abf', '#7b85d4']}
          style={[ds.gradHeader, { paddingTop: insets.top + 14 }]}
        >
          <View style={ds.gradHeaderRow}>
            <Pressable onPress={onClose} style={ds.closeCircle}>
              <MaterialIcons name="close" size={20} color="#fff" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={ds.gradName}>{student.name}</Text>
              <Text style={ds.gradSub}>
                {student.registerNumber}
                {(student.departmentName ?? student.programme) ? ` • ${student.departmentName ?? student.programme}` : ''}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Tab bar with icons ── */}
        <View style={ds.tabBar}>
          {PAGE_DEFS.map(({ label, icon }, i) => (
            <Pressable key={label} style={ds.tabItem} onPress={() => setPage(i)}>
              <MaterialIcons
                name={icon}
                size={20}
                color={page === i ? colors.primary : colors.textMuted}
              />
              <Text style={[ds.tabLabel, page === i && ds.tabLabelActive]}>{label}</Text>
              {page === i && <View style={ds.tabUnderline} />}
            </Pressable>
          ))}
        </View>

        {/* ── Scrollable body ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={ds.body}
          showsVerticalScrollIndicator={false}
        >
          {/* White card with icon + page title */}
          <View style={ds.sectionCard}>
            <View style={ds.sectionCardHeader}>
              <View style={ds.sectionIconBox}>
                <MaterialIcons name={ph.icon} size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ds.sectionCardTitle}>{PAGE_DEFS[page]!.label} Details</Text>
                <Text style={ds.sectionCardSub}>{ph.subtitle}</Text>
              </View>
            </View>

            {/* Personal page */}
            {page === 0 && <>
              <IRow icon="person"            label="Full Name"      value={student.name} />
              <IRow icon="badge"             label="Register Number" value={student.registerNumber} />
              <IRow icon="account-balance"   label="Department"     value={student.departmentName ?? student.programme} />
              <IRow icon="school"            label="Year"           value={student.year ? String(student.year) : '—'} />
              <IRow icon="groups"            label="Section"        value={student.section ?? '—'} />
              <IRow icon="email"             label="Email"          value={student.email} />
              <IRow icon="phone"             label="Mobile"         value={student.mobile} last />
              <IRow icon="calendar-month"    label="Registered On"  value={new Date(student.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} last />
            </>}

            {/* Internship page */}
            {page === 1 && <>
              <IRow icon="business"          label="Organisation"   value={student.organisationName ?? '—'} />
              <IRow icon="location-on"       label="Location"       value={student.organisationLocation ?? '—'} />
              <IRow icon="code"              label="Domain"         value={student.internshipDomain ?? '—'} />
              <IRow icon="laptop"            label="Mode"           value={student.internshipMode ?? '—'} />
              <IRow icon="event"             label="Start Date"     value={student.startDate ?? '—'} />
              <IRow icon="event-busy"        label="End Date"       value={student.endDate ?? '—'} />
              <IRow icon="hourglass-empty"   label="Duration"       value={student.durationDays ? `${student.durationDays} days` : '—'} />
              <IRow icon="schedule"          label="Hours / Day"    value={student.workingHoursPerDay ? String(student.workingHoursPerDay) : '—'} last />
            </>}

            {/* Mentor page */}
            {page === 2 && <>
              <IRow icon="person"            label="Mentor Name"        value={student.mentorName ?? '—'} />
              <IRow icon="work"              label="Designation"        value={student.mentorDesignation ?? '—'} />
              <IRow icon="contact-phone"     label="Contact"            value={student.mentorContact ?? '—'} />
              <IRow icon="supervisor-account" label="Faculty Coordinator" value={student.facultyCoordinator ?? '—'} last />
            </>}

            {/* Documents page */}
            {page === 3 && <>
              <DocRow
                label="Internship Offer Letter"
                uploaded={!!student.offerLetterDocId}
                opening={opening}
                onView={() => void openDocument(student.offerLetterDocId, 'Offer Letter.pdf')}
              />
              <DocRow
                label="Joining Letter / Proof"
                uploaded={!!student.joiningLetterDocId}
                opening={opening}
                onView={() => void openDocument(student.joiningLetterDocId, 'Joining Letter.pdf')}
                last
              />
              {!student.offerLetterDocId && !student.joiningLetterDocId && (
                <View style={ds.noDocsBox}>
                  <MaterialIcons name="info-outline" size={16} color={colors.textMuted} />
                  <Text style={ds.noDocsText}>No documents uploaded during registration.</Text>
                </View>
              )}
            </>}
          </View>
        </ScrollView>

        {/* ── Footer action buttons ── */}
        <View style={[ds.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable style={ds.rejectBtn} onPress={onReject}>
            <MaterialIcons name="close" size={18} color={colors.danger} />
            <Text style={ds.rejectText}>Reject</Text>
          </Pressable>
          <Pressable style={ds.approveBtn} onPress={onApprove}>
            <MaterialIcons name="check" size={18} color="#fff" />
            <Text style={ds.approveText}>Approve</Text>
          </Pressable>
        </View>

        <DocumentViewer
          visible={docViewerVisible}
          url={docViewerUrl}
          filename={docViewerName}
          mimeType="application/pdf"
          onClose={() => setDocViewerVisible(false)}
        />
      </View>
    </Modal>
  );
}

// Row with a rounded-square icon on the left, label and value
function IRow({
  icon,
  label,
  value,
  last,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[ds.iRow, last && { borderBottomWidth: 0 }]}>
      <View style={ds.iIconBox}>
        <MaterialIcons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={ds.iLabel}>{label}</Text>
      <Text style={ds.iValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function DocRow({
  label,
  uploaded,
  opening,
  onView,
  last,
}: {
  label: string;
  uploaded: boolean;
  opening: boolean;
  onView: () => void;
  last?: boolean;
}) {
  return (
    <View style={[ds.iRow, last && { borderBottomWidth: 0 }]}>
      <View style={ds.iIconBox}>
        <MaterialIcons name="description" size={18} color={uploaded ? colors.primary : colors.textFaint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={ds.iLabel}>{label}</Text>
        <Text style={[ds.docStatus, { color: uploaded ? colors.success : colors.textFaint }]}>
          {uploaded ? 'Uploaded ✓' : 'Not uploaded'}
        </Text>
      </View>
      {uploaded && (
        <Pressable style={ds.viewBtn} onPress={onView} disabled={opening}>
          <MaterialIcons name="open-in-new" size={14} color={colors.primary} />
          <Text style={ds.viewBtnText}>{opening ? '...' : 'View'}</Text>
        </Pressable>
      )}
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

function DetailRow({ icon, value }: { icon: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <MaterialIcons name={icon as any} size={15} color={colors.textMuted} />
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const ds = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Gradient header
  gradHeader: { paddingHorizontal: 20, paddingBottom: 18 },
  gradHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  closeCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff25', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  gradName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  gradSub: { fontSize: 13, color: '#ffffffcc', marginTop: 3 },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 4, paddingTop: 6, paddingBottom: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 3, position: 'relative' },
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  tabLabelActive: { color: colors.primary, fontWeight: '700' },
  tabUnderline: { position: 'absolute', bottom: 0, left: '10%', right: '10%', height: 2.5, borderRadius: 2, backgroundColor: colors.primary },

  // Body
  body: { padding: 14, paddingBottom: 80 },

  // White section card
  sectionCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, ...shadow.card },
  sectionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionIconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  sectionCardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionCardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

  // Info rows
  iRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
  iIconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  iLabel: { flex: 1, fontSize: 14, color: colors.textMuted },
  iValue: { flex: 1.4, fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'right' },

  // Document rows
  docStatus: { fontSize: 12, marginTop: 2 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eceef8' },
  viewBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  noDocsBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 14, marginTop: 8 },
  noDocsText: { fontSize: 13, color: colors.textMuted, flex: 1 },

  // Footer
  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 15, borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger },
  rejectText: { fontSize: 15, fontWeight: '700', color: colors.danger },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.primary },
  approveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
