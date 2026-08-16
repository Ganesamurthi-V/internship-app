/**
 * Student registration — all 20 fields grouped into sections.
 *
 * On success the returned session is set in Supabase and the user navigates
 * directly to the student dashboard.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { AuthenticatedUser, InternshipDomain, InternshipMode } from '@ims/shared-types';
import {
  INTERNSHIP_DOMAINS,
  INTERNSHIP_DOMAIN_LABELS,
  INTERNSHIP_MODES,
  INTERNSHIP_MODE_LABELS,
} from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup, type ChipOption } from '@/components/ui/Chips';
import { api, ApiError } from '@/lib/api/client';
import { uploadFile, type PickedFile } from '@/lib/api/upload';
import { getSupabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentRegisterResponse {
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  user: AuthenticatedUser;
}

interface FormData {
  // Personal
  name: string;
  registerNumber: string;
  programme: string;
  yearSection: string;
  email: string;
  mobile: string;
  // Internship
  organisationName: string;
  organisationLocation: string;
  internshipDomain: InternshipDomain | null;
  internshipMode: InternshipMode | null;
  startDate: string;
  endDate: string;
  totalDuration: string;
  workingHoursPerDay: string;
  // Mentor
  industryMentorName: string;
  industryMentorDesignation: string;
  mentorContact: string;
  facultyCoordinator: string;
}

const INITIAL_FORM: FormData = {
  name: '',
  registerNumber: '',
  programme: '',
  yearSection: '',
  email: '',
  mobile: '',
  organisationName: '',
  organisationLocation: '',
  internshipDomain: null,
  internshipMode: null,
  startDate: '',
  endDate: '',
  totalDuration: '',
  workingHoursPerDay: '',
  industryMentorName: '',
  industryMentorDesignation: '',
  mentorContact: '',
  facultyCoordinator: '',
};

// ---------------------------------------------------------------------------
// Chip options
// ---------------------------------------------------------------------------

const domainOptions: ChipOption<InternshipDomain>[] = INTERNSHIP_DOMAINS.map((d) => ({
  value: d,
  label: INTERNSHIP_DOMAIN_LABELS[d],
}));

const modeOptions: ChipOption<InternshipMode>[] = INTERNSHIP_MODES.map((m) => ({
  value: m,
  label: INTERNSHIP_MODE_LABELS[m],
}));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudentRegisterScreen() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [offerLetter, setOfferLetter] = useState<PickedFile | null>(null);
  const [joiningLetter, setJoiningLetter] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setError(null);
  };

  // -------------------------------------------------------------------------
  // File picking
  // -------------------------------------------------------------------------

  const pickDocument = async (
    setter: (file: PickedFile | null) => void,
  ): Promise<void> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0]!;
      setter({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'application/pdf',
        size: asset.size ?? 0,
      });
    } catch {
      // User cancelled or permission denied — nothing to do.
    }
  };

  // -------------------------------------------------------------------------
  // Submission
  // -------------------------------------------------------------------------

  const onSubmit = async (): Promise<void> => {
    setFieldErrors({});
    setError(null);

    // Client-side required field check
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Student name is required.';
    if (!form.registerNumber.trim()) errors.registerNumber = 'Register number is required.';
    if (!form.programme.trim()) errors.programme = 'Programme is required.';
    if (!form.email.trim()) errors.email = 'Email is required.';
    if (!form.mobile.trim()) errors.mobile = 'Mobile number is required.';
    if (!form.organisationName.trim()) errors.organisationName = 'Organisation name is required.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);

    try {
      // Upload documents first if provided
      let offerLetterDocId: string | undefined;
      let joiningLetterDocId: string | undefined;

      if (offerLetter) {
        const doc = await uploadFile(offerLetter);
        offerLetterDocId = doc.id;
      }
      if (joiningLetter) {
        const doc = await uploadFile(joiningLetter);
        joiningLetterDocId = doc.id;
      }

      const response = await api.anonymous.post<StudentRegisterResponse>('/auth/student-register', {
        name: form.name.trim(),
        registerNumber: form.registerNumber.trim().toUpperCase(),
        programme: form.programme.trim(),
        yearSection: form.yearSection.trim() || undefined,
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile.trim(),
        organisationName: form.organisationName.trim(),
        organisationLocation: form.organisationLocation.trim() || undefined,
        internshipDomain: form.internshipDomain ?? undefined,
        internshipMode: form.internshipMode ?? undefined,
        startDate: form.startDate.trim() || undefined,
        endDate: form.endDate.trim() || undefined,
        totalDuration: form.totalDuration.trim() ? Number(form.totalDuration) : undefined,
        workingHoursPerDay: form.workingHoursPerDay.trim() ? Number(form.workingHoursPerDay) : undefined,
        industryMentorName: form.industryMentorName.trim() || undefined,
        industryMentorDesignation: form.industryMentorDesignation.trim() || undefined,
        mentorContact: form.mentorContact.trim() || undefined,
        facultyCoordinator: form.facultyCoordinator.trim() || undefined,
        offerLetterDocId,
        joiningLetterDocId,
      });

      // Set the session in Supabase client
      await getSupabase().auth.setSession({
        access_token: response.session.accessToken,
        refresh_token: response.session.refreshToken,
      });

      // Set the user in the auth store
      useAuthStore.setState({
        user: response.user,
        isAuthenticated: true,
        isSigningIn: false,
        error: null,
      });

      router.replace('/(student)/dashboard');
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.fields) {
          setFieldErrors(caught.fields);
        } else {
          setError(caught.message);
        }
      } else {
        setError('Something went wrong. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Register as a new student</Text>
      </View>

      {/* ── Personal Details ── */}
      <Text style={styles.sectionTitle}>Personal Details</Text>

      <TextField
        label="Student Name"
        required
        value={form.name}
        onChangeText={(t) => updateField('name', t)}
        placeholder="Full name"
        autoComplete="name"
        error={fieldErrors.name}
      />

      <TextField
        label="Register Number"
        required
        value={form.registerNumber}
        onChangeText={(t) => updateField('registerNumber', t)}
        placeholder="e.g. 21CS101"
        autoCapitalize="characters"
        error={fieldErrors.registerNumber}
      />

      <TextField
        label="Programme / Department"
        required
        value={form.programme}
        onChangeText={(t) => updateField('programme', t)}
        placeholder="e.g. B.Tech CSE"
        error={fieldErrors.programme}
      />

      <TextField
        label="Year & Section"
        value={form.yearSection}
        onChangeText={(t) => updateField('yearSection', t)}
        placeholder="e.g. IV - A"
        error={fieldErrors.yearSection}
      />

      <TextField
        label="Student Email ID"
        required
        value={form.email}
        onChangeText={(t) => updateField('email', t)}
        placeholder="you@smvec.ac.in"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        error={fieldErrors.email}
      />

      <TextField
        label="Mobile Number"
        required
        value={form.mobile}
        onChangeText={(t) => updateField('mobile', t)}
        placeholder="10-digit mobile"
        keyboardType="phone-pad"
        autoComplete="tel"
        error={fieldErrors.mobile}
      />

      {/* ── Internship Details ── */}
      <Text style={styles.sectionTitle}>Internship Details</Text>

      <TextField
        label="Organisation / Company Name"
        required
        value={form.organisationName}
        onChangeText={(t) => updateField('organisationName', t)}
        placeholder="Company name"
        error={fieldErrors.organisationName}
      />

      <TextField
        label="Organisation Location"
        value={form.organisationLocation}
        onChangeText={(t) => updateField('organisationLocation', t)}
        placeholder="City, State"
        error={fieldErrors.organisationLocation}
      />

      <ChipGroup<InternshipDomain>
        label="Internship Domain"
        options={domainOptions}
        value={form.internshipDomain}
        onChange={(v) => updateField('internshipDomain', v)}
        error={fieldErrors.internshipDomain}
      />

      <ChipGroup<InternshipMode>
        label="Internship Mode"
        options={modeOptions}
        value={form.internshipMode}
        onChange={(v) => updateField('internshipMode', v)}
        error={fieldErrors.internshipMode}
      />

      <TextField
        label="Internship Start Date"
        value={form.startDate}
        onChangeText={(t) => updateField('startDate', t)}
        placeholder="YYYY-MM-DD"
        error={fieldErrors.startDate}
      />

      <TextField
        label="Internship End Date"
        value={form.endDate}
        onChangeText={(t) => updateField('endDate', t)}
        placeholder="YYYY-MM-DD"
        error={fieldErrors.endDate}
      />

      <TextField
        label="Total Duration (days)"
        value={form.totalDuration}
        onChangeText={(t) => updateField('totalDuration', t)}
        placeholder="e.g. 45"
        keyboardType="numeric"
        error={fieldErrors.totalDuration}
      />

      <TextField
        label="Working Hours per Day"
        value={form.workingHoursPerDay}
        onChangeText={(t) => updateField('workingHoursPerDay', t)}
        placeholder="e.g. 8"
        keyboardType="numeric"
        error={fieldErrors.workingHoursPerDay}
      />

      {/* ── Mentor Details ── */}
      <Text style={styles.sectionTitle}>Mentor Details</Text>

      <TextField
        label="Industry Mentor Name"
        value={form.industryMentorName}
        onChangeText={(t) => updateField('industryMentorName', t)}
        placeholder="Mentor's full name"
        error={fieldErrors.industryMentorName}
      />

      <TextField
        label="Industry Mentor Designation"
        value={form.industryMentorDesignation}
        onChangeText={(t) => updateField('industryMentorDesignation', t)}
        placeholder="e.g. Senior Engineer"
        error={fieldErrors.industryMentorDesignation}
      />

      <TextField
        label="Mentor Email / Contact"
        value={form.mentorContact}
        onChangeText={(t) => updateField('mentorContact', t)}
        placeholder="Email or phone"
        keyboardType="email-address"
        autoCapitalize="none"
        error={fieldErrors.mentorContact}
      />

      <TextField
        label="College Faculty Coordinator"
        value={form.facultyCoordinator}
        onChangeText={(t) => updateField('facultyCoordinator', t)}
        placeholder="Coordinator name"
        error={fieldErrors.facultyCoordinator}
      />

      {/* ── Documents ── */}
      <Text style={styles.sectionTitle}>Documents</Text>

      <FilePickerField
        label="Internship Offer Letter (PDF)"
        file={offerLetter}
        onPick={() => pickDocument(setOfferLetter)}
        onClear={() => setOfferLetter(null)}
        error={fieldErrors.offerLetterDocId}
      />

      <FilePickerField
        label="Joining Letter / Proof (PDF)"
        file={joiningLetter}
        onPick={() => pickDocument(setJoiningLetter)}
        onClear={() => setJoiningLetter(null)}
        error={fieldErrors.joiningLetterDocId}
      />

      {/* ── Error & Submit ── */}
      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button label="Create Account" onPress={() => void onSubmit()} loading={submitting} />

      <View style={styles.footer}>
        <Button label="Back to Login" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// File Picker Field
