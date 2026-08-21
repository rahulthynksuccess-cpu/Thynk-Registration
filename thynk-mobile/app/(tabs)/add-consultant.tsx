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
      <View style={cardStyles.statsRow}>
        <View style={cardStyles.statItem}><Text style={[cardStyles.statVal, { color: Colors.success }]}>{c.paid_student_count ?? 0}</Text><Text style={cardStyles.statLbl}>Total Paid Students</Text></View>
        <View style={cardStyles.statDiv} />
        <View style={cardStyles.statItem}><Text style={cardStyles.statVal}>{c.total_student_count ?? 0}</Text><Text style={cardStyles.statLbl}>Total (Paid+Unpaid)</Text></View>
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
  metaRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  metaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt:   { fontSize: 11, color: Colors.textDim },
  statsRow:  { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: Spacing.sm },
  statItem:  { flex: 1, alignItems: 'center' },
  statVal:   { fontSize: 15, fontWeight: '800', color: Colors.text },
  statLbl:   { fontSize: 10, color: Colors.textDim, marginTop: 2, textAlign: 'center' },
  statDiv:   { width: 1, height: 26, backgroundColor: Colors.cardBorder },
});

// ── Consultant profile modal (view / call / whatsapp / remark / toggle) ──
function ConsultantProfileModal({ consultant, schools, visible, onClose, onUpdated }: {
  consultant: any; schools: any[]; visible: boolean; onClose: () => void; onUpdated: () => void;
}) {
  const [remark, setRemark]       = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [toggling, setToggling]   = useState(false);

  useEffect(() => { setRemark(consultant?.internal_remark ?? ''); }, [consultant?.id]);

  if (!consultant) return null;
  const associated = consultant.association_status === 'associated';
  const phone = cleanNumber(consultant.mobile_number);

  // Program-wise breakdown of this consultant's schools (same grouping shown on the Schools list)
  const consultantSchools = schools.filter(s => s.consultant_id === consultant.id);
  const programGroups: { program: string; schools: any[] }[] = [];
  const groupIndex: Record<string, number> = {};
  consultantSchools.forEach(s => {
    const program = s.program_name || 'No Program';
    if (!(program in groupIndex)) {
      groupIndex[program] = programGroups.length;
      programGroups.push({ program, schools: [] });
    }
    programGroups[groupIndex[program]].schools.push(s);
  });
  programGroups.sort((a, b) => b.schools.length - a.schools.length);

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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
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

          <SectionHeader title="Registrations" note="Across all schools" />
          <View style={pStyles.statsRow}>
            <View style={pStyles.statItem}><Text style={[pStyles.statVal, { color: Colors.success }]}>{consultant.paid_student_count ?? 0}</Text><Text style={pStyles.statLbl}>Total Paid Students</Text></View>
            <View style={pStyles.statDiv} />
            <View style={pStyles.statItem}><Text style={pStyles.statVal}>{consultant.total_student_count ?? 0}</Text><Text style={pStyles.statLbl}>Total (Paid+Unpaid)</Text></View>
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

          <SectionHeader title="Program-wise Schools" note={`${consultantSchools.length} total`} />
          {programGroups.length === 0
            ? <View style={pStyles.card}><Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 }}>No schools assigned yet</Text></View>
            : programGroups.map(g => (
                <View key={g.program} style={pStyles.programCard}>
                  <View style={pStyles.programHdr}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Ionicons name="book-outline" size={13} color={Colors.primary} />
                      <Text style={pStyles.programName} numberOfLines={1}>{g.program}</Text>
                    </View>
                    <View style={pStyles.programCountPill}>
                      <Text style={pStyles.programCountTxt}>{g.schools.length} school{g.schools.length === 1 ? '' : 's'}</Text>
                    </View>
                  </View>
                  {g.schools.map((s: any) => (
                    <View key={s.id} style={pStyles.schoolRow}>
                      <Ionicons name="school-outline" size={12} color={Colors.textDim} />
                      <Text style={pStyles.schoolName} numberOfLines={1}>{s.name}</Text>
                      <Text style={pStyles.schoolStats} numberOfLines={1}>
                        {s.paid_student_count ?? 0} paid · {s.total_student_count ?? 0} total
                      </Text>
                      {s.is_registration_active === false && <Badge label="Closed" variant="danger" />}
                    </View>
                  ))}
                </View>
              ))
          }

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
  programCard:      { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, marginBottom: Spacing.sm },
  programHdr:        { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  programName:       { fontSize: 13, fontWeight: '700', color: Colors.text, flex: 1 },
  programCountPill:  { backgroundColor: Colors.primaryBg, borderRadius: Radius.round, paddingHorizontal: 8, paddingVertical: 3 },
  programCountTxt:   { fontSize: 10, fontWeight: '700', color: Colors.primary },
  schoolRow:          { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  schoolName:         { fontSize: 12, color: Colors.textMuted, flex: 1 },
  schoolStats:        { fontSize: 10, color: Colors.textDim, fontWeight: '600' },
  statsRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder, padding: Spacing.md, marginBottom: Spacing.md },
  statItem:  { flex: 1, alignItems: 'center' },
  statVal:   { fontSize: 18, fontWeight: '800', color: Colors.text },
  statLbl:   { fontSize: 10, color: Colors.textDim, marginTop: 2, textAlign: 'center' },
  statDiv:   { width: 1, height: 30, backgroundColor: Colors.cardBorder },
});

