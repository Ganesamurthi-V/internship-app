/**
 * Login screen with show/hide password and detailed error display.
 */

import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { colors, fontSize, spacing, touchTarget, radius } from '@/constants/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim()) {
      setError('Enter your email address.');
      setErrorDetail(null);
      return;
    }
    if (!password) {
      setError('Enter your password.');
      setErrorDetail(null);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorDetail(null);

    try {
      const { getSupabase } = await import('@/lib/supabase');
      const supabase = getSupabase();

      console.log('Attempting login for:', email.trim());

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        console.log('Auth error:', authError.message, authError.status);
        
        // Map Supabase error messages to user-friendly ones
        let userMessage = 'Sign in failed.';
        let detail = authError.message;

        if (authError.message.includes('Invalid login credentials')) {
          userMessage = 'Email or password is incorrect.';
          detail = 'Check your email address and try again. Passwords are case-sensitive.';
        } else if (authError.message.includes('Email not confirmed')) {
          userMessage = 'Please verify your email first.';
          detail = 'Check your inbox for a verification email from Supabase.';
        } else if (authError.message.includes('Too many requests')) {
          userMessage = 'Too many login attempts.';
          detail = 'Wait a minute and try again.';
        } else if (authError.message.includes('Network')) {
          userMessage = 'No internet connection.';
          detail = 'Check your connection and try again.';
        } else {
          userMessage = authError.message;
          detail = `Status: ${authError.status ?? 'unknown'}`;
        }

        setError(userMessage);
        setErrorDetail(detail);
        setLoading(false);
        return;
      }

      if (!data.session) {
        setError('Login succeeded but no session was returned.');
        setErrorDetail('This is unexpected. Try again.');
        setLoading(false);
        return;
      }

      console.log('Login successful! User:', data.user?.email, 'Role:', data.user?.user_metadata?.role);

      // Navigate directly to the correct dashboard based on role
      const role = data.user?.user_metadata?.role as string ?? 'student';
      switch (role) {
        case 'faculty':
        case 'admin':
          router.replace('/(faculty)/dashboard');
          break;
        case 'mentor':
          router.replace('/(mentor)/dashboard');
          break;
        default:
          router.replace('/(student)/dashboard');
      }
    } catch (err) {
      console.log('Login exception:', err);
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError('Connection error');
      setErrorDetail(message);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Internship Manager</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={(text) => { setEmail(text); setError(null); }}
            placeholder="you@smvec.ac.in"
            placeholderTextColor={colors.textFaint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={(text) => { setPassword(text); setError(null); }}
              placeholder="Your password"
              placeholderTextColor={colors.textFaint}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              accessibilityRole="button"
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              {errorDetail ? (
                <Text style={styles.errorDetail}>{errorDetail}</Text>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => void onSubmit()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} size="small" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          <View style={styles.helpBox}>
            <Text style={styles.helpText}>Demo accounts (password: Internship1)</Text>
            <Text style={styles.helpDetail}>Student: praveen@smvec.ac.in</Text>
            <Text style={styles.helpDetail}>Faculty: faculty@smvec.ac.in</Text>
            <Text style={styles.helpDetail}>Mentor: raj@iinvsys.example</Text>
          </View>

          <Pressable
            style={styles.forgotButton}
            onPress={() => router.push('/(auth)/forgot-password')}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, marginTop: spacing.xs },
  form: {},
  label: { fontSize: fontSize.small, fontWeight: '600', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  passwordInput: {
    flex: 1,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.body,
    color: colors.text,
  },
  eyeButton: {
    paddingHorizontal: spacing.md,
    minHeight: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: { fontSize: 20 },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  errorText: { color: colors.danger, fontSize: fontSize.body, fontWeight: '600' },
  errorDetail: { color: colors.danger, fontSize: fontSize.small, marginTop: 4, opacity: 0.8 },
  button: {
    minHeight: touchTarget,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.onPrimary, fontSize: fontSize.body, fontWeight: '700' },
  helpBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
  },
  helpText: { fontSize: fontSize.small, fontWeight: '600', color: colors.info, marginBottom: 4 },
  helpDetail: { fontSize: fontSize.caption, color: colors.info, marginTop: 2 },
  forgotButton: { alignItems: 'center', marginTop: spacing.lg, minHeight: touchTarget, justifyContent: 'center' },
  forgotText: { color: colors.primary, fontSize: fontSize.body },
});
