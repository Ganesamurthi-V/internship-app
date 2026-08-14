/**
 * Student profile — 12_Mobile_App_Spec §2.
 *
 * Read-only view of the academic record plus the sign-out and biometric controls.
 * The register number is deliberately not editable: it is the master key for the
 * student record (01_PRD §1), and `updateStudentProfileSchema` omits it server-side.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useMyProfile } from '@/lib/api/hooks';
import { tokenStore } from '@/lib/auth/tokenStore';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, spacing, touchTarget } from '@/constants/theme';

export default function ProfileScreen() {
  const { data, isLoading } = useMyProfile();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    void (async () => {
      const [hasHardware, isEnrolled, enabled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        tokenStore.isBiometricEnabled(),
      ]);
      setBiometricSupported(hasHardware && isEnrolled);
      setBiometricEnabled(enabled);
    })();
  }, []);

  const toggleBiometric = async (next: boolean): Promise<void> => {
    if (next) {
      // Confirm the user can actually pass the check before promising it at next launch.
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm to enable biometric unlock',
      });
      if (!result.success) return;
    }
    await tokenStore.setBiometricEnabled(next);
    setBiometricEnabled(next);
  };

  const onSignOut = async (): Promise<void> => {
    setSigningOut(true);
    await logout();
    router.replace('/(auth)/login');
  };

  const student = data?.value;

  return (
    <Screen>
      <Card title={student?.name ?? user?.name ?? 'Profile'} subtitle={user?.email}>
        {isLoading && !student ? (
          <Text style={styles.muted}>Loading\u2026</Text>
        ) : student ? (
          <View style={styles.facts}>
            <Row label="Register number" value={student.registerNumber} />
            <Row label="Programme" value={student.programme} />
            <Row label="Department" value={student.department?.name ?? '\u2014'} />
            <Row label="Year" value={student.year !== null ? String(student.year) : '\u2014'} />
            <Row label="Section" value={student.section ?? '\u2014'} />
            <Row label="Email" value={student.studentEmail} />
            <Row label="Mobile" value={student.mobile ?? '\u2014'} />
          </View>
        ) : (
          <Text style={styles.muted}>Could not load your profile.</Text>
        )}
      </Card>

      {biometricSupported ? (
        <Card title="Security">
          <View style={styles.switchRow}>
            <View style={styles.switchLabel}>
              <Text style={styles.switchTitle}>Biometric unlock</Text>
              <Text style={styles.muted}>
                Use Face ID, Touch ID or your fingerprint to unlock the app instead of typing your
                password.
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={(next) => void toggleBiometric(next)}
              accessibilityLabel="Biometric unlock"
              accessibilityRole="switch"
              trackColor={{ true: colors.primary, false: colors.borderStrong }}
            />
          </View>
        </Card>
      ) : null}

      <Card title="Account">
        <Text style={styles.muted}>
          Signing out removes your saved login and clears any drafts stored on this device. Sync
          anything pending first.
        </Text>
        <View style={styles.spacer} />
        <Button
          label="Sign out"
          variant="danger"
          onPress={() => void onSignOut()}
          loading={signingOut}
        />
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: fontSize.small, color: colors.textMuted, lineHeight: 20 },
  facts: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { fontSize: fontSize.small, color: colors.textMuted, flexShrink: 0 },
  rowValue: { fontSize: fontSize.small, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget },
  switchLabel: { flex: 1, gap: 2 },
  switchTitle: { fontSize: fontSize.body, fontWeight: '600', color: colors.text },
  spacer: { height: spacing.md },
});
