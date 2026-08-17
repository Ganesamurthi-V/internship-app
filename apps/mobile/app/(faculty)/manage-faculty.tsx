/**
 * Manage Faculty — admin only.
 *
 * Lists existing faculty with their department, and provides a form to create new
 * faculty accounts with a department assignment.
 */

import { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Department } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { useDepartments } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { Pressable, ScrollView } from 'react-native';

interface FacultyItem {
  id: string;
  email: string;
  name: string | null;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: string;
}

export default function ManageFacultyScreen() {
  const role = useAuthStore((state) => state.user?.role);

  // Only admin can access this
  if (role !== 'admin') {
    return (
      <Screen>
        <Card title="Access denied">
          <Text style={styles.muted}>Only administrators can manage faculty accounts.</Text>
        </Card>
      </Screen>
    );
  }

  return <AdminFacultyView />;
}

function AdminFacultyView() {
  const queryClient = useQueryClient();
  const { data: departments } = useDepartments();
  const { data: faculty, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['faculty'],
    queryFn: () => api.get<FacultyItem[]>('/faculty'),
    staleTime: 60 * 1000,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setName(''); setEmail(''); setPassword(''); setSelectedDept(null);
    setError(null); setFieldErrors({}); setShowForm(false);
  };

  const selectedDeptName = departments?.find((d) => d.id === selectedDept)?.name ?? null;

  const onCreate = async () => {
    setError(null); setFieldErrors({});
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Required';
    if (!email.trim()) errs.email = 'Required';
    if (!password.trim()) errs.password = 'Required';
    if (!selectedDept) errs.departmentId = 'Select a department';

    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setSubmitting(true);
    try {
      await api.post('/auth/create-faculty', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        departmentId: selectedDept,
      });

      Alert.alert('Faculty Created', `${name.trim()} can now sign in with their email and password.`);
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['faculty'] });
    } catch (caught) {
      if (caught instanceof ApiError) {
        caught.fields ? setFieldErrors(caught.fields) : setError(caught.message);
      } else { setError('Could not create faculty. Try again.'); }
    } finally { setSubmitting(false); }
  };

  return (
    <Screen refreshing={isRefetching} onRefresh={() => void refetch()}>
      <Text style={styles.title}>Faculty Management</Text>
      <Text style={styles.subtitle}>
        Create faculty accounts and assign departments. Faculty can only review students from their assigned department.
      </Text>

      {/* Create form */}
      {showForm ? (
        <Card title="New Faculty Account">
          <TextField label="Full Name" required value={name}
            onChangeText={(t) => { setName(t); setFieldErrors({}); }}
            placeholder="Dr. Name" error={fieldErrors.name} />

          <TextField label="Email" required value={email}
            onChangeText={(t) => { setEmail(t); setFieldErrors({}); }}
            placeholder="faculty@smvec.ac.in" keyboardType="email-address"
            autoCapitalize="none" error={fieldErrors.email} />

          <TextField label="Password" required value={password}
            onChangeText={(t) => { setPassword(t); setFieldErrors({}); }}
            placeholder="Min 8 characters" secureTextEntry error={fieldErrors.password} />

          {/* Department picker */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Department <Text style={styles.req}>*</Text></Text>
            <Pressable style={styles.dropdown} onPress={() => setShowDeptPicker(!showDeptPicker)}>
              <Text style={selectedDeptName ? styles.dropdownText : styles.dropdownPlaceholder} numberOfLines={1}>
                {selectedDeptName || 'Select department'}
              </Text>
              <MaterialIcons name={showDeptPicker ? 'expand-less' : 'expand-more'} size={22} color={colors.textMuted} />
            </Pressable>
            {showDeptPicker && departments ? (
              <View style={styles.dropdownList}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {departments.map((dept) => (
                    <Pressable key={dept.id} style={styles.dropdownItem}
                      onPress={() => { setSelectedDept(dept.id); setShowDeptPicker(false); setFieldErrors({}); }}>
                      <Text style={[styles.dropdownItemText, selectedDept === dept.id && styles.dropdownItemActive]}>
                        {dept.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {fieldErrors.departmentId ? <Text style={styles.fieldError}>{fieldErrors.departmentId}</Text> : null}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button label="Create Faculty" onPress={() => void onCreate()} loading={submitting} />
          <View style={{ height: spacing.sm }} />
          <Button label="Cancel" variant="secondary" onPress={resetForm} />
        </Card>
      ) : (
        <Button label="+ Add Faculty" onPress={() => setShowForm(true)} />
      )}

      {/* Faculty list */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          Existing Faculty ({faculty?.length ?? 0})
        </Text>
      </View>

      {isLoading ? (
        <Text style={styles.muted}>Loading...</Text>
      ) : faculty && faculty.length > 0 ? (
        faculty.map((f) => (
          <Card key={f.id}>
            <View style={styles.facultyRow}>
              <View style={styles.facultyIcon}>
                <MaterialIcons name="person" size={22} color={colors.primary} />
              </View>
              <View style={styles.facultyInfo}>
                <Text style={styles.facultyName}>{f.name ?? f.email}</Text>
                <Text style={styles.facultyEmail}>{f.email}</Text>
                <View style={styles.deptBadge}>
                  <MaterialIcons name="business" size={12} color={colors.primary} />
                  <Text style={styles.deptBadgeText}>{f.departmentName ?? 'No department'}</Text>
                </View>
              </View>
            </View>
          </Card>
        ))
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="group-add" size={40} color={colors.textFaint} />
          <Text style={styles.emptyTitle}>No faculty accounts yet</Text>
          <Text style={styles.emptyBody}>Create one above to get started.</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: fontSize.small, color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 19 },
  muted: { fontSize: fontSize.body, color: colors.textMuted },

  // Form
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  req: { color: colors.danger },
  fieldWrap: { marginBottom: spacing.lg },
  fieldError: { color: colors.danger, fontSize: fontSize.caption, marginTop: 4 },
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
  dropdownItem: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  dropdownItemText: { fontSize: fontSize.small, color: colors.text },
  dropdownItemActive: { color: colors.primary, fontWeight: '700' },
  errorBox: { backgroundColor: colors.dangerBg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSize.small, textAlign: 'center' },

  // List
  listHeader: { marginTop: spacing.xl, marginBottom: spacing.md },
  listTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  facultyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  facultyIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.infoBg,
    justifyContent: 'center', alignItems: 'center',
  },
  facultyInfo: { flex: 1 },
  facultyName: { fontSize: fontSize.body, fontWeight: '700', color: colors.text },
  facultyEmail: { fontSize: fontSize.caption, color: colors.textMuted, marginTop: 1 },
  deptBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 4, backgroundColor: colors.infoBg, paddingHorizontal: spacing.sm,
    paddingVertical: 2, borderRadius: radius.sm, alignSelf: 'flex-start',
  },
  deptBadgeText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '600' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: fontSize.small, color: colors.textMuted },
});
