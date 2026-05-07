import React, { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '@/constants/theme';

// ⚠️ Replace with your Supabase credentials (same as login.tsx)
const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

async function tryRefreshToken(): Promise<void> {
  try {
    const refresh = await SecureStore.getItemAsync('thynk_refresh_token');
    if (!refresh) return;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.access_token)  await SecureStore.setItemAsync('thynk_admin_token', data.access_token);
    if (data.refresh_token) await SecureStore.setItemAsync('thynk_refresh_token', data.refresh_token);
  } catch {}
}

export default function RootLayout() {
  const [ready, setReady] = React.useState(false);
  const router     = useRouter();
  const segments   = useSegments();
  const navigating = useRef(false);

  // On app open — check auth then go to correct screen
  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('thynk_admin_token');
      const url   = await SecureStore.getItemAsync('thynk_backend_url');
      const authed = !!(token && url);
      setReady(true);
      if (authed) {
        tryRefreshToken(); // silent background refresh
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/login');
      }
    })();
  }, []);

  // Guard: redirect if token disappears
  useEffect(() => {
    if (!ready || navigating.current) return;
    const inAuth = segments[0] === '(auth)';
    (async () => {
      const token    = await SecureStore.getItemAsync('thynk_admin_token');
      const url      = await SecureStore.getItemAsync('thynk_backend_url');
      const isAuthed = !!(token && url);
      if (!isAuthed && !inAuth) {
        navigating.current = true;
        router.replace('/(auth)/login');
        setTimeout(() => { navigating.current = false; }, 500);
      } else if (isAuthed && inAuth) {
        navigating.current = true;
        router.replace('/(tabs)');
        setTimeout(() => { navigating.current = false; }, 500);
      }
    })();
  }, [ready, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </GestureHandlerRootView>
  );
}
