/**
 * Mentor evaluation form — 01_PRD §4.7, 12_Mobile_App_Spec §2.
 *
 * Ten rating parameters (1-5), free text, and a digital confirmation that locks
 * the record (02_SRS §2.6).
 */

import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  MENTOR_RATING_FIELDS,
  MENTOR_RATING_LABELS,
  type MentorRatingField,
} from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { api, ApiError } from '@/lib/api/client';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function MentorEvaluationScreen() {
  const { internshipId } = useLocalSearchParams<{ internshipId: string }>();

  const [ratings, setRatings] = useState<Record<MentorRatingField, number | null>>(
    Object.fromEntries(MENTOR_RATING_FIELDS.map((f) => [f, null])) as Record<MentorRatingField, number | null>,
  );
  const [strengths, setStrengths] = useState('');
  const [improvementAreas, setImprovementAreas] = useState('');
  const [remarks, setRemarks] = useState('');
  const [employmentRecommendation, setEmploymentRecommendation] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load existing evaluation
  useEffect(() => {
    if (!internshipId) return;
    void (async () => {
      try {
        const existing = await api.get<{
          technicalKnowledge: number | null;
          problemSolving: number | null;
          communication: number | null;
          teamwork: number | null;
          professionalBehaviour: number | null;
          punctualityAttendance: number | null;
          abilityToLearn: number | null;
          initiative: number | null;
          qualityOfWork: number | null;
          overallPerformance: number | null;
          strengths: string | null;
          improvementAreas: string | null;
          remarks: string | null;
          employmentRecommendation: boolean | null;
          digitalConfirmation: boolean;
        } | null>(`/mentor-evaluations/${internshipId}`);

        if (!existing) return;
        if (existing.digitalConfirmation) setIsConfirmed(true);

        const newRatings = { ...ratings };
        for (const field of MENTOR_RATING_FIELDS) {
          const val = existing[field as keyof typeof existing];
          if (typeof val === 'number') (newRatings as Record<string, number | null>)[field] = val;
        }
        setRatings(newRatings);
        if (existing.strengths) setStrengths(existing.strengths);
        if (existing.improvementAreas) setImprovementAreas(existing.improvementAreas);
        if (existing.remarks) setRemarks(existing.remarks);
        if (existing.employmentRecommendation !== null) setEmploymentRecommendation(existing.employmentRecommendation);
      } catch {
        // No existing evaluation — fresh form
      }
    })();
  }, [internshipId]);

  const saveDraft = async (): Promise<void> => {
    if (!internshipId) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { internshipId };
      for (const field of MENTOR_RATING_FIELDS) {
        body[field] = ratings[field];
      }
      body.strengths = strengths.trim() || null;
      body.improvementAreas = improvementAreas.trim() || null;
      body.remarks = remarks.trim() || null;
      body.employmentRecommendation = employmentRecommendation;

      await api.post('/mentor-evaluations', body);
      Alert.alert('Saved', 'Draft saved.');
    } catch {
      // Silent
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!internshipId) return;

    // Check all ratings are filled
    const missing = MENTOR_RATING_FIELDS.filter((f) => !ratings[f]);
    if (missing.length > 0) {
      Alert.alert('Incomplete', `Please rate all parameters before confirming. Missing: ${missing.map((f) => MENTOR_RATING_LABELS[f]).join(', ')}`);
      return;
    }

    Alert.alert(
      'Confirm evaluation',
      'Once confirmed, this evaluation cannot be changed. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Submit',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            setErrors({});
            try {
              const body: Record<string, unknown> = { digitalConfirmation: true };
              for (const field of MENTOR_RATING_FIELDS) {
                body[field] = ratings[field]!;
              }
              body.strengths = strengths.trim() || null;
              body.improvementAreas = improvementAreas.trim() || null;
              body.remarks = remarks.trim() || null;
              body.employmentRecommendation = employmentRecommendation;

              await api.post(`/mentor-evaluations/${internshipId}/submit`, body);
              Alert.alert('Confirmed', 'Thank you for your evaluation.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error) {
              if (error instanceof ApiError && error.fields) {
                setErrors(error.fields);
              } else {
                setErrors({ _: error instanceof ApiError ? error.message : 'Failed.' });
              }
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  if (isConfirmed) {
    return (
      <Screen>
        <Card title="Evaluation confirmed">
          <Text style={styles.confirmed}>
            Your evaluation has been digitally confirmed and is now locked. Thank you for your time.
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={styles.footerRow}>
          <View style={styles.footerBtn}>
            <Button label="Save draft" variant="secondary" onPress={() => void saveDraft()} loading={submitting} />
          </View>
          <View style={styles.footerBtn}>
            <Button label="Confirm & Submit" onPress={() => void submit()} loading={submitting} />
          </View>
        </View>
      }
    >
      <Card title="Industry Mentor Evaluation">
        <Text style={styles.muted}>
          Rate the student on each parameter from 1 (Poor) to 5 (Excellent).
          Once confirmed, this evaluation cannot be changed.
        </Text>
      </Card>

      {MENTOR_RATING_FIELDS.map((field) => (
        <View key={field} style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>{MENTOR_RATING_LABELS[field]}</Text>
          <ChipGroup<'1'|'2'|'3'|'4'|'5'>
            options={(['1','2','3','4','5'] as const).map((v) => ({ value: v, label: v }))}
            value={ratings[field] ? String(ratings[field]) as '1'|'2'|'3'|'4'|'5' : null}
            onChange={(v) => setRatings({ ...ratings, [field]: Number(v) })}
          />
        </View>
      ))}

      <TextField label="Major strengths" multiline value={strengths} onChangeText={setStrengths} placeholder="What are this student's key strengths?" />
      <TextField label="Areas for improvement" multiline value={improvementAreas} onChangeText={setImprovementAreas} placeholder="Where could they improve?" />
      <TextField label="Overall remarks" multiline value={remarks} onChangeText={setRemarks} placeholder="Any additional observations?" />

      <ChipGroup<'yes' | 'no'>
        label="Employment recommendation"
        options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
        value={employmentRecommendation === null ? null : employmentRecommendation ? 'yes' : 'no'}
        onChange={(v) => setEmploymentRecommendation(v === 'yes')}
      />

      {errors._ ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{errors._}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  confirmed: { fontSize: fontSize.body, color: colors.success, fontWeight: '700' },
  ratingRow: { marginBottom: spacing.sm },
  ratingLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: 4 },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  footerBtn: { flex: 1 },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.small },
});
