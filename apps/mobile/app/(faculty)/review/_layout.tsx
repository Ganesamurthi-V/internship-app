import { Stack } from 'expo-router';
import { colors, motion } from '@/constants/theme';

/**
 * Review queue and its detail screen.
 *
 * A slide, because opening a submission is a genuine push: it goes forward onto the queue
 * and comes back with the header arrow or a swipe. `gestureEnabled` matters as much as the
 * animation — a screen that slides in but cannot be swiped away feels stuck.
 */
export default function ReviewLayout() {
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
