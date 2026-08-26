/**
 * Student registration — multi-step wizard with breadcrumbs.
 *
 * 4 steps:
 *   1. Personal Details
 *   2. Internship Details
 *   3. Mentor Details
 *   4. Documents & Submit
 *
 * Each step validates its own fields before allowing "Next". The breadcrumb bar
 * at the top shows progress and lets the student tap back to a completed step.
 */

import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { InternshipDomain, InternshipMode } from '@ims/shared-types';
import {
  INTERNSHIP_DOMAINS,
  INTERNSHIP_DOMAIN_LABELS,
  INTERNSHIP_MODES,
  INTERNSHIP_MODE_LABELS,
} from '@ims/shared-types';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ChipGroup, type ChipOption } from '@/components/ui/Chips';
import { api, ApiError } from '@/lib/api/client';
import { uploadFileAnonymous, type PickedFile, type PreRegistrationUpload } from '@/lib/api/upload';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

// ---------------------------------------------------------------------------
// Upload state types
// ---------------------------------------------------------------------------

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

interface FileUploadState {
  file: PickedFile;
  upload?: PreRegistrationUpload;  // set once the upload completes
  status: UploadStatus;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPARTMENTS = [
  'Electrical and Electronics Engineering',
  'Electronics and Communication Engineering',
  'Computer Science and Engineering',
  'Information Technology',
  'Instrumentation and Control Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Biomedical Engineering',
  'Mechatronics',
  'Computer Science and Business Systems',
  'Computer and Communication Engineering',
  'Artificial Intelligence and Data Science',
  'Fashion Technology',
] as const;

const YEARS = ['1', '2', '3', '4'] as const;
const STEPS = ['Personal', 'Internship', 'Mentor', 'Documents'] as const;

interface FormData {
  name: string;
  registerNumber: string;
  department: string;
  year: string;
  section: string;
  email: string;
  mobile: string;
  organisationName: string;
  organisationLocation: string;
  internshipDomain: InternshipDomain | null;
  otherDomain: string;
  internshipMode: InternshipMode | null;
  startDate: string;
  endDate: string;
  totalDuration: string;
  workingHoursPerDay: string;
  mentorName: string;
  mentorDesignation: string;
  mentorContact: string;
  facultyCoordinator: string;
}

const INITIAL: FormData = {
  name: '', registerNumber: '', department: '', year: '', section: '',
  email: '', mobile: '', organisationName: '', organisationLocation: '',
  internshipDomain: null, otherDomain: '', internshipMode: null,
  startDate: '', endDate: '', totalDuration: '', workingHoursPerDay: '',
  mentorName: '', mentorDesignation: '', mentorContact: '', facultyCoordinator: '',
};

const domainOptions: ChipOption<InternshipDomain>[] = INTERNSHIP_DOMAINS.map((d) => ({
  value: d, label: INTERNSHIP_DOMAIN_LABELS[d],
}));

const modeOptions: ChipOption<InternshipMode>[] = INTERNSHIP_MODES.map((m) => ({
  value: m, label: INTERNSHIP_MODE_LABELS[m],
}));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudentRegisterScreen() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [offerUpload, setOfferUpload] = useState<FileUploadState | null>(null);
  const [joiningUpload, setJoiningUpload] = useState<FileUploadState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Store in-flight upload promises so submit can await them
  const offerPromiseRef = useRef<Promise<PreRegistrationUpload | null> | null>(null);
  const joiningPromiseRef = useRef<Promise<PreRegistrationUpload | null> | null>(null);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setError(null);
  };

  /** Pick a PDF and immediately start uploading it in the background. */
  const pickDoc = async (
    setUploadState: (s: FileUploadState | null) => void,
    promiseRef: React.MutableRefObject<Promise<PreRegistrationUpload | null> | null>,
    fieldKey: string,
  ) => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const a = result.assets[0]!;
    const picked: PickedFile = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', size: a.size ?? 0 };

    // Clear any previous error for this field
    setFieldErrors((prev) => { const n = { ...prev }; delete n[fieldKey]; return n; });
    setError(null);

    // Show uploading state immediately
    setUploadState({ file: picked, status: 'uploading' });

    // Start background upload (no auth needed — uses the anonymous register-upload endpoint)
    const promise = uploadFileAnonymous(picked)
      .then((upload) => {
        setUploadState({ file: picked, upload, status: 'done' });
        return upload;
      })
      .catch((err) => {
        const msg = err instanceof ApiError ? err.message : 'Upload failed. Try again.';
        setUploadState({ file: picked, status: 'error', error: msg });
        return null;
      });

    promiseRef.current = promise;
  };

  const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);

  // ─── Step validation ───
  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};

    if (s === 0) {
      if (!form.name.trim()) errs.name = 'Required';
      if (!form.registerNumber.trim()) errs.registerNumber = 'Required';
      if (!form.department) errs.department = 'Required';
      if (!form.year) errs.year = 'Required';
      if (!form.section.trim()) errs.section = 'Required';
      if (!form.email.trim()) errs.email = 'Required';
      if (!form.mobile.trim()) errs.mobile = 'Required';
    } else if (s === 1) {
      if (!form.organisationName.trim()) errs.organisationName = 'Required';
      if (!form.organisationLocation.trim()) errs.organisationLocation = 'Required';
      if (!form.internshipDomain) errs.internshipDomain = 'Required';
      if (form.internshipDomain === 'other' && !form.otherDomain.trim()) errs.otherDomain = 'Specify domain';
      if (!form.internshipMode) errs.internshipMode = 'Required';
      if (!form.startDate) errs.startDate = 'Required';
      if (!form.endDate) errs.endDate = 'Required';
      if (!form.totalDuration.trim()) errs.totalDuration = 'Required';
      if (!form.workingHoursPerDay.trim()) errs.workingHoursPerDay = 'Required';
    } else if (s === 2) {
      if (!form.mentorName.trim()) errs.mentorName = 'Required';
      if (!form.mentorDesignation.trim()) errs.mentorDesignation = 'Required';
      if (!form.mentorContact.trim()) errs.mentorContact = 'Required';
      if (!form.facultyCoordinator.trim()) errs.facultyCoordinator = 'Required';
    } else if (s === 3) {
      if (!offerUpload) errs.offerLetter = 'Upload offer letter';
      if (!joiningUpload) errs.joiningLetter = 'Upload joining letter';
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return false;
    }
    setFieldErrors({});
    return true;
  };

  const goNext = () => {
    if (validateStep(step)) setStep(step + 1);
  };

  const goBack = () => {
    if (step === 0) router.back();
    else setStep(step - 1);
  };



  // ─── Submit ───
  const onSubmit = async (): Promise<void> => {
    if (!validateStep(3)) return;

    // Make sure both uploads have finished (they're likely already done)
    const stillUploading =
      offerUpload?.status === 'uploading' || joiningUpload?.status === 'uploading';
    if (stillUploading) {
      setError('Please wait — documents are still uploading…');
      return;
    }
    const hasUploadError =
      offerUpload?.status === 'error' || joiningUpload?.status === 'error';
    if (hasUploadError) {
      setError('One or more documents failed to upload. Please re-select and try again.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      // Get uploaded document metadata from state or in-flight promises
      let offerUploadResult = offerUpload?.upload ?? null;
      if (!offerUploadResult && offerPromiseRef.current) {
        offerUploadResult = await offerPromiseRef.current.catch(() => null);
      }

      let joinUploadResult = joiningUpload?.upload ?? null;
      if (!joinUploadResult && joiningPromiseRef.current) {
        joinUploadResult = await joiningPromiseRef.current.catch(() => null);
      }

      if (!offerUploadResult?.storageKey || !joinUploadResult?.storageKey) {
        setError('Document upload incomplete. Please re-select PDF files.');
        setSubmitting(false);
        return;
      }

      const domainValue = form.internshipDomain === 'other' ? form.otherDomain.trim() : form.internshipDomain;

      const res = await api.anonymous.post<{ message: string; registerNumber: string; status: string }>('/auth/student-register', {
        name: form.name.trim(),
        registerNumber: form.registerNumber.trim().toUpperCase(),
        programme: form.department,
        year: form.year ? Number(form.year) : undefined,
        section: form.section.trim().toUpperCase(),
        studentEmail: form.email.trim().toLowerCase(),
        mobile: form.mobile.trim(),
        organisationName: form.organisationName.trim(),
        organisationLocation: form.organisationLocation.trim(),
        internshipDomain: domainValue,
        internshipMode: form.internshipMode,
        startDate: form.startDate,
        endDate: form.endDate,
        durationDays: form.totalDuration ? Number(form.totalDuration) : undefined,
        workingHoursPerDay: form.workingHoursPerDay ? Number(form.workingHoursPerDay) : undefined,
        mentorName: form.mentorName.trim(),
        mentorDesignation: form.mentorDesignation.trim(),
        mentorContact: form.mentorContact.trim(),
        facultyCoordinator: form.facultyCoordinator.trim(),
        // Pass storage keys + metadata so student-register can create Document rows
        offerLetterStorageKey: offerUploadResult.storageKey,
        offerLetterFilename: offerUploadResult.filename,
        offerLetterMimeType: offerUploadResult.mimeType,
        offerLetterSizeBytes: offerUploadResult.sizeBytes,
        joiningLetterStorageKey: joinUploadResult.storageKey,
        joiningLetterFilename: joinUploadResult.filename,
        joiningLetterMimeType: joinUploadResult.mimeType,
        joiningLetterSizeBytes: joinUploadResult.sizeBytes,
      });

      // Registration successful — account is pending approval, show custom modal
      setSuccessMessage(res.message);
      setShowSuccessModal(true);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const errorMsg = (caught.fields && Object.values(caught.fields)[0]) || caught.message;
        if (caught.fields) {
          setFieldErrors(caught.fields);
        }
        setError(errorMsg);
        Alert.alert('Registration Failed', errorMsg);
      } else {
        const fallbackMsg = 'Something went wrong. Check your connection and try again.';
        setError(fallbackMsg);
        Alert.alert('Error', fallbackMsg);
      }
    } finally { setSubmitting(false); }
  };

  // ─── Render ───
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerBar}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Account</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Breadcrumbs */}
      <View style={styles.breadcrumbs}>
        {STEPS.map((label, i) => (
          <Pressable
            key={label}
            style={styles.breadcrumbItem}
            onPress={() => { if (i < step) setStep(i); }}
            disabled={i > step}
          >
            <View style={[
              styles.breadcrumbDot,
              i < step && styles.breadcrumbDotDone,
              i === step && styles.breadcrumbDotActive,
            ]}>
              {i < step ? (
                <MaterialIcons name="check" size={12} color={colors.onPrimary} />
              ) : (
                <Text style={[
                  styles.breadcrumbDotText,
                  i === step && styles.breadcrumbDotTextActive,
                ]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[
              styles.breadcrumbLabel,
              i === step && styles.breadcrumbLabelActive,
              i < step && styles.breadcrumbLabelDone,
            ]}>{label}</Text>
            {i < STEPS.length - 1 ? (
              <View style={[styles.breadcrumbLine, i < step && styles.breadcrumbLineDone]} />
            ) : null}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <View>
            <Text style={styles.stepTitle}>Personal Details</Text>

            <TextField label="Student Name" required value={form.name}
              onChangeText={(t) => set('name', t)} placeholder="Full name" error={fieldErrors.name} />

            <TextField label="Register Number" required value={form.registerNumber}
              onChangeText={(t) => set('registerNumber', t)} placeholder="e.g. 21CS101"
              autoCapitalize="characters" error={fieldErrors.registerNumber} />

            {/* Department dropdown */}
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Department <Text style={styles.req}>*</Text></Text>
              <Pressable style={styles.dropdown} onPress={() => setShowDeptPicker(!showDeptPicker)}>
                <Text style={form.department ? styles.dropdownText : styles.dropdownPlaceholder} numberOfLines={1}>
                  {form.department || 'Select department'}
                </Text>
                <MaterialIcons name={showDeptPicker ? 'expand-less' : 'expand-more'} size={22} color={colors.textMuted} />
              </Pressable>
              {showDeptPicker && (
                <View style={styles.dropdownList}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                    {DEPARTMENTS.map((dept) => (
                      <Pressable key={dept} style={styles.dropdownItem}
                        onPress={() => { set('department', dept); setShowDeptPicker(false); }}>
                        <Text style={[styles.dropdownItemText, form.department === dept && styles.dropdownItemActive]}>
                          {dept}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
              {fieldErrors.department ? <Text style={styles.fieldError}>{fieldErrors.department}</Text> : null}
            </View>

            {/* Year & Section */}
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Year <Text style={styles.req}>*</Text></Text>
                <View style={styles.yearRow}>
                  {YEARS.map((y) => (
                    <Pressable key={y} style={[styles.yearChip, form.year === y && styles.yearChipActive]}
                      onPress={() => set('year', y)}>
                      <Text style={[styles.yearChipText, form.year === y && styles.yearChipTextActive]}>{y}</Text>
                    </Pressable>
                  ))}
                </View>
                {fieldErrors.year ? <Text style={styles.fieldError}>{fieldErrors.year}</Text> : null}
              </View>
              <View style={styles.halfField}>
                <TextField label="Section" required value={form.section}
                  onChangeText={(t) => set('section', t)} placeholder="A"
                  autoCapitalize="characters" error={fieldErrors.section} />
              </View>
            </View>

            <TextField label="Student Email" required value={form.email}
              onChangeText={(t) => set('email', t)} placeholder="you@smvec.ac.in"
              keyboardType="email-address" autoCapitalize="none" error={fieldErrors.email} />

            <TextField label="Mobile Number" required value={form.mobile}
              onChangeText={(t) => set('mobile', t)} placeholder="10-digit mobile"
              keyboardType="phone-pad" error={fieldErrors.mobile} />
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Internship Details</Text>

            <TextField label="Organisation / Company" required value={form.organisationName}
              onChangeText={(t) => set('organisationName', t)} placeholder="Company name"
              error={fieldErrors.organisationName} />

            <TextField label="Organisation Location" required value={form.organisationLocation}
              onChangeText={(t) => set('organisationLocation', t)} placeholder="City, State"
              error={fieldErrors.organisationLocation} />

            <ChipGroup<InternshipDomain> label="Internship Domain *" options={domainOptions}
              value={form.internshipDomain} onChange={(v) => set('internshipDomain', v)}
              error={fieldErrors.internshipDomain} required />

            {form.internshipDomain === 'other' && (
              <TextField label="Specify Domain" required value={form.otherDomain}
                onChangeText={(t) => set('otherDomain', t)} placeholder="Your domain"
                error={fieldErrors.otherDomain} />
            )}

            <ChipGroup<InternshipMode> label="Internship Mode *" options={modeOptions}
              value={form.internshipMode} onChange={(v) => set('internshipMode', v)}
              error={fieldErrors.internshipMode} required />

            {/* Dates */}
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Start Date <Text style={styles.req}>*</Text></Text>
                <Pressable style={styles.dateBtn} onPress={() => setShowStartDate(true)}>
                  <MaterialIcons name="calendar-today" size={16} color={colors.primary} />
                  <Text style={form.startDate ? styles.dateText : styles.datePlaceholder}>
                    {form.startDate || 'Pick date'}
                  </Text>
                </Pressable>
                {showStartDate && (
                  <DateTimePicker value={form.startDate ? new Date(form.startDate) : new Date()}
                    mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={(_, d) => { setShowStartDate(Platform.OS === 'ios'); if (d) set('startDate', fmtDate(d)); }} />
                )}
                {fieldErrors.startDate ? <Text style={styles.fieldError}>{fieldErrors.startDate}</Text> : null}
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>End Date <Text style={styles.req}>*</Text></Text>
                <Pressable style={styles.dateBtn} onPress={() => setShowEndDate(true)}>
                  <MaterialIcons name="calendar-today" size={16} color={colors.primary} />
                  <Text style={form.endDate ? styles.dateText : styles.datePlaceholder}>
                    {form.endDate || 'Pick date'}
                  </Text>
                </Pressable>
                {showEndDate && (
                  <DateTimePicker value={form.endDate ? new Date(form.endDate) : new Date()}
                    mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onValueChange={(_, d) => { setShowEndDate(Platform.OS === 'ios'); if (d) set('endDate', fmtDate(d)); }} />
                )}
                {fieldErrors.endDate ? <Text style={styles.fieldError}>{fieldErrors.endDate}</Text> : null}
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <TextField label="Duration (days)" required value={form.totalDuration}
                  onChangeText={(t) => set('totalDuration', t.replace(/[^0-9]/g, ''))}
                  placeholder="45" keyboardType="numeric" error={fieldErrors.totalDuration} />
              </View>
              <View style={styles.halfField}>
                <TextField label="Hours / Day" required value={form.workingHoursPerDay}
                  onChangeText={(t) => set('workingHoursPerDay', t.replace(/[^0-9]/g, ''))}
                  placeholder="8" keyboardType="numeric" error={fieldErrors.workingHoursPerDay} />
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Mentor Details</Text>

            <TextField label="Industry Mentor Name" required value={form.mentorName}
              onChangeText={(t) => set('mentorName', t)} placeholder="Mentor's full name"
              error={fieldErrors.mentorName} />

            <TextField label="Mentor Designation" required value={form.mentorDesignation}
              onChangeText={(t) => set('mentorDesignation', t)} placeholder="e.g. Senior Engineer"
              error={fieldErrors.mentorDesignation} />

            <TextField label="Mentor Email / Contact" required value={form.mentorContact}
              onChangeText={(t) => set('mentorContact', t)} placeholder="Email or phone"
              error={fieldErrors.mentorContact} />

            <TextField label="Faculty Coordinator" required value={form.facultyCoordinator}
              onChangeText={(t) => set('facultyCoordinator', t)} placeholder="Coordinator name"
              error={fieldErrors.facultyCoordinator} />
          </View>
        )}

        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Documents</Text>
            <Text style={styles.stepSubtitle}>Upload PDF files for verification</Text>

            <FilePicker
              label="Internship Offer Letter (PDF) *"
              uploadState={offerUpload}
              onPick={() => pickDoc(setOfferUpload, offerPromiseRef, 'offerLetter')}
              onClear={() => { setOfferUpload(null); offerPromiseRef.current = null; }}
              error={fieldErrors.offerLetter}
            />

            <FilePicker
              label="Joining Letter / Proof (PDF) *"
              uploadState={joiningUpload}
              onPick={() => pickDoc(setJoiningUpload, joiningPromiseRef, 'joiningLetter')}
              onClear={() => { setJoiningUpload(null); joiningPromiseRef.current = null; }}
              error={fieldErrors.joiningLetter}
            />

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer buttons */}
      <View style={styles.footer}>
        {step > 0 && (
          <Pressable style={styles.footerBackBtn} onPress={goBack}>
            <MaterialIcons name="arrow-back" size={18} color={colors.primary} />
            <Text style={styles.footerBackText}>Back</Text>
          </Pressable>
        )}
        <View style={styles.footerSpacer} />
        {step < 3 ? (
          <Button label="Next" onPress={goNext} />
        ) : (
          <Button label="Create Account" onPress={() => void onSubmit()} loading={submitting} />
        )}
      </View>

      {/* Account Created Modal */}
      <AccountCreatedModal
        visible={showSuccessModal}
        message={successMessage}
        onClose={() => {
          setShowSuccessModal(false);
          router.replace('/(auth)/login');
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// File Picker
// ---------------------------------------------------------------------------

function FilePicker({ label, uploadState, onPick, onClear, error }: {
  label: string;
  uploadState: FileUploadState | null;
  onPick: () => void;
  onClear: () => void;
  error?: string;
}) {
  const { file, status, error: uploadError } = uploadState ?? {};

  return (
    <View style={styles.fileField}>
      <Text style={styles.fileLabel}>{label}</Text>
      {file ? (
        <View style={[
          styles.fileRow,
          status === 'error' && styles.fileRowError,
        ]}>
          {status === 'uploading' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : status === 'done' ? (
            <MaterialIcons name="check-circle" size={22} color={colors.success} />
          ) : status === 'error' ? (
            <MaterialIcons name="error" size={22} color={colors.danger} />
          ) : (
            <MaterialIcons name="description" size={22} color={colors.success} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
            {status === 'uploading' && (
              <Text style={styles.fileStatusText}>Uploading…</Text>
            )}
            {status === 'done' && (
              <Text style={[styles.fileStatusText, { color: colors.success }]}>Uploaded ✓</Text>
            )}
            {status === 'error' && (
              <Text style={[styles.fileStatusText, { color: colors.danger }]}>{uploadError}</Text>
            )}
          </View>
          {status !== 'uploading' && (
            <Pressable onPress={onClear} hitSlop={8}>
              <MaterialIcons name="close" size={20} color={colors.danger} />
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable style={styles.filePicker} onPress={onPick}>
          <MaterialIcons name="cloud-upload" size={28} color={colors.primary} />
          <Text style={styles.filePickTitle}>Tap to choose PDF</Text>
          <Text style={styles.filePickHint}>Max 10 MB</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.fileError}>{error}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary, paddingTop: 50, paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.onPrimary },

  // Breadcrumbs
  breadcrumbs: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.lg, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbDot: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surfaceAlt,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
  },
  breadcrumbDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  breadcrumbDotDone: { backgroundColor: colors.success, borderColor: colors.success },
  breadcrumbDotText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  breadcrumbDotTextActive: { color: colors.onPrimary },
  breadcrumbLabel: { fontSize: 10, color: colors.textMuted, marginLeft: 4, fontWeight: '600' },
  breadcrumbLabelActive: { color: colors.primary },
  breadcrumbLabelDone: { color: colors.success },
  breadcrumbLine: {
    width: 16, height: 2, backgroundColor: colors.border, marginHorizontal: 4, borderRadius: 1,
  },
  breadcrumbLineDone: { backgroundColor: colors.success },

  // Scroll content
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  stepTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  stepSubtitle: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: spacing.lg },

  // Fields
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  req: { color: colors.danger },
  fieldWrap: { marginBottom: spacing.lg },
  fieldError: { color: colors.danger, fontSize: fontSize.caption, marginTop: 4 },

  // Dropdown
  dropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, minHeight: 48, backgroundColor: colors.surface,
  },
  dropdownText: { fontSize: fontSize.body, color: colors.text, flex: 1 },
  dropdownPlaceholder: { fontSize: fontSize.body, color: colors.textFaint, flex: 1 },
  dropdownList: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface, marginTop: spacing.xs, overflow: 'hidden',
  },
  dropdownItem: { paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dropdownItemText: { fontSize: fontSize.small, color: colors.text },
  dropdownItemActive: { color: colors.primary, fontWeight: '700' },

  // Row
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  halfField: { flex: 1 },

  // Year
  yearRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  yearChip: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface,
  },
  yearChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  yearChipText: { fontSize: fontSize.small, fontWeight: '700', color: colors.text },
  yearChipTextActive: { color: colors.onPrimary },

  // Date
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, minHeight: 48, backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  dateText: { fontSize: fontSize.body, color: colors.text },
  datePlaceholder: { fontSize: fontSize.body, color: colors.textFaint },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  footerBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerBackText: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
  footerSpacer: { flex: 1 },

  // Error
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  errorText: { color: colors.danger, fontSize: fontSize.small, textAlign: 'center' },

  // File picker
  fileField: { marginBottom: spacing.xl },
  fileLabel: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  filePicker: {
    alignItems: 'center', gap: spacing.sm, borderWidth: 2, borderColor: colors.border,
    borderStyle: 'dashed', borderRadius: radius.lg, paddingVertical: spacing.xl,
    backgroundColor: colors.surfaceAlt,
  },
  filePickTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.primary },
  filePickHint: { fontSize: fontSize.caption, color: colors.textMuted },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.successBg, borderRadius: radius.md, padding: spacing.md,
  },
  fileRowError: { backgroundColor: colors.dangerBg },
  fileName: { fontSize: fontSize.small, color: colors.text, fontWeight: '600' },
  fileStatusText: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  fileError: { marginTop: spacing.xs, fontSize: fontSize.small, color: colors.danger },
});

// ---------------------------------------------------------------------------
// Account Created Success Modal Component
// ---------------------------------------------------------------------------

function AccountCreatedModal({
  visible,
  message,
  onClose,
}: {
  visible: boolean;
  message: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.card}>
          {/* Header illustration with sparkles */}
          <View style={modalStyles.illustrationContainer}>
            {/* Sparkles / diamonds around the checkmark */}
            <View style={[modalStyles.sparkle, { top: 12, left: 24, backgroundColor: '#FACC15', width: 9, height: 9 }]} />
            <View style={[modalStyles.sparkle, { top: 0, left: 62, backgroundColor: '#93C5FD', width: 11, height: 11 }]} />
            <View style={[modalStyles.sparkle, { top: 4, right: 62, backgroundColor: '#FB7185', width: 9, height: 9 }]} />
            <View style={[modalStyles.sparkle, { top: 14, right: 24, backgroundColor: '#34D399', width: 10, height: 10 }]} />
            <View style={[modalStyles.sparkle, { top: 46, left: 44, backgroundColor: '#F472B6', width: 8, height: 8 }]} />
            <View style={[modalStyles.sparkle, { top: 46, right: 44, backgroundColor: '#FDE047', width: 9, height: 9 }]} />
            <View style={[modalStyles.sparkle, { top: 60, left: 20, backgroundColor: '#2DD4BF', width: 8, height: 8 }]} />
            <View style={[modalStyles.sparkle, { top: 60, right: 20, backgroundColor: '#FB7185', width: 7, height: 7 }]} />

            {/* Central green checkmark badge */}
            <View style={modalStyles.circle}>
              <MaterialIcons name="check" size={42} color="#059669" />
            </View>
          </View>

          {/* Title */}
          <Text style={modalStyles.title}>Account Created!</Text>

          {/* Description */}
          <Text style={modalStyles.message}>
            {message ||
              'Account created successfully! Your profile is pending faculty approval. You will be able to log in once your department faculty approves your account.'}
          </Text>

          {/* Got it Button */}
          <Pressable style={modalStyles.button} onPress={onClose}>
            <Text style={modalStyles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  illustrationContainer: {
    width: 170,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  circle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkle: {
    position: 'absolute',
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 14.5,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    width: '100%',
    backgroundColor: colors.primaryDark,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
