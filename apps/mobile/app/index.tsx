/**
 * Launch router — the decision tree in 06_App_Flow §2.
 *
 *   authenticated?
 *     YES -> role check -> student | faculty | mentor | admin dashboard
 *     NO  -> login
 *
 * The root layout has already finished the session restore by the time this
 * renders, so this is a pure redirect with no loading state of its own.
 *
 * Admin routes to the faculty dashboard: 01_PRD §3 puts admins on the web portal,
 * and the backend leaves the faculty dashboard unscoped for them.
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
    case 'mentor':
      return <Redirect href="/(mentor)/dashboard" />;
    case 'student':
      return <Redirect href="/(student)/dashboard" />;
    default:
      // Authenticated but no role resolved yet — treat as student, the common case.
      return <Redirect href="/(student)/dashboard" />;
  }
}
