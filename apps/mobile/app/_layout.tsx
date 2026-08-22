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

import { useEffect } from 'react';
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
      // A student submits once a day and a reviewer decides once per submission, so
      // 5 minutes of staleness is generous. Navigating between tabs then serves from
      // cache instead of firing a request on every mount.
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
      // No blind retries on writes. Submitting answers upserts on
      // (student, date) so a repeat is harmless, but a review decision is
      // rejected once already decided — retrying it would surface a confusing
      // "already reviewed" error instead of the original failure.
      retry: false,
    },
  },
});

export default function RootLayout() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);

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
          <Stack.Screen name="(admin)" options={{ headerShown: false }} />

        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
