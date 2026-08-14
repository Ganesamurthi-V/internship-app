/**
 * Daily work log — 01_PRD §4.3, 02_SRS §2.3, 06_App_Flow §4.
 *
 * The two word caps are the defining feature of this form: activities <= 200 words and
 * learning <= 100, each with a live counter. Both the counter and the submit validation
 * call `countWords` from @ims/shared-validation — the same function the server uses — so
 * the number on screen is the number that will be judged.
 *
 * Like attendance, submission writes to SQLite first and lets the sync engine deliver
 * it, so the offline path is the only path.
 *
 * Evidence upload is gated by the organisation's permission (02_SRS §2.3). The gate is
 * enforced server-side; here it simply is not offered when the internship does not allow
 * it, rather than presenting a control that would be rejected.
 */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  COMPLETION_STATUSES,
  COMPLETION_STATUS_LABELS,
  DELIVERABLE_TYPES,
  DELIVERABLE_TYPE_LABELS,
  MAX_ACTIVITIES_WORDS,
  MAX_LEARNING_WORDS,
  RECOMMENDED_ACTIVITIES_WORDS_MIN,
  type CompletionStatus,
  type DeliverableType,
} from '@ims/shared-types';
import { countWords, createWorkLogSchema } from '@ims/shared-validation';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/Chips';
import { TextField } from '@/components/ui/TextField';
import { TagInput } from '@/components/ui/TagInput';
import { WordCounter } from '@/components/ui/WordCounter';
import { useMyInternship } from '@/lib/api/hooks';
import { workLogDrafts } from '@/lib/db/database';
import { generateClientId } from '@/lib/utils/id';
import { useSyncStore } from '@/stores/syncStore';
import { colors, fontSize, spacing } from '@/constants/theme';

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

