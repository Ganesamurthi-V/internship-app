/**
 * Weekly report form — 01_PRD §4.4, 06_App_Flow §5.
 *
 * Days attended and total hours are read-only (auto-aggregated from attendance by
 * the server). The student fills the rest and submits.
 */

import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { TagInput } from '@/components/ui/TagInput';
import { api, ApiError } from '@/lib/api/client';
import { useCurrentWeek, useMyInternship } from '@/lib/api/hooks';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function WeeklyReportFormScreen() {
  const params = useLocalSearchParams<{ week: string }>();
  const weekNumber = Number(params.week) || 1;

  const { data: internshipData } = useMyInternship();
  const internshipId = internshipData?.value?.internship?.id;
  const { data: currentWeekData } = useCurrentWeek(internshipId);

  const [majorActivities, setMajorActivities] = useState('');
  const [technologiesLearned, setTechnologiesLearned] = useState<string[]>([]);
  const [skillsDeveloped, setSkillsDeveloped] = useState<string[]>([]);
  const [majorAssignment, setMajorAssignment] = useState('');
  const [problems, setProblems] = useState('');
  const [solutions, setSolutions] = useState('');
  const [learningOutcomes, setLearningOutcomes] = useState('');
  const [mentorFeedback, setMentorFeedback] = useState('');
  const [selfAssessment, setSelfAssessment] = useState('');

  const [reportId, setReportId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentWeek = currentWeekData?.value;

  // Create or load the report draft
  useEffect(() => {
    if (!internshipId) return;
    void (async () => {
      try {
        const result = await api.post<{ id: string; submittedAt: string | null; majorActivities?: string; technologiesLearned?: string[]; skillsDeveloped?: string[]; majorAssignment?: string; problems?: string; solutions?: string; learningOutcomes?: string; mentorFeedback?: string; studentSelfAssessment?: string }>('/weekly-reports', {
          internshipId,
          weekNumber,
        });
        setReportId(result.id);
        if (result.submittedAt) setIsSubmitted(true);
        if (result.majorActivities) setMajorActivities(result.majorActivities);
        if (result.technologiesLearned) setTechnologiesLearned(result.technologiesLearned);
        if (result.skillsDeveloped) setSkillsDeveloped(result.skillsDeveloped);
        if (result.majorAssignment) setMajorAssignment(result.majorAssignment);
        if (result.problems) setProblems(result.problems);
        if (result.solutions) setSolutions(result.solutions);
        if (result.learningOutcomes) setLearningOutcomes(result.learningOutcomes);
        if (result.mentorFeedback) setMentorFeedback(result.mentorFeedback);
        if (result.studentSelfAssessment) setSelfAssessment(result.studentSelfAssessment);
      } catch {
        // Report might already exist or we're offline
      }
    })();
  }, [internshipId, weekNumber]);

  const saveDraft = async (): Promise<void> => {
    if (!reportId) return;
    setSubmitting(true);
    setErrors({});
    try {
      await api.patch(`/weekly-reports/${reportId}`, {
        majorActivities: majorActivities.trim() || null,
        technologiesLearned,
        skillsDeveloped,
        majorAssignment: majorAssignment.trim() || null,
        problems: problems.trim() || null,
        solutions: solutions.trim() || null,
        learningOutcomes: learningOutcomes.trim() || null,
        mentorFeedback: mentorFeedback.trim() || null,
        studentSelfAssessment: selfAssessment.trim() || null,
      });
      Alert.alert('Saved', 'Draft saved successfully.');
    } catch (error) {
      setErrors({ _: error instanceof ApiError ? error.message : 'Failed to save.' });
    } finally {
      setSubmitting(false);
    }
  };

  const submitReport = async (): Promise<void> => {
    if (!reportId) return;
    setSubmitting(true);
    setErrors({});
    try {
      // Save first, then submit
      await api.patch(`/weekly-reports/${reportId}`, {
        majorActivities: majorActivities.trim() || null,
        technologiesLearned,
        skillsDeveloped,
        majorAssignment: majorAssignment.trim() || null,
        problems: problems.trim() || null,
        solutions: solutions.trim() || null,
        learningOutcomes: learningOutcomes.trim() || null,
        mentorFeedback: mentorFeedback.trim() || null,
        studentSelfAssessment: selfAssessment.trim() || null,
      });
      await api.post(`/weekly-reports/${reportId}/submit`, {});
      Alert.alert('Submitted', 'Weekly report submitted successfully.', [
        { text: 'OK', onPress: () => router.back() },
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

  return (
    <Screen
      footer={
        isSubmitted ? undefined : (
          <View style={styles.footerRow}>
            <View style={styles.footerBtn}>
              <Button label="Save draft" variant="secondary" onPress={() => void saveDraft()} loading={submitting} />
            </View>
            <View style={styles.footerBtn}>
              <Button label="Submit" onPress={() => void submitReport()} loading={submitting} />
            </View>
          </View>
        )
      }
    >
      <Card title={`Week ${weekNumber}`} subtitle={currentWeek ? `${currentWeek.weekStartDate} to ${currentWeek.weekEndDate}` : undefined}>
        {currentWeek ? (
          <View style={styles.aggregates}>
            <Text style={styles.aggregateText}>Days attended: {currentWeek.daysAttended} (auto-filled)</Text>
            <Text style={styles.aggregateText}>Total hours: {currentWeek.totalHours} (auto-filled)</Text>
          </View>
        ) : null}
        {isSubmitted ? (
          <Text style={styles.submitted}>This report has been submitted.</Text>
        ) : null}
      </Card>

      <TextField label="Major activities completed" multiline value={majorActivities} onChangeText={setMajorActivities} error={errors.majorActivities} placeholder="What were the key things you worked on this week?" />

      <TagInput label="Technologies / tools learned" value={technologiesLearned} onChange={setTechnologiesLearned} placeholder="e.g. Docker, Redis" showSuggestions />

      <TagInput label="Skills developed" value={skillsDeveloped} onChange={setSkillsDeveloped} placeholder="e.g. API design, Testing" showSuggestions={false} />

      <TextField label="Major assignment completed" multiline value={majorAssignment} onChangeText={setMajorAssignment} placeholder="Any specific task or milestone" />

      <TextField label="Problems encountered" multiline value={problems} onChangeText={setProblems} placeholder="What challenges came up?" />

      <TextField label="Solutions / approach" multiline value={solutions} onChangeText={setSolutions} placeholder="How did you resolve them?" />

      <TextField label="Key learning outcomes" multiline value={learningOutcomes} onChangeText={setLearningOutcomes} placeholder="What did you take away from this week?" />

      <TextField label="Mentor feedback" multiline value={mentorFeedback} onChangeText={setMentorFeedback} placeholder="What did your mentor say?" />

      <TextField label="Self assessment" multiline value={selfAssessment} onChangeText={setSelfAssessment} placeholder="How do you rate your own progress?" />

      {errors._ || errors.reportDocumentId ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{errors._ ?? errors.reportDocumentId}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  aggregates: { gap: 2 },
  aggregateText: { fontSize: fontSize.small, color: colors.info, fontWeight: '600', fontVariant: ['tabular-nums'] },
  submitted: { fontSize: fontSize.small, color: colors.success, fontWeight: '700', marginTop: spacing.xs },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  footerBtn: { flex: 1 },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.small },
});
