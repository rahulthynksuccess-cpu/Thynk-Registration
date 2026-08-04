import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  SafeAreaView, Alert, ActivityIndicator, Switch, FlatList,
  RefreshControl, Modal, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { SectionHeader, EmptyState, Badge } from '@/components/ui';
import { authFetch, fmtDate } from '@/lib/api';

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

function cleanNumber(n?: string | null) {
  return (n ?? '').replace(/[^\d+]/g, '');
}

// ── Consultant card (list mode) ─────────────────────────────────────
function ConsultantCard({ c, onPress }: { c: any; onPress: () => void }) {
  const associated = c.association_status === 'associated';
  return (
    <TouchableOpacity style={cardStyles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={cardStyles.top}>
        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarTxt}>{(c.name || c.email || '?')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={cardStyles.name} numberOfLines={1}>{c.name || '—'}</Text>
            {c.is_default_consultant && <Text style={{ fontSize: 13 }}>⭐</Text>}
          </View>
          <Text style={cardStyles.sub} numberOfLines={1}>{c.email}</Text>
        </View>
        <Badge label={associated ? 'Associated' : 'Not Associated'} variant={associated ? 'success' : 'muted'} />
      </View>
      <View style={cardStyles.metaRow}>
        {c.consultant_code && <View style={cardStyles.metaItem}><Ionicons name="pricetag-outline" size={11} color={Colors.textDim} /><Text style={cardStyles.metaTxt}>{c.consultant_code}</Text></View>}
        <View style={cardStyles.metaItem}><Ionicons name="school-outline" size={11} color={Colors.textDim} /><Text style={cardStyles.metaTxt}>{c.school_count ?? 0} schools</Text></View>
        {c.mobile_number && <View style={cardStyles.metaItem}><Ionicons name="call-outline" size={11} color={Colors.textDim} /><Text style={cardStyles.metaTxt}>{c.mobile_number}</Text></View>}
      </View>
    </TouchableOpacity>
  );
}
const cardStyles = StyleSheet.create({
  card:      { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  top:       { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatar:    { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  name:      { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub:       { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:   { fontSize: 11, color: Colors.textDim },
});

// ── Consultant profile modal (view / call / whatsapp / remark / toggle) ──
function ConsultantProfileModal({ consultant, visible, onClose, onUpdated }: {
  consultant: any; visible: boolean; onClose: () => void; onUpdated: () => void;
}) {
  const [remark, setRemark]       = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [toggling, setToggling]   = useState(false);

  useEffect(() => { setRemark(consultant?.internal_remark ?? ''); }, [consultant?.id]);

  if (!consultant) return null;
  const associated = consultant.association_status === 'associated';
  const phone = cleanNumber(consultant.mobile_number);

  async function patch(body: Record<string, any>) {
    const res = await authFetch('/api/admin/consultants', { method: 'PATCH', body: JSON.stringify({ id: consultant.id, ...body }) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      Alert.alert('Error', d.error ?? 'Update failed');
      return false;
    }
    return true;
  }

  async function handleToggleAssociation() {
    setToggling(true);
    const ok = await patch({ association_status: associated ? 'not_associated' : 'associated' });
    setToggling(false);
    if (ok) onUpdated();
  }

  async function handleSaveRemark() {
    setSavingRemark(true);
    const ok = await patch({ internal_remark: remark.trim() || null });
    setSavingRemark(false);
    if (ok) { Alert.alert('Saved', 'Internal remark updated.'); onUpdated(); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={pStyles.hdr}>
          <Text style={pStyles.hdrTitle} numberOfLines={1}>{consultant.name || '—'}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>

          {/* Quick actions: Call / WhatsApp */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: Spacing.lg }}>
            <TouchableOpacity
              disabled={!phone}
              onPress={() => Linking.openURL(`tel:${phone}`)}
              style={[pStyles.actionBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }, !phone && { opacity: 0.4 }]}>
              <Ionicons name="call" size={16} color={Colors.danger} />
              <Text style={[pStyles.actionTxt, { color: Colors.danger }]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!phone}
              onPress={() => Linking.openURL(`https://wa.me/${phone.replace(/^\+/, '')}`)}
              style={[pStyles.actionBtn, { backgroundColor: 'rgba(26,184,168,0.1)', borderColor: 'rgba(26,184,168,0.3)' }, !phone && { opacity: 0.4 }]}>
              <Ionicons name="logo-whatsapp" size={16} color="#1ab8a8" />
              <Text style={[pStyles.actionTxt, { color: '#1ab8a8' }]}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          <SectionHeader title="Profile" />
          <View style={pStyles.card}>
            {[
              ['Consultant Code', consultant.consultant_code],
              ['Email',           consultant.email],
              ['Mobile',          consultant.mobile_number],
              ['PAN',             consultant.pan_number],
              ['Schools',         String(consultant.school_count ?? 0)],
              ['Joined',          fmtDate(consultant.created_at)],
              ['Default Consultant', consultant.is_default_consultant ? 'Yes ⭐' : 'No'],
            ].map(([l, v]) => (
              <View key={String(l)} style={pStyles.row}>
                <Text style={pStyles.rowLabel}>{l}</Text>
                <Text style={pStyles.rowValue} numberOfLines={1}>{v || '—'}</Text>
              </View>
            ))}
          </View>

          <SectionHeader title="Association Status" />
          <TouchableOpacity
            onPress={handleToggleAssociation}
            disabled={toggling}
            style={[pStyles.statusBtn, { backgroundColor: associated ? 'rgba(5,150,105,0.1)' : 'rgba(100,116,139,0.1)', borderColor: associated ? 'rgba(5,150,105,0.35)' : Colors.cardBorder }]}>
            {toggling
              ? <ActivityIndicator color={associated ? '#059669' : Colors.textMuted} size="small" />
              : <Text style={[pStyles.statusTxt, { color: associated ? '#059669' : Colors.textMuted }]}>
                  {associated ? '🟢 Associated' : '⚪ Not Associated'} — tap to toggle
                </Text>
            }
          </TouchableOpacity>

          <SectionHeader title="Internal Remark" note="Admin only" />
          <TextInput
            style={pStyles.remarkInput}
            value={remark}
            onChangeText={setRemark}
            placeholder="Private notes about this consultant…"
            placeholderTextColor={Colors.textDim}
            multiline
          />
          <TouchableOpacity
            onPress={handleSaveRemark}
            disabled={savingRemark}
            style={[pStyles.saveRemarkBtn, savingRemark && { opacity: 0.6 }]}>
            {savingRemark
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={pStyles.saveRemarkTxt}>Save Remark</Text>
            }
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const pStyles = StyleSheet.create({
  hdr:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  hdrTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: Colors.text, marginRight: 12 },
  actionBtn:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.md, borderWidth: 1.5, paddingVertical: 12 },
  actionTxt:{ fontSize: 13, fontWeight: '700' },
  card:     { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.md },
  row:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  rowLabel: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  rowValue: { fontSize: 12, color: Colors.text, fontWeight: '600', flex: 2, textAlign: 'right' },
  statusBtn:{ borderRadius: Radius.md, borderWidth: 1.5, paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md },
  statusTxt:{ fontSize: 13, fontWeight: '700' },
  remarkInput: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.cardBorder, color: Colors.text, fontSize: 13, padding: Spacing.md, minHeight: 90, textAlignVertical: 'top', marginBottom: Spacing.sm },
  saveRemarkBtn: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  saveRemarkTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});

// ── List mode ─────────────────────────────────────────────────────
type AssocFilter = 'all' | 'associated' | 'not_associated';

function ConsultantListView({ onAddNew }: { onAddNew: () => void }) {
  const [consultants, setConsultants] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<AssocFilter>('all');
  const [selected, setSelected]   = useState<any>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await authFetch('/api/admin/consultants');
      if (res.ok) { const d = await res.json(); setConsultants(d.consultants ?? []); }
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const counts = {
    all: consultants.length,
    associated: consultants.filter(c => c.association_status === 'associated').length,
    not_associated: consultants.filter(c => c.association_status !== 'associated').length,
  };

  const filtered = consultants.filter(c => {
    const q = search.toLowerCase();
    const ok = !search || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.consultant_code?.toLowerCase().includes(q);
    if (!ok) return false;
    if (filter === 'associated')     return c.association_status === 'associated';
    if (filter === 'not_associated') return c.association_status !== 'associated';
    return true;
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>
        <View style={lStyles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textDim} style={{ marginRight: 8 }} />
          <TextInput style={lStyles.searchInput} placeholder="Search consultants..." placeholderTextColor={Colors.textDim} value={search} onChangeText={setSearch} />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={Colors.textDim} /></TouchableOpacity>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
          {([['all','All'],['associated','Associated'],['not_associated','Not Associated']] as [AssocFilter,string][]).map(([f,label]) => (
            <TouchableOpacity key={f} style={[lStyles.chip, filter === f && lStyles.chipOn]} onPress={() => setFilter(f)}>
              <Text style={[lStyles.chipTxt, filter === f && lStyles.chipTxtOn]}>{label} ({counts[f]})</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading
        ? <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        : <FlatList
            data={filtered}
            keyExtractor={c => c.id}
            contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.primary} />}
            ListEmptyComponent={<EmptyState icon="🤝" message="No consultants found" />}
            renderItem={({ item }) => <ConsultantCard c={item} onPress={() => setSelected(item)} />}
          />
      }

      <TouchableOpacity style={lStyles.fab} onPress={onAddNew}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <ConsultantProfileModal consultant={selected} visible={!!selected} onClose={() => setSelected(null)} onUpdated={() => { load(true); }} />
    </View>
  );
}
const lStyles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  searchInput:{ flex: 1, height: 42, color: Colors.text, fontSize: 14 },
  chip:    { paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.round, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  chipOn:  { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  chipTxt: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  chipTxtOn:{ color: Colors.primary },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});

// ── Add mode (original form) ─────────────────────────────────────
function AddConsultantForm({ onAdded }: { onAdded: () => void }) {
  const [name,               setName]               = useState('');
  const [email,               setEmail]             = useState('');
  const [password,            setPassword]           = useState('');
  const [showPassword,        setShowPassword]       = useState(false);
  const [consultantCode,      setConsultantCode]     = useState('');
  const [mobileNumber,        setMobileNumber]       = useState('');
  const [panNumber,           setPanNumber]          = useState('');
  const [isDefaultConsultant, setIsDefaultConsultant] = useState(false);
  const [isAssociated,        setIsAssociated]       = useState(false);
  const [saving,              setSaving]             = useState(false);

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
    setMobileNumber(''); setPanNumber(''); setIsDefaultConsultant(false); setIsAssociated(false); setSaving(false);
  }

  async function handleSave() {
    const err = validate();
    if (err) { Alert.alert('Validation Error', err); return; }

    setSaving(true);

    try {
      const payload = {
        name:                   name.trim(),
        email:                  email.trim(),
        password:               password.trim(),
        consultant_code:        consultantCode.trim().toLowerCase().replace(/\s+/g, '-'),
        mobile_number:          mobileNumber.trim() || null,
        pan_number:             panNumber.trim() || null,
        is_default_consultant:  isDefaultConsultant,
        association_status:     isAssociated ? 'associated' : 'not_associated',
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let res: Response;
      try {
        res = await authFetch('/api/admin/consultants', {
          method: 'POST',
          signal: controller.signal,
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
        onAdded();
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
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>🟢 Mark as Associated</Text>
          <Text style={styles.switchSub}>Defaults to Not Associated until turned on</Text>
        </View>
        <Switch
          value={isAssociated}
          onValueChange={setIsAssociated}
          trackColor={{ false: Colors.cardBorder, true: '#059669' }}
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
  );
}

// ── Main screen: List / Add toggle ────────────────────────────────
export default function ConsultantScreen() {
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Consultants</Text>
          <Text style={styles.subtitle}>{mode === 'list' ? 'Browse and manage consultants' : 'Onboard a new consultant'}</Text>
        </View>
      </View>

      <View style={styles.segmentWrap}>
        <TouchableOpacity style={[styles.segment, mode === 'list' && styles.segmentOn]} onPress={() => setMode('list')}>
          <Ionicons name="list-outline" size={16} color={mode === 'list' ? '#fff' : Colors.textMuted} />
          <Text style={[styles.segmentTxt, mode === 'list' && styles.segmentTxtOn]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segment, mode === 'add' && styles.segmentOn]} onPress={() => setMode('add')}>
          <Ionicons name="person-add-outline" size={16} color={mode === 'add' ? '#fff' : Colors.textMuted} />
          <Text style={[styles.segmentTxt, mode === 'add' && styles.segmentTxtOn]}>Add New</Text>
        </TouchableOpacity>
      </View>

      {mode === 'list'
        ? <ConsultantListView key={refreshKey} onAddNew={() => setMode('add')} />
        : <AddConsultantForm onAdded={() => { setRefreshKey(k => k + 1); setMode('list'); }} />
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.bg },
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder },
  title:   { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  subtitle:{ fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  content: { padding: Spacing.xl, paddingTop: Spacing.sm },

  segmentWrap: { flexDirection: 'row', margin: Spacing.xl, marginBottom: Spacing.sm, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, padding: 4, gap: 4 },
  segment:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: Radius.sm },
  segmentOn:   { backgroundColor: Colors.primary },
  segmentTxt:  { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  segmentTxtOn:{ color: '#fff' },

  eyeBtn: { marginLeft: -40, padding: Spacing.sm, zIndex: 1 },

  switchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.sm },
  switchLabel:{ fontSize: 14, fontWeight: '700', color: Colors.text },
  switchSub:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  resetBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.card, borderRadius: Radius.md, paddingVertical: 16, paddingHorizontal: Spacing.xl, borderWidth: 1, borderColor: Colors.cardBorder },
  resetBtnTxt:{ color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
  saveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, elevation: 6 },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
