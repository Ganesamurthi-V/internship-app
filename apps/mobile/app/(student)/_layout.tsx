/**
 * Student tabs — redesigned bottom tab bar with active indicator line.
 */

import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import type { ColorValue } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, fontSize } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function StudentLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (role === 'faculty' || role === 'admin') return <Redirect href="/(faculty)/dashboard" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        /**
         * Bottom tabs swap instantly by default, which is what made moving around the app
         * feel abrupt, so they cross-fade instead.
         *
         * `fade` and not `shift`: `shift` translates the incoming scene sideways as it
         * fades. Every screen here opens with a full-bleed gradient header, and sliding
         * that block across the viewport is precisely the "transition block" artifact —
         * a coloured slab visibly travelling over the old screen. Opacity alone swaps the
         * two surfaces in place, so nothing appears to move across the screen.
         */
        animation: 'fade',
        // Keeps the app background under the animating screens, so the cross-fade never
        // passes through white.
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
          paddingTop: 8,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
        },
        tabBarIconStyle: { marginBottom: 0 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="assignment" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="history" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="answer" options={{ href: null, title: "Today's Questions" }} />
    </Tabs>
  );
}

function TabIcon({ name, color, focused }: { name: keyof typeof MaterialIcons.glyphMap; color: ColorValue; focused: boolean }) {
  return (
    <View style={tabStyles.iconWrap}>
      <MaterialIcons name={name} size={22} color={color as string} />
      {focused && <View style={tabStyles.indicator} />}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconWrap: { alignItems: 'center', position: 'relative' },
  indicator: {
    position: 'absolute',
    bottom: -8,
    width: 20,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});
