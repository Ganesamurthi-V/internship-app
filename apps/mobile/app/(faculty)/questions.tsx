/**
 * Question management.
 *
 * The questions defined here are what every student answers each day, so the screen
 * makes the consequence visible: an empty list means nobody can submit anything.
 *
 * Retiring rather than deleting is surfaced in the confirm dialog, because a reviewer
 * needs to know past answers survive.
 */

import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Question, QuestionType, DocumentMeta } from '@ims/shared-types';
import {
  ANSWER_MAX_LENGTH,
  MAX_ACTIVE_QUESTIONS,
  QUESTION_PROMPT_MAX_LENGTH,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
} from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { ApiError } from '@/lib/api/client';
import {
  useCreateQuestion,
  useDeleteQuestion,
  useQuestions,
  useUpdateQuestion,
} from '@/lib/api/hooks';
import { uploadFile, validateFile, type PickedFile } from '@/lib/api/upload';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

const TYPE_OPTIONS = QUESTION_TYPES.map((type) => ({
  value: type,
  label: QUESTION_TYPE_LABELS[type],
}));

export default function QuestionsScreen() {
  // Include retired ones: a reviewer needs to see what exists before adding a duplicate.
  const { data: questions, isLoading, isRefetching, refetch } = useQuestions(false);
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();
  const deleteQuestion = useDeleteQuestion();

  const [showForm, setShowForm] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [helpText, setHelpText] = useState('');
  const [type, setType] = useState<QuestionType>('long_text');
  const [required, setRequired] = useState(true);
  const [optionsText, setOptionsText] = useState('');
  const [referenceFile, setReferenceFile] = useState<DocumentMeta | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const active = (questions ?? []).filter((question) => question.isActive);
  const retired = (questions ?? []).filter((question) => !question.isActive);

  const resetForm = (): void => {
    setPrompt('');
    setHelpText('');
    setType('long_text');
    setRequired(true);
    setOptionsText('');
    setReferenceFile(null);
    setErrors({});
    setShowForm(false);
  };

  const onPickReferenceFile = async (): Promise<void> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
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

    // Allow docx too for questions (even though submissions only accept PDF/images)
    if (file.size > 10 * 1024 * 1024) {
      Alert.alert('File too large', 'The file must be 10 MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const doc = await uploadFile(file);
      setReferenceFile(doc);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const onCreate = async (): Promise<void> => {
    setErrors({});

    const trimmed = prompt.trim();
    if (trimmed.length < 3) {
      setErrors({ prompt: 'Write the question.' });
      return;
    }

    const options =
      type === 'choice'
        ? optionsText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        : undefined;

    if (type === 'choice' && (!options || options.length < 2)) {
      setErrors({ options: 'A choice question needs at least two options, one per line.' });
      return;
    }

    try {
      await createQuestion.mutateAsync({
        prompt: trimmed,
        helpText: helpText.trim().length > 0 ? helpText.trim() : null,
        type,
        required,
        sortOrder: (active.length + 1) * 10,
        options: options ?? null,
        minLength: null,
        maxLength: type === 'long_text' ? ANSWER_MAX_LENGTH : null,
        departmentId: null,
        referenceDocId: referenceFile?.id ?? null,
      });
      resetForm();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) setErrors(error.fields);
        else setErrors({ _: error.message });
      } else {
        setErrors({ _: 'Could not save the question.' });
      }
    }
  };

  const onToggleActive = (question: Question): void => {
    void updateQuestion.mutateAsync({
      questionId: question.id,
      isActive: !question.isActive,
    });
  };

  const onRemove = (question: Question): void => {
    Alert.alert(
      'Remove this question?',
      'If students have already answered it, it is retired instead of deleted so their answers stay readable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const result = await deleteQuestion.mutateAsync(question.id);
                Alert.alert(result.deleted ? 'Deleted' : 'Retired', result.message);
              } catch (error) {
                Alert.alert(
                  'Could not remove',
                  error instanceof Error ? error.message : 'Try again.',
                );
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      {/* The consequence of an empty list, stated plainly. */}
      {!isLoading && active.length === 0 ? (
        <View style={styles.warnBox}>
          <MaterialIcons name="warning" size={18} color={colors.warning} />
          <Text style={styles.warnText}>
            No active questions. Students cannot submit anything until you add one.
          </Text>
        </View>
      ) : null}

      {showForm ? (
        <Card title="New question">
          <TextField
            label="Question"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            placeholder="e.g. What did you work on today?"
            maxLength={QUESTION_PROMPT_MAX_LENGTH}
            error={errors.prompt}
            required
          />

          <TextField
            label="Help text"
            value={helpText}
            onChangeText={setHelpText}
            placeholder="Optional guidance shown under the question"
            error={errors.helpText}
          />

          <ChipGroup
            label="Answer type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(next) => setType(next)}
          />

          {type === 'choice' ? (
            <TextField
              label="Options"
              value={optionsText}
              onChangeText={setOptionsText}
              multiline
              placeholder={'One per line, e.g.\nOffice\nRemote\nHybrid'}
              helper="One option per line. At least two."
              error={errors.options}
              required
            />
          ) : null}

          <ChipGroup
            label="Is an answer required?"
            options={[
              { value: 'yes', label: 'Required' },
              { value: 'no', label: 'Optional' },
            ]}
            value={required ? 'yes' : 'no'}
            onChange={(next) => setRequired(next === 'yes')}
          />

          {/* ---- Reference file attachment ---- */}
          <View style={styles.fileSection}>
            <Text style={styles.fileSectionLabel}>Reference file (optional)</Text>
            <Text style={styles.fileSectionHelp}>
              Attach a PDF, image or document that students should read as part of this question.
            </Text>
            {referenceFile ? (
              <View style={styles.fileRow}>
                <MaterialIcons
                  name={referenceFile.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'insert-drive-file'}
                  size={20}
                  color={colors.success}
                />
                <Text style={styles.fileName} numberOfLines={1}>
                  {referenceFile.originalFilename}
                </Text>
                <Text
                  style={styles.removeLink}
                  onPress={() => setReferenceFile(null)}
                  accessibilityRole="button"
                >
                  Remove
                </Text>
              </View>
            ) : (
              <Button
                label={uploading ? 'Uploading\u2026' : 'Attach file'}
                variant="secondary"
                loading={uploading}
                onPress={() => void onPickReferenceFile()}
              />
            )}
          </View>

          {errors._ ? (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.formError}>{errors._}</Text>
              <View style={styles.spacer} />
            </View>
          ) : null}

          <Button
            label="Add question"
            onPress={() => void onCreate()}
            loading={createQuestion.isPending}
          />
          <View style={styles.spacer} />
          <Button label="Cancel" variant="secondary" onPress={resetForm} />
        </Card>
      ) : (
        <Card>
          <Text style={styles.muted}>
            {active.length} of {MAX_ACTIVE_QUESTIONS} active question
            {active.length === 1 ? '' : 's'}. These are what every student answers each day.
          </Text>
          <View style={styles.spacer} />
          <Button
            label="Add a question"
            onPress={() => setShowForm(true)}
            disabled={active.length >= MAX_ACTIVE_QUESTIONS}
          />
          {active.length >= MAX_ACTIVE_QUESTIONS ? (
            <Text style={styles.hint}>
              Retire one before adding another.
            </Text>
          ) : null}
        </Card>
      )}

      {/* ---- Active ---- */}
      {active.map((question, index) => (
        <QuestionCard
          key={question.id}
          index={index + 1}
          question={question}
          onToggle={() => onToggleActive(question)}
          onRemove={() => onRemove(question)}
        />
      ))}

      {/* ---- Retired ---- */}
      {retired.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Retired</Text>
          {retired.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              onToggle={() => onToggleActive(question)}
              onRemove={() => onRemove(question)}
            />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function QuestionCard({
  index,
  question,
  onToggle,
  onRemove,
}: {
  index?: number;
  question: Question;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <Text style={[styles.prompt, !question.isActive && styles.promptRetired]}>
        {index ? `${index}. ` : ''}
        {question.prompt}
      </Text>

      {question.helpText ? <Text style={styles.help}>{question.helpText}</Text> : null}

      <View style={styles.badgeRow}>
        <Badge text={QUESTION_TYPE_LABELS[question.type]} />
        <Badge text={question.required ? 'Required' : 'Optional'} />
        {question.options && question.options.length > 0 ? (
          <Badge text={`${question.options.length} options`} />
        ) : null}
      </View>

      {question.options && question.options.length > 0 ? (
        <Text style={styles.options}>{question.options.join(' \u00b7 ')}</Text>
      ) : null}

      {question.referenceDoc ? (
        <View style={styles.fileRow}>
          <MaterialIcons
            name={question.referenceDoc.mimeType === 'application/pdf' ? 'picture-as-pdf' : 'insert-drive-file'}
            size={18}
            color={colors.info}
          />
          <Text style={styles.fileName} numberOfLines={1}>
            {question.referenceDoc.originalFilename}
          </Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <Text style={styles.actionLink} onPress={onToggle} accessibilityRole="button">
          {question.isActive ? 'Retire' : 'Reactivate'}
        </Text>
        <Text style={styles.actionDanger} onPress={onRemove} accessibilityRole="button">
          Remove
        </Text>
      </View>
    </Card>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  spacer: { height: spacing.md },
  hint: {
    marginTop: spacing.sm,
    fontSize: fontSize.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  formError: { fontSize: fontSize.small, color: colors.danger, fontWeight: '600' },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warnText: { flex: 1, fontSize: fontSize.small, color: colors.text, lineHeight: 19 },
  sectionLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  prompt: { fontSize: fontSize.body, fontWeight: '700', color: colors.text, lineHeight: 22 },
  promptRetired: { color: colors.textMuted },
  help: { fontSize: fontSize.small, color: colors.textMuted, marginTop: 4, lineHeight: 19 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  badgeText: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '600' },
  options: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: spacing.sm },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionLink: { fontSize: fontSize.small, color: colors.primary, fontWeight: '700' },
  actionDanger: { fontSize: fontSize.small, color: colors.danger, fontWeight: '700' },
  fileSection: { marginBottom: spacing.lg },
  fileSectionLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  fileSectionHelp: { fontSize: fontSize.caption, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginTop: spacing.sm,
  },
  fileName: { flex: 1, fontSize: fontSize.small, color: colors.text, fontWeight: '600' },
  removeLink: { fontSize: fontSize.small, color: colors.danger, fontWeight: '700' },
});
