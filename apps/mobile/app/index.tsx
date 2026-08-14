/**
 * Launch router — implements the decision tree in 06_App_Flow §2.
 *
 *   Token valid?
 *     YES -> role check -> student | faculty | mentor | admin dashboard
 *     NO  -> login
 *
 * The session restore has already finished by the time this renders (the root layout
 * holds the splash screen until then), so this is a pure redirect with no loading state
 * of its own.
 *
 * Admin is routed to the faculty dashboard. 01_PRD §3 puts the admin on "Web
 * (mobile-accessible)", so the mobile app gives an admin the faculty view rather than
 * a stub — the faculty dashboard is unscoped for admins server-side anyway.
 */

import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  if (!isAuthenticated || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  switch (user.role) {
    case 'student':
      return <Redirect href="/(student)/dashboard" />;
    case 'faculty':
    case 'admin':
      return <Redirect href="/(faculty)/dashboard" />;
    case 'mentor':
      return <Redirect href="/(mentor)/dashboard" />;
    default:
      return <Redirect href="/(auth)/login" />;
  }
}
