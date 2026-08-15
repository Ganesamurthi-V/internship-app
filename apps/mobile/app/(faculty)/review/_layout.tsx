import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function ReviewLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Review Queue' }} />
      <Stack.Screen name="[id]" options={{ title: 'Submission' }} />
    </Stack>
  );
}
