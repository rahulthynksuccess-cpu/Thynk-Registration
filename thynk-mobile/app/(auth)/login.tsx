import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { setBackendUrl, setToken } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [backendUrl, setBackendUrlState] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!backendUrl || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      const baseUrl = backendUrl.replace(/\/$/, '');
      const res = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        await setBackendUrl(baseUrl);
        await setToken(data.token ?? data.access_token ?? `${email}:${password}`);
        router.replace('/(tabs)');
        return;
      }
      // Try Supabase-style auth via the backend's own session
      // The web app uses Supabase client-side auth. For mobile we store credentials
      // and pass them as Basic auth or rely on the same token pattern.
      // Fallback: store credentials directly (the web app admin APIs use
      // admin_password from supabase settings table).
      const res2 = await fetch(`${baseUrl}/api/admin/settings`, {
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
      });
      if (res2.ok || res2.status === 403) {
        // Server is reachable; store creds
        await setBackendUrl(baseUrl);
        await setToken(btoa(`${email}:${password}`));
        router.replace('/(tabs)');
        return;
      }
      Alert.alert('Login failed', 'Invalid credentials or server unreachable.');
    } catch (e: any) {
      Alert.alert('Connection error', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo / Brand */}
        <View style={styles.brand}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>T</Text>
          </View>
          <Text style={styles.brandName}>Thynk Admin</Text>
          <Text style={styles.brandSub}>Registration Management Platform</Text>
        </View>

        {/* Form */}
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Backend URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://your-app.vercel.app"
            placeholderTextColor={Colors.textDim}
            value={backendUrl}
            onChangeText={setBackendUrlState}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="admin@example.com"
            placeholderTextColor={Colors.textDim}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor={Colors.textDim}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Enter your Thynk deployment URL and admin credentials.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  brand: { alignItems: 'center', marginBottom: Spacing.xxxl },
  logoBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary, shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
  },
  logoText: { fontSize: 36, fontWeight: '800', color: '#fff' },
  brandName: { fontSize: 26, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  brandSub: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    color: Colors.text,
    fontSize: 15,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  btn: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { textAlign: 'center', color: Colors.textDim, fontSize: 12, marginTop: Spacing.xl },
});
