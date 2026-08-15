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
import { MAX_FILES_PER_SUBMISSION } from '@ims/shared-types';
import { answerValidatorFor } from '@ims/shared-validation';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { ApiError } from '@/lib/api/client';
import { useSubmitAnswers, useTodayForm, useUnattachedDocuments, useDeleteDocument } from '@/lib/api/hooks';
import { uploadFile, validateFile, type PickedFile } from '@/lib/api/upload';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

export default function AnswerScreen() {
  // The server owns what "today" is; asking for it without a date gets that answer.
  const todayKey = new Date().toISOString().slice(0, 10);
  const { data: form, isLoading, error, refetch } = useTodayForm(todayKey);

  const { data: stagedFiles } = useUnattachedDocuments();
  const submit = useSubmitAnswers();
  const removeFile = useDeleteDocument();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  const onPickFile = async (): Promise<void> => {
    const staged = stagedFiles ?? [];
    if (staged.length >= MAX_FILES_PER_SUBMISSION) {
      Alert.alert('Too many files', `You can attach up to ${MAX_FILES_PER_SUBMISSION} files.`);
      return;
    }

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
      await uploadFile(file);
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
        documentIds: (stagedFiles ?? []).map((file) => file.id),
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
    return (
      <Screen>
        <Text style={styles.muted}>Loading today\u2019s questions\u2026</Text>
      </Screen>
    );
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

  const staged = stagedFiles ?? [];
  const attached = form.submission?.documents ?? [];

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
          onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
        />
      ))}

      {/* ---- Attachments ---- */}
      <Card title="Files" subtitle={`Optional \u00b7 up to ${MAX_FILES_PER_SUBMISSION}`}>
        {attached.length > 0 ? (
          <>
            <Text style={styles.fileGroupLabel}>Attached to this submission</Text>
            {attached.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </>
        ) : null}

        {staged.length > 0 ? (
          <>
            <Text style={styles.fileGroupLabel}>Ready to attach</Text>
            {staged.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                onRemove={() => void removeFile.mutateAsync(file.id)}
              />
            ))}
          </>
        ) : null}

        {attached.length === 0 && staged.length === 0 ? (
          <Text style={styles.muted}>No files attached.</Text>
        ) : null}

        {form.canSubmit ? (
          <>
            <View style={styles.spacer} />
            <Button
              label={uploading ? 'Uploading\u2026' : 'Attach a file'}
              variant="secondary"
              loading={uploading}
              onPress={() => void onPickFile()}
            />
          </>
        ) : null}
      </Card>

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
}: {
  index: number;
  question: Question;
  value: string;
  error: string | undefined;
  editable: boolean;
  onChange: (value: string) => void;
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
        onChangeText={onChange}
        editable={editable}
        multiline={question.type === 'long_text'}
        keyboardType={question.type === 'number' ? 'numeric' : 'default'}
        placeholder={question.type === 'number' ? 'e.g. 8' : 'Type your answer'}
        error={error}
        accessory={counter}
        accessibilityLabel={question.prompt}
      />
    </Card>
  );
}

function FileRow({ file, onRemove }: { file: DocumentMeta; onRemove?: () => void }) {
  return (
    <View style={styles.fileRow}>
      <MaterialIcons
        name={file.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'image'}
        size={20}
        color={colors.textMuted}
      />
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {file.originalFilename}
        </Text>
        <Text style={styles.fileSize}>{formatSize(file.sizeBytes)}</Text>
      </View>
      {onRemove ? (
        <Text style={styles.removeLink} onPress={onRemove} accessibilityRole="button">
          Remove
        </Text>
      ) : null}
    </View>
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
  fileGroupLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
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
  removeLink: { fontSize: fontSize.small, color: colors.danger, fontWeight: '700' },
});
