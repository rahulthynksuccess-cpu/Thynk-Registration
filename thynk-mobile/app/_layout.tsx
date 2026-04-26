import React, { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '@/constants/theme';

export default function RootLayout() {
  const [ready, setReady]   = React.useState(false);
  const router     = useRouter();
  const segments   = useSegments();
  const navigating = useRef(false);

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('thynk_admin_token');
      const url   = await SecureStore.getItemAsync('thynk_backend_url');
      const authed = !!(token && url);
      setReady(true);
      if (!authed) {
        router.replace('/(auth)/login');
      } else {
        router.replace('/(tabs)');
      }
    })();
  }, []);

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
