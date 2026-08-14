/**
 * Login — 12_Mobile_App_Spec §2, 06_App_Flow §2.
 *
 * Email + password, with an optional biometric unlock (02_SRS §1.1, 01_PRD §5.4).
 *
 * The biometric flow is important to get right conceptually: 07_Security_and_Privacy
 * §3.2 says "App does not re-send credentials; biometric success unlocks locally stored
 * token only." So Face ID does not log the user in — it authorises reuse of the refresh
 * token already sitting in the Keychain. The password is never stored.
 */

import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@ims/shared-validation';
import { Screen } from '@/components/shared/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useAuthStore } from '@/stores/authStore';
import { tokenStore } from '@/lib/auth/tokenStore';
import { ApiError } from '@/lib/api/client';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const isSigningIn = useAuthStore((state) => state.isSigningIn);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  const [formError, setFormError] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const {
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const email = watch('email');
  const password = watch('password');

  /**
   * Offer biometric unlock only when the hardware exists, a biometric is enrolled, the
   * user opted in, and a refresh token is actually present. Any missing piece and the
   * button would be a dead end.
   */
  useEffect(() => {
    void (async () => {
      const [hasHardware, isEnrolled, optedIn, stored] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        tokenStore.isBiometricEnabled(),
        tokenStore.load(),
      ]);
      setBiometricAvailable(hasHardware && isEnrolled && optedIn && stored !== null);
    })();
  }, []);

  const onSubmit = async (values: LoginInput): Promise<void> => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      router.replace('/');
    } catch (error) {
      if (error instanceof ApiError && error.fields) {
        // Map server field errors onto the form.
        for (const [field, message] of Object.entries(error.fields)) {
          if (field === 'email' || field === 'password') {
            setError(field, { message });
          }
        }
      }
      setFormError(error instanceof Error ? error.message : 'Could not sign in.');
    }
  };

  const onBiometricUnlock = async (): Promise<void> => {
    setFormError(null);

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Internship Manager',
      // Falls back to the device PIN when biometrics fail, per 07_Security_and_Privacy §3.2.
      disableDeviceFallback: false,
      cancelLabel: 'Use password',
    });

    if (!result.success) return;

    // Success authorises reuse of the stored token; bootstrap validates it against
    // /auth/me and routes onward.
    await bootstrap();
    router.replace('/');
  };

  return (
    <Screen hideOfflineBanner>
      <View style={styles.header}>
        <Image
          source={require('../../assets/images/icon.png')}
          style={styles.logo}
          accessibilityLabel="Internship Manager"
        />
        <Text style={styles.title}>Internship Manager</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <TextField
        label="Email"
        required
        value={email}
        onChangeText={(text) => setValue('email', text, { shouldValidate: false })}
        error={errors.email?.message}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@smvec.ac.in"
        returnKeyType="next"
      />

      <TextField
        label="Password"
        required
        value={password}
        onChangeText={(text) => setValue('password', text, { shouldValidate: false })}
        error={errors.password?.message}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        placeholder="Your password"
        returnKeyType="go"
        onSubmitEditing={handleSubmit(onSubmit)}
      />

      {formError ? (
        <View style={styles.errorBox} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      ) : null}

      <Button label="Sign in" onPress={handleSubmit(onSubmit)} loading={isSigningIn} />

      {biometricAvailable ? (
        <View style={styles.biometric}>
          <Button
            label="Unlock with biometrics"
            variant="secondary"
            onPress={() => void onBiometricUnlock()}
          />
        </View>
      ) : null}

      <View style={styles.footer}>
        <Button
          label="Forgot password?"
          variant="ghost"
          onPress={() => router.push('/(auth)/forgot-password')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xl },
  logo: { width: 72, height: 72, borderRadius: 16, marginBottom: spacing.lg },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },
  subtitle: { fontSize: fontSize.body, color: colors.textMuted, marginTop: spacing.xs },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.danger, fontSize: fontSize.small, fontWeight: '500' },
  biometric: { marginTop: spacing.md },
  footer: { marginTop: spacing.lg, alignItems: 'center' },
});
