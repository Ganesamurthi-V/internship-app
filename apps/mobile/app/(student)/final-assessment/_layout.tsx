import { Stack } from 'expo-router';
import { colors } from '@/constants/theme';

export default function FinalAssessmentLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Final Assessment' }} />
    </Stack>
  );
}
