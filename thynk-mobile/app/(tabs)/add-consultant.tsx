import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  SafeAreaView, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { SectionHeader } from '@/components/ui';

// ── Field / Input helpers (same pattern as create-school.tsx) ─────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}{required && <Text style={{ color: Colors.danger }}> *</Text>}</Text>
      {children}
    </View>
  );
}
const fieldStyles = StyleSheet.create({
  wrap:  { marginBottom: Spacing.md },
  label: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 },
});

function TInput({ value, onChangeText, placeholder, keyboardType, autoCapitalize, secureTextEntry }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: any; autoCapitalize?: any; secureTextEntry?: boolean;
}) {
  return (
    <TextInput
      style={inputStyles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textDim}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? 'none'}
      autoCorrect={false}
      secureTextEntry={secureTextEntry}
    />
  );
}
const inputStyles = StyleSheet.create({
  input: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.cardBorder, color: Colors.text, fontSize: 14, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
});

// ── Main screen ────────────────────────────────────────────────────
export default function AddConsultantScreen() {
  const [name,               setName]               = useState('');
  const [email,               setEmail]             = useState('');
  const [password,            setPassword]           = useState('');
  const [showPassword,        setShowPassword]       = useState(false);
  const [consultantCode,      setConsultantCode]     = useState('');
  const [mobileNumber,        setMobileNumber]       = useState('');
  const [panNumber,           setPanNumber]          = useState('');
  const [isDefaultConsultant, setIsDefaultConsultant] = useState(false);
  const [saving,              setSaving]             = useState(false);

  // Reset saving spinner every time this tab comes into focus
  useFocusEffect(
    useCallback(() => {
      setSaving(false);
      return () => {};
    }, [])
  );

  function validate(): string | null {
    if (!name.trim())            return 'Full Name is required';
    if (!email.trim())           return 'Email is required';
    if (!password.trim())        return 'Password is required';
    if (password.trim().length < 8) return 'Password must be at least 8 characters';
    if (!consultantCode.trim())  return 'Consultant Code is required';
    if (!/^[a-z0-9-]+$/.test(consultantCode.trim().toLowerCase().replace(/\s+/g, '-')))
      return 'Consultant Code: lowercase letters, digits or hyphens only';
    return null;
  }

  function resetForm() {
    setName(''); setEmail(''); setPassword(''); setConsultantCode('');
    setMobileNumber(''); setPanNumber(''); setIsDefaultConsultant(false); setSaving(false);
  }

  async function handleSave() {
    const err = validate();
    if (err) { Alert.alert('Validation Error', err); return; }

    setSaving(true);

    try {
      const SecureStore = await import('expo-secure-store');
      const token   = await SecureStore.getItemAsync('thynk_admin_token');
      const baseUrl = await SecureStore.getItemAsync('thynk_backend_url');

      if (!token || !baseUrl) {
        Alert.alert('Session Expired', 'Please log out and log back in.');
        setSaving(false);
        return;
      }

      const payload = {
        name:                   name.trim(),
        email:                  email.trim(),
        password:               password.trim(),
        consultant_code:        consultantCode.trim().toLowerCase().replace(/\s+/g, '-'),
        mobile_number:          mobileNumber.trim() || null,
        pan_number:             panNumber.trim() || null,
        is_default_consultant:  isDefaultConsultant,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/admin/consultants`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
      } finally {
        clearTimeout(timeout);
      }

      let data: any = {};
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: 'Invalid response from server' };
      }

      if (res.ok) {
        const consultantName = name.trim();
        resetForm();
        Alert.alert('✅ Consultant Added', `${consultantName} has been added successfully!`);
      } else {
        const msg = data.error ?? data.message ?? `Server error (${res.status})`;
        Alert.alert('Failed to Add Consultant', msg);
        setSaving(false);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        Alert.alert('Request Timeout', 'The server took too long to respond. Please try again.');
      } else {
        Alert.alert('Connection Error', e.message ?? 'Unknown error');
      }
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Add Consultant</Text>
          <Text style={styles.subtitle}>Onboard a new consultant to the platform</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* ── Basic Info ── */}
        <SectionHeader title="Basic Information" />
        <Field label="Full Name" required>
          <TInput value={name} onChangeText={setName} placeholder="Rahul Sharma" autoCapitalize="words" />
        </Field>
        <Field label="Consultant Code" required>
          <TInput
            value={consultantCode}
            onChangeText={v => setConsultantCode(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))}
            placeholder="e.g. tscons103"
          />
        </Field>

        {/* ── Login Credentials ── */}
        <SectionHeader title="Login Credentials" />
        <Field label="Email" required>
          <TInput value={email} onChangeText={setEmail} placeholder="consultant@example.com" keyboardType="email-address" />
        </Field>
        <Field label="Password" required>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <TInput value={password} onChangeText={setPassword} placeholder="Min 8 characters" secureTextEntry={!showPassword} />
            </View>
            <TouchableOpacity onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textDim} />
            </TouchableOpacity>
          </View>
        </Field>

        {/* ── Contact Details ── */}
        <SectionHeader title="Contact Details" />
        <Field label="Mobile Number">
          <TInput value={mobileNumber} onChangeText={setMobileNumber} placeholder="+91 98765 43210" keyboardType="phone-pad" />
        </Field>
        <Field label="PAN Number">
          <TInput value={panNumber} onChangeText={v => setPanNumber(v.toUpperCase())} placeholder="ABCDE1234F" autoCapitalize="characters" />
        </Field>

        {/* ── Settings ── */}
        <SectionHeader title="Settings" />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>⭐ Set as Default Consultant</Text>
            <Text style={styles.switchSub}>Schools from the generic link will be tagged to this consultant</Text>
          </View>
          <Switch
            value={isDefaultConsultant}
            onValueChange={setIsDefaultConsultant}
            trackColor={{ false: Colors.cardBorder, true: Colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* ── Save Button ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: Spacing.xl }}>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => {
              Alert.alert('Reset Form', 'Clear all fields?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: resetForm },
              ]);
            }}
            disabled={saving}
          >
            <Ionicons name="refresh-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.resetBtnTxt}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <><ActivityIndicator color="#fff" size="small" /><Text style={styles.saveBtnTxt}>  Adding...</Text></>
              : <>
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.saveBtnTxt}>Add Consultant</Text>
                </>
            }
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title:   { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  subtitle:{ fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  content: { padding: Spacing.xl, paddingTop: Spacing.sm },

  eyeBtn: { marginLeft: -40, padding: Spacing.sm, zIndex: 1 },

  switchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.sm },
  switchLabel:{ fontSize: 14, fontWeight: '700', color: Colors.text },
  switchSub:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  resetBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.card, borderRadius: Radius.md, paddingVertical: 16, paddingHorizontal: Spacing.xl, borderWidth: 1, borderColor: Colors.cardBorder },
  resetBtnTxt:{ color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, elevation: 6 },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
