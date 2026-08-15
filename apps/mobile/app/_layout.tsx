/**
 * Root layout.
 *
 * Runs the launch-time session restore and holds the splash screen until it
 * settles, so the user never sees a flash of login before being routed to their
 * dashboard.
 *
 * Heavy native modules (SQLite, NetInfo) are loaded lazily rather than at module
 * scope — in Expo Go some of them are unavailable, and importing them eagerly here
 * took the whole app down before the first render.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

void SplashScreen.preventAutoHideAsync();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data changes at most a few times per day (attendance, work log). 5 minutes
      // means navigating between tabs serves from cache instantly rather than
      // firing a network request on every mount/focus.
      staleTime: 5 * 60 * 1000, // 5 minutes

      // Keep unmounted query data in memory for 30 minutes so returning to a
      // previously visited screen is instant without a loading spinner.
      gcTime: 30 * 60 * 1000, // 30 minutes

      // 4xx will not succeed on a retry; only retry transport failures.
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Attendance and work-log writes are idempotent by clientId and go through
      // the offline queue; a blind retry here could create a duplicate.
      retry: false,
    },
  },
});

export default function RootLayout() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const [syncStarted, setSyncStarted] = useState(false);

  useEffect(() => {
    // Never leave the user on a blank splash screen if the session check stalls.
    const timeout = setTimeout(() => {
      if (useAuthStore.getState().isBootstrapping) {
        useAuthStore.setState({ isBootstrapping: false, isAuthenticated: false, user: null });
      }
    }, 6000);

    void bootstrap().finally(() => clearTimeout(timeout));

    return () => clearTimeout(timeout);
  }, [bootstrap]);

  useEffect(() => {
    if (isBootstrapping) return;
    void SplashScreen.hideAsync();
  }, [isBootstrapping]);

  // Start the offline sync engine after the first render, and only once. It pulls
  // in SQLite and NetInfo, so a failure here must not prevent the app rendering.
  useEffect(() => {
    if (isBootstrapping || syncStarted) return;
    setSyncStarted(true);

    void (async () => {
      try {
        const { useSyncStore } = await import('@/stores/syncStore');
        useSyncStore.getState().start();
      } catch {
        // Offline support unavailable in this runtime; the app still works online.
      }
    })();
  }, [isBootstrapping, syncStarted]);

  // Splash screen is still up; rendering a tree here would only be redirected away.
  if (isBootstrapping) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.onPrimary,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(student)" options={{ headerShown: false }} />
          <Stack.Screen name="(faculty)" options={{ headerShown: false }} />
          <Stack.Screen name="(mentor)" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
