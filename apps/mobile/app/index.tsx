/**
 * Launch router — checks Supabase session and routes accordingly.
 */

import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/constants/theme';

export default function Index() {
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { getSupabase } = await import('@/lib/supabase');
        const supabase = getSupabase();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          setRoute('/(auth)/login');
          return;
        }

        // Try to get user role from metadata
        const role = session.user.user_metadata?.role as string ?? 'student';

        switch (role) {
          case 'faculty':
          case 'admin':
            setRoute('/(faculty)/dashboard');
            break;
          case 'mentor':
            setRoute('/(mentor)/dashboard');
            break;
          default:
            setRoute('/(student)/dashboard');
        }
      } catch {
        setRoute('/(auth)/login');
      }
    };

    void check();
  }, []);

  if (!route) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  return <Redirect href={route as never} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  text: { marginTop: 12, color: colors.textMuted, fontSize: 14 },
});
