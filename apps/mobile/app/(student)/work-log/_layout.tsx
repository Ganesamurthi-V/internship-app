import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function WorkLogLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
      }}
    >
      <Stack.Screen name="today" options={{ title: "Today's Work Log" }} />
      <Stack.Screen name="history" options={{ title: 'Work Log History' }} />
    </Stack>
  );
}
