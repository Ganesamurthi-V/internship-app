/**
 * Student profile — 12_Mobile_App_Spec §2.
 *
 * Read-only view of the academic record plus sign-out.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/shared/Screen';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useMyProfile } from '@/lib/api/hooks';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const { data, isLoading } = useMyProfile();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

  const [signingOut, setSigningOut] = useState(false);

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
  spacer: { height: spacing.md },
});
