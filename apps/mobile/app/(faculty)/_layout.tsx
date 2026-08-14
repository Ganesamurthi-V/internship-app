import { Redirect, Stack } from 'expo-router';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

/**
 * Faculty group. Admins share this group: 01_PRD §3 puts the admin on the web portal,
 * so on mobile they get the faculty view, which the backend leaves unscoped for them.
 */
export default function FacultyLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  // Redirect to the concrete dashboard rather than "/" to avoid a redirect loop.
  if (role === 'student') return <Redirect href="/(student)/dashboard" />;
  if (role === 'mentor') return <Redirect href="/(mentor)/dashboard" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
      }}
    >
      <Stack.Screen name="dashboard" options={{ title: 'Faculty Dashboard' }} />
      <Stack.Screen name="students" options={{ title: 'Students' }} />
    </Stack>
  );
}
