import { Redirect, Stack } from 'expo-router';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function MentorLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  // Redirect to the concrete dashboard rather than "/" to avoid a redirect loop.
  if (role === 'student') return <Redirect href="/(student)/dashboard" />;
  if (role === 'faculty' || role === 'admin') return <Redirect href="/(faculty)/dashboard" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
      }}
    >
      <Stack.Screen name="dashboard" options={{ title: 'Mentor Dashboard' }} />
      <Stack.Screen name="evaluation/[internshipId]" options={{ title: 'Evaluation' }} />
    </Stack>
  );
}
