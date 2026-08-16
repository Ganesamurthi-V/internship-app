import { Stack } from 'expo-router';

/** Auth screens carry their own branding, so the native header is hidden. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="student-register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
