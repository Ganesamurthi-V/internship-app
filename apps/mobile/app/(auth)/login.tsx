/**
 * Login screen — tabbed layout with Student Portal and Faculty/Admin tabs.
 *
 * Both forms live on the same screen. The active tab determines which fields show:
 *   - Student Portal: Register Number + Mobile Number
 *   - Faculty/Admin: Email + Password
 *
 * Matches the reference layout: tab bar at top, form title + subtitle below,
 * input fields with icons, and a single sign-in button.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { AuthenticatedUser } from '@ims/shared-types';
import { Screen } from '@/components/shared/Screen';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api/client';
import { getSupabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

type Tab = 'student' | 'faculty';

interface StudentLoginResponse {
  session: { accessToken: string; refreshToken: string; expiresAt: number };
  user: AuthenticatedUser;
}

export default function LoginScreen() {
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

  // ─── Student Login ───
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

  // ─── Faculty Login ───
  const onFacultyLogin = async (): Promise<void> => {
    clearError();
    if (!email.trim()) { setError('Enter your email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }

    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/(faculty)/dashboard');
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
    <Screen>
      {/* ─── App Title ─── */}
      <View style={styles.appHeader}>
        <Text style={styles.appName}>Internship Manager</Text>
      </View>

      {/* ─── Tab Bar ─── */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'student' && styles.tabActive]}
          onPress={() => { setActiveTab('student'); clearError(); }}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'student' }}
        >
          <MaterialIcons
            name="school"
            size={18}
            color={activeTab === 'student' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'student' && styles.tabTextActive]}>
            Student Portal
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'faculty' && styles.tabActive]}
          onPress={() => { setActiveTab('faculty'); clearError(); }}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'faculty' }}
        >
          <MaterialIcons
            name="admin-panel-settings"
            size={18}
            color={activeTab === 'faculty' ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.tabText, activeTab === 'faculty' && styles.tabTextActive]}>
            Faculty / Admin
          </Text>
        </Pressable>
      </View>

      {/* ─── Form Card ─── */}
      <View style={styles.formCard}>
        {activeTab === 'student' ? (
          <>
            <Text style={styles.formTitle}>Student Sign In</Text>
            <Text style={styles.formSubtitle}>
              Enter your register number and mobile number
            </Text>

            {/* Register Number */}
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

            {/* Mobile Number */}
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
            <Text style={styles.formSubtitle}>
              Enter your institutional email and password
            </Text>

            {/* Email */}
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

            {/* Password */}
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
              <Pressable
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={10}
                style={styles.eyeBtn}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility' : 'visibility-off'}
                  size={22}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </>
        )}

        {/* Error */}
        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Sign In Button */}
        <Button
          label={activeTab === 'student' ? 'Sign In' : 'Sign In'}
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
          <Pressable
            onPress={() => { setActiveTab('student'); setRegisterNumber('21CS101'); setMobile('9876543210'); }}
            style={styles.devRow}
          >
            <Text style={styles.devText}>Student: 21CS101 / 9876543210</Text>
          </Pressable>
          <Pressable
            onPress={() => { setActiveTab('faculty'); setEmail('faculty@smvec.ac.in'); setPassword('Internship1'); }}
            style={styles.devRow}
          >
            <Text style={styles.devText}>Faculty: faculty@smvec.ac.in / Internship1</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  appHeader: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.lg },
  appName: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
    backgroundColor: colors.infoBg,
  },
  tabText: { fontSize: fontSize.small, fontWeight: '600', color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  // Form card
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  formTitle: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  formSubtitle: {
    fontSize: fontSize.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },

  // Fields
  fieldLabel: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
    minHeight: 50,
  },
  inputIcon: { marginLeft: spacing.md },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
  },
  eyeBtn: { paddingHorizontal: spacing.md },

  // Error
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.danger, fontSize: fontSize.small, textAlign: 'center' },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  footerText: { fontSize: fontSize.small, color: colors.textMuted },
  footerLink: { fontSize: fontSize.small, fontWeight: '700', color: colors.primary },

  // Dev
  devBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
  },
  devTitle: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm },
  devRow: { paddingVertical: 4 },
  devText: { fontSize: fontSize.caption, color: colors.primary },
});