export default function WorkLogTodayScreen() {
  const { data: internshipData, isLoading } = useMyInternship();
  const triggerSync = useSyncStore((state) => state.triggerSync);
  const isConnected = useSyncStore((state) => state.isConnected);

  const internship = internshipData?.value?.internship ?? null;
  const internshipId = internship?.id;
  const workDate = todayLocal();

  const [activities, setActivities] = useState('');
  const [technologies, setTechnologies] = useState<string[]>([]);
  const [taskAssigned, setTaskAssigned] = useState('');
  const [completionStatus, setCompletionStatus] = useState<CompletionStatus | null>(null);
  const [learning, setLearning] = useState('');
  const [challenge, setChallenge] = useState('');
  const [solution, setSolution] = useState('');
  const [deliverableType, setDeliverableType] = useState<DeliverableType | null>(null);
  const [mentorInteraction, setMentorInteraction] = useState(false);
  const [mentorFeedback, setMentorFeedback] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [existingDraft, setExistingDraft] = useState<{ synced: boolean } | null>(null);

  /** Rehydrate today's draft so the form is resumable. */
  useEffect(() => {
    if (!internshipId) return;

    void (async () => {
      const draft = await workLogDrafts.findByDate(internshipId, workDate);
      if (!draft) return;

      setActivities(draft.activities);
      setTechnologies(workLogDrafts.parseTechnologies(draft));
      setTaskAssigned(draft.task_assigned ?? '');
      setCompletionStatus(draft.completion_status as CompletionStatus | null);
      setLearning(draft.learning ?? '');
      setChallenge(draft.challenge ?? '');
      setSolution(draft.solution ?? '');
      setDeliverableType(draft.deliverable_type as DeliverableType | null);
      setMentorInteraction(draft.mentor_interaction === 1);
      setMentorFeedback(draft.mentor_feedback ?? '');
      setExistingDraft({ synced: draft.sync_status === 'synced' });
    })();
  }, [internshipId, workDate]);

  /** Disable submit while a cap is exceeded, rather than letting it fail on tap. */
  const overLimit = useMemo(
    () =>
      countWords(activities) > MAX_ACTIVITIES_WORDS || countWords(learning) > MAX_LEARNING_WORDS,
    [activities, learning],
  );

  const onSubmit = async (): Promise<void> => {
    if (!internshipId) return;

    setSubmitting(true);
    setErrors({});

    const candidate = {
      internshipId,
      workDate,
      activities,
      technologies,
      taskAssigned: taskAssigned.trim() || null,
      completionStatus,
      learning: learning.trim() || null,
      challenge: challenge.trim() || null,
      solution: solution.trim() || null,
      deliverableType,
      evidenceDocumentId: null,
      mentorInteraction,
      // Only meaningful when there was an interaction to report.
      mentorFeedback: mentorInteraction ? mentorFeedback.trim() || null : null,
      clientId: null,
    };

    const parsed = createWorkLogSchema.safeParse(candidate);

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setSubmitting(false);
      return;
    }

    try {
      const existing = await workLogDrafts.findByDate(internshipId, workDate);

      await workLogDrafts.upsert({
        clientId: existing?.client_id ?? generateClientId(),
        internshipId,
        workDate,
        activities: parsed.data.activities,
        technologies: parsed.data.technologies ?? [],
        taskAssigned: parsed.data.taskAssigned ?? null,
        completionStatus: parsed.data.completionStatus ?? null,
        learning: parsed.data.learning ?? null,
        challenge: parsed.data.challenge ?? null,
        solution: parsed.data.solution ?? null,
        deliverableType: parsed.data.deliverableType ?? null,
        mentorInteraction: parsed.data.mentorInteraction ?? false,
        mentorFeedback: parsed.data.mentorFeedback ?? null,
      });

      void triggerSync();
      router.back();
    } catch (error) {
      setErrors({ _: error instanceof Error ? error.message : 'Could not save your work log.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Screen>
        <Text style={styles.muted}>Loading\u2026</Text>
      </Screen>
    );
  }

  if (!internship || (internship.status !== 'approved' && internship.status !== 'active')) {
    return (
      <Screen>
        <Card title="Not available yet">
          <Text style={styles.muted}>
            You can submit work logs once your internship registration has been approved.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label={existingDraft ? 'Update work log' : 'Submit work log'}
          onPress={() => void onSubmit()}
          loading={submitting}
          disabled={overLimit}
        />
      }
    >
      <Card title={formatDate(workDate)}>
        {existingDraft ? (
          <Text style={existingDraft.synced ? styles.synced : styles.pendingNote}>
            {existingDraft.synced
              ? 'Already submitted. Changes will be sent as an edit.'
              : 'Saved on this device, waiting to sync.'}
          </Text>
        ) : (
          <Text style={styles.muted}>
            {isConnected
              ? 'Saved on this device and synced immediately.'
              : "You're offline. This will sync automatically."}
          </Text>
        )}
      </Card>

      <TextField
        label="Activities performed"
        required
        multiline
        value={activities}
        onChangeText={setActivities}
        error={errors.activities}
        placeholder="What did you work on today?"
        accessory={
          <WordCounter
            value={activities}
            max={MAX_ACTIVITIES_WORDS}
            recommendedMin={RECOMMENDED_ACTIVITIES_WORDS_MIN}
          />
        }
      />

      <TagInput
        label="Technologies / tools used"
        value={technologies}
        onChange={setTechnologies}
        error={errors.technologies}
        placeholder="e.g. Python, Git, AWS"
      />

      <TextField
        label="Task assigned today"
        value={taskAssigned}
        onChangeText={setTaskAssigned}
        error={errors.taskAssigned}
        placeholder="What were you asked to do?"
      />

      <ChipGroup<CompletionStatus>
        label="Task completed?"
        options={COMPLETION_STATUSES.map((value) => ({
          value,
          label: COMPLETION_STATUS_LABELS[value],
        }))}
        value={completionStatus}
        onChange={setCompletionStatus}
        error={errors.completionStatus}
      />

      <TextField
        label="Key learning"
        multiline
        value={learning}
        onChangeText={setLearning}
        error={errors.learning}
        placeholder="What did you learn?"
        accessory={<WordCounter value={learning} max={MAX_LEARNING_WORDS} />}
      />

      <TextField
        label="Problem or challenge faced"
        multiline
        value={challenge}
        onChangeText={setChallenge}
        error={errors.challenge}
        placeholder="Anything that blocked you?"
      />

      <TextField
        label="Solution or approach taken"
        multiline
        value={solution}
        onChangeText={setSolution}
        error={errors.solution}
        placeholder="How did you handle it?"
      />

      <ChipGroup<DeliverableType>
        label="Output / deliverable"
        options={DELIVERABLE_TYPES.map((value) => ({
          value,
          label: DELIVERABLE_TYPE_LABELS[value],
        }))}
        value={deliverableType}
        onChange={setDeliverableType}
        error={errors.deliverableType}
      />

      <ChipGroup<'yes' | 'no'>
        label="Mentor interaction today?"
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]}
        value={mentorInteraction ? 'yes' : 'no'}
        onChange={(value) => setMentorInteraction(value === 'yes')}
      />

      {/* Only shown when the toggle is yes, per 06_App_Flow §4. */}
      {mentorInteraction ? (
        <TextField
          label="Mentor feedback / remarks"
          multiline
          value={mentorFeedback}
          onChangeText={setMentorFeedback}
          error={errors.mentorFeedback}
          placeholder="What did your mentor say?"
        />
      ) : null}

      {internship.status === 'active' || internship.status === 'approved' ? (
        <Card title="Evidence (optional)">
          <Text style={styles.muted}>
            Evidence uploads are only available when your organisation permits them, and are never
            required. Do not upload confidential company information or source code.
          </Text>
        </Card>
      ) : null}

      {errors._ ? (
        <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{errors._}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

function formatDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  synced: { fontSize: fontSize.small, color: colors.success, fontWeight: '600' },
  pendingNote: { fontSize: fontSize.small, color: colors.warning, fontWeight: '600' },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: fontSize.small },
});
