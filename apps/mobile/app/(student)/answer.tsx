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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { DocumentMeta, Question } from '@ims/shared-types';
import { wordBoundsForQuestionType } from '@ims/shared-types';
import { answerValidatorFor, countWords } from '@ims/shared-validation';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { StatusPill } from '@/components/ui/StatusPill';
import { FormSkeleton } from '@/components/ui/SkeletonLoader';
import { DocumentViewer } from '@/components/ui/DocumentViewer';
import { api, ApiError } from '@/lib/api/client';
import { useSubmitAnswers, useTodayForm } from '@/lib/api/hooks';
import { uploadFile, validateFile, type PickedFile } from '@/lib/api/upload';
import { formatLongDate } from '@/lib/utils/dates';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

export default function AnswerScreen() {
  const insets = useSafeAreaInsets();

  /**
   * A `date` param means the student opened a specific past day — currently only ever
   * a granted retake. Without it no date is sent at all, so the server resolves today
   * on the institution clock rather than the device's, which reads UTC and names
   * yesterday between midnight and 05:30 IST.
   */
  const params = useLocalSearchParams<{ date?: string }>();
  const requestedDate = typeof params.date === 'string' && params.date.length > 0
    ? params.date
    : undefined;

  const { data: form, isLoading, isRefetching, error, refetch } = useTodayForm(requestedDate);

  const submit = useSubmitAnswers();

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Maps questionId → uploaded file metadata for file_upload type questions */
  const [uploadedFileMap, setUploadedFileMap] = useState<Record<string, DocumentMeta>>({});

  /**
   * Whether submit has been pressed on an incomplete form.
   *
   * Per-question errors stay hidden until this flips, because validating live would put
   * "Write at least 30 words" under the box on the first keystroke of every answer. The
   * live word counter is the feedback while typing; these messages are the feedback on
   * trying to submit.
   */
  const [submitAttempted, setSubmitAttempted] = useState(false);

  /** Lets a failed submit jump the student to the first question that needs work. */
  const scrollRef = useRef<ScrollView>(null);
  const questionOffsets = useRef<Record<string, number>>({});

  /**
   * Id of the submission already copied into the form.
   *
   * A ref rather than state: it must not trigger a render, and it has to survive the
   * refetches that would otherwise re-seed over the student's typing.
   */
  const seededSubmissionRef = useRef<string | null>(null);

  const [docViewerUrl, setDocViewerUrl] = useState('');
  const [docViewerName, setDocViewerName] = useState('');
  const [docViewerMime, setDocViewerMime] = useState('application/pdf');
  const [docViewerVisible, setDocViewerVisible] = useState(false);

  /** Opens one of the student's own uploaded files in the in-app viewer. */
  const onViewFile = async (file: DocumentMeta): Promise<void> => {
    try {
      const result = await api.get<{ downloadUrl: string }>(`/documents/${file.id}`);
      setDocViewerUrl(result.downloadUrl);
      setDocViewerName(file.originalFilename);
      setDocViewerMime(file.mimeType);
      setDocViewerVisible(true);
    } catch (e) {
      Alert.alert('Could not open', e instanceof Error ? e.message : 'Try again.');
    }
  };

  /**
   * Seeds the form from an existing submission so a resubmission starts from what
   * was written before, rather than making the student retype everything after a
   * decline.
   */
  useEffect(() => {
    const submission = form?.submission;
    if (!submission) return;

    // Seed once per submission, not once per response object.
    //
    // `useTodayForm` inherits `staleTime: 0` and `refetchOnMount: 'always'`, and the root
    // layout refetches everything when the app returns to the foreground. Keying this
    // effect on the object alone meant any refetch that came back differing in a single
    // field — a reviewer acting concurrently, a changed `updatedAt` — re-ran the seed and
    // replaced whatever the student had typed with the values they last submitted. React
    // Query's structural sharing hid it whenever the response was byte-identical, which is
    // what made it intermittent rather than obvious.
    //
    // The id still changes for a genuinely different submission — another day, or a
    // granted retake — so those seed as before.
    if (seededSubmissionRef.current === submission.id) return;
    seededSubmissionRef.current = submission.id;

    const seeded: Record<string, string> = {};
    const seededFiles: Record<string, DocumentMeta> = {};

    for (const answer of submission.answers) {
      seeded[answer.questionId] = answer.answerText;
      // A file answer carries its document, so an already-uploaded file shows its
      // real name and stays viewable after a reload instead of reading
      // "File attached" with no way to check it.
      if (answer.document) {
        seededFiles[answer.questionId] = answer.document;
      }
    }

    setAnswers(seeded);
    setUploadedFileMap(seededFiles);
  }, [form?.submission]);

  const questions = form?.questions ?? [];

  /**
   * A reopened day must not be titled "Today's Questions" — the student is answering
   * for a date that has passed, and the answers get recorded against that date.
   */
  const isRetake = Boolean(form?.retake);
  const headerTitle = isRetake
    ? 'Retake questions'
    : requestedDate
      ? 'Questions'
      : "Today's Questions";

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

  /**
   * Questions that would be rejected, in the order they appear on screen.
   *
   * Keyed off `localErrors` alone rather than also testing `required` separately: the
   * validator already reports a blank required answer as an error, and going through it
   * means an *optional* answer that breaks a rule — 300 words in a 200-word box — blocks
   * submission too. The previous check only looked at required questions, so that case
   * passed locally and was rejected by the server instead.
   */
  const problemQuestions = useMemo(
    () => questions.filter((question) => localErrors[question.id] !== undefined),
    [questions, localErrors],
  );

  /** 1-based positions, for naming the offending questions in the summary. */
  const questionNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    questions.forEach((question, index) => numbers.set(question.id, index + 1));
    return numbers;
  }, [questions]);

  const scrollToQuestion = (questionId: string): void => {
    const offset = questionOffsets.current[questionId];
    if (offset === undefined) return;
    // A little above the card, so its number and prompt are both in view rather than the
    // card starting exactly at the top edge.
    scrollRef.current?.scrollTo({ y: Math.max(0, offset - 16), animated: true });
  };

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

    // Reveals the per-question messages and the highlight. Set before the check so a
    // failed attempt marks the form even though it returns early.
    setSubmitAttempted(true);

    if (problemQuestions.length > 0) {
      const unanswered = problemQuestions.filter(
        (question) => (answers[question.id] ?? '').trim().length === 0,
      ).length;

      setFormError(
        unanswered === problemQuestions.length
          ? `${unanswered} question${unanswered === 1 ? '' : 's'} still ${unanswered === 1 ? 'needs' : 'need'} an answer.`
          : `${problemQuestions.length} question${problemQuestions.length === 1 ? '' : 's'} need${problemQuestions.length === 1 ? 's' : ''} your attention.`,
      );

      // Jumping to the first one is the point: on a long form the offending question can
      // be well off screen, and a message by the button alone does not say which.
      const first = problemQuestions[0];
      if (first) scrollToQuestion(first.id);
      return;
    }

    const payload = questions
      .map((question) => ({
        questionId: question.id,
        answerText: (answers[question.id] ?? '').trim(),
      }))
      // Optional questions left blank send nothing rather than an empty row.
      .filter((entry) => entry.answerText.length > 0);

    // The server also derives these from the file answers themselves, but sending
    // them keeps the request self-describing.
    const documentIds = questions
      .filter((question) => question.type === 'file_upload')
      .map((question) => answers[question.id])
      .filter((value): value is string => Boolean(value));

    try {
      await submit.mutateAsync({
        // The server's own resolved date, not the device's. Sending it back is what
        // makes a retake land on the reopened day instead of on today.
        date: form?.date,
        answers: payload,
        ...(documentIds.length > 0 ? { documentIds } : {}),
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
      <View style={styles.container}>
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
        </LinearGradient>
        <View style={styles.errorCard}>
          <MaterialIcons name="error-outline" size={36} color={colors.danger} />
          <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Something went wrong.'}</Text>
          <Button label="Try again" onPress={() => void refetch()} />
        </View>
      </View>
    );
  }

  if (!form) return null;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <Text style={styles.headerSubtitle}>
              {isRetake ? `For ${formatLongDate(form.date)}` : null}
              {isRetake ? ' \u00b7 ' : null}
              {questions.length} question{questions.length === 1 ? '' : 's'} to answer
            </Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
      {/* ---- Existing decision, if any ---- */}
      {form.submission ? (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>Your submission</Text>
            <StatusPill status={form.submission.status} />
          </View>
          {form.submission.reviewNote ? (
            <View style={styles.noteBox}>
              <MaterialIcons name="info" size={14} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.noteLabel}>Faculty note</Text>
                <Text style={styles.noteText}>{form.submission.reviewNote}</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ---- Retake notice ----
          A day that closed and then reopened needs saying so explicitly. Without
          this the student cannot tell a second chance from a deadline that never
          existed, and would not know it has its own expiry. */}
      {form.retake ? (
        <View style={[styles.retakeBox, !form.retake.isActive && styles.retakeBoxExpired]}>
          <MaterialIcons
            name={form.retake.isActive ? 'event-available' : 'event-busy'}
            size={18}
            color={form.retake.isActive ? colors.primary : colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.retakeTitle}>
              {form.retake.isActive
                ? `Retake open for ${formatLongDate(form.retake.targetDate)}`
                : form.retake.usedAt
                  ? `Retake for ${formatLongDate(form.retake.targetDate)} already used`
                  : `Retake for ${formatLongDate(form.retake.targetDate)} has ended`}
            </Text>
            <Text style={styles.retakeBody}>
              {form.retake.isActive
                ? `You get one attempt. Answer by ${formatLongDate(form.retake.expiresOn)} and this day counts as present once approved.`
                : form.retake.revokedAt
                  ? 'Your faculty withdrew this retake.'
                  : form.retake.usedAt
                    ? 'You have already used your retake for this day.'
                    : `The deadline was ${formatLongDate(form.retake.expiresOn)}.`}
            </Text>
            {form.retake.reason ? (
              <Text style={styles.retakeReason}>
                {form.retake.grantedByName
                  ? `${form.retake.grantedByName}: `
                  : ''}
                {form.retake.reason}
              </Text>
            ) : null}
          </View>
        </View>
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
          // A server error always wins; the local message appears only once submit has
          // been attempted, so the form does not scold the student as they type.
          error={fieldErrors[question.id] ?? (submitAttempted ? localErrors[question.id] : undefined)}
          highlight={submitAttempted && localErrors[question.id] !== undefined}
          editable={form.canSubmit}
          onLayout={(y) => {
            questionOffsets.current[question.id] = y;
          }}
          onChange={(value) => {
            if (value === '__pick_file__') {
              void onPickFileForQuestion(question.id);
            } else {
              setAnswers((prev) => ({ ...prev, [question.id]: value }));
            }
          }}
          uploadedFiles={uploadedFileMap}
          onViewFile={(file) => void onViewFile(file)}
        />
      ))}

      {/* ---- Submit ---- */}
      {form.canSubmit ? (
        <View style={styles.card}>
          {/* Summary of what is outstanding, shown only after a failed attempt.
              Each number is tappable: on a long form, telling the student that question 4
              is unanswered is far less useful than taking them to it. */}
          {submitAttempted && problemQuestions.length > 0 ? (
            <View style={styles.problemBox} accessibilityLiveRegion="polite">
              <View style={styles.problemHeader}>
                <MaterialIcons name="error-outline" size={18} color={colors.danger} />
                <Text style={styles.problemTitle}>
                  {formError ?? 'Some answers need attention.'}
                </Text>
              </View>

              <View style={styles.problemChips}>
                {problemQuestions.map((question) => {
                  const number = questionNumbers.get(question.id) ?? 0;
                  const blank = (answers[question.id] ?? '').trim().length === 0;
                  return (
                    <Pressable
                      key={question.id}
                      style={styles.problemChip}
                      onPress={() => scrollToQuestion(question.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Go to question ${number}, ${blank ? 'not answered' : 'needs attention'}`}
                    >
                      <Text style={styles.problemChipText}>
                        Q{number} {blank ? '\u00b7 not answered' : '\u00b7 check'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : formError ? (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.formError}>{formError}</Text>
              <View style={styles.spacer} />
            </View>
          ) : null}

          {/* Deliberately never disabled for incomplete answers. A dead button explains
              nothing — pressing it is how the student finds out what is missing. */}
          <Button
            label={form.submission ? 'Resubmit answers' : 'Submit answers'}
            onPress={() => void onSubmit()}
            loading={submit.isPending}
          />

          {problemQuestions.length > 0 && !submitAttempted ? (
            <Text style={styles.hint}>Answer every required question to submit.</Text>
          ) : null}
        </View>
      ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      <DocumentViewer
        visible={docViewerVisible}
        url={docViewerUrl}
        filename={docViewerName}
        mimeType={docViewerMime}
        onClose={() => setDocViewerVisible(false)}
      />
    </View>
  );
}

/** One question, rendered according to its type. */
function QuestionField({
  index,
  question,
  value,
  error,
  highlight = false,
  editable,
  onChange,
  onLayout,
  uploadedFiles,
  onViewFile,
}: {
  index: number;
  question: Question;
  value: string;
  error: string | undefined;
  /** Draws attention to a question a failed submit is waiting on. */
  highlight?: boolean;
  editable: boolean;
  onChange: (value: string) => void;
  /** Reports this card's vertical offset so a failed submit can scroll to it. */
  onLayout?: (y: number) => void;
  uploadedFiles: Record<string, DocumentMeta>;
  onViewFile: (file: DocumentMeta) => void;
}) {
  /** Both render paths below share this, so the highlight cannot apply to only one type. */
  const cardStyle = [styles.card, highlight ? styles.cardProblem : null];
  const reportLayout = onLayout
    ? (event: LayoutChangeEvent) => onLayout(event.nativeEvent.layout.y)
    : undefined;
  /**
   * Live word count for free-text answers.
   *
   * Derived from the question type rather than from the stored length columns, so it
   * appears for short text as well as paragraphs — it used to render only when
   * `maxLength` happened to be set, which the editor did for paragraphs and not for
   * short text.
   *
   * The target it counts towards changes with progress. Below the minimum it shows
   * `min 5/10 words`, because the number the student needs then is how far they still
   * have to go; once clear of it, it switches to the ceiling. Showing only the ceiling
   * would leave someone at 4 words looking at `4/200` with no hint they are short.
   */
  const wordBounds = wordBoundsForQuestionType(question.type);
  const wordCount = wordBounds === null ? 0 : countWords(value);

  const belowMinimum = wordBounds !== null && question.required && wordCount < wordBounds.min;
  const overMaximum = wordBounds !== null && wordCount > wordBounds.max;

  const counter =
    wordBounds !== null ? (
      <Text
        // Only the ceiling is flagged red. Being under the minimum is the normal state
        // while typing the first sentence, and colouring it as an error would mean the
        // field opens looking broken.
        style={[styles.counter, overMaximum ? styles.counterOver : null]}
        accessibilityLabel={
          belowMinimum
            ? `${wordCount} words. At least ${wordBounds.min} needed.`
            : `${wordCount} of ${wordBounds.max} words used`
        }
      >
        {belowMinimum
          ? `min ${wordCount}/${wordBounds.min} words`
          : `${wordCount}/${wordBounds.max} words`}
      </Text>
    ) : null;

  // File upload question — shows a file picker button, not a text field
  if (question.type === 'file_upload') {
    const fileInfo = uploadedFiles[question.id];
    return (
      <View style={cardStyle} onLayout={reportLayout}>
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
            <Text
              style={styles.viewLink}
              onPress={() => onViewFile(fileInfo)}
              accessibilityRole="button"
            >
              View
            </Text>
            {editable ? (
              <Text
                style={styles.changeLink}
                // Opens the picker rather than clearing the answer first.
                //
                // `onChange('')` used to strand the student here: it emptied the answer but
                // left this question's entry in `uploadedFileMap`, so `fileInfo` stayed
                // truthy, this same row re-rendered, and the "Choose file" button below was
                // unreachable — leaving a question that could neither be answered nor
                // replaced. Picking straight away also means a cancelled picker keeps the
                // file that was already attached.
                onPress={() => onChange('__pick_file__')}
                accessibilityRole="button"
              >
                Change
              </Text>
            ) : null}
          </View>
        ) : value.length > 0 ? (
          // A document id with no metadata: the file exists but was deleted, or the
          // submission predates answers carrying their document.
          <View style={styles.uploadedFileRow}>
            <MaterialIcons name="attach-file" size={22} color={colors.success} />
            <Text style={styles.fileName}>File attached</Text>
            {editable ? (
              <Text
                style={styles.changeLink}
                // Same one-step replace as the branch above. Clearing worked here, because
                // there is no `fileInfo` to strand the row, but it still cost the student a
                // second tap and briefly left the question unanswered.
                onPress={() => onChange('__pick_file__')}
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
      </View>
    );
  }

  if (question.type === 'choice') {
    return (
      <View style={cardStyle} onLayout={reportLayout}>
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
      </View>
    );
  }

  return (
    <View style={cardStyle} onLayout={reportLayout}>
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
        footer={counter}
        accessibilityLabel={question.prompt}
      />
    </View>
  );
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
  /**
   * A question a failed submit is waiting on.
   *
   * A left bar plus a tinted background rather than colour alone, so the marked questions
   * are distinguishable without relying on colour vision.
   */
  cardProblem: {
    backgroundColor: colors.dangerBg,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  errorCard: { margin: 20, padding: 24, backgroundColor: '#fff', borderRadius: 14, alignItems: 'center', gap: 12 },
  errorText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
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

  // Outstanding-question summary above the submit button.
  problemBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  problemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  problemTitle: { flex: 1, fontSize: fontSize.small, fontWeight: '700', color: colors.danger },
  problemChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  problemChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  problemChipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.danger },
  hint: {
    marginTop: spacing.sm,
    fontSize: fontSize.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  noteBox: {
    flexDirection: 'row',
    gap: 8,
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
  retakeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  retakeBoxExpired: { backgroundColor: colors.surfaceAlt, borderLeftColor: colors.textFaint },
  retakeTitle: { fontSize: fontSize.small, fontWeight: '700', color: colors.text },
  retakeBody: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 19, marginTop: 2 },
  retakeReason: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 6,
    fontStyle: 'italic',
  },
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
  viewLink: { fontSize: fontSize.small, color: colors.primary, fontWeight: '700' },
  changeLink: { fontSize: fontSize.small, color: colors.textMuted, fontWeight: '700' },
});
