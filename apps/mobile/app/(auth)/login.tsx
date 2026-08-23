/**
 * Login screen — redesigned with gradient header and modern card styling.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { AuthenticatedUser } from '@ims/shared-types';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api/client';
import { getSupabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

type Tab = 'student' | 'faculty';

interface StudentLoginResponse {
  session: { accessToken: string; refreshToken: string; expiresAt: number };
  user: AuthenticatedUser;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('student');

  // Student fields
  const [registerNumber, setRegisterNumber] = useState('');
  const [mobile, setMobile] = useState('');

  // Faculty fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Shared state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useAuthStore((state) => state.login);

  const clearError = () => setError(null);

  const onStudentLogin = async (): Promise<void> => {
    clearError();
    if (!registerNumber.trim()) { setError('Enter your register number.'); return; }
    if (!mobile.trim()) { setError('Enter your mobile number.'); return; }

    setSubmitting(true);
    try {
      const response = await api.anonymous.post<StudentLoginResponse>('/auth/student-login', {
        registerNumber: registerNumber.trim().toUpperCase(),
        mobile: mobile.trim(),
      });

      await getSupabase().auth.setSession({
        access_token: response.session.accessToken,
        refresh_token: response.session.refreshToken,
      });

      useAuthStore.setState({
        user: response.user,
        isAuthenticated: true,
        isSigningIn: false,
        error: null,
      });

      router.replace('/(student)/dashboard');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onFacultyLogin = async (): Promise<void> => {
    clearError();
    if (!email.trim()) { setError('Enter your email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }

    setSubmitting(true);
    try {
      await login(email, password);
      // Check role after login to route correctly
      const role = useAuthStore.getState().user?.role;
      if (role === 'admin') {
        router.replace('/(admin)/dashboard');
      } else {
        router.replace('/(faculty)/dashboard');
      }
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : 'Could not sign in.';
      if (msg.includes('Invalid login credentials')) {
        setError('Email or password is incorrect.');
      } else if (msg.includes('too many')) {
        setError('Too many attempts. Wait a minute.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Gradient Header */}
      <LinearGradient
        colors={['#414fb8', '#5b6abf', '#7b85d4']}
        style={[styles.header, { paddingTop: insets.top + 24 }]}
      >
        <View style={styles.logoCircle}>
          <MaterialIcons name="school" size={32} color={colors.primary} />
        </View>
        <Text style={styles.appName}>Internship Manager</Text>
        <Text style={styles.appSubtitle}>Sri Manakula Vinayagar Engineering College</Text>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Tab Bar */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, activeTab === 'student' && styles.tabActive]}
            onPress={() => { setActiveTab('student'); clearError(); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'student' }}
          >
            <MaterialIcons name="school" size={16} color={activeTab === 'student' ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === 'student' && styles.tabTextActive]}>Student</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'faculty' && styles.tabActive]}
            onPress={() => { setActiveTab('faculty'); clearError(); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'faculty' }}
          >
            <MaterialIcons name="admin-panel-settings" size={16} color={activeTab === 'faculty' ? colors.primary : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === 'faculty' && styles.tabTextActive]}>Faculty / Admin</Text>
          </Pressable>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          {activeTab === 'student' ? (
            <>
              <Text style={styles.formTitle}>Student Sign In</Text>
              <Text style={styles.formSubtitle}>Enter your register number and mobile number</Text>

              <Text style={styles.fieldLabel}>Register Number</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="badge" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={registerNumber}
                  onChangeText={(t) => { setRegisterNumber(t); clearError(); }}
                  placeholder="e.g. 21CS101"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="next"
                  accessibilityLabel="Register Number"
                />
              </View>

              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="phone" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={mobile}
                  onChangeText={(t) => { setMobile(t); clearError(); }}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                  returnKeyType="go"
                  onSubmitEditing={() => void onStudentLogin()}
                  accessibilityLabel="Mobile Number"
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Faculty / Admin Sign In</Text>
              <Text style={styles.formSubtitle}>Enter your institutional email and password</Text>

              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(t) => { setEmail(t); clearError(); }}
                  placeholder="e.g. faculty@smvec.ac.in"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  returnKeyType="next"
                  accessibilityLabel="Email"
                />
              </View>

              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputRow}>
                <MaterialIcons name="lock-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={password}
                  onChangeText={(t) => { setPassword(t); clearError(); }}
                  placeholder="Your password"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="go"
                  onSubmitEditing={() => void onFacultyLogin()}
                  accessibilityLabel="Password"
                />
                <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={10} style={styles.eyeBtn} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={22} color={colors.textMuted} />
                </Pressable>
              </View>
            </>
          )}

          {/* Error */}
          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <MaterialIcons name="error-outline" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Sign In Button */}
          <Button
            label="Sign In"
            onPress={() => void (activeTab === 'student' ? onStudentLogin() : onFacultyLogin())}
            loading={submitting}
          />

          {/* Footer links */}
          {activeTab === 'student' ? (
            <View style={styles.footer}>
              <Text style={styles.footerText}>New student?</Text>
              <Pressable onPress={() => router.push('/(auth)/student-register')}>
                <Text style={styles.footerLink}>Create Account</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.footer}>
              <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
                <Text style={styles.footerLink}>Forgot password?</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Dev credentials */}
        {__DEV__ ? (
          <View style={styles.devBox}>
            <Text style={styles.devTitle}>Dev accounts (tap to fill)</Text>
            <Pressable onPress={() => { setActiveTab('student'); setRegisterNumber('21CS101'); setMobile('9876543210'); }} style={styles.devRow}>
              <Text style={styles.devText}>Student: 21CS101 / 9876543210</Text>
            </Pressable>
            <Pressable onPress={() => { setActiveTab('faculty'); setEmail('faculty@smvec.ac.in'); setPassword('Internship1'); }} style={styles.devRow}>
              <Text style={styles.devText}>Faculty: faculty@smvec.ac.in / Internship1</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  appSubtitle: { fontSize: 12, color: '#ffffffcc', marginTop: 4 },
  content: { padding: 16, paddingBottom: 40 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    ...shadow.card,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary, backgroundColor: '#eceef8' },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  // Form card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    ...shadow.card,
  },
  formTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 4 },
  formSubtitle: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },

  // Fields
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.background,
    marginBottom: 16,
    minHeight: 48,
  },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colors.text },
  eyeBtn: { paddingHorizontal: 12 },

  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 },
  footerText: { fontSize: 13, color: colors.textMuted },
  footerLink: { fontSize: 13, fontWeight: '700', color: colors.primary },

  // Dev
  devBox: { marginTop: 20, padding: 14, backgroundColor: '#fff', borderRadius: 12, ...shadow.card },
  devTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  devRow: { paddingVertical: 5 },
  devText: { fontSize: 12, color: colors.primary },
});
