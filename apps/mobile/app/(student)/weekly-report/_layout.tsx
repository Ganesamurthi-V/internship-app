import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function WeeklyReportLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
      }}
    >
      <Stack.Screen name="list" options={{ title: 'Weekly Reports' }} />
      <Stack.Screen name="[week]" options={{ title: 'Weekly Report' }} />
    </Stack>
  );
}
