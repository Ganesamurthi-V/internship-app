/**
 * Forgot password — redesigned with gradient header and modern styling.
 */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@ims/shared-validation';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { api, ApiError } from '@/lib/api/client';
import { colors, fontSize, shadow, spacing } from '@/constants/theme';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
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
      <View style={styles.container}>
        <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Check your email</Text>
        </LinearGradient>

        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.successIcon}>
              <MaterialIcons name="mark-email-read" size={40} color={colors.success} />
            </View>
            <Text style={styles.successTitle}>Reset link sent</Text>
            <Text style={styles.successBody}>
              If an account exists for {email}, we have sent a link to reset your password. The link
              is valid for one hour and can be used once.
            </Text>
            <Button label="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#414fb8', '#5b6abf', '#7b85d4']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Reset Password</Text>
            <Text style={styles.headerSubtitle}>We'll send a reset link to your email</Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.iconRow}>
            <MaterialIcons name="lock-reset" size={28} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>Enter your email</Text>
          <Text style={styles.cardBody}>
            Enter the email address on your account and we will send you a reset link.
          </Text>

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
            <View style={styles.errorBox}>
              <MaterialIcons name="error-outline" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button label="Send reset link" onPress={handleSubmit(onSubmit)} loading={submitting} />

          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={14} color={colors.primary} />
            <Text style={styles.backLinkText}>Back to sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 20, paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#ffffffcc', marginTop: 2 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffffff20', alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, ...shadow.card },
  iconRow: { alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 6 },
  cardBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerBg, borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { color: colors.danger, fontSize: 13, flex: 1 },
  backLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16 },
  backLinkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  successIcon: { alignItems: 'center', marginBottom: 16 },
  successTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8 },
  successBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
});
