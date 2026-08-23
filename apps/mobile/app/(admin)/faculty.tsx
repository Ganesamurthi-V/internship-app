/**
 * Admin Faculty Management — view all faculty, create new ones, see their departments.
 */

import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Department } from '@ims/shared-types';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { useDepartments } from '@/lib/api/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

interface FacultyItem {
  id: string;
  email: string;
  name: string | null;
  departmentId: string | null;
  departmentName: string | null;
  createdAt: string;
}

export default function AdminFacultyScreen() {
  const insets = useSafeAreaInsets();
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
      Alert.alert('Faculty Created', `${name.trim()} can now sign in.`);
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ['faculty'] });
    } catch (caught) {
      if (caught instanceof ApiError) {
        caught.fields ? setFieldErrors(caught.fields) : setError(caught.message);
      } else { setError('Could not create faculty.'); }
    } finally { setSubmitting(false); }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#2d3a8c', '#414fb8', '#5b6abf']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Faculty</Text>
            <Text style={styles.headerSubtitle}>{faculty?.length ?? 0} faculty accounts</Text>
          </View>
          <Pressable style={styles.addBtn} onPress={() => setShowForm(true)}>
            <MaterialIcons name="person-add" size={20} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={colors.primary} />}
      >
        {/* Create form */}
        {showForm && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <MaterialIcons name="person-add" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>New Faculty Account</Text>
            </View>

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
                <MaterialIcons name="error-outline" size={14} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              <Button label="Create Faculty" onPress={() => void onCreate()} loading={submitting} />
              <Button label="Cancel" variant="secondary" onPress={resetForm} />
            </View>
          </View>
        )}

        {/* Faculty list */}
        {isLoading ? (
          <Text style={styles.muted}>Loading...</Text>
        ) : faculty && faculty.length > 0 ? (
          faculty.map((f) => (
            <View key={f.id} style={styles.card}>
              <View style={styles.facultyRow}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{(f.name ?? f.email).charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.facultyName}>{f.name ?? f.email}</Text>
                  <Text style={styles.facultyEmail}>{f.email}</Text>
                </View>
              </View>
              <View style={styles.deptRow}>
                <MaterialIcons name="business" size={14} color={colors.primary} />
                <Text style={styles.deptText}>{f.departmentName ?? 'No department assigned'}</Text>
              </View>
              <Text style={styles.dateText}>Joined {new Date(f.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MaterialIcons name="group-add" size={32} color={colors.textFaint} />
            </View>
            <Text style={styles.emptyTitle}>No faculty yet</Text>
            <Text style={styles.emptyBody}>Tap + to create a faculty account.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#ffffffcc', marginTop: 3 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 100, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, ...shadow.card },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted, padding: 20 },
  facultyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatarCircle: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: colors.primary },
  facultyName: { fontSize: 15, fontWeight: '700', color: colors.text },
  facultyEmail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  deptRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eceef8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 6 },
  deptText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  dateText: { fontSize: 11, color: colors.textMuted },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  req: { color: colors.danger },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, minHeight: 48, backgroundColor: colors.background },
  dropdownText: { fontSize: 14, color: colors.text, flex: 1 },
  dropdownPlaceholder: { fontSize: 14, color: colors.textFaint, flex: 1 },
  dropdownList: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: '#fff', marginTop: 4, overflow: 'hidden' },
  dropdownItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dropdownItemText: { fontSize: 13, color: colors.text },
  dropdownItemActive: { color: colors.primary, fontWeight: '700' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  fieldError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eceef8', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted },
});
