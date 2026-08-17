import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function StudentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Students' }} />
      <Stack.Screen name="pending" options={{ title: 'Pending Approvals' }} />
      <Stack.Screen name="[id]" options={{ title: 'Student' }} />
    </Stack>
  );
}
