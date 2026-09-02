import { Stack } from 'expo-router';
import { colors, motion } from '@/constants/theme';

/**
 * Auth screens carry their own branding, so the native header is hidden.
 *
 * These slide rather than fade, unlike the root layout: register and forgot-password are
 * pushed on top of login and come back with a gesture, so a horizontal slide describes what
 * is actually happening. `contentStyle` keeps the app background under the moving screen so
 * the slide does not reveal a white gap behind it.
 */
export default function AuthLayout() {
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
      <Stack.Screen name="login" />
      <Stack.Screen name="student-register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
