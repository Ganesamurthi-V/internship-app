import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function AttendanceLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
      }}
    >
      <Stack.Screen name="today" options={{ title: 'Mark Attendance' }} />
      <Stack.Screen name="history" options={{ title: 'Attendance History' }} />
    </Stack>
  );
}