// ---------------------------------------------------------------------------

function FilePickerField({
  label,
  file,
  onPick,
  onClear,
  error,
}: {
  label: string;
  file: PickedFile | null;
  onPick: () => void;
  onClear: () => void;
  error?: string;
}) {
  return (
    <View style={styles.fileField}>
      <Text style={styles.fileLabel}>{label}</Text>
      {file ? (
        <View style={styles.fileRow}>
          <MaterialIcons name="description" size={20} color={colors.primary} />
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}
          </Text>
          <Pressable
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label}`}
          >
            <MaterialIcons name="close" size={20} color={colors.danger} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.filePicker}
          onPress={onPick}
          accessibilityRole="button"
          accessibilityLabel={`Pick ${label}`}
        >
          <MaterialIcons name="upload-file" size={20} color={colors.primary} />
          <Text style={styles.filePickText}>Choose PDF</Text>
        </Pressable>
      )}
      {error ? (
        <View accessibilityLiveRegion="polite">
          <Text style={styles.fileError}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  header: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, marginTop: spacing.xs },
  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.danger, fontSize: fontSize.small },
  footer: { marginTop: spacing.lg, alignItems: 'center', marginBottom: spacing.xl },

  // File picker
  fileField: { marginBottom: spacing.lg },
  fileLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  filePickText: { fontSize: fontSize.body, color: colors.primary },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  fileName: { flex: 1, fontSize: fontSize.small, color: colors.text },
  fileError: { marginTop: spacing.xs, fontSize: fontSize.small, color: colors.danger },
});
