import { Stack } from 'expo-router';
import { colors, motion } from '@/constants/theme';

/**
 * Student directory, pending approvals, and student detail.
 *
 * All three are pushes off the directory, so they slide and can be swiped back.
 */
export default function StudentsLayout() {
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
      <Stack.Screen name="pending" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
