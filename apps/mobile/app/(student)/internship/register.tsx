/**
 * Internship registration wizard — 3 steps per 06_App_Flow §3.
 *
 * Step 1: Organisation, domain, mode, dates, hours
 * Step 2: Mentor details, faculty coordinator
 * Step 3: Document upload (offer letter + joining proof)
 *
 * Each step validates locally before advancing. The internship is created as a
 * draft on Step 1 submission (POST /api/internships), then updated on Steps 2-3.
 * Final submission happens via POST /api/internships/:id/submit.
 */

import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  INTERNSHIP_DOMAINS,
  INTERNSHIP_DOMAIN_LABELS,
  INTERNSHIP_MODES,
  INTERNSHIP_MODE_LABELS,
  type InternshipDomain,
  type InternshipMode,
} from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup } from '@/components/ui/Chips';
import { api, ApiError } from '@/lib/api/client';
import { useFacultyCoordinators } from '@/lib/api/hooks';
import { colors, fontSize, spacing } from '@/constants/theme';

type Step = 1 | 2 | 3;

export default function RegisterInternshipScreen() {
  const [step, setStep] = useState<Step>(1);
  const [internshipId, setInternshipId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Step 1 fields
  const [organisationName, setOrganisationName] = useState('');
  const [organisationLocation, setOrganisationLocation] = useState('');
  const [domain, setDomain] = useState<InternshipDomain | null>(null);
  const [mode, setMode] = useState<InternshipMode | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [workingHoursPerDay, setWorkingHoursPerDay] = useState('8');

  // Step 2 fields
  const [mentorName, setMentorName] = useState('');
  const [mentorDesignation, setMentorDesignation] = useState('');
  const [mentorEmail, setMentorEmail] = useState('');
  const [mentorContact, setMentorContact] = useState('');
  const [facultyCoordinatorId, setFacultyCoordinatorId] = useState<string | null>(null);

  const { data: coordinatorsData } = useFacultyCoordinators();
  const coordinators = coordinatorsData?.value ?? [];

  const submitStep1 = async (): Promise<void> => {
    setErrors({});
    if (!organisationName.trim()) { setErrors({ organisationName: 'Required.' }); return; }
    if (!domain) { setErrors({ domain: 'Select a domain.' }); return; }
    if (!mode) { setErrors({ mode: 'Select a mode.' }); return; }
    if (!startDate) { setErrors({ startDate: 'Required.' }); return; }
    if (!endDate) { setErrors({ endDate: 'Required.' }); return; }

    setSubmitting(true);
    try {
      const result = await api.post<{ id: string }>('/internships', {
        organisationName: organisationName.trim(),
        organisationLocation: organisationLocation.trim() || undefined,
        domain,
        mode,
        startDate,
        endDate,
        workingHoursPerDay: Number(workingHoursPerDay) || 8,
      });
      setInternshipId(result.id);
      setStep(2);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields);
      } else {
        setErrors({ _: error instanceof Error ? error.message : 'Failed to create.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitStep2 = async (): Promise<void> => {
    if (!internshipId) return;
    setErrors({});

    setSubmitting(true);
    try {
      await api.patch(`/internships/${internshipId}`, {
        mentorName: mentorName.trim() || undefined,
        mentorDesignation: mentorDesignation.trim() || undefined,
        mentorEmail: mentorEmail.trim() || undefined,
        mentorContact: mentorContact.trim() || undefined,
        facultyCoordinatorId: facultyCoordinatorId || undefined,
      });
      setStep(3);
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields);
      } else {
        setErrors({ _: error instanceof Error ? error.message : 'Failed to save.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitFinal = async (): Promise<void> => {
    if (!internshipId) return;
    setSubmitting(true);
    setErrors({});
    try {
      await api.post(`/internships/${internshipId}/submit`);
      Alert.alert(
        'Registration submitted',
        'Your internship registration has been sent for approval. You will be notified once your faculty coordinator reviews it.',
        [{ text: 'OK', onPress: () => router.replace('/(student)/dashboard') }],
      );
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        setErrors(error.fields);
      } else {
        setErrors({ _: error instanceof Error ? error.message : 'Failed to submit.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      footer={
        step === 1 ? (
          <Button label="Next: Mentor details" onPress={() => void submitStep1()} loading={submitting} />
        ) : step === 2 ? (
          <Button label="Next: Documents" onPress={() => void submitStep2()} loading={submitting} />
        ) : (
          <Button label="Submit for approval" onPress={() => void submitFinal()} loading={submitting} />
        )
      }
    >
      <View style={styles.stepper}>
        <StepDot active={step >= 1} label="1" />
        <View style={styles.stepLine} />
        <StepDot active={step >= 2} label="2" />
        <View style={styles.stepLine} />
        <StepDot active={step >= 3} label="3" />
      </View>

      {step === 1 && (
        <>
          <Card title="Step 1: Organisation & Internship">
            <Text style={styles.hint}>Enter your internship details</Text>
          </Card>

          <TextField
            label="Organisation name"
            required
            value={organisationName}
            onChangeText={setOrganisationName}
            error={errors.organisationName}
            placeholder="e.g. Iinvsys Technologies"
          />
          <TextField
            label="Location"
            value={organisationLocation}
            onChangeText={setOrganisationLocation}
            placeholder="e.g. Puducherry"
          />

          <ChipGroup<InternshipDomain>
            label="Internship domain"
            required
            options={INTERNSHIP_DOMAINS.map((v) => ({ value: v, label: INTERNSHIP_DOMAIN_LABELS[v] }))}
            value={domain}
            onChange={setDomain}
            error={errors.domain}
          />

          <ChipGroup<InternshipMode>
            label="Mode"
            required
            options={INTERNSHIP_MODES.map((v) => ({ value: v, label: INTERNSHIP_MODE_LABELS[v] }))}
            value={mode}
            onChange={setMode}
            error={errors.mode}
          />

          <TextField
            label="Start date"
            required
            value={startDate}
            onChangeText={setStartDate}
            error={errors.startDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="End date"
            required
            value={endDate}
            onChangeText={setEndDate}
            error={errors.endDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="Working hours per day"
            value={workingHoursPerDay}
            onChangeText={setWorkingHoursPerDay}
            error={errors.workingHoursPerDay}
            keyboardType="numeric"
            placeholder="8"
          />
        </>
      )}

      {step === 2 && (
        <>
          <Card title="Step 2: Mentor & Coordinator">
            <Text style={styles.hint}>Industry mentor details and faculty coordinator</Text>
          </Card>

          <TextField label="Mentor name" value={mentorName} onChangeText={setMentorName} error={errors.mentorName} placeholder="e.g. Raj Kumar" />
          <TextField label="Mentor designation" value={mentorDesignation} onChangeText={setMentorDesignation} placeholder="e.g. Senior Engineer" />
          <TextField label="Mentor email" value={mentorEmail} onChangeText={setMentorEmail} error={errors.mentorEmail} placeholder="raj@company.com" keyboardType="email-address" autoCapitalize="none" />
          <TextField label="Mentor contact" value={mentorContact} onChangeText={setMentorContact} error={errors.mentorContact} placeholder="9876543210" keyboardType="phone-pad" />

          <Text style={styles.fieldLabel}>Faculty coordinator</Text>
          {coordinators.length > 0 ? (
            <View style={styles.coordinatorList}>
              {coordinators.map((c) => (
                <Button
                  key={c.id}
                  label={`${c.name} (${c.email})`}
                  variant={facultyCoordinatorId === c.id ? 'primary' : 'secondary'}
                  onPress={() => setFacultyCoordinatorId(c.id)}
                  fullWidth
                />
              ))}
            </View>
          ) : (
            <Text style={styles.hint}>No coordinators available</Text>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <Card title="Step 3: Documents">
            <Text style={styles.hint}>
              Upload your offer/confirmation letter and joining proof. These are required before
              your registration can be submitted for approval.
            </Text>
          </Card>

          <Card title="Offer / Confirmation Letter" subtitle="Required">
            <Text style={styles.hint}>
              Document upload will be available once the backend is connected. For now, you can
              submit the registration and upload documents later from the Documents screen.
            </Text>
          </Card>

          <Card title="Joining Proof" subtitle="Required">
            <Text style={styles.hint}>
              PDF or photo of your joining letter / email confirmation.
            </Text>
          </Card>

          <Text style={styles.note}>
            Note: You can submit now and upload documents later. Your faculty coordinator will be
            notified and can approve once all documents are in place.
          </Text>
        </>
      )}

      {errors._ ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{errors._}</Text>
        </View>
      ) : null}
      {errors.documents ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{errors.documents}</Text>
        </View>
      ) : null}

      {step > 1 && (
        <View style={styles.backRow}>
          <Button label="Back" variant="ghost" onPress={() => setStep((step - 1) as Step)} />
        </View>
      )}
    </Screen>
  );
}

function StepDot({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[styles.dot, active && styles.dotActive]}>
      <Text style={[styles.dotLabel, active && styles.dotLabelActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  stepLine: { height: 2, width: 40, backgroundColor: colors.border },
  dot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotLabel: { fontSize: fontSize.small, fontWeight: '700', color: colors.textMuted },
  dotLabelActive: { color: colors.onPrimary },
  hint: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  note: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20, marginTop: spacing.md, fontStyle: 'italic' },
  fieldLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  coordinatorList: { gap: spacing.sm, marginBottom: spacing.lg },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.small },
  backRow: { marginTop: spacing.lg, alignItems: 'center' },
});
