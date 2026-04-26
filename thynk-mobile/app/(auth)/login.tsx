import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing, Radius } from '@/constants/theme';

const DEFAULT_BACKEND  = 'https://thynk-registration.vercel.app';
const DEFAULT_EMAIL    = 'success@thynksuccess.com';

// Replace these with values from Supabase dashboard → Project Settings → API
const SUPABASE_URL      = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

export default function LoginScreen() {
  const router = useRouter();
  const [backendUrl, setBackendUrl]     = useState(DEFAULT_BACKEND);
  const [email, setEmail]               = useState(DEFAULT_EMAIL);
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);

  async function handleLogin() {
    if (!password.trim()) {
      Alert.alert('Missing password', 'Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok || !data.access_token) {
        Alert.alert('Login failed', data.error_description ?? data.message ?? 'Incorrect email or password.');
        setLoading(false);
        return;
      }

      await SecureStore.setItemAsync('thynk_backend_url', backendUrl.replace(/\/$/, ''));
      await SecureStore.setItemAsync('thynk_admin_token', data.access_token);
      await SecureStore.setItemAsync('thynk_admin_email', email.trim());

      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Connection error', 'Could not reach the server.\n\n' + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>T</Text>
          </View>
          <Text style={styles.brandName}>Thynk Admin</Text>
          <Text style={styles.brandSub}>Registration Management Platform</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Backend URL</Text>
          <TextInput style={styles.input} value={backendUrl} onChangeText={setBackendUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />

          <Text style={[styles.label, { marginTop: Spacing.lg }]}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />

          <Text style={[styles.label, { marginTop: Spacing.lg }]}>Password</Text>
          <View style={styles.pwRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Enter your password"
              placeholderTextColor={Colors.textDim}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
              <Text style={{ fontSize: 18 }}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>Backend URL and email are pre-filled. Just enter your password.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: Colors.bg },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  brand:     { alignItems: 'center', marginBottom: Spacing.xxxl },
  logoBox:   { width: 72, height: 72, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md, elevation: 8 },
  logoText:  { fontSize: 36, fontWeight: '800', color: '#fff' },
  brandName: { fontSize: 26, fontWeight: '800', color: Colors.text },
  brandSub:  { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  card:      { backgroundColor: Colors.card, borderRadius: Radius.xl, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.cardBorder },
  label:     { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  input:     { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.cardBorder, color: Colors.text, fontSize: 15, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  pwRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:    { padding: 12, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.cardBorder },
  btn:       { marginTop: Spacing.xl, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', elevation: 6 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint:      { textAlign: 'center', color: Colors.textDim, fontSize: 12, marginTop: Spacing.xl },
});
