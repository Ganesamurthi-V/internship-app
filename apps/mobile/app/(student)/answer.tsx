/**
 * The daily questions form — the screen the whole app exists for.
 *
 * Renders whatever questions faculty configured, validates each answer against that
 * question's own rules before sending, and lets the student attach files.
 *
 * The server decides whether the day is still open (`canSubmit` / `lockedReason`).
 * The form honours that rather than computing it locally, because a device with a
 * wrong clock must not be able to reopen a closed day.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { DocumentMeta, Question } from '@ims/shared-types';
import { answerValidatorFor } from '@ims/shared-validation';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { FormSkeleton } from '@/components/ui/SkeletonLoader';
import { ApiError } from '@/lib/api/client';
import { useSubmitAnswers, useTodayForm } from '@/lib/api/hooks';
import { uploadFile, validateFile, type PickedFile } from '@/lib/api/upload';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export default function AnswerScreen() {
  // The server owns what "today" is; asking for it without a date gets that answer.
  const todayKey = new Date().toISOString().slice(0, 10);
  const { data: form, isLoading, error, refetch } = useTodayForm(todayKey);

  const submit = useSubmitAnswers();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Maps questionId → uploaded file metadata for file_upload type questions */
  const [uploadedFileMap, setUploadedFileMap] = useState<Record<string, DocumentMeta>>({});

  /**
   * Seeds the form from an existing submission so a resubmission starts from what
   * was written before, rather than making the student retype everything after a
   * decline.
   */
  useEffect(() => {
    if (!form?.submission) return;
    const seeded: Record<string, string> = {};
    for (const answer of form.submission.answers) {
      seeded[answer.questionId] = answer.answerText;
    }
    setAnswers(seeded);
  }, [form?.submission]);

  const questions = form?.questions ?? [];

  /** Local validation mirrors the server's, so errors appear before a round trip. */
  const localErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const question of questions) {
      const value = answers[question.id] ?? '';
      // Skip untouched optional fields; an empty optional answer is fine.
      if (value.length === 0 && !question.required) continue;

      const result = answerValidatorFor({
        type: question.type,
        required: question.required,
        options: question.options,
        minLength: question.minLength,
        maxLength: question.maxLength,
      }).safeParse(value);

      if (!result.success) {
        errors[question.id] = result.error.issues[0]?.message ?? 'Check this answer.';
      }
    }
    return errors;
  }, [questions, answers]);

  const hasBlockingErrors = questions.some(
    (question) => question.required && (localErrors[question.id] || !answers[question.id]?.trim()),
  );

  /** Handles file pick for a file_upload type question */
  const onPickFileForQuestion = async (questionId: string): Promise<void> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const file: PickedFile = {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      size: asset.size ?? 0,
    };

    const problem = validateFile(file);
    if (problem) {
      Alert.alert('Cannot attach that file', problem);
      return;
    }

    setUploading(true);
    try {
      const doc = await uploadFile(file);
      // Store the document ID as the "answer" and keep the metadata for display
      setAnswers((prev) => ({ ...prev, [questionId]: doc.id }));
      setUploadedFileMap((prev) => ({ ...prev, [questionId]: doc }));
    } catch (uploadError) {
      Alert.alert(
        'Upload failed',
        uploadError instanceof Error ? uploadError.message : 'Try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (): Promise<void> => {
    setFormError(null);
    setFieldErrors({});

    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setFormError('Some answers need attention.');
      return;
    }

    const payload = questions
      .map((question) => ({
        questionId: question.id,
        answerText: (answers[question.id] ?? '').trim(),
      }))
      // Optional questions left blank send nothing rather than an empty row.
      .filter((entry) => entry.answerText.length > 0);

    try {
      await submit.mutateAsync({
        answers: payload,
      });

      Alert.alert(
        'Submitted',
        'Your answers are with faculty for review. Your attendance is recorded once they approve.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        // The server returns field-keyed messages against question ids.
        if (submitError.fields) setFieldErrors(submitError.fields);
        setFormError(submitError.message);
      } else {
        setFormError('Could not submit. Try again.');
      }
    }
  };

  if (isLoading && !form) {
    return <FormSkeleton fields={3} />;
  }

  if (error && !form) {
    return (
      <Screen>
        <Card title="Could not load the questions">
          <Text style={styles.muted}>
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </Text>
          <View style={styles.spacer} />
          <Button label="Try again" onPress={() => void refetch()} />
        </Card>
      </Screen>
    );
  }

  if (!form) return null;

  return (
    <Screen>
      {/* ---- Existing decision, if any ---- */}
      {form.submission ? (
        <Card title="Your submission">
          <View style={styles.statusRow}>
            <StatusPill status={form.submission.status} />
          </View>
          {form.submission.reviewNote ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteLabel}>Faculty note</Text>
              <Text style={styles.noteText}>{form.submission.reviewNote}</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* ---- Locked explanation ---- */}
      {!form.canSubmit && form.lockedReason ? (
        <View style={styles.lockedBox}>
          <MaterialIcons name="lock" size={18} color={colors.warning} />
          <Text style={styles.lockedText}>{form.lockedReason}</Text>
        </View>
      ) : null}

      {/* ---- Questions ---- */}
      {questions.map((question, index) => (
        <QuestionField
          key={question.id}
          index={index + 1}
          question={question}
          value={answers[question.id] ?? ''}
          error={fieldErrors[question.id]}
          editable={form.canSubmit}
          onChange={(value) => {
            if (value === '__pick_file__') {
              void onPickFileForQuestion(question.id);
            } else {
              setAnswers((prev) => ({ ...prev, [question.id]: value }));
            }
          }}
          uploadedFiles={uploadedFileMap}
        />
      ))}

      {/* ---- Submit ---- */}
      {form.canSubmit ? (
        <Card>
          {formError ? (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.formError}>{formError}</Text>
              <View style={styles.spacer} />
            </View>
          ) : null}

          <Button
            label={form.submission ? 'Resubmit answers' : 'Submit answers'}
            onPress={() => void onSubmit()}
            loading={submit.isPending}
            disabled={hasBlockingErrors}
          />

          {hasBlockingErrors ? (
            <Text style={styles.hint}>Answer every required question to submit.</Text>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

/** One question, rendered according to its type. */
function QuestionField({
  index,
  question,
  value,
  error,
  editable,
  onChange,
  uploadedFiles,
}: {
  index: number;
  question: Question;
  value: string;
  error: string | undefined;
  editable: boolean;
  onChange: (value: string) => void;
  uploadedFiles: Record<string, DocumentMeta>;
}) {
  const counter =
    question.maxLength && (question.type === 'text' || question.type === 'long_text') ? (
      <Text
        style={[
          styles.counter,
          value.length > question.maxLength ? styles.counterOver : null,
        ]}
      >
        {value.length}/{question.maxLength}
      </Text>
    ) : null;

  // File upload question — shows a file picker button, not a text field
  if (question.type === 'file_upload') {
    const fileInfo = uploadedFiles[question.id];
    return (
      <Card>
        <Text style={styles.questionPrompt}>
          {index}. {question.prompt}
          {question.required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {question.helpText ? <Text style={styles.questionHelp}>{question.helpText}</Text> : null}
        <View style={styles.spacer} />

        {fileInfo ? (
          <View style={styles.uploadedFileRow}>
            <MaterialIcons
              name={fileInfo.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'}
              size={22}
              color={colors.success}
            />
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>
                {fileInfo.originalFilename}
              </Text>
              <Text style={styles.fileSize}>{formatSize(fileInfo.sizeBytes)}</Text>
            </View>
            {editable ? (
              <Text
                style={styles.changeLink}
                onPress={() => onChange('')}
                accessibilityRole="button"
              >
                Change
              </Text>
            ) : null}
          </View>
        ) : value.length > 0 ? (
          // Has a document ID from a previous submission but we don't have the metadata
          <View style={styles.uploadedFileRow}>
            <MaterialIcons name="attach-file" size={22} color={colors.success} />
            <Text style={styles.fileName}>File attached</Text>
            {editable ? (
              <Text
                style={styles.changeLink}
                onPress={() => onChange('')}
                accessibilityRole="button"
              >
                Change
              </Text>
            ) : null}
          </View>
        ) : editable ? (
          <Button
            label="Choose file (PDF, JPG, PNG)"
            variant="secondary"
            onPress={() => {
              // This triggers the parent's onPickFileForQuestion
              // We pass it through the onChange with a special marker
              onChange('__pick_file__');
            }}
          />
        ) : (
          <Text style={styles.muted}>No file uploaded.</Text>
        )}

        {error ? (
          <View accessibilityLiveRegion="polite">
            <Text style={styles.fieldError}>{error}</Text>
          </View>
        ) : null}
      </Card>
    );
  }

  if (question.type === 'choice') {
    return (
      <Card>
        <Text style={styles.questionPrompt}>
          {index}. {question.prompt}
          {question.required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {question.helpText ? <Text style={styles.questionHelp}>{question.helpText}</Text> : null}
        <View style={styles.spacer} />
        <ChipGroup
          options={(question.options ?? []).map((option) => ({ label: option, value: option }))}
          value={value.length > 0 ? value : null}
          onChange={onChange}
          disabled={!editable}
          error={error}
        />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.questionPrompt}>
        {index}. {question.prompt}
        {question.required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {question.helpText ? <Text style={styles.questionHelp}>{question.helpText}</Text> : null}
      <View style={styles.spacer} />
      <TextField
        label=""
        value={value}
        onChangeText={(text) => {
          // For number questions, strip everything except digits, a single decimal
          // point and an optional leading minus sign.
          if (question.type === 'number') {
            const cleaned = text.replace(/[^0-9.\-]/g, '')
              // Only one decimal point
              .replace(/(\..*?)\.+/g, '$1')
              // Minus only at the start
              .replace(/(.+)-/g, '$1');
            onChange(cleaned);
          } else {
            onChange(text);
          }
        }}
        editable={editable}
        multiline={question.type === 'long_text'}
        keyboardType={question.type === 'number' ? 'decimal-pad' : 'default'}
        placeholder={question.type === 'number' ? 'e.g. 8' : 'Type your answer'}
        error={error}
        accessory={counter}
        accessibilityLabel={question.prompt}
      />
    </Card>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.body, color: colors.textMuted },
  spacer: { height: spacing.md },
  statusRow: { flexDirection: 'row', marginBottom: spacing.sm },
  questionPrompt: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 22,
  },
  required: { color: colors.danger },
  questionHelp: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  counter: { fontSize: fontSize.caption, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  counterOver: { color: colors.danger, fontWeight: '700' },
  fieldError: { marginTop: spacing.sm, fontSize: fontSize.small, color: colors.danger },
  formError: { fontSize: fontSize.small, color: colors.danger, fontWeight: '600' },
  hint: {
    marginTop: spacing.sm,
    fontSize: fontSize.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  noteBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  noteLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.danger,
    marginBottom: 2,
  },
  noteText: { fontSize: fontSize.small, color: colors.text, lineHeight: 20 },
  lockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  lockedText: { flex: 1, fontSize: fontSize.small, color: colors.text, lineHeight: 19 },
  uploadedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  fileInfo: { flex: 1 },
  fileName: { fontSize: fontSize.small, color: colors.text, fontWeight: '600' },
  fileSize: { fontSize: fontSize.caption, color: colors.textMuted },
  changeLink: { fontSize: fontSize.small, color: colors.primary, fontWeight: '700' },
});
