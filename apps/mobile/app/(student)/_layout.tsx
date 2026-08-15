/**
 * Student tabs.
 *
 * Three tabs for three things a student does: answer today's questions, look at
 * their history, and check their profile. Anything not in that list does not get a
 * tab.
 *
 * The role guard sits here rather than in each screen, so an unauthenticated or
 * non-student caller is redirected once at the group boundary.
 */

import { Redirect, Tabs } from 'expo-router';
import { Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, fontSize } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function StudentLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  // Redirect to the concrete dashboard, not "/", which would bounce back through
  // the launch router and can loop if role and group ever disagree.
  if (role === 'faculty' || role === 'admin') return <Redirect href="/(faculty)/dashboard" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: '600' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.caption, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 88 : 60,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="assignment" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="history" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />

      {/* Pushed from the dashboard, so it gets no tab of its own. */}
      <Tabs.Screen name="answer" options={{ href: null, title: "Today's Questions" }} />
    </Tabs>
  );
}
