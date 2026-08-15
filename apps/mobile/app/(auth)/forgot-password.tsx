/**
 * Forgot password â€” 12_Mobile_App_Spec Â§2.
 *
 * The success message is shown whether or not the address is registered, because the
 * endpoint deliberately does not disclose that (it would be an email enumeration
 * oracle). The copy therefore says "if an account exists" rather than "email sent".
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@ims/shared-validation';
import { Screen } from '@/components/shared/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setErrorMessage] = useState<string | null>(null);

  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const email = watch('email');

  const onSubmit = async (values: ForgotPasswordInput): Promise<void> => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await api.anonymous.post('/auth/forgot-password', { email: values.email });
      setSubmitted(true);
    } catch (caught) {
      // A rate limit is the one failure worth surfacing here.
      setErrorMessage(
        caught instanceof ApiError && caught.code === 'RATE_LIMITED'
          ? caught.message
          : 'Could not send the reset link. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.body}>
            If an account exists for {email}, we have sent a link to reset your password. The link
            is valid for one hour and can be used once.
          </Text>
        </View>
        <Button label="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Reset your password</Text>
        <Text style={styles.body}>
          Enter the email address on your account and we will send you a reset link.
        </Text>
      </View>

      <TextField
        label="Email"
        required
        value={email}
        onChangeText={(text) => setValue('email', text)}
        error={errors.email?.message}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        placeholder="you@smvec.ac.in"
        returnKeyType="go"
        onSubmitEditing={handleSubmit(onSubmit)}
      />

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Button label="Send reset link" onPress={handleSubmit(onSubmit)} loading={submitting} />

      <View style={styles.footer}>
        <Button label="Back to sign in" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.xxl, marginBottom: spacing.xl },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.primary },
  body: { fontSize: fontSize.body, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 22 },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.danger, fontSize: fontSize.small },
  footer: { marginTop: spacing.lg, alignItems: 'center' },
});
