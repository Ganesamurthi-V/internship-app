/**
 * Student tab navigator — 10_Project_Setup_README structure.
 *
 * Four visible tabs matching the daily rhythm in 06_App_Flow §4: the dashboard,
 * attendance, work log, and profile. Everything else (internship registration,
 * documents, weekly reports, final assessment) lives under their own stack layouts
 * but is hidden from the tab bar — accessed via buttons on the dashboard.
 */

import { Redirect, Tabs } from 'expo-router';
import { Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, fontSize } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { SyncBadge } from '@/components/ui/SyncBadge';

export default function StudentLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (role === 'faculty' || role === 'admin') return <Redirect href="/(faculty)/dashboard" />;
  if (role === 'mentor') return <Redirect href="/(mentor)/dashboard" />;

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
      {/* Visible tabs */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="dashboard" size={size} color={color} />
          ),
          headerRight: () => <SyncBadge compact />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="check-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="work-log"
        options={{
          title: 'Work Log',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="edit-note" size={size} color={color} />
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

      {/* Hidden from tab bar — accessed via dashboard buttons */}
      <Tabs.Screen
        name="internship"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="weekly-report"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="final-assessment"
        options={{ href: null, headerShown: false }}
      />
    </Tabs>
  );
}
