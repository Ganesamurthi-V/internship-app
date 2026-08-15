/**
 * Launch router.
 *
 *   authenticated?
 *     YES -> role check -> student | faculty dashboard
 *     NO  -> login
 *
 * The root layout has already finished the session restore by the time this renders,
 * so this is a pure redirect with no loading state of its own.
 *
 * Admin routes to the faculty dashboard: the capabilities are identical and only the
 * data scope differs, which the backend already handles.
 */

import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  switch (role) {
    case 'faculty':
    case 'admin':
      return <Redirect href="/(faculty)/dashboard" />;
    case 'student':
      return <Redirect href="/(student)/dashboard" />;
    default:
      // Authenticated but no role resolved yet — treat as student, the common case.
      return <Redirect href="/(student)/dashboard" />;
  }
}
