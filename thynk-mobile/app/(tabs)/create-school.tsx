import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  SafeAreaView, Alert, ActivityIndicator, Modal, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authFetch } from '@/lib/api';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { SectionHeader } from '@/components/ui';

// ── Types ─────────────────────────────────────────────────────────
interface Program { id: string; name: string; slug: string; base_amount_inr?: number; base_amount_usd?: number; base_amount?: number; currency?: string; status: string; }
interface Contact { name: string; designation: string; email: string; mobile: string; }

// ── Input component ───────────────────────────────────────────────
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

function TInput({ value, onChangeText, placeholder, keyboardType, autoCapitalize, multiline, numberOfLines, editable = true }: {
  value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: any; autoCapitalize?: any; multiline?: boolean; numberOfLines?: number; editable?: boolean;
}) {
  return (
    <TextInput
      style={[inputStyles.input, multiline && { height: 80, textAlignVertical: 'top' }, !editable && { opacity: 0.5 }]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textDim}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize ?? 'none'}
      autoCorrect={false}
      multiline={multiline}
      numberOfLines={numberOfLines}
      editable={editable}
    />
  );
}
const inputStyles = StyleSheet.create({
  input: { backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1.5, borderColor: Colors.cardBorder, color: Colors.text, fontSize: 14, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
});

// ── Picker modal ──────────────────────────────────────────────────
function PickerModal({ visible, title, options, selected, onSelect, onClose }: {
  visible: boolean; title: string; options: string[]; selected: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text }}>{title}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView>
          {options.map(opt => (
            <TouchableOpacity
              key={opt}
              style={{ flexDirection: 'row', alignItems: 'center', padding: Spacing.xl, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, backgroundColor: selected === opt ? Colors.primaryBg : 'transparent' }}
              onPress={() => { onSelect(opt); onClose(); }}
            >
              {selected === opt && <Ionicons name="checkmark" size={18} color={Colors.primary} style={{ marginRight: 10 }} />}
              <Text style={{ fontSize: 15, color: selected === opt ? Colors.primary : Colors.text, fontWeight: selected === opt ? '700' : '400' }}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PickerField({ label, required, value, placeholder, options, onSelect }: {
  label: string; required?: boolean; value: string; placeholder: string; options: string[]; onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Field label={label} required={required}>
        <TouchableOpacity
          style={[inputStyles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
          onPress={() => setOpen(true)}
        >
          <Text style={{ color: value ? Colors.text : Colors.textDim, fontSize: 14 }}>{value || placeholder}</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.textDim} />
        </TouchableOpacity>
      </Field>
      <PickerModal visible={open} title={label} options={options} selected={value} onSelect={onSelect} onClose={() => setOpen(false)} />
    </>
  );
}

// ── Contact person form ────────────────────────────────────────────
function ContactForm({ index, contact, onChange, onRemove, canRemove }: {
  index: number; contact: Contact; onChange: (c: Contact) => void; onRemove: () => void; canRemove: boolean;
}) {
  const set = (k: keyof Contact) => (v: string) => onChange({ ...contact, [k]: v });
  return (
    <View style={contactStyles.card}>
      <View style={contactStyles.header}>
        <Text style={contactStyles.title}>Contact {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity onPress={onRemove}>
            <Ionicons name="close-circle" size={20} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>
      <Field label="Name" required><TInput value={contact.name} onChangeText={set('name')} placeholder="Full Name" autoCapitalize="words" /></Field>
      <Field label="Designation" required><TInput value={contact.designation} onChangeText={set('designation')} placeholder="Principal / Coordinator" autoCapitalize="words" /></Field>
      <Field label="Email" required><TInput value={contact.email} onChangeText={set('email')} placeholder="contact@school.edu" keyboardType="email-address" /></Field>
      <Field label="Mobile" required><TInput value={contact.mobile} onChangeText={set('mobile')} placeholder="+91 98765 43210" keyboardType="phone-pad" /></Field>
    </View>
  );
}
const contactStyles = StyleSheet.create({
  card:   { backgroundColor: Colors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title:  { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const fmtR = (p: number) => (p / 100).toLocaleString('en-IN');

// ── Main screen ────────────────────────────────────────────────────
export default function CreateSchoolScreen() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [states, setStates]     = useState<string[]>([]);
  const [cities, setCities]     = useState<string[]>([]);
  const [saving, setSaving]     = useState(false);
  const [loadingLoc, setLoadingLoc] = useState(false);
  const [success, setSuccess]   = useState(false);

  // Form state
  const [schoolCode,   setSchoolCode]   = useState('');
  const [name,         setName]         = useState('');
  const [orgName,      setOrgName]      = useState('');
  const [address,      setAddress]      = useState('');
  const [pinCode,      setPinCode]      = useState('');
  const [country,      setCountry]      = useState('India');
  const [state,        setState_]       = useState('');
  const [city,         setCity]         = useState('');
  const [projectId,    setProjectId]    = useState('');
  const [schoolPrice,  setSchoolPrice]  = useState('');
  const [currency,     setCurrency]     = useState('INR');
  const [discountCode, setDiscountCode] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#4f46e5');
  const [isActive,     setIsActive]     = useState(true);
  const [isRegActive,  setIsRegActive]  = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([{ name: '', designation: '', email: '', mobile: '' }]);

  // Load programs
  const loadPrograms = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/projects');
      if (res.ok) {
        const d = await res.json();
        setPrograms((d.projects ?? []).filter((p: Program) => p.status === 'active'));
      }
    } catch {}
  }, []);

  // Load countries
  const loadCountries = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/location?type=countries');
      if (res.ok) {
        const d = await res.json();
        if (d.countries?.length) setCountries(d.countries);
        else setCountries(['India', 'United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Singapore', 'Malaysia']);
      }
    } catch {
      setCountries(['India', 'United Arab Emirates', 'Saudi Arabia', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Singapore', 'Malaysia']);
    }
  }, []);

  // Load states when country changes
  useEffect(() => {
    if (!country) return;
    setState_(''); setCity(''); setStates([]); setCities([]);
    setLoadingLoc(true);
    authFetch(`/api/admin/location?type=states&country=${encodeURIComponent(country)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setStates(d?.states ?? []); })
      .catch(() => {})
      .finally(() => setLoadingLoc(false));
  }, [country]);

  // Load cities when state changes
  useEffect(() => {
    if (!country || !state) { setCities([]); return; }
    setCity('');
    authFetch(`/api/admin/location?type=cities&country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setCities(d?.cities ?? []); })
      .catch(() => {});
  }, [country, state]);

  useEffect(() => { loadPrograms(); loadCountries(); }, []);

  // Auto-set currency based on country
  useEffect(() => {
    setCurrency(country === 'India' ? 'INR' : 'USD');
  }, [country]);

  // Auto-set discount code from school code
  useEffect(() => {
    setDiscountCode(schoolCode.toUpperCase());
  }, [schoolCode]);

  // Auto-set price from selected program
  useEffect(() => {
    const prog = programs.find(p => p.id === projectId);
    if (!prog) return;
    if (country === 'India') {
      const inr = prog.base_amount_inr ?? (prog.currency === 'INR' ? prog.base_amount : null);
      if (inr) setSchoolPrice(String(inr / 100));
    } else {
      const usd = prog.base_amount_usd ?? (prog.currency === 'USD' ? prog.base_amount : null);
      if (usd) setSchoolPrice(String(usd / 100));
    }
  }, [projectId, country, programs]);

  const selectedProgram = programs.find(p => p.id === projectId);
  const regUrl = selectedProgram
    ? `https://thynksuccess.com/registration/${selectedProgram.slug}/?school=${schoolCode || '[code]'}`
    : '';

  function validate(): string | null {
    if (!schoolCode.trim()) return 'School Code is required';
    if (!name.trim())       return 'School Name is required';
    if (!orgName.trim())    return 'Organisation Name is required';
    if (!address.trim())    return 'Address is required';
    if (!pinCode.trim())    return 'Pin Code is required';
    if (!country)           return 'Country is required';
    if (!state)             return 'State is required';
    if (!projectId)         return 'Program is required';
    if (!schoolPrice)       return 'School Price is required';
    const c = contacts[0];
    if (!c.name.trim())        return 'Contact Name is required';
    if (!c.designation.trim()) return 'Contact Designation is required';
    if (!c.email.trim())       return 'Contact Email is required';
    if (!c.mobile.trim())      return 'Contact Mobile is required';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) { Alert.alert('Validation Error', err); return; }

    setSaving(true);
    try {
      const payload = {
        school_code:           schoolCode.trim(),
        name:                  name.trim(),
        org_name:              orgName.trim(),
        address:               address.trim(),
        pin_code:              pinCode.trim(),
        country,
        state,
        city,
        project_id:            projectId,
        project_slug:          selectedProgram?.slug ?? '',
        school_price:          Math.round(Number(schoolPrice) * 100),
        currency,
        discount_code:         discountCode.trim() || schoolCode.toUpperCase(),
        pricing: [{
          base_amount: Math.round(Number(schoolPrice) * 100),
          currency,
        }],
        primary_color:         primaryColor,
        accent_color:          '#8b5cf6',
        is_active:             isActive,
        is_registration_active: isRegActive,
        contact_persons:       contacts,
        branding: {
          primaryColor,
          accentColor: '#8b5cf6',
          redirectURL: selectedProgram ? `https://thynksuccess.com/registration/${selectedProgram.slug}/` : '',
        },
      };

      const res = await authFetch('/api/admin/schools', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        // Reset form
        setSchoolCode(''); setName(''); setOrgName(''); setAddress('');
        setPinCode(''); setCountry('India'); setState_(''); setCity('');
        setProjectId(''); setSchoolPrice(''); setDiscountCode('');
        setIsActive(true); setIsRegActive(true);
        setContacts([{ name: '', designation: '', email: '', mobile: '' }]);
        Alert.alert('✅ School Created', `${name} has been created successfully!`);
      } else {
        Alert.alert('Error', data.error ?? 'Failed to create school. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Connection Error', e.message);
    }
    setSaving(false);
  }

  const CURRENCIES = ['INR', 'USD'];

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Create School</Text>
          <Text style={styles.subtitle}>Add a new school to the platform</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* ── Basic Info ── */}
        <SectionHeader title="Basic Information" />
        <View style={styles.row2}>
          <View style={{ flex: 1 }}>
            <Field label="School Code" required>
              <TInput value={schoolCode} onChangeText={v => setSchoolCode(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))} placeholder="e.g. delhi-dps" />
            </Field>
          </View>
        </View>
        <Field label="School Name" required>
          <TInput value={name} onChangeText={setName} placeholder="Delhi Public School" autoCapitalize="words" />
        </Field>
        <Field label="Organisation Name" required>
          <TInput value={orgName} onChangeText={setOrgName} placeholder="DPS Society" autoCapitalize="words" />
        </Field>

        {/* ── Address ── */}
        <SectionHeader title="Address" />
        <Field label="Complete Address" required>
          <TInput value={address} onChangeText={setAddress} placeholder="Enter full street address…" autoCapitalize="sentences" multiline numberOfLines={3} />
        </Field>
        <Field label="Pin Code" required>
          <TInput value={pinCode} onChangeText={setPinCode} placeholder="110001" keyboardType="number-pad" />
        </Field>
        <PickerField label="Country" required value={country} placeholder="Select Country" options={countries} onSelect={setCountry} />
        <PickerField label="State" required value={state} placeholder={loadingLoc ? 'Loading…' : 'Select State'} options={states} onSelect={setState_} />
        {cities.length > 0
          ? <PickerField label="City" value={city} placeholder="Select City" options={cities} onSelect={setCity} />
          : <Field label="City">
              <TInput value={city} onChangeText={setCity} placeholder={state ? 'Enter city' : 'Select state first'} editable={!!state} autoCapitalize="words" />
            </Field>
        }

        {/* ── Contact Persons ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 3, height: 14, backgroundColor: Colors.primary, borderRadius: 2 }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>Contact Persons</Text>
          </View>
          {contacts.length < 4 && (
            <TouchableOpacity
              style={styles.addContactBtn}
              onPress={() => setContacts(c => [...c, { name: '', designation: '', email: '', mobile: '' }])}
            >
              <Ionicons name="add" size={14} color={Colors.primary} />
              <Text style={styles.addContactTxt}>Add Contact</Text>
            </TouchableOpacity>
          )}
        </View>
        {contacts.map((c, i) => (
          <ContactForm
            key={i}
            index={i}
            contact={c}
            onChange={updated => setContacts(prev => prev.map((x, j) => j === i ? updated : x))}
            onRemove={() => setContacts(prev => prev.filter((_, j) => j !== i))}
            canRemove={contacts.length > 1}
          />
        ))}

        {/* ── Program & Pricing ── */}
        <SectionHeader title="Program & Pricing" />
        <PickerField
          label="Program"
          required
          value={selectedProgram?.name ?? ''}
          placeholder="Select a program"
          options={programs.map(p => p.name)}
          onSelect={name => {
            const prog = programs.find(p => p.name === name);
            if (prog) setProjectId(prog.id);
          }}
        />

        {selectedProgram && (
          <View style={styles.priceHint}>
            <Text style={styles.priceHintLabel}>Program Base Price</Text>
            <Text style={styles.priceHintValue}>
              {country === 'India'
                ? `₹${fmtR(selectedProgram.base_amount_inr ?? selectedProgram.base_amount ?? 0)}`
                : `$${fmtR(selectedProgram.base_amount_usd ?? 0)}`
              }
            </Text>
          </View>
        )}

        <View style={styles.row2}>
          <View style={{ flex: 2 }}>
            <Field label={`School Price (${currency})`} required>
              <TInput value={schoolPrice} onChangeText={setSchoolPrice} placeholder="Enter amount" keyboardType="decimal-pad" />
            </Field>
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <PickerField label="Currency" value={currency} placeholder="INR" options={CURRENCIES} onSelect={setCurrency} />
          </View>
        </View>

        {regUrl ? (
          <Field label="Registration URL (auto-generated)">
            <View style={[inputStyles.input, { backgroundColor: Colors.primaryBg }]}>
              <Text style={{ color: Colors.primary, fontSize: 11, fontFamily: 'monospace' }} numberOfLines={2}>{regUrl}</Text>
            </View>
          </Field>
        ) : null}

        {/* ── Discount Code ── */}
        <SectionHeader title="Discount Code" />
        <Field label="Discount Code">
          <TInput
            value={discountCode}
            onChangeText={v => setDiscountCode(v.toUpperCase())}
            placeholder="e.g. DELHI-DPS"
            autoCapitalize="characters"
          />
        </Field>

        {/* ── Status ── */}
        <SectionHeader title="Settings" />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>School is Active</Text>
            <Text style={styles.switchSub}>School will appear in the system</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: Colors.cardBorder, true: Colors.primary }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Registration Active</Text>
            <Text style={styles.switchSub}>Students can register for this school</Text>
          </View>
          <Switch
            value={isRegActive}
            onValueChange={setIsRegActive}
            trackColor={{ false: Colors.cardBorder, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>

        {/* ── Save Button ── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveBtnTxt}>Create School</Text>
              </>
          }
        </TouchableOpacity>

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
  row2:    { flexDirection: 'row' },

  addContactBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryBg, borderRadius: Radius.round, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: Colors.primary },
  addContactTxt: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  priceHint:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.primaryBg, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: `${Colors.primary}30` },
  priceHintLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  priceHintValue: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  switchRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.lg, marginBottom: Spacing.sm },
  switchLabel:{ fontSize: 14, fontWeight: '700', color: Colors.text },
  switchSub:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  saveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 16, marginTop: Spacing.xl, elevation: 6 },
  saveBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
