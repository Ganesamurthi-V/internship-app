import { Stack } from 'expo-router';
import { colors, motion } from '@/constants/theme';

/** Student directory and detail. A push, so it slides and can be swiped back. */
export default function AdminStudentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
        animationDuration: motion.push,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
