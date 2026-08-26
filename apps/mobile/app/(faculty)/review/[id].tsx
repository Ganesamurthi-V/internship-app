/**
 * Review detail — redesigned with gradient header and modern cards.
 */

import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DocumentViewer } from '@/components/ui/DocumentViewer';
import type { DocumentMeta } from '@ims/shared-types';
import { REVIEW_NOTE_MIN_LENGTH, REVIEW_NOTE_MAX_LENGTH } from '@ims/shared-types';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { StatusPill } from '@/components/ui/StatusPill';
import { api, ApiError } from '@/lib/api/client';
import { useReviewSubmission, useSubmission } from '@/lib/api/hooks';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

export default function ReviewDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: submission, isLoading, error, refetch, isRefetching } = useSubmission(id);
  const review = useReviewSubmission();

  const [showDecline, setShowDecline] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [opening, setOpening] = useState<string | null>(null);
  const [docViewerUrl, setDocViewerUrl] = useState('');
  const [docViewerName, setDocViewerName] = useState('');
  const [docViewerVisible, setDocViewerVisible] = useState(false);

  const onApprove = (): void => {
    Alert.alert(
      'Approve this submission?',
      'The day will count towards the student\u2019s attendance.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            void (async () => {
              try {
                await review.mutateAsync({ submissionId: id, decision: 'approved', note: null });
                router.back();
              } catch (e) {
                Alert.alert('Could not approve', e instanceof Error ? e.message : 'Try again.');
              }
            })();
          },
        },
      ],
    );
  };

  const onDecline = async (): Promise<void> => {
    const trimmed = note.trim();
    if (trimmed.length < REVIEW_NOTE_MIN_LENGTH) {
      setNoteError(`Say why, in at least ${REVIEW_NOTE_MIN_LENGTH} characters.`);
      return;
    }
    setNoteError(undefined);
    try {
      await review.mutateAsync({ submissionId: id, decision: 'declined', note: trimmed });
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.fields?.note) { setNoteError(e.fields.note); return; }
      Alert.alert('Could not decline', e instanceof Error ? e.message : 'Try again.');
    }
  };

  const onOpenFile = async (file: DocumentMeta): Promise<void> => {
    setOpening(file.id);
    try {
      const result = await api.get<{ downloadUrl: string }>(`/documents/${file.id}`);
      setDocViewerUrl(result.downloadUrl);
      setDocViewerName(file.originalFilename);
      setDocViewerVisible(true);
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setOpening(null);
    }
  };

  if (isLoading && !submission) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Submission</Text>
        </LinearGradient>
        <Text style={{ padding: 20, color: colors.textMuted }}>Loading...</Text>
      </View>
    );
  }

  if (error && !submission) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Submission</Text>
        </LinearGradient>
        <View style={styles.errorCard}>
          <Text style={{ color: colors.textMuted }}>{error instanceof Error ? error.message : 'Error'}</Text>
          <Button label="Try again" onPress={() => void refetch()} />
        </View>
      </View>
    );
  }

  if (!submission) return null;

  const isPending = submission.status === 'pending';

  // Documents already rendered inline with their question, so the file list below
  // shows only genuinely separate attachments.
  const answeredDocumentIds = new Set(
    submission.answers.map((answer) => answer.document?.id).filter(Boolean) as string[],
  );
  const extraDocuments = submission.documents.filter((d) => !answeredDocumentIds.has(d.id));

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{submission.student?.name ?? 'Student'}</Text>
            <Text style={styles.headerSubtitle}>
              {submission.student?.registerNumber ?? ''} \u00b7 {formatDate(submission.submissionDate)}
            </Text>
          </View>
          <StatusPill status={submission.status} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {/* Previous note */}
        {submission.reviewNote ? (
          <View style={styles.noteBox}>
            <MaterialIcons name="info" size={16} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noteLabel}>Note sent to student</Text>
              <Text style={styles.noteText}>{submission.reviewNote}</Text>
            </View>
          </View>
        ) : null}

        {/* Answers */}
        {submission.answers.length === 0 ? (
          <View style={styles.card}>
            <Text style={{ color: colors.textMuted }}>No answers recorded.</Text>
          </View>
        ) : (
          submission.answers.map((answer, index) => (
            <View key={answer.id} style={styles.card}>
              <View style={styles.answerHeader}>
                <View style={styles.answerNum}>
                  <Text style={styles.answerNumText}>{index + 1}</Text>
                </View>
                <Text style={styles.answerPrompt}>{answer.promptSnapshot}</Text>
              </View>

              {/* A file answer stores a document id, so render the file rather than
                  the raw id the student never typed. */}
              {answer.questionType === 'file_upload' ? (
                answer.document ? (
                  <Pressable style={styles.fileRow} onPress={() => void onOpenFile(answer.document!)}>
                    <View style={styles.fileIcon}>
                      <MaterialIcons
                        name={answer.document.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'}
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {answer.document.originalFilename}
                      </Text>
                      <Text style={styles.fileSize}>{formatSize(answer.document.sizeBytes)}</Text>
                    </View>
                    <Text style={styles.openLink}>
                      {opening === answer.document.id ? 'Opening...' : 'View'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.missingFileBox}>
                    <MaterialIcons name="error-outline" size={16} color={colors.warning} />
                    <Text style={styles.missingFileText}>
                      The student answered with a file, but it is no longer available.
                    </Text>
                  </View>
                )
              ) : (
                <Text style={styles.answerText}>{answer.answerText}</Text>
              )}
            </View>
          ))
        )}

        {/* Files — only extras. Files that answer a question are shown with that
            question above, so listing them again here reads as duplicates. */}
        {extraDocuments.length > 0 ? (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialIcons name="attach-file" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Other files ({extraDocuments.length})</Text>
            </View>
            {extraDocuments.map((file) => (
              <Pressable key={file.id} style={styles.fileRow} onPress={() => void onOpenFile(file)}>
                <View style={styles.fileIcon}>
                  <MaterialIcons
                    name={file.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'}
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{file.originalFilename}</Text>
                  <Text style={styles.fileSize}>{formatSize(file.sizeBytes)}</Text>
                </View>
                <Text style={styles.openLink}>{opening === file.id ? 'Opening...' : 'Open'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Decision */}
        {isPending ? (
          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MaterialIcons name="gavel" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Your decision</Text>
            </View>

            {showDecline ? (
              <>
                <TextField
                  label="Why are you declining?"
                  value={note}
                  onChangeText={(v) => { setNote(v); if (noteError) setNoteError(undefined); }}
                  multiline
                  placeholder="Explain what the student needs to fix."
                  error={noteError}
                  maxLength={REVIEW_NOTE_MAX_LENGTH}
                  required
                />
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Button label="Confirm decline" variant="danger" onPress={() => void onDecline()} loading={review.isPending} />
                  <Button label="Cancel" variant="secondary" onPress={() => { setShowDecline(false); setNote(''); setNoteError(undefined); }} />
                </View>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
                  Approving marks this day as attended. Declining sends it back.
                </Text>
                <View style={{ gap: 8 }}>
                  <Button label="Approve" onPress={onApprove} loading={review.isPending} />
                  <Button label="Decline" variant="danger" onPress={() => setShowDecline(true)} disabled={review.isPending} />
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>
              This submission has been {submission.status}. The decision cannot be changed.
            </Text>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Inline document viewer */}
      <DocumentViewer
        visible={docViewerVisible}
        url={docViewerUrl}
        filename={docViewerName}
        onClose={() => setDocViewerVisible(false)}
      />
    </View>
  );
}

function formatDate(dateOnly: string): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  errorCard: { margin: 20, padding: 20, backgroundColor: '#fff', borderRadius: 14, gap: 12 },
  noteBox: { flexDirection: 'row', gap: 10, backgroundColor: colors.dangerBg, borderRadius: 12, padding: 14 },
  noteLabel: { fontSize: 11, fontWeight: '700', color: colors.danger },
  noteText: { fontSize: 13, color: colors.text, lineHeight: 18, marginTop: 2 },
  answerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  answerNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  answerNumText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  answerPrompt: { fontSize: 13, fontWeight: '600', color: colors.textMuted, flex: 1 },
  answerText: { fontSize: 14, color: colors.text, lineHeight: 21 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  fileIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 13, color: colors.text, fontWeight: '600' },
  fileSize: { fontSize: 11, color: colors.textMuted },
  openLink: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  missingFileBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.warningBg, borderRadius: 10, padding: 12 },
  missingFileText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 17 },
});
