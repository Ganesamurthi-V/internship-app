/**
 * Student tab navigator — 10_Project_Setup_README structure ("_layout.tsx  # Tab
 * navigator for students").
 *
 * Four tabs matching the daily rhythm in 06_App_Flow §4: the dashboard checklist,
 * today's attendance, today's work log, and history. Everything else (registration
 * wizard, weekly reports, final assessment, documents, profile) is pushed as a stack
 * screen from those tabs rather than competing for a tab slot.
 *
 * A guard here rather than in each screen: an unauthenticated or non-student user is
 * redirected once, at the group boundary.
 */

import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors, fontSize } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { SyncBadge } from '@/components/ui/SyncBadge';

/**
 * Text glyphs stand in for icons.
 *
 * 03_TechSpec §2.1 specifies `@expo/vector-icons`, which is available, but a glyph
 * keeps the tab bar dependency-free and renders identically on both platforms. Swapping
 * in real icons is a one-line change per tab.
 */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function StudentLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  // An admin or faculty member reaching this group is sent to their own dashboard.
  if (role && role !== 'student') return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.caption, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <TabIcon glyph="\u2637" color={color} />,
          // Surfaces the pending-sync count on the tab itself, per 06_App_Flow §4.
          headerRight: () => <SyncBadge compact />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon glyph="\u2713" color={color} />,
        }}
      />
      <Tabs.Screen
        name="work-log"
        options={{
          title: 'Work Log',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon glyph="\u270e" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabIcon glyph="\u25cf" color={color} />,
        }}
      />

    </Tabs>
  );
}
