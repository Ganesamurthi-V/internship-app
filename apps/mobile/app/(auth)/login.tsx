/**
 * Login screen.
 *
 * Signs in through the auth store, which is what every route guard reads. Calling
 * Supabase directly from here would leave the store empty and make the group
 * layouts bounce straight back to this screen.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import type { UserRole } from '@ims/shared-types';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, radius, spacing, touchTarget } from '@/constants/theme';

/** Maps a Supabase error message to something a student can act on. */
function describeError(message: string): { title: string; detail: string } {
  if (message.includes('Invalid login credentials')) {
    return {
      title: 'Email or password is incorrect.',
      detail: 'Passwords are case-sensitive. Check both and try again.',
    };
  }
  if (message.includes('Email not confirmed')) {
    return {
      title: 'Your email is not verified yet.',
      detail: 'Check your inbox for the verification link.',
    };
  }
  if (message.toLowerCase().includes('too many')) {
    return { title: 'Too many attempts.', detail: 'Wait a minute, then try again.' };
  }
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return {
      title: 'Cannot reach the server.',
      detail: 'Check your internet connection and try again.',
    };
  }
  if (message.includes('configuration missing')) {
    return {
      title: 'App is not configured.',
      detail: 'Supabase keys are missing from apps/mobile/.env',
    };
  }
  return { title: 'Sign in failed.', detail: message };
}

function routeForRole(role: UserRole): string {
  switch (role) {
    case 'faculty':
    case 'admin':
      return '/(faculty)/dashboard';
    default:
      return '/(student)/dashboard';
  }
}

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const isSigningIn = useAuthStore((state) => state.isSigningIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  const onSubmit = async (): Promise<void> => {
    if (!email.trim()) {
      setError({ title: 'Enter your email address.', detail: '' });
      return;
    }
    if (!password) {
      setError({ title: 'Enter your password.', detail: '' });
      return;
    }

    setError(null);

    try {
      // The store performs the sign-in and populates the state the guards read,
      // then hands back the role so navigation does not race React's commit.
      const role = await login(email, password);
      router.replace(routeForRole(role) as never);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not sign in.';
      setError(describeError(message));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Internship Manager</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setError(null);
          }}
          placeholder="you@smvec.ac.in"
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          accessibilityLabel="Email"
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            placeholder="Your password"
            placeholderTextColor={colors.textFaint}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void onSubmit()}
            accessibilityLabel="Password"
          />
          <Pressable
            onPress={() => setShowPassword((previous) => !previous)}
            style={styles.eyeButton}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            accessibilityState={{ selected: showPassword }}
          >
            <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.errorTitle}>{error.title}</Text>
            {error.detail ? <Text style={styles.errorDetail}>{error.detail}</Text> : null}
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            isSigningIn && styles.buttonDisabled,
          ]}
          onPress={() => void onSubmit()}
          disabled={isSigningIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          accessibilityState={{ busy: isSigningIn, disabled: isSigningIn }}
        >
          {isSigningIn ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.forgotButton}
          onPress={() => router.push('/(auth)/forgot-password')}
          accessibilityRole="button"
          accessibilityLabel="Forgot password"
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>

        {/* Development convenience. Remove before any real deployment. */}
        {__DEV__ ? (
          <View style={styles.demoBox}>
            <Text style={styles.demoTitle}>Demo accounts — password Internship1</Text>
            {[
              ['Student', 'praveen@smvec.ac.in'],
              ['Faculty', 'faculty@smvec.ac.in'],
              ['Admin', 'admin@smvec.ac.in'],
            ].map(([label, address]) => (
              <Pressable
                key={address}
                onPress={() => {
                  setEmail(address!);
                  setPassword('Internship1');
                  setError(null);
                }}
                style={styles.demoRow}
                accessibilityRole="button"
                accessibilityLabel={`Fill ${label} credentials`}
              >
                <Text style={styles.demoText}>
                  {label}: {address}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, marginTop: spacing.xs },
  label: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
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
  },
  eyeText: { fontSize: fontSize.small, fontWeight: '700', color: colors.primary },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorTitle: { color: colors.danger, fontSize: fontSize.small, fontWeight: '700' },
  errorDetail: { color: colors.danger, fontSize: fontSize.caption, marginTop: 2 },
  button: {
    minHeight: touchTarget,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.onPrimary, fontSize: fontSize.body, fontWeight: '700' },
  forgotButton: {
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: touchTarget,
    justifyContent: 'center',
  },
  forgotText: { color: colors.primary, fontSize: fontSize.body },
  demoBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
  },
  demoTitle: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.info,
    marginBottom: spacing.xs,
  },
  demoRow: { minHeight: 32, justifyContent: 'center' },
  demoText: { fontSize: fontSize.caption, color: colors.info },
});
