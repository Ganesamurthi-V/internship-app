import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function InternshipLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
      }}
    >
      <Stack.Screen name="register" options={{ title: 'Register Internship' }} />
      <Stack.Screen name="documents" options={{ title: 'Documents' }} />
    </Stack>
  );
}
