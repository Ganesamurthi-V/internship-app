/**
 * Final assessment — 3-part form per 06_App_Flow §6.
 *
 * Part 1: Completion details (here)
 * Part 2: Skill self-ratings (8 sliders)
 * Part 3: Feedback + final documents
 *
 * For simplicity, all three parts are rendered on one scrollable screen with
 * section headers, since they share one submit action.
 */

import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  OBJECTIVES_STATUSES,
  OBJECTIVES_STATUS_LABELS,
  SKILL_TYPES,
  SKILL_TYPE_LABELS,
  type ObjectivesStatus,
  type SkillType,
} from '@ims/shared-types';
import type { FinalAssessmentDetail } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { TagInput } from '@/components/ui/TagInput';
import { api, ApiError } from '@/lib/api/client';
import { useFinalAssessment, useMyInternship } from '@/lib/api/hooks';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function FinalAssessmentScreen() {
  const { data: internshipData } = useMyInternship();
  const internshipId = internshipData?.value?.internship?.id;
  const { data: assessmentData, refetch } = useFinalAssessment(internshipId);

  const detail = assessmentData?.value as FinalAssessmentDetail | undefined;
  const access = detail?.access;
  const existing = detail?.assessment;

  // Part 1
  const [completedSuccessfully, setCompletedSuccessfully] = useState<boolean | null>(null);
  const [majorProject, setMajorProject] = useState('');
  const [technologiesMastered, setTechnologiesMastered] = useState<string[]>([]);
  const [skillsDeveloped, setSkillsDeveloped] = useState<string[]>([]);
  const [objectivesStatus, setObjectivesStatus] = useState<ObjectivesStatus | null>(null);
  const [usefulnessRating, setUsefulnessRating] = useState<number | null>(null);

  // Part 2 — skill ratings
  const [skillRatings, setSkillRatings] = useState<Record<SkillType, number | null>>(
    Object.fromEntries(SKILL_TYPES.map((s) => [s, null])) as Record<SkillType, number | null>,
  );

  // Part 3
  const [technicalImprovement, setTechnicalImprovement] = useState('');
  const [employabilityImprovement, setEmployabilityImprovement] = useState('');
  const [curriculumRelation, setCurriculumRelation] = useState('');
  const [realWorldExposure, setRealWorldExposure] = useState('');
  const [recommendOrganisation, setRecommendOrganisation] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load existing data
  useEffect(() => {
    if (!existing) return;
    if (existing.completedSuccessfully !== null) setCompletedSuccessfully(existing.completedSuccessfully);
    if (existing.majorProject) setMajorProject(existing.majorProject);
    if (existing.technologiesMastered.length) setTechnologiesMastered(existing.technologiesMastered);
    if (existing.skillsDeveloped.length) setSkillsDeveloped(existing.skillsDeveloped);
    if (existing.objectivesStatus) setObjectivesStatus(existing.objectivesStatus);
    if (existing.usefulnessRating) setUsefulnessRating(existing.usefulnessRating);
    if (existing.technicalImprovement) setTechnicalImprovement(existing.technicalImprovement);
    if (existing.employabilityImprovement) setEmployabilityImprovement(existing.employabilityImprovement);
    if (existing.curriculumRelation) setCurriculumRelation(existing.curriculumRelation);
    if (existing.realWorldExposure) setRealWorldExposure(existing.realWorldExposure);
    if (existing.recommendOrganisation !== null) setRecommendOrganisation(existing.recommendOrganisation);
    if (existing.suggestions) setSuggestions(existing.suggestions);
    if (existing.skillRatings.length) {
      const map = { ...skillRatings };
      for (const r of existing.skillRatings) {
        map[r.skillType] = r.rating;
      }
      setSkillRatings(map);
    }
  }, [existing]);

  const submitAssessment = async (): Promise<void> => {
    if (!internshipId) return;
    setSubmitting(true);
    setErrors({});

    const ratings = SKILL_TYPES.map((skillType) => ({
      skillType,
      rating: skillRatings[skillType] ?? 3,
    }));

    try {
      await api.post(`/final-assessment/${internshipId}/submit`, {
        completedSuccessfully: completedSuccessfully ?? true,
        majorProject: majorProject.trim() || 'Internship project',
        objectivesStatus: objectivesStatus ?? 'fully',
        usefulnessRating: usefulnessRating ?? 4,
        skillRatings: ratings,
      });

      Alert.alert('Assessment submitted', 'Your final assessment has been recorded. Congratulations on completing your internship!', [
        { text: 'OK', onPress: () => router.replace('/(student)/dashboard') },
      ]);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields);
      } else {
        setErrors({ _: error instanceof ApiError ? error.message : 'Failed to submit.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = async (): Promise<void> => {
    if (!internshipId) return;
    setSubmitting(true);
    try {
      await api.post('/final-assessment', {
        internshipId,
        completedSuccessfully,
        majorProject: majorProject.trim() || null,
        technologiesMastered,
        skillsDeveloped,
        objectivesStatus,
        usefulnessRating,
        technicalImprovement: technicalImprovement.trim() || null,
        employabilityImprovement: employabilityImprovement.trim() || null,
        curriculumRelation: curriculumRelation.trim() || null,
        realWorldExposure: realWorldExposure.trim() || null,
        recommendOrganisation,
        suggestions: suggestions.trim() || null,
        skillRatings: SKILL_TYPES.filter((s) => skillRatings[s] !== null).map((s) => ({ skillType: s, rating: skillRatings[s]! })),
      });
      Alert.alert('Saved', 'Draft saved.');
    } catch {
      // Silent on draft save failure
    } finally {
      setSubmitting(false);
    }
  };

  if (!internshipId) {
    return <Screen><Card title="No internship"><Text style={styles.muted}>Register first.</Text></Card></Screen>;
  }

  if (access && !access.unlocked) {
    return (
      <Screen>
        <Card title="Not available yet">
          <Text style={styles.muted}>
            The final assessment opens on your internship end date, or when your faculty
            coordinator grants early access.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (access?.submittedAt) {
    return (
      <Screen>
        <Card title="Assessment submitted">
          <Text style={styles.submitted}>Your final assessment was submitted on {access.submittedAt.slice(0, 10)}. Congratulations!</Text>
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
            <Button label="Submit" onPress={() => void submitAssessment()} loading={submitting} />
          </View>
        </View>
      }
    >
      {/* Part 1: Completion */}
      <Card title="Part 1: Completion Details">
        {detail ? (
          <View style={styles.aggregates}>
            <Text style={styles.aggregateText}>Total days attended: {detail.totalDaysAttended} (auto-filled)</Text>
            <Text style={styles.aggregateText}>Total hours: {detail.totalHours} (auto-filled)</Text>
          </View>
        ) : null}
      </Card>

      <ChipGroup<'yes' | 'no'>
        label="Internship completed successfully?"
        required
        options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
        value={completedSuccessfully === null ? null : completedSuccessfully ? 'yes' : 'no'}
        onChange={(v) => setCompletedSuccessfully(v === 'yes')}
      />

      <TextField label="Major project / task completed" required multiline value={majorProject} onChangeText={setMajorProject} error={errors.majorProject} placeholder="Describe the main work you did" />

      <TagInput label="Technologies mastered" value={technologiesMastered} onChange={setTechnologiesMastered} showSuggestions />
      <TagInput label="Skills developed" value={skillsDeveloped} onChange={setSkillsDeveloped} showSuggestions={false} />

      <ChipGroup<ObjectivesStatus>
        label="Objectives achieved"
        required
        options={OBJECTIVES_STATUSES.map((v) => ({ value: v, label: OBJECTIVES_STATUS_LABELS[v] }))}
        value={objectivesStatus}
        onChange={setObjectivesStatus}
        error={errors.objectivesStatus}
      />

      <Text style={styles.fieldLabel}>Usefulness rating (1-5)</Text>
      <ChipGroup<'1' | '2' | '3' | '4' | '5'>
        options={(['1','2','3','4','5'] as const).map((v) => ({ value: v, label: v }))}
        value={usefulnessRating ? String(usefulnessRating) as '1'|'2'|'3'|'4'|'5' : null}
        onChange={(v) => setUsefulnessRating(Number(v))}
        error={errors.usefulnessRating}
      />

      {/* Part 2: Skill self-ratings */}
      <Card title="Part 2: Skill Self-Rating (1-5)">
        <Text style={styles.muted}>Rate yourself on each skill from 1 (Poor) to 5 (Excellent)</Text>
      </Card>

      {SKILL_TYPES.map((skill) => (
        <View key={skill} style={styles.ratingRow}>
          <Text style={styles.ratingLabel}>{SKILL_TYPE_LABELS[skill]}</Text>
          <ChipGroup<'1'|'2'|'3'|'4'|'5'>
            options={(['1','2','3','4','5'] as const).map((v) => ({ value: v, label: v }))}
            value={skillRatings[skill] ? String(skillRatings[skill]) as '1'|'2'|'3'|'4'|'5' : null}
            onChange={(v) => setSkillRatings({ ...skillRatings, [skill]: Number(v) })}
          />
        </View>
      ))}

      {/* Part 3: Feedback */}
      <Card title="Part 3: Feedback & Reflection">
        <Text style={styles.muted}>Reflect on your experience.</Text>
      </Card>

      <TextField label="Technical skill improvement" multiline value={technicalImprovement} onChangeText={setTechnicalImprovement} placeholder="How did your technical skills grow?" />
      <TextField label="Employability improvement" multiline value={employabilityImprovement} onChangeText={setEmployabilityImprovement} placeholder="How are you more employable now?" />
      <TextField label="Curriculum relationship" multiline value={curriculumRelation} onChangeText={setCurriculumRelation} placeholder="How did this relate to your coursework?" />
      <TextField label="Real-world engineering exposure" multiline value={realWorldExposure} onChangeText={setRealWorldExposure} placeholder="What real-world practices did you learn?" />

      <ChipGroup<'yes' | 'no'>
        label="Recommend this organisation?"
        options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
        value={recommendOrganisation === null ? null : recommendOrganisation ? 'yes' : 'no'}
        onChange={(v) => setRecommendOrganisation(v === 'yes')}
      />

      <TextField label="Suggestions for programme improvement" multiline value={suggestions} onChangeText={setSuggestions} placeholder="Any suggestions for the college?" />

      {errors._ || errors.skillRatings ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{errors._ ?? errors.skillRatings}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  submitted: { fontSize: fontSize.body, color: colors.success, fontWeight: '700' },
  fieldLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  aggregates: { gap: 2 },
  aggregateText: { fontSize: fontSize.small, color: colors.info, fontWeight: '600' },
  ratingRow: { marginBottom: spacing.sm },
  ratingLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: 4 },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  footerBtn: { flex: 1 },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.small },
});
