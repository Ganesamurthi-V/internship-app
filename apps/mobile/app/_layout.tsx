/**
 * Root layout.
 *
 * Sets up the three cross-cutting concerns from 03_TechSpec §2.1:
 *   - React Query for server state,
 *   - the offline sync engine (NetInfo listener),
 *   - notification handling and deep links.
 *
 * It also performs the session restore that drives the routing decision in
 * 06_App_Flow §2, and holds the splash screen until that is settled so the user never
 * sees a flash of the login screen before being sent to their dashboard.
 */

import { useEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { useSyncStore } from '@/stores/syncStore';
import { configureNotificationHandler } from '@/lib/notifications/register';
import { colors } from '@/constants/theme';

void SplashScreen.preventAutoHideAsync();

configureNotificationHandler();

/**
 * Query defaults tuned for a mobile client on an unreliable connection.
 *
 * `retry` skips 4xx: a 403 or a 422 will not succeed on a second attempt, and retrying
 * them just delays the error the user needs to see. Network errors do get retried.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnReconnect: true,
    },
    mutations: {
      // Mutations are never retried automatically. Attendance and work-log writes go
      // through the offline queue instead, which is idempotent by clientId; a blind
      // retry here could create a second record.
      retry: false,
    },
  },
});

/**
 * React Query's window-focus refetching assumes a browser. This maps React Native's
 * AppState to it, so returning to the app refreshes stale data.
 */
function useAppStateFocus(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);
}

/** Routes a notification tap to the screen named in its `data.screen` payload. */
function useNotificationRouting(): void {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const navigate = (data: unknown): void => {
      const screen = (data as { screen?: unknown } | null)?.screen;
      if (typeof screen === 'string' && screen.startsWith('/')) {
        // 12_Mobile_App_Spec §7 sends paths like '/(student)/attendance/today'.
        router.push(screen as never);
      }
    };

    // A notification tapped while the app was killed is delivered here on launch.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      navigate(response.notification.request.content.data);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      navigate(response.notification.request.content.data);
    });

    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const startSync = useSyncStore((state) => state.start);

  useAppStateFocus();
  useNotificationRouting();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    // Starting the engine unconditionally is safe: it no-ops without a session.
    startSync();
  }, [startSync]);

  useEffect(() => {
    if (!isBootstrapping) {
      void SplashScreen.hideAsync();
    }
  }, [isBootstrapping]);

  // Hold on the splash screen rather than rendering a layout that would immediately
  // redirect. Returning null here is what prevents the login-screen flash.
  if (isBootstrapping) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* `backgroundColor` was removed from expo-status-bar; the Android status bar
              colour comes from the theme instead. */}
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
    </GestureHandlerRootView>
  );
}
