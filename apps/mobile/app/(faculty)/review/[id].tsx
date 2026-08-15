/**
 * One submission, with the approve and decline actions.
 *
 * The answers are the whole point of the screen, so they get the most room. Declining
 * requires a reason — enforced here and again on the server — because a decline
 * without one leaves the student nothing to act on.
 */

import { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { DocumentMeta } from '@ims/shared-types';
import { REVIEW_NOTE_MIN_LENGTH, REVIEW_NOTE_MAX_LENGTH } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { StatusPill } from '@/components/ui/StatusPill';
import { api, ApiError } from '@/lib/api/client';
import { useReviewSubmission, useSubmission } from '@/lib/api/hooks';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export default function ReviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: submission, isLoading, error, refetch, isRefetching } = useSubmission(id);
  const review = useReviewSubmission();

  const [showDecline, setShowDecline] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>();
  const [opening, setOpening] = useState<string | null>(null);

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
              } catch (approveError) {
                Alert.alert(
                  'Could not approve',
                  approveError instanceof Error ? approveError.message : 'Try again.',
                );
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
      setNoteError(
        `Say why, in at least ${REVIEW_NOTE_MIN_LENGTH} characters. The student sees this.`,
      );
      return;
    }

    setNoteError(undefined);

    try {
      await review.mutateAsync({ submissionId: id, decision: 'declined', note: trimmed });
      router.back();
    } catch (declineError) {
      if (declineError instanceof ApiError && declineError.fields?.note) {
        setNoteError(declineError.fields.note);
        return;
      }
      Alert.alert(
        'Could not decline',
        declineError instanceof Error ? declineError.message : 'Try again.',
      );
    }
  };

  /** Fetches a signed URL, then hands it to the OS to open. */
  const onOpenFile = async (file: DocumentMeta): Promise<void> => {
    setOpening(file.id);
    try {
      const result = await api.get<{ downloadUrl: string }>(`/documents/${file.id}`);
      const canOpen = await Linking.canOpenURL(result.downloadUrl);
      if (!canOpen) {
        Alert.alert('Cannot open', 'No app on this device can open that file.');
        return;
      }
      await Linking.openURL(result.downloadUrl);
    } catch (openError) {
      Alert.alert(
        'Could not open the file',
        openError instanceof Error ? openError.message : 'Try again.',
      );
    } finally {
      setOpening(null);
    }
  };

  if (isLoading && !submission) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading\u2026</Text>
      </Screen>
    );
  }

  if (error && !submission) {
    return (
      <Screen>
        <Card title="Could not load the submission">
          <Text style={styles.muted}>
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </Text>
          <View style={styles.spacer} />
          <Button label="Try again" onPress={() => void refetch()} />
        </Card>
      </Screen>
    );
  }

  if (!submission) return null;

  const isPending = submission.status === 'pending';

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      {/* ---- Who and when ---- */}
      <Card>
        <View style={styles.headerRow}>
          <View style={styles.headerMain}>
            <Text style={styles.studentName}>{submission.student?.name ?? 'Student'}</Text>
            <Text style={styles.registerNumber}>
              {submission.student?.registerNumber ?? ''}
              {submission.student?.programme ? `\n${submission.student.programme}` : ''}
            </Text>
          </View>
          <StatusPill status={submission.status} />
        </View>
        <View style={styles.divider} />
        <Row label="Date" value={formatDate(submission.submissionDate)} />
        <Row label="Submitted" value={formatTimestamp(submission.submittedAt)} />
        {submission.reviewedAt ? (
          <Row
            label="Reviewed"
            value={`${formatTimestamp(submission.reviewedAt)}${
              submission.reviewedByName ? ` by ${submission.reviewedByName}` : ''
            }`}
          />
        ) : null}
      </Card>

      {/* ---- Previous decision ---- */}
      {submission.reviewNote ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Note sent to the student</Text>
          <Text style={styles.noteText}>{submission.reviewNote}</Text>
        </View>
      ) : null}

      {/* ---- The answers ---- */}
      {submission.answers.length === 0 ? (
        <Card title="No answers">
          <Text style={styles.muted}>This submission has no answers recorded.</Text>
        </Card>
      ) : (
        submission.answers.map((answer, index) => (
          <Card key={answer.id}>
            <Text style={styles.prompt}>
              {index + 1}. {answer.promptSnapshot}
            </Text>
            <Text style={styles.answer}>{answer.answerText}</Text>
          </Card>
        ))
      )}

      {/* ---- Files ---- */}
      {submission.documents.length > 0 ? (
        <Card title={`Files (${submission.documents.length})`}>
          {submission.documents.map((file) => (
            <View key={file.id} style={styles.fileRow}>
              <MaterialIcons
                name={file.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'}
                size={22}
                color={colors.textMuted}
              />
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.originalFilename}
                </Text>
                <Text style={styles.fileSize}>{formatSize(file.sizeBytes)}</Text>
              </View>
              <Text
                style={styles.openLink}
                onPress={() => void onOpenFile(file)}
                accessibilityRole="button"
              >
                {opening === file.id ? 'Opening\u2026' : 'Open'}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* ---- Decision ---- */}
      {isPending ? (
        <Card title="Your decision">
          {showDecline ? (
            <>
              <TextField
                label="Why are you declining?"
                value={note}
                onChangeText={(value) => {
                  setNote(value);
                  if (noteError) setNoteError(undefined);
                }}
                multiline
                placeholder="Explain what the student needs to fix."
                helper="The student sees this, so make it actionable."
                error={noteError}
                maxLength={REVIEW_NOTE_MAX_LENGTH}
                required
              />
              <Button
                label="Confirm decline"
                variant="danger"
                onPress={() => void onDecline()}
                loading={review.isPending}
              />
              <View style={styles.spacer} />
              <Button
                label="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowDecline(false);
                  setNote('');
                  setNoteError(undefined);
                }}
              />
            </>
          ) : (
            <>
              <Text style={styles.muted}>
                Approving marks this day as attended. Declining sends it back with your note.
              </Text>
              <View style={styles.spacer} />
              <Button label="Approve" onPress={onApprove} loading={review.isPending} />
              <View style={styles.spacer} />
              <Button
                label="Decline"
                variant="danger"
                onPress={() => setShowDecline(true)}
                disabled={review.isPending}
              />
            </>
          )}
        </Card>
      ) : (
        <Card>
          <Text style={styles.muted}>
            This submission has already been {submission.status}. A decision cannot be changed.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  spacer: { height: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headerMain: { flex: 1 },
  studentName: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.text },
  registerNumber: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, marginBottom: 4 },
  rowLabel: { fontSize: fontSize.caption, color: colors.textMuted, flexShrink: 0 },
  rowValue: {
    fontSize: fontSize.caption,
    color: colors.text,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  prompt: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted, lineHeight: 19 },
  answer: { fontSize: fontSize.body, color: colors.text, lineHeight: 22, marginTop: spacing.sm },
  noteBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noteLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 2,
  },
  noteText: { fontSize: fontSize.small, color: colors.text, lineHeight: 20 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: fontSize.small, color: colors.text, fontWeight: '600' },
  fileSize: { fontSize: fontSize.caption, color: colors.textMuted },
  openLink: { fontSize: fontSize.small, color: colors.primary, fontWeight: '700' },
});
