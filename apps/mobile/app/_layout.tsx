/**
 * Root layout — simplified to avoid crashes on load.
 *
 * Heavy modules (sync engine, notifications, SQLite) are loaded lazily after the
 * initial render, so a missing native module doesn't crash the splash screen.
 */

import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Dynamically import to avoid crashes if native modules aren't available
        const { getSupabase } = await import('@/lib/supabase');
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();

        if (!cancelled) {
          setIsAuthenticated(session !== null);
        }
      } catch (error) {
        console.log('Bootstrap error:', error);
        if (!cancelled) {
          setIsAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setIsReady(true);
          void SplashScreen.hideAsync();
        }
      }
    };

    // Safety timeout — never stay stuck on splash
    const timeout = setTimeout(() => {
      if (!cancelled && !isReady) {
        setIsReady(true);
        setIsAuthenticated(false);
        void SplashScreen.hideAsync();
      }
    }, 4000);

    void init();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  if (!isReady) {
    return null; // Splash screen is still showing
  }

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
