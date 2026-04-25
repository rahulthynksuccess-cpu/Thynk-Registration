import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Colors, Spacing, Radius } from '@/constants/theme';

const DEFAULT_BACKEND = 'https://thynk-registration.vercel.app';
const DEFAULT_EMAIL   = 'success@thynksuccess.com';

export default function LoginScreen() {
  const router = useRouter();
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND);
  const [email, setEmail]           = useState(DEFAULT_EMAIL);
  const [password, setPassword]     = useState('');
  const [loading, setLoading]       = useState(false);

  async function handleLogin() {
    if (!password) {
      Alert.alert('Missing password', 'Please enter your admin password.');
      return;
    }
    setLoading(true);
    try {
      const baseUrl = backendUrl.replace(/\/$/, '');

      const res = await fetch(`${baseUrl}/api/admin/schools`, {
        headers: { 'x-admin-password': password },
      });

      if (res.ok || res.status === 200) {
        await SecureStore.setItemAsync('thynk_backend_url', baseUrl);
        await SecureStore.setItemAsync('thynk_admin_token', password);
        router.replace('/(tabs)');
        return;
      }

      if (res.status === 401 || res.status === 403) {
        Alert.alert('Wrong password', 'Please check your admin password.');
        return;
      }

      // Proceed anyway if server responds
      await SecureStore.setItemAsync('thynk_backend_url', baseUrl);
      await SecureStore.setItemAsync('thynk_admin_token', password);
      router.replace('/(tabs)');

    } catch (e: any) {
      Alert.alert('Connection error', 'Could not reach the server.\n\n' + e.message);
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

        {/* Logo */}
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
            value={backendUrl}
            onChangeText={setBackendUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your admin password"
            placeholderTextColor={Colors.textDim}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Sign In</Text>
            }
          </TouchableOpacity>

        </View>

        <Text style={styles.hint}>
          Backend URL and email are pre-filled. Just enter your password.
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: Colors.bg },
  scroll:{ flexGrow: 1, justifyContent: 'center', padding: Spacing.xl },
  brand: { alignItems: 'center', marginBottom: Spacing.xxxl },
  logoBox: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary, shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
  },
  logoText:  { fontSize: 36, fontWeight: '800', color: '#fff' },
  brandName: { fontSize: 26, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  brandSub:  { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6,
  },
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