// ── Pending registration card (list mode) ───────────────────────────
function PendingCard({ reg, onPress }: { reg: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={cardStyles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={cardStyles.top}>
        <View style={[cardStyles.avatar, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
          <Text style={[cardStyles.avatarTxt, { color: '#b45309' }]}>{(reg.full_name || reg.contact_email || '?')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={cardStyles.name} numberOfLines={1}>{reg.full_name || '—'}</Text>
          <Text style={cardStyles.sub} numberOfLines={1}>{reg.contact_email}</Text>
        </View>
        <Badge label="Pending" variant="warning" />
      </View>
      <View style={cardStyles.metaRow}>
        {reg.location && <View style={cardStyles.metaItem}><Ionicons name="location-outline" size={11} color={Colors.textDim} /><Text style={cardStyles.metaTxt}>{reg.location}</Text></View>}
        {reg.contact_number && <View style={cardStyles.metaItem}><Ionicons name="call-outline" size={11} color={Colors.textDim} /><Text style={cardStyles.metaTxt}>{reg.contact_number}</Text></View>}
        <View style={cardStyles.metaItem}><Ionicons name="calendar-outline" size={11} color={Colors.textDim} /><Text style={cardStyles.metaTxt}>{fmtDate(reg.created_at)}</Text></View>
      </View>
    </TouchableOpacity>
  );
}

// ── Pending registration detail modal — approve / reject ────────────
function PendingProfileModal({ reg, visible, onClose, onDone }: {
  reg: any; visible: boolean; onClose: () => void; onDone: () => void;
}) {
  const [busy, setBusy]           = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason]       = useState('');

  useEffect(() => { setRejecting(false); setReason(''); }, [reg?.id]);

  if (!reg) return null;
  const phone = cleanNumber(reg.contact_number);
  const domains: string[] = Array.isArray(reg.domain_expertise) ? reg.domain_expertise : [];

  async function approve() {
    setBusy('approve');
    try {
      const res = await authFetch('/api/admin/consultant-registrations', {
        method: 'PATCH',
        body: JSON.stringify({ id: reg.id, action: 'approve' }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert('Approved', `Consultant code: ${d.consultant_code ?? '—'}\nDefault password: Thynk@1234`);
        onDone();
      } else {
        Alert.alert('Error', d.error ?? 'Approval failed');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Approval failed');
    } finally { setBusy(null); }
  }

  async function reject() {
    setBusy('reject');
    try {
      const res = await authFetch('/api/admin/consultant-registrations', {
        method: 'PATCH',
        body: JSON.stringify({ id: reg.id, action: 'reject', reject_reason: reason.trim() || null }),
      });
      if (res.ok) { onDone(); }
      else { const d = await res.json().catch(() => ({})); Alert.alert('Error', d.error ?? 'Reject failed'); }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Reject failed');
    } finally { setBusy(null); setRejecting(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
        <View style={pStyles.hdr}>
          <Text style={pStyles.hdrTitle} numberOfLines={1}>{reg.full_name || '—'}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={Colors.textMuted} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.xl }}>
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

          <SectionHeader title="Registration Details" />
          <View style={pStyles.card}>
            {[
              ['Email',              reg.contact_email],
              ['Mobile',             reg.contact_number],
              ['Location',           reg.location],
              ['Total Experience',   reg.total_exp_years ? `${reg.total_exp_years} years` : '—'],
              ['Locations Worked',   reg.locations_worked],
              ['Edu Connections',    reg.has_edu_connections == null ? '—' : reg.has_edu_connections ? 'Yes' : 'No'],
              ['B2B Experience',     reg.has_b2b_exp == null ? '—' : reg.has_b2b_exp ? 'Yes' : 'No'],
              ['B2C Experience',     reg.has_b2c_exp == null ? '—' : reg.has_b2c_exp ? 'Yes' : 'No'],
              ['Submitted',          fmtDate(reg.created_at)],
            ].map(([l, v]) => (
              <View key={String(l)} style={pStyles.row}>
                <Text style={pStyles.rowLabel}>{l}</Text>
                <Text style={pStyles.rowValue} numberOfLines={2}>{v || '—'}</Text>
              </View>
            ))}
          </View>

          {domains.length > 0 && (
            <>
              <SectionHeader title="Domain Expertise" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md }}>
                {domains.map(d => (
                  <View key={d} style={{ backgroundColor: Colors.primaryBg, borderRadius: Radius.round, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>{d}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {reg.detailed_intro && (
            <>
              <SectionHeader title="Detailed Introduction" />
              <View style={pStyles.card}><Text style={{ fontSize: 13, color: Colors.text, lineHeight: 19 }}>{reg.detailed_intro}</Text></View>
            </>
          )}
          {reg.experience_summary && (
            <>
              <SectionHeader title="Experience Summary" />
              <View style={pStyles.card}><Text style={{ fontSize: 13, color: Colors.text, lineHeight: 19 }}>{reg.experience_summary}</Text></View>
            </>
          )}

          <SectionHeader title="Actions" />
          {!rejecting ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={approve}
                disabled={!!busy}
                style={[pStyles.statusBtn, { flex: 1, backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.35)' }]}>
                {busy === 'approve'
                  ? <ActivityIndicator color={Colors.success} size="small" />
                  : <Text style={[pStyles.statusTxt, { color: Colors.success }]}>✓ Approve</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRejecting(true)}
                disabled={!!busy}
                style={[pStyles.statusBtn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)' }]}>
                <Text style={[pStyles.statusTxt, { color: Colors.danger }]}>✕ Reject</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <TextInput
                style={pStyles.remarkInput}
                value={reason}
                onChangeText={setReason}
                placeholder="Rejection reason (optional)…"
                placeholderTextColor={Colors.textDim}
                multiline
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => setRejecting(false)} disabled={!!busy} style={[pStyles.statusBtn, { flex: 1 }]}>
                  <Text style={[pStyles.statusTxt, { color: Colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={reject}
                  disabled={!!busy}
                  style={[pStyles.statusBtn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.35)' }]}>
                  {busy === 'reject'
                    ? <ActivityIndicator color={Colors.danger} size="small" />
                    : <Text style={[pStyles.statusTxt, { color: Colors.danger }]}>Confirm Reject</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── List mode ─────────────────────────────────────────────────────
type AssocFilter  = 'all' | 'associated' | 'not_associated';
type RemarkFilter = 'all' | 'updated' | 'not_updated';

function ConsultantListView({ onAddNew }: { onAddNew: () => void }) {
  const [subTab, setSubTab] = useState<'approved' | 'pending'>('approved');
  const [consultants, setConsultants] = useState<any[]>([]);
  const [pending, setPending]     = useState<any[]>([]);
  const [schools, setSchools]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<AssocFilter>('all');
  const [remarkFilter, setRemarkFilter] = useState<RemarkFilter>('all');
  const [selected, setSelected]   = useState<any>(null);
  const [selectedPending, setSelectedPending] = useState<any>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Fetch consultants + schools + pending registrations together so the
      // profile modal can show a program-wise breakdown of each consultant's
      // schools without an extra round trip when it's opened.
      const [cRes, sRes, pRes] = await Promise.all([
        authFetch('/api/admin/consultants'),
        authFetch('/api/admin/schools'),
        authFetch('/api/admin/consultant-registrations?status=pending'),
      ]);
      if (cRes.ok) { const d = await cRes.json(); setConsultants(d.consultants ?? []); }
      if (sRes.ok) { const d = await sRes.json(); setSchools(d.schools ?? d ?? []); }
      if (pRes.ok) { const d = await pRes.json(); setPending(d.registrations ?? []); }
    } catch {}
    setLoading(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const counts = {
    all: consultants.length,
    associated: consultants.filter(c => c.association_status === 'associated').length,
    not_associated: consultants.filter(c => c.association_status !== 'associated').length,
  };

  const hasRemark = (c: any) => !!(c.internal_remark && String(c.internal_remark).trim());
  const remarkCounts = {
    all: consultants.length,
    updated: consultants.filter(hasRemark).length,
    not_updated: consultants.filter(c => !hasRemark(c)).length,
  };

  const filtered = consultants.filter(c => {
    const q = search.toLowerCase();
    const ok = !search || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.consultant_code?.toLowerCase().includes(q);
    if (!ok) return false;
    if (filter === 'associated')     return c.association_status === 'associated';
    if (filter === 'not_associated') return c.association_status !== 'associated';
    if (remarkFilter === 'updated')     return hasRemark(c);
    if (remarkFilter === 'not_updated') return !hasRemark(c);
    return true;
  });

  const filteredPending = pending.filter(r => {
    const q = search.toLowerCase();
    return !search || r.full_name?.toLowerCase().includes(q) || r.contact_email?.toLowerCase().includes(q) || r.location?.toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm }}>
        {/* Approved / Pending sub-tabs */}
        <View style={lStyles.subTabWrap}>
          <TouchableOpacity style={[lStyles.subTab, subTab === 'approved' && lStyles.subTabOn]} onPress={() => setSubTab('approved')}>
            <Text style={[lStyles.subTabTxt, subTab === 'approved' && lStyles.subTabTxtOn]}>👥 Approved ({consultants.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[lStyles.subTab, subTab === 'pending' && lStyles.subTabOn]} onPress={() => setSubTab('pending')}>
            <Text style={[lStyles.subTabTxt, subTab === 'pending' && lStyles.subTabTxtOn]}>📥 Pending ({pending.length})</Text>
            {pending.length > 0 && subTab !== 'pending' && <View style={lStyles.subTabDot} />}
          </TouchableOpacity>
        </View>

        <View style={lStyles.searchBox}>
          <Ionicons name="search-outline" size={16} color={Colors.textDim} style={{ marginRight: 8 }} />
          <TextInput style={lStyles.searchInput} placeholder={subTab === 'approved' ? 'Search consultants...' : 'Search pending registrations...'} placeholderTextColor={Colors.textDim} value={search} onChangeText={setSearch} />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={Colors.textDim} /></TouchableOpacity>}
        </View>
        {subTab === 'approved' && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
            {([['all','All'],['associated','Associated'],['not_associated','Not Associated']] as [AssocFilter,string][]).map(([f,label]) => (
              <TouchableOpacity key={f} style={[lStyles.chip, filter === f && lStyles.chipOn]} onPress={() => setFilter(f)}>
                <Text style={[lStyles.chipTxt, filter === f && lStyles.chipTxtOn]}>{label} ({counts[f]})</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {([['all','All Remarks'],['updated','Remark Updated'],['not_updated','Remark Not Updated']] as [RemarkFilter,string][]).map(([f,label]) => (
              <TouchableOpacity key={f} style={[lStyles.chip, { flexDirection: 'row', alignItems: 'center' }, remarkFilter === f && lStyles.chipOn]} onPress={() => setRemarkFilter(f)}>
                <Ionicons name="chatbox-ellipses-outline" size={11} color={remarkFilter === f ? Colors.primary : Colors.textDim} style={{ marginRight: 4 }} />
                <Text style={[lStyles.chipTxt, remarkFilter === f && lStyles.chipTxtOn]}>{label} ({remarkCounts[f]})</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>}
      </View>

      {loading
        ? <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        : subTab === 'approved'
          ? <FlatList
              data={filtered}
              keyExtractor={c => c.id}
              contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.primary} />}
              ListEmptyComponent={<EmptyState icon="🤝" message="No consultants found" />}
              renderItem={({ item }) => <ConsultantCard c={item} onPress={() => setSelected(item)} />}
            />
          : <FlatList
              data={filteredPending}
              keyExtractor={r => r.id}
              contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.sm }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.primary} />}
              ListEmptyComponent={<EmptyState icon="📥" message="No pending registrations" />}
              renderItem={({ item }) => <PendingCard reg={item} onPress={() => setSelectedPending(item)} />}
            />
      }

      <TouchableOpacity style={lStyles.fab} onPress={onAddNew}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <ConsultantProfileModal consultant={selected} schools={schools} visible={!!selected} onClose={() => setSelected(null)} onUpdated={() => { load(true); }} />
      <PendingProfileModal reg={selectedPending} visible={!!selectedPending} onClose={() => setSelectedPending(null)} onDone={() => { setSelectedPending(null); load(true); }} />
    </View>
  );
}
const lStyles = StyleSheet.create({
  subTabWrap: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm },
  subTab:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder },
  subTabOn:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  subTabTxt:  { fontSize: 12.5, fontWeight: '700', color: Colors.textMuted },
  subTabTxtOn:{ color: '#fff' },
  subTabDot:  { position: 'absolute', top: 6, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.warning },
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
