/**
 * Faculty and admin tabs — redesigned bottom tab bar with active indicator line.
 */

import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import type { ColorValue } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors, fontSize } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function FacultyLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.user?.role);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (role === 'student') return <Redirect href="/(student)/dashboard" />;
  if (role === 'admin') return <Redirect href="/(admin)/dashboard" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // See the student layout: bottom tabs swap instantly by default, and the scene
        // background stops the cross-fade passing through white.
        animation: 'shift',
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
          title: 'Overview',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="grid-view" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="fact-check" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: 'Students',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="groups" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="questions"
        options={{
          title: 'Questions',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="help-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="manage-faculty"
        options={{ href: null }}
      />
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
